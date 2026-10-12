"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowDownToLine, LoaderCircle, RefreshCw, WifiOff, X } from "lucide-react";
import { AgentStrip } from "./agent-strip";
import { CompareDialog } from "./compare-dialog";
import { ConsoleTabs, panelId, tabId } from "./console-tabs";
import { EvolutionPanel } from "./evolution-panel";
import { ExperimentTable } from "./experiment-table";
import { Hero } from "./hero";
import { HistoryView } from "./history-view";
import { ProgressPanel } from "./progress-panel";
import { RunConfig } from "./run-config";
import { BrandMark, SiteHeader } from "./site-header";
import { StatusBadge } from "./status";
import { VerificationView } from "./verification-view";
import { useHashTab, type Tab } from "@/hooks/use-hash-tab";
import { useLab } from "@/hooks/use-lab";
import { useReveal } from "@/hooks/use-motion";
import { useSeedPreview } from "@/hooks/use-seed-preview";
import { downloadExport } from "@/lib/api";
import { DEFAULT_CONFIG, parseDraft, toDraft } from "@/lib/config";
import { statusLabel } from "@/lib/format";
import type { Candidate, ConfigDraft, Experiment } from "@/lib/types";

const TRAIL_EMPTY = (
  <p>Empty for now. Each generation’s best molecule gets written here with its hash as soon as a run starts.</p>
);

