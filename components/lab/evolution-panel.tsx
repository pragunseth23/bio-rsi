"use client";
import { memo, useEffect, useRef, useState } from "react";
import { ArrowRight, GitCompareArrows } from "lucide-react";
import { Molecule } from "./molecule";
import { PropertyGrid } from "./property-grid";
import { useAnimatedNumber } from "@/hooks/use-motion";
import { fmt, pad, signed } from "@/lib/format";
import type { Candidate, Experiment, Run } from "@/lib/types";

/** Shows a short-lived chip only when the live best fitness actually increases. */
function useImprovement(runId: string | undefined, fitness: number | undefined) {
  const [chip, setChip] = useState<{ delta: number; key: number } | null>(null);
  const last = useRef<{ runId?: string; fitness?: number }>({});
  useEffect(() => {
    const prev = last.current;
    if (prev.runId === runId && prev.fitness !== undefined && fitness !== undefined && fitness > prev.fitness + 1e-9) {
      setChip({ delta: fitness - prev.fitness, key: Date.now() });
    }
    if (prev.runId !== runId) setChip(null);
    last.current = { runId, fitness };
  }, [runId, fitness]);
  useEffect(() => {
    if (!chip) return;
    const t = window.setTimeout(() => setChip(null), 2600);
    return () => window.clearTimeout(t);
  }, [chip]);
  return chip;
}

export const EvolutionPanel = memo(function EvolutionPanel({
  run,
  seed,
  best,
  generation,
  live,
  canCompare,
  onCompare,
  latest,
}: {
  latest?: Experiment;
  run: Run | null;
  seed?: Candidate;
  best?: Candidate;
  generation: number;
  live: boolean;
  canCompare: boolean;
  onCompare: () => void;
}) {
  const chip = useImprovement(run?.id, live ? best?.fitness : undefined);
  const bestFitness = useAnimatedNumber(best?.fitness);
  const gain = best && run ? best.fitness - run.initial.fitness : undefined;

  return (
    <section className="panel evolution" aria-labelledby="evolution-title">
      <header className="panel-head">
        <h3 id="evolution-title">Molecular evolution</h3>
        <span className="panel-meta">
          <span className={`live-dot ${live ? "is-live" : ""}`} aria-hidden="true" />
          {live ? "Live" : "RDKit 2D"}
        </span>
      </header>
      <div className="specimen-pair">
        <figure className="specimen-card">
          <figcaption>
            <span>{run ? "Seed" : "Seed preview"}</span>
            <span className="num">Gen 00</span>
          </figcaption>
          {seed ? <Molecule smiles={seed.smiles} /> : <div className="molecule molecule-md molecule-empty">Enter a valid SMILES</div>}
          <code title={seed?.smiles}>{seed?.smiles || "—"}</code>
          <div className="specimen-score">
            <span className="num">{fmt(seed?.fitness)}</span>
            <small>Fitness</small>
          </div>
        </figure>
        <div className="specimen-arrow" aria-hidden="true">
          <ArrowRight size={16} />
        </div>
        <figure className="specimen-card is-best" data-empty={!run || undefined}>
          <figcaption>
            <span>Current best</span>
            <span className="num">Gen {pad(generation)}</span>
          </figcaption>
          {run && best ? (
            <Molecule smiles={best.smiles} />
          ) : (
            <div className="molecule molecule-md molecule-empty">
              The best structure appears here once a run starts.
            </div>
          )}
          <code title={run ? best?.smiles : undefined}>{run ? best?.smiles : "—"}</code>
          <div className="specimen-score">
            <span className="num">{run ? fmt(bestFitness) : "—"}</span>
            <small>Best fitness</small>
            {run && gain !== undefined && gain > 0 && (
              <span className="gain num" title="Change from seed fitness">
                {signed(gain)}
              </span>
            )}
          </div>
          {chip && (
            <span key={chip.key} className="improve-chip num" role="status">
              Improved {signed(chip.delta)}
            </span>
          )}
        </figure>
      </div>
      <div className="section-label">
        <span>Computed properties · {run ? "current best" : "seed"}</span>
        {run && <span>Δ from seed</span>}
      </div>
      <PropertyGrid candidate={run ? best : seed} reference={run ? run.initial : undefined} />
      {run && latest && (
        <dl className="lineage">
          <div>
            <dt>Origin of best</dt>
            <dd>
              {latest.record.mutation.method === "seed"
                ? "Seed molecule (no improvement yet)"
                : `${latest.record.mutation.method} mutation${latest.record.mutation.strategy ? ` · ${latest.record.mutation.strategy} strategy` : ""}`}
            </dd>
          </div>
          {latest.record.iteration > 0 && (
            <div>
              <dt>Generation {latest.record.iteration}</dt>
              <dd className="num">
                {latest.record.stats.valid} new · {latest.record.stats.invalid} invalid · {latest.record.stats.duplicates} duplicate
                <span className="muted"> / {latest.record.stats.attempted} attempts</span>
              </dd>
            </div>
          )}
        </dl>
      )}
      <footer className="panel-foot">
        <span>Elitist selection · top 5 retained per generation</span>
        <button type="button" className="link-btn" disabled={!canCompare} onClick={onCompare}>
          <GitCompareArrows size={14} aria-hidden="true" />
          Compare generations
        </button>
      </footer>
    </section>
  );
});
