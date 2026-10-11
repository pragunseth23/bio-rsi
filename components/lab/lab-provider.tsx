"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLab } from "@/hooks/use-lab";
import { useSeedPreview } from "@/hooks/use-seed-preview";
import { downloadExport } from "@/lib/api";
import { DEFAULT_CONFIG, parseDraft, toDraft } from "@/lib/config";
import { PAGE_PATHS, type Tab } from "@/lib/navigation";
import { statusLabel } from "@/lib/format";
import type { Candidate, ConfigDraft, Experiment } from "@/lib/types";

function useLabState() {
  const lab = useLab();
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraftState] = useState<ConfigDraft>(() =>
    toDraft(DEFAULT_CONFIG),
  );
  const [touched, setTouched] = useState(false);
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pair, setPair] = useState<[number, number]>([0, 0]);
  const [exporting, setExporting] = useState(false);
  const [loadingRun, setLoadingRun] = useState<string | null>(null);
  const lastSeed = useRef<Candidate | undefined>(undefined);

  const { run, experiments, active } = lab;
  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const preview = useSeedPreview(
    draft,
    parsed.config,
    lab.connection === "online" && !active,
  );
  if (preview.state === "valid") lastSeed.current = preview.candidate;

  // Restore the form from the saved run once it is known.
  useEffect(() => {
    if (lab.restored) setDraftState(toDraft(lab.restored));
  }, [lab.restored]);

  const setDraft = (d: ConfigDraft) => {
    setDraftState(d);
    setTouched(true);
  };

  const goTo = useCallback(
    (view: Tab) => router.push(PAGE_PATHS[view]),
    [router],
  );

  // Preserve links shared by the earlier single-page app.
  useEffect(() => {
    const match = /^#lab\/(optimization|history|verification)$/.exec(
      window.location.hash,
    );
    if (match) router.replace(PAGE_PATHS[match[1] as Tab]);
    else if (window.location.hash === "#lab")
      router.replace(PAGE_PATHS.optimization);
  }, [router]);

  const best = experiments.at(-1)?.record ?? run?.initial;
  const previewSeed =
    preview.state === "valid"
      ? preview.candidate
      : preview.state === "checking"
        ? preview.last
        : undefined;
  // While idle, an edited seed is previewed; otherwise the seed of the loaded run is shown.
  const showDraftSeed =
    !active &&
    previewSeed &&
    (!run || previewSeed.smiles !== run.initial.smiles);
  const seedForCard = showDraftSeed ? previewSeed : run?.initial;
  const sceneSmiles =
    run && (active || !showDraftSeed)
      ? best!.smiles
      : previewSeed?.smiles ||
        lastSeed.current?.smiles ||
        DEFAULT_CONFIG.smiles;

  const canLaunch =
    lab.connection === "online" &&
    !!parsed.config &&
    preview.state !== "invalid" &&
    !active;

  async function launch() {
    setTouched(true);
    if (!parsed.config || preview.state === "invalid") return;
    const created = await lab.launch(parsed.config);
    if (created) setSelected(null);
  }

  const chooseRun = useCallback(
    async (id: string) => {
      setLoadingRun(id);
      const r = await lab.chooseRun(id);
      setLoadingRun(null);
      if (r) {
        setDraftState(toDraft(r.config));
        setTouched(false);
        setSelected(null);
      }
    },
    [lab.chooseRun],
  );

  const inspect = useCallback(
    (e: Experiment) => {
      setSelected(e);
      router.push(
        `/verification?experiment=${encodeURIComponent(e.record.id)}`,
      );
    },
    [router],
  );

  const selectExperiment = useCallback(
    (e: Experiment) => {
      setSelected(e);
      setRecordQuery(e.record.id);
      router.replace(
        `/verification?experiment=${encodeURIComponent(e.record.id)}`,
        { scroll: false },
      );
    },
    [router],
  );

  // Resolve a bookmarked record only after its persisted run has loaded.
  const [recordQuery, setRecordQuery] = useState<string | null>(null);
  useEffect(() => {
    const sync = () =>
      setRecordQuery(
        new URLSearchParams(window.location.search).get("experiment"),
      );
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [pathname]);
  const requestedRecord = useRef<string | null>(null);
  const loadingRecord = useRef(false);
  useEffect(() => {
    if (pathname !== "/verification") {
      requestedRecord.current = null;
      return;
    }
    const id = recordQuery;
    if (!id) return;
    const match = experiments.find((e) => e.record.id === id);
    if (match) {
      setSelected(match);
      return;
    }
    const runId = id.split(":")[0];
    if (
      lab.connection !== "online" ||
      run?.id === runId ||
      requestedRecord.current === id ||
      loadingRecord.current
    )
      return;
    requestedRecord.current = id;
    loadingRecord.current = true;
    void chooseRun(runId).finally(() => {
      loadingRecord.current = false;
    });
  }, [pathname, recordQuery, experiments, lab.connection, run?.id, chooseRun]);

  const openCompare = useCallback(() => {
    if (experiments.length < 2) return;
    setPair([
      experiments[0].record.iteration,
      experiments.at(-1)!.record.iteration,
    ]);
    setCompareOpen(true);
  }, [experiments]);

  const { setError } = lab;
  const exportRun = useCallback(async () => {
    if (!run) return;
    setExporting(true);
    try {
      await downloadExport(run.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }, [run, setError]);

  const recent = useMemo(() => experiments.slice(-5).reverse(), [experiments]);
  const lastEntry = useMemo(
    () => lab.runs.find((r) => r.status === "completed"),
    [lab.runs],
  );

  // Close the compare dialog if the records behind it disappear (run switched).
  useEffect(() => {
    if (compareOpen && experiments.length < 2) setCompareOpen(false);
  }, [compareOpen, experiments.length]);

  // Announce meaningful run events without narrating every generation.
  const announcement = run
    ? run.status === "running"
      ? `Run in progress, generation ${Math.floor(run.iteration / 10) * 10} or later of ${run.config.iterations}.`
      : `Run ${statusLabel(run.status).toLowerCase()} at generation ${run.iteration} of ${run.config.iterations}.`
    : "";

  return {
    lab,
    draft,
    setDraft,
    parsed,
    preview,
    touched,
    run,
    experiments,
    active,
    selected,
    setSelected,
    selectExperiment,
    best,
    previewSeed,
    seedForCard,
    sceneSmiles,
    canLaunch,
    launch,
    chooseRun,
    inspect,
    openCompare,
    exportRun,
    recent,
    lastEntry,
    announcement,
    compareOpen,
    setCompareOpen,
    pair,
    setPair,
    exporting,
    loadingRun,
    goTo,
  };
}

const LabContext = createContext<ReturnType<typeof useLabState> | null>(null);

/** One live stream and one configuration draft, preserved by the root layout. */
export function LabProvider({ children }: { children: React.ReactNode }) {
  const state = useLabState();
  return <LabContext.Provider value={state}>{children}</LabContext.Provider>;
}

export function useLabContext() {
  const state = useContext(LabContext);
  if (!state) throw new Error("LabProvider is required");
  return state;
}