export function LabApp() {
  const lab = useLab();
  const [tab, setTab] = useHashTab();
  // The tab bar responds instantly; the heavier panel renders right after without blocking input.
  const panelTab = useDeferredValue(tab);
  const [draft, setDraftState] = useState<ConfigDraft>(() => toDraft(DEFAULT_CONFIG));
  const [touched, setTouched] = useState(false);
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pair, setPair] = useState<[number, number]>([0, 0]);
  const [exporting, setExporting] = useState(false);
  const [loadingRun, setLoadingRun] = useState<string | null>(null);
  const lastSeed = useRef<Candidate | undefined>(undefined);
  const consoleRef = useReveal<HTMLDivElement>();

  const { run, experiments, active } = lab;
  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const preview = useSeedPreview(draft, parsed.config, lab.connection === "online" && !active);
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
    (t: Tab) => {
      setTab(t);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("lab")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    },
    [setTab],
  );

  const best = experiments.at(-1)?.record ?? run?.initial;
  const previewSeed = preview.state === "valid" ? preview.candidate : preview.state === "checking" ? preview.last : undefined;
  // While idle, an edited seed is previewed; otherwise the seed of the loaded run is shown.
  const showDraftSeed = !active && previewSeed && (!run || previewSeed.smiles !== run.initial.smiles);
  const seedForCard = showDraftSeed ? previewSeed : run?.initial;
  const sceneSmiles = run && (active || !showDraftSeed) ? best!.smiles : previewSeed?.smiles || lastSeed.current?.smiles || DEFAULT_CONFIG.smiles;

  const canLaunch =
    lab.connection === "online" && !!parsed.config && preview.state !== "invalid" && !active;

  async function launch() {
    setTouched(true);
    if (!parsed.config || preview.state === "invalid") return;
    const created = await lab.launch(parsed.config);
    if (created) setSelected(null);
  }

  async function chooseRun(id: string) {
    setLoadingRun(id);
    const r = await lab.chooseRun(id);
    setLoadingRun(null);
    if (r) {
      setDraftState(toDraft(r.config));
      setTouched(false);
      setSelected(null);
    }
  }

  const inspect = useCallback(
    (e: Experiment) => {
      setSelected(e);
      setTab("verification");
      document.getElementById("lab-tabs")?.scrollIntoView({ block: "nearest" });
    },
    [setTab],
  );

  const openCompare = useCallback(() => {
    if (experiments.length < 2) return;
    setPair([experiments[0].record.iteration, experiments.at(-1)!.record.iteration]);
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
  const lastEntry = useMemo(() => lab.runs.find((r) => r.status === "completed"), [lab.runs]);

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

  return (
    <div className="page" id="top">
      <a className="skip-link" href="#lab" onClick={() => setTab(tab)}>
        Skip to the research console
      </a>
      <SiteHeader chainMode={lab.health?.chain_mode} connection={lab.connection} goTo={goTo} />
      <main>
        <Hero
          run={run}
          best={best}
          seed={run ? run.initial : previewSeed}
          sceneSmiles={sceneSmiles}
          active={active}
          lastEntry={lastEntry}
          goTo={goTo}
        />

        <div className="console theme-night reveal" id="lab" ref={consoleRef} tabIndex={-1} aria-labelledby="lab-title">
          <header className="console-head">
            <p className="kicker">The bench</p>
            <h2 id="lab-title">
              Set it up, let it run, <em>read the notebook.</em>
            </h2>
            <p className="console-lede">
              Everything here talks to the live optimizer. Nothing is precomputed. Every number on this page comes from
              RDKit or from the record chain.
            </p>
          </header>

          <div id="lab-tabs">
            <ConsoleTabs
              tab={tab}
              onChange={setTab}
              counts={{ history: experiments.length }}
              end={
                run && (
                  <>
                    <code className="run-id">Run {run.id.slice(0, 8)}</code>
                    <StatusBadge status={run.status} />
                  </>
                )
              }
            />
          </div>

          <div className="banners">
            {lab.connection === "offline" && (
              <div className="banner" data-tone="bad" role="alert">
                <WifiOff size={16} aria-hidden="true" />
                <p>
                  <strong>Research service unreachable.</strong> Start it with <code>npm run dev:all</code>. Retrying automatically;
                  your configuration is kept.
                </p>
                <button type="button" className="btn btn-outline btn-sm" onClick={lab.retryConnection}>
                  <RefreshCw size={13} aria-hidden="true" /> Retry now
                </button>
              </div>
            )}
            {lab.connection !== "offline" && lab.stream === "reconnecting" && (
              <div className="banner" data-tone="warn" role="status">
                <LoaderCircle size={15} className="spin" aria-hidden="true" />
                <p>
                  <strong>Live updates interrupted.</strong> Reconnecting… The run continues on the server; nothing is lost.
                </p>
                <button type="button" className="btn btn-outline btn-sm" onClick={lab.retryConnection}>
                  Reconnect
                </button>
              </div>
            )}
            {lab.error && (
              <div className="banner" data-tone="bad" role="alert">
                <p>{lab.error}</p>
                <button type="button" className="icon-btn" onClick={() => lab.setError("")} aria-label="Dismiss message">
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>

          <div className="tab-panel" role="tabpanel" id={panelId(panelTab)} aria-labelledby={tabId(panelTab)} key={panelTab}>
            {panelTab === "optimization" && (
              <>
                <div className="workbench">
                  <RunConfig
                    draft={draft}
                    setDraft={setDraft}
                    errors={parsed.errors}
                    touched={touched}
                    preview={preview}
                    active={active}
                    launching={lab.launching}
                    stopping={lab.stopping}
                    canLaunch={canLaunch}
                    simulator={lab.health?.simulator}
                    chainMode={lab.health?.chain_mode}
                    networkName={lab.health?.network?.name}
                    onLaunch={launch}
                    onStop={lab.stop}
                  />
                  <EvolutionPanel
                    run={run}
                    seed={seedForCard}
                    best={best}
                    generation={run?.iteration ?? 0}
                    live={active}
                    canCompare={experiments.length >= 2}
                    onCompare={openCompare}
                    latest={experiments.at(-1)}
                  />
                  <ProgressPanel run={run} experiments={experiments} objective={draft.objective} />
                </div>
                <AgentStrip latest={experiments.at(-1)} agentMode={lab.health?.agent} />
                <section className="trail" aria-labelledby="trail-title">
                  <header className="trail-head">
                    <div>
                      <h3 id="trail-title">Lab notebook</h3>
                      <span className="muted num">
                        {experiments.length} records ·{" "}
                        {experiments.filter((e) => e.proof.status === "verified").length} onchain
                      </span>
                    </div>
                    <div className="panel-actions">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={!run || exporting} onClick={exportRun}>
                        {exporting ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <ArrowDownToLine size={14} aria-hidden="true" />}
                        Export JSON
                      </button>
                      <button type="button" className="link-btn" onClick={() => setTab("history")} disabled={!run}>
                        All records <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </header>
                  <ExperimentTable
                    all={experiments}
                    experiments={recent}
                    onInspect={inspect}
                    empty={TRAIL_EMPTY}
                  />
                </section>
              </>
            )}
            {panelTab === "history" && (
              <HistoryView
                runs={lab.runs}
                run={run}
                experiments={experiments}
                onChooseRun={chooseRun}
                onInspect={inspect}
                onCompare={openCompare}
                onExport={exportRun}
                exporting={exporting}
                loadingRun={loadingRun}
              />
            )}
            {panelTab === "verification" && (
              <VerificationView
                experiments={experiments}
                selected={selected ?? experiments.at(-1) ?? null}
                onSelect={setSelected}
                onRetryCommitments={lab.retryCommitments}
                onError={lab.setError}
              />
            )}
          </div>
        </div>
      </main>
      <footer className="site-footer">
        <span className="footer-brand">
          <BrandMark /> Proof of Discovery
        </span>
        <p>
          Built at B@B Hacks 2.0 · YZi Labs track · {lab.health?.network?.name || "BNB Smart Chain Testnet"}. Computed properties
          are heuristics, not evidence of efficacy or safety.
        </p>
        <span className="muted">{lab.health?.simulator || "RDKit"} · SHA-256</span>
      </footer>
      <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} experiments={experiments} pair={pair} setPair={setPair} />
    </div>
  );
}
