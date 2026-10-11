"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
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

const WORDS = ["Discover.", "Evolve.", "Prove."];

export function Hero({
  run,
  best,
  seed,
  sceneSmiles,
  active,
  goTo,
}: {
  run: Run | null;
  best?: Candidate;
  seed?: Candidate;
  sceneSmiles: string;
  active: boolean;
  goTo: (tab: Tab) => void;
}) {
  const [info, setInfo] = useState<SceneInfo | null>(null);
  const fitness = useAnimatedNumber(best?.fitness ?? seed?.fitness);
  const evaluated = useAnimatedNumber(run?.evaluated);
  const specimenLabel = run ? (best && best.smiles !== run.initial.smiles ? "Current best" : "Seed molecule") : "Seed preview";

  return (
    <section className="hero" aria-labelledby="hero-title" data-parallax-root>
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-copy">
        <p className="eyebrow eyebrow-dark">
          <span>01</span> Autonomous molecular optimisation
        </p>
        <h1 id="hero-title" className="hero-title">
          {WORDS.map((w, i) => (
            <span key={w} className="word" style={{ "--i": i } as React.CSSProperties}>
              <span>{w}</span>
            </span>
          ))}
        </h1>
        <p className="hero-lede">
          Seed a molecule and choose an objective. An evolutionary search proposes, validates and scores
          candidates with RDKit, keeps the five strongest, and seals every generation into a SHA-256 hash
          chain you can verify.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-paper btn-lg" onClick={() => goTo("optimization")}>
            Start an experiment
            <ArrowDownRight size={18} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-ghost-dark btn-lg" onClick={() => goTo("verification")}>
            <ShieldCheck size={17} aria-hidden="true" />
            Verify a record
          </button>
        </div>
        <p className="hero-footnote">Scores are computational heuristics, not evidence of efficacy or safety.</p>
      </div>

      <div className="specimen">
        <div className="specimen-head">
          <span className="specimen-kicker">
            <span className={`live-dot ${active ? "is-live" : ""}`} aria-hidden="true" />
            {active ? "Optimising" : specimenLabel}
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
                {info.geometry === "illustrative-conformer" ? "Illustrative conformer · ETKDG + MMFF" : "2D layout"}
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
            <dt>Evaluated</dt>
            <dd className="num">{evaluated === undefined ? "—" : Math.round(evaluated).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Objective</dt>
            <dd title={run ? objectiveLabel(run.config.objective) : undefined}>{run ? { qed: "QED", logp: `logP → ${run.config.target_logp}`, multi: "Multi" }[run.config.objective] || run.config.objective : "Not started"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
