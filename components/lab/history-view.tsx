"use client";
import { ArrowDownToLine, GitCompareArrows, LoaderCircle } from "lucide-react";
import { ExperimentTable } from "./experiment-table";
import { StatusBadge } from "./status";
import { fmt, objectiveLabel, relativeTime, shortHash } from "@/lib/format";
import type { Experiment, Run } from "@/lib/types";

export function HistoryView({
  runs,
  run,
  experiments,
  onChooseRun,
  onInspect,
  onCompare,
  onExport,
  exporting,
  loadingRun,
}: {
  runs: Run[];
  run: Run | null;
  experiments: Experiment[];
  onChooseRun: (id: string) => void;
  onInspect: (e: Experiment) => void;
  onCompare: () => void;
  onExport: () => void;
  exporting: boolean;
  loadingRun: string | null;
}) {
  return (
    <div className="history">
      <section className="panel runs" aria-labelledby="runs-title">
        <header className="panel-head">
          <h3 id="runs-title">Saved runs</h3>
          <span className="panel-meta num">{runs.length}</span>
        </header>
        {runs.length === 0 ? (
          <p className="panel-empty">Runs you launch are stored here with their full record chain.</p>
        ) : (
          <ul className="run-list">
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  aria-current={r.id === run?.id || undefined}
                  onClick={() => onChooseRun(r.id)}
                  disabled={loadingRun !== null}
                >
                  <span className="run-line">
                    <code>{r.id.slice(0, 8)}</code>
                    {loadingRun === r.id ? <LoaderCircle size={13} className="spin" aria-label="Loading" /> : <StatusBadge status={r.status} />}
                  </span>
                  <span className="run-sub">
                    {objectiveLabel(r.config.objective)} · {r.config.smiles.length > 18 ? `${r.config.smiles.slice(0, 18)}…` : r.config.smiles}
                  </span>
                  <span className="run-sub num">
                    best {fmt(r.best_fitness)} · gen {r.iteration}/{r.config.iterations} · {relativeTime(r.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel records-panel" aria-labelledby="records-title">
        <header className="panel-head">
          <div>
            <h3 id="records-title">Notebook entries</h3>
            {run && (
              <p className="panel-sub">
                Run <code>{run.id.slice(0, 8)}</code> · start <code>{run.config.smiles}</code> · random seed {run.config.seed} ·{" "}
                {run.config.iterations}×{run.config.candidates}
              </p>
            )}
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-outline btn-sm" disabled={experiments.length < 2} onClick={onCompare}>
              <GitCompareArrows size={14} aria-hidden="true" />
              Compare
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={!run || exporting} onClick={onExport}>
              {exporting ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <ArrowDownToLine size={14} aria-hidden="true" />}
              Export JSON
            </button>
          </div>
        </header>
        <p className="panel-note">
          One record per generation, each holding the generation’s best molecule (unchanged elites included). Every record’s
          parent hash is the previous record’s hash{experiments[0] ? `, starting from ${shortHash(experiments[0].record.parent_hash)}` : ""}.
        </p>
        <ExperimentTable
          all={experiments}
          experiments={[...experiments].reverse()}
          onInspect={onInspect}
          empty={<p>Select a saved run, or launch one from the console.</p>}
        />
      </section>
    </div>
  );
}
