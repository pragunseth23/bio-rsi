"use client";
import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDownRight, ShieldCheck } from "lucide-react";
import type { SceneInfo } from "@/components/molecular-scene";
import { ELEMENT_COLORS } from "@/components/molecular-scene";
import { useAnimatedNumber } from "@/hooks/use-motion";
import type { Tab } from "@/hooks/use-hash-tab";
import { fmt, objectiveLabel, pad } from "@/lib/format";
import type { Candidate, Run } from "@/lib/types";

const MolecularScene = dynamic(() => import("@/components/molecular-scene").then((m) => m.MolecularScene), {
  ssr: false,
  loading: () => <div className="scene" data-state="loading" />,
});

const shortObjective = (run: Run) =>
  ({ qed: "QED", logp: `logP → ${run.config.target_logp}`, multi: "Multi" })[run.config.objective] || run.config.objective;

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export const Hero = memo(function Hero({
  run,
  best,
  seed,
  sceneSmiles,
  active,
  lastEntry,
  goTo,
}: {
  run: Run | null;
  best?: Candidate;
  seed?: Candidate;
  sceneSmiles: string;
  active: boolean;
  lastEntry?: Run;
  goTo: (tab: Tab) => void;
}) {
  const [info, setInfo] = useState<SceneInfo | null>(null);
  const fitness = useAnimatedNumber(best?.fitness ?? seed?.fitness);
  const evaluated = useAnimatedNumber(run?.evaluated);
  const specimenLabel = run ? (best && best.smiles !== run.initial.smiles ? "Current best" : "Seed molecule") : "Seed preview";

  return (
    <section className="hero" aria-labelledby="hero-title" data-parallax-root>
      <div className="hero-copy">
        <p className="kicker kicker-dark">A lab notebook for molecular search</p>
        <h1 id="hero-title" className="hero-title">
          <span className="line" style={{ "--i": 0 } as React.CSSProperties}>
            <span>Evolve a molecule.</span>
          </span>
          <span className="line" style={{ "--i": 1 } as React.CSSProperties}>
            <span>
              <em>Keep the receipts.</em>
            </span>
          </span>
        </h1>
        <p className="hero-lede">
          Give it a starting molecule and a goal. A small evolutionary search mutates it, checks every candidate with
          RDKit, keeps the five best, and writes each generation into a hash chain, so anyone can check later that the
          record wasn’t edited.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-paper btn-lg" onClick={() => goTo("optimization")}>
            Open the bench
            <ArrowDownRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-ghost-dark btn-lg" onClick={() => goTo("verification")}>
            <ShieldCheck size={17} aria-hidden="true" />
            Check a record
          </button>
        </div>
        {lastEntry && (
          <p className="notebook-note">
            <span className="note-date">{dateOf(lastEntry.updated_at || lastEntry.created_at)}</span>
            <span>
              Last finished run: <code>{lastEntry.config.smiles}</code> went from {fmt(lastEntry.initial.fitness)} to{" "}
              <strong>{fmt(lastEntry.best_fitness)}</strong> ({shortObjective(lastEntry)}) in {lastEntry.iteration} generations,{" "}
              {lastEntry.evaluated.toLocaleString()} candidates scored.
            </span>
          </p>
        )}
        <p className="hero-footnote">
          Scores are RDKit heuristics. They say nothing about whether a molecule works in a body, or is safe.
        </p>
        <p className="track-line">
          Built at B@B Hacks 2.0 for the <strong>YZi Labs track</strong>: tamper-evident logs for an AI agent doing
          science, built to commit every generation to <strong>BNB Chain</strong> (BSC Testnet).
        </p>
      </div>

      <div className="specimen">
        <div className="specimen-head">
          <span className="specimen-kicker">
            <span className={`live-dot ${active ? "is-live" : ""}`} aria-hidden="true" />
            {active ? "Optimizing now" : specimenLabel}
          </span>
          <code className="specimen-smiles" title={info?.smiles || sceneSmiles}>
            {info?.smiles || sceneSmiles}
          </code>
        </div>
        <MolecularScene smiles={sceneSmiles} running={active} onInfo={setInfo} />
        <div className="specimen-legend" aria-label="Heavy atoms by element">
          {info ? (
            <>
              {Object.entries(info.elements).map(([el, n]) => (
                <span key={el}>
                  <i style={{ background: ELEMENT_COLORS[el] || "#aab3c5" }} aria-hidden="true" />
                  {el}
                  <b className="num">{n}</b>
                </span>
              ))}
              <span className="specimen-note">
                {info.geometry === "illustrative-conformer" ? "Illustrative conformer (ETKDG + MMFF), drag to turn" : "2D layout"}
              </span>
            </>
          ) : (
            <span className="specimen-note">Building geometry…</span>
          )}
        </div>
        <dl className="readout">
          <div>
            <dt>{run ? "Best fitness" : "Seed fitness"}</dt>
            <dd className="num">{fmt(fitness)}</dd>
          </div>
          <div>
            <dt>Generation</dt>
            <dd className="num">
              {run ? (
                <>
                  {pad(run.iteration)}
                  <small> / {run.config.iterations}</small>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Scored</dt>
            <dd className="num">{evaluated === undefined ? "—" : Math.round(evaluated).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Objective</dt>
            <dd title={run ? objectiveLabel(run.config.objective) : undefined}>{run ? shortObjective(run) : "Not started"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
});
