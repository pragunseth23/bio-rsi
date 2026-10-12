"use client";
import { useId, useState } from "react";
import { AlertCircle, Check, ChevronDown, LoaderCircle, Play, ShieldCheck, Square } from "lucide-react";
import type { SeedPreview } from "@/hooks/use-seed-preview";
import { byKey } from "@/lib/chains";
import { LIMITS, PRESETS, WEIGHT_KEYS, type FieldErrors } from "@/lib/config";
import type { ConfigDraft, Objective } from "@/lib/types";

const OBJECTIVES: { value: Objective; label: string; hint: string }[] = [
  { value: "qed", label: "Maximize drug-likeness (QED)", hint: "Fitness is RDKit QED, 0–1. Higher is better." },
  { value: "logp", label: "Target lipophilicity (logP)", hint: "Fitness = −|calculated logP − target|. Best is 0." },
  { value: "multi", label: "Balanced multi-objective", hint: "Weighted mean of QED, logP, MW, TPSA and rule-based constraints." },
];

const WEIGHT_LABELS: Record<string, string> = {
  qed: "QED",
  logp: "logP proximity",
  mw: "MW near 300",
  tpsa: "TPSA near 75",
  constraints: "Constraints",
};

function Field({
  id,
  label,
  error,
  hint,
  children,
  aside,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="field" data-invalid={!!error || undefined}>
      <div className="field-label">
        <label htmlFor={id}>{label}</label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-msg`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-msg`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function RunConfig({
  draft,
  setDraft,
  errors,
  touched,
  preview,
  active,
  launching,
  stopping,
  canLaunch,
  simulator,
  chainMode,
  networkName,
  onLaunch,
  onStop,
}: {
  draft: ConfigDraft;
  setDraft: (d: ConfigDraft) => void;
  errors: FieldErrors;
  touched: boolean;
  preview: SeedPreview;
  active: boolean;
  launching: boolean;
  stopping: boolean;
  canLaunch: boolean;
  simulator?: string;
  chainMode?: string;
  networkName?: string;
  onLaunch: () => void;
  onStop: () => void;
}) {
  const uid = useId();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const set = <K extends keyof ConfigDraft>(key: K, value: ConfigDraft[K]) => setDraft({ ...draft, [key]: value });
  const show = (k: keyof FieldErrors) => (touched ? errors[k] : undefined);
  const iterations = Number(draft.iterations);
  const candidates = Number(draft.candidates);
  const budgetKnown = !errors.iterations && !errors.candidates;
  const objective = OBJECTIVES.find((o) => o.value === draft.objective)!;

  const smilesError =
    errors.smiles && (touched || draft.smiles.length > 0) ? errors.smiles : preview.state === "invalid" ? preview.message : undefined;

  const seedStatus =
    preview.state === "checking" ? (
      <span className="seed-status" data-state="checking">
        <LoaderCircle size={12} className="spin" aria-hidden="true" /> Checking
      </span>
    ) : preview.state === "valid" ? (
      <span className="seed-status" data-state="valid">
        <Check size={12} aria-hidden="true" /> Valid · {preview.candidate.properties.heavy_atoms} atoms
      </span>
    ) : preview.state === "unavailable" ? (
      <span className="seed-status" data-state="unavailable">
        Can’t check: service offline
      </span>
    ) : (
      <span className="seed-status">SMILES</span>
    );

  const numberInput = (key: "iterations" | "candidates" | "seed" | "target_logp", step = 1) => {
    const id = `${uid}-${key}`;
    return (
      <input
        id={id}
        type="number"
        inputMode={key === "target_logp" ? "decimal" : "numeric"}
        min={LIMITS[key].min}
        max={LIMITS[key].max}
        step={step}
        value={draft[key]}
        disabled={active}
        aria-invalid={!!show(key) || undefined}
        aria-describedby={`${id}-msg`}
        onChange={(e) => set(key, e.target.value)}
      />
    );
  };

  return (
    <section className="panel config" aria-labelledby={`${uid}-title`}>
      <header className="panel-head">
        <h3 id={`${uid}-title`}>Run configuration</h3>
      </header>
      <form
        className="panel-body"
        onSubmit={(e) => {
          e.preventDefault();
          onLaunch();
        }}
        noValidate
      >
        <Field id={`${uid}-smiles`} label="Starting molecule" error={smilesError} aside={seedStatus}>
          <textarea
            id={`${uid}-smiles`}
            value={draft.smiles}
            rows={2}
            disabled={active}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={!!smilesError || undefined}
            aria-describedby={`${uid}-smiles-msg`}
            onChange={(e) => set("smiles", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onLaunch();
              }
            }}
          />
        </Field>
        <div className="presets" role="group" aria-label="Example molecules">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              disabled={active}
              aria-pressed={p.smiles === draft.smiles.trim()}
              onClick={() => set("smiles", p.smiles)}
            >
              {p.name}
            </button>
          ))}
        </div>

        <p className="field-hint preset-note">
          Our tested demo: Ethanol with the default settings and seed 42 climbs from QED 0.407 to 0.946 in 30 generations.
        </p>

        <Field id={`${uid}-objective`} label="Objective" hint={objective.hint}>
          <div className="select">
            <select
              id={`${uid}-objective`}
              value={draft.objective}
              disabled={active}
              aria-describedby={`${uid}-objective-msg`}
              onChange={(e) => set("objective", e.target.value as Objective)}
            >
              {OBJECTIVES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </Field>

        <Field
          id={`${uid}-target_logp`}
          label="Target logP"
          error={show("target_logp")}
          hint={
            draft.objective === "qed"
              ? "Not scored under QED, but the search switches to polar fragments when logP overshoots it by more than 1."
              : `${LIMITS.target_logp.min} to ${LIMITS.target_logp.max}. Also steers the search toward polar fragments when overshot.`
          }
        >
          {numberInput("target_logp", 0.1)}
        </Field>

        {draft.objective === "multi" && (
          <fieldset className="weights" disabled={active}>
            <legend>Objective weights</legend>
            {WEIGHT_KEYS.map((k) => {
              const id = `${uid}-w-${k}`;
              const err = show(`weight_${k}`);
              return (
                <div className="weight" key={k} data-invalid={!!err || undefined}>
                  <label htmlFor={id}>{WEIGHT_LABELS[k]}</label>
                  <input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.weights[k]}
                    aria-invalid={!!err || undefined}
                    title={err}
                    onChange={(e) => set("weights", { ...draft.weights, [k]: e.target.value })}
                  />
                </div>
              );
            })}
            <p className={show("weights") || WEIGHT_KEYS.some((k) => show(`weight_${k}`)) ? "field-error" : "field-hint"}>
              {show("weights") ||
                (WEIGHT_KEYS.some((k) => show(`weight_${k}`)) ? "Each weight must be between 0 and 1." : "Each 0–1; normalized by their sum.")}
            </p>
          </fieldset>
        )}

        <div className="field-pair">
          <Field id={`${uid}-iterations`} label="Iterations" error={show("iterations")} hint="1–100">
            {numberInput("iterations")}
          </Field>
          <Field id={`${uid}-candidates`} label="Batch size" error={show("candidates")} hint="20–50">
            {numberInput("candidates")}
          </Field>
        </div>

        <div className="budget">
          <span>Evaluation budget</span>
          <strong className="num">
            {budgetKnown ? `≤ ${(iterations * candidates).toLocaleString()}` : "—"}
            <small> candidates</small>
          </strong>
        </div>

        <div className="disclosure" data-open={showAdvanced}>
          <button
            type="button"
            className="disclosure-toggle"
            aria-expanded={showAdvanced}
            aria-controls={`${uid}-advanced`}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            Reproducibility
            {errors.seed && touched && <AlertCircle size={13} className="text-bad" aria-label="Has an error" />}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <div className="disclosure-body" id={`${uid}-advanced`} hidden={!showAdvanced && !(errors.seed && touched)}>
            <Field id={`${uid}-seed`} label="Random seed" error={show("seed")} hint="Same seed + same config → same search.">
              {numberInput("seed")}
            </Field>
            <p className="engine">{simulator || "RDKit engine"}</p>
          </div>
        </div>

        <div className="config-actions">
          {active ? (
            <button type="button" className="btn btn-outline btn-block" onClick={onStop} disabled={stopping}>
              {stopping ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Square size={12} fill="currentColor" aria-hidden="true" />}
              {stopping ? "Stopping…" : "Stop run"}
            </button>
          ) : (
            <button type="submit" className="btn btn-accent btn-block btn-lg" disabled={!canLaunch || launching} aria-describedby={`${uid}-launch-note`}>
              {launching ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Play size={14} fill="currentColor" aria-hidden="true" />}
              {launching ? "Starting run…" : "Launch optimization"}
            </button>
          )}
          <p className="config-note" id={`${uid}-launch-note`}>
            <ShieldCheck size={14} aria-hidden="true" />
            {byKey(chainMode)
              ? `Each generation is hash-linked and committed to ${byKey(chainMode)!.name}.`
              : `Each generation is hash-linked locally. No onchain transactions until a ${networkName || "BNB Smart Chain Testnet"} wallet is configured.`}
          </p>
        </div>
      </form>
    </section>
  );
}
