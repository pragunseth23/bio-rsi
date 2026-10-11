"use client";
import { ArrowRight, ArrowDownToLine, LoaderCircle } from "lucide-react";
import { AgentStrip } from "./agent-strip";
import { ConsoleNav } from "./console-nav";
import { EvolutionPanel } from "./evolution-panel";
import { ExperimentTable } from "./experiment-table";
import { Hero } from "./hero";
import { HistoryView } from "./history-view";
import { ProgressPanel } from "./progress-panel";
import { RunConfig } from "./run-config";
import { StatusBadge } from "./status";
import { VerificationView } from "./verification-view";
import { useLabContext } from "./lab-provider";
import type { Tab } from "@/lib/navigation";

const PAGE_COPY = {
  optimization: {
    label: "The bench",
    title: "Set a direction.",
    subtitle: "Watch it evolve.",
    description:
      "Configure a molecular search and follow its progress. Every score comes from the live RDKit optimizer.",
  },
  history: {
    label: "The notebook",
    title: "Every generation.",
    subtitle: "Every receipt.",
    description:
      "Browse saved runs, compare molecules, and inspect the complete experiment trail.",
  },
  verification: {
    label: "The audit",
    title: "Check the record.",
    subtitle: "Trace the lineage.",
    description:
      "Recompute experiment hashes, check parent links, and compare committed records with the onchain registry.",
  },
};
const TRAIL_EMPTY = (
  <p>
    Empty for now. Each generation’s best molecule gets written here with its
    hash as soon as a run starts.
  </p>
);

export function LabApp({ view }: { view: Tab | "home" }) {
  const {
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
    exporting,
    loadingRun,
    goTo,
  } = useLabContext();
  if (view === "home")
    return (
      <Hero
        run={run}
        best={best}
        seed={run ? run.initial : previewSeed}
        sceneSmiles={sceneSmiles}
        active={active}
        lastEntry={lastEntry}
        goTo={goTo}
      />
    );
  return (
    <div
      className="console console-page theme-night"
      id="lab"
      tabIndex={-1}
      aria-labelledby="lab-title"
    >
      <header className="console-head">
        <p className="kicker">{PAGE_COPY[view].label}</p>
        <h1 id="lab-title">
          {PAGE_COPY[view].title} <em>{PAGE_COPY[view].subtitle}</em>
        </h1>
        <p className="console-lede">{PAGE_COPY[view].description}</p>
      </header>

      <div id="lab-tabs">
        <ConsoleNav
          tab={view}
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

      <div className="tab-panel">
        {view === "optimization" && (
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
              <ProgressPanel
                run={run}
                experiments={experiments}
                objective={draft.objective}
              />
            </div>
            <AgentStrip
              latest={experiments.at(-1)}
              agentMode={lab.health?.agent}
            />
            <section className="trail" aria-labelledby="trail-title">
              <header className="trail-head">
                <div>
                  <h3 id="trail-title">Lab notebook</h3>
                  <span className="muted num">
                    {experiments.length} records ·{" "}
                    {
                      experiments.filter((e) => e.proof.status === "verified")
                        .length
                    }{" "}
                    onchain
                  </span>
                </div>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!run || exporting}
                    onClick={exportRun}
                  >
                    {exporting ? (
                      <LoaderCircle
                        size={14}
                        className="spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowDownToLine size={14} aria-hidden="true" />
                    )}
                    Export JSON
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => goTo("history")}
                    disabled={!run}
                  >
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
        {view === "history" && (
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
        {view === "verification" && (
          <VerificationView
            experiments={experiments}
            selected={selected ?? experiments.at(-1) ?? null}
            onSelect={selectExperiment}
            onRetryCommitments={lab.retryCommitments}
            onError={lab.setError}
          />
        )}
      </div>
    </div>
  );
}
