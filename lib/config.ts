import type { Config, ConfigDraft, WeightKey } from "./types";

export const WEIGHT_KEYS: WeightKey[] = ["qed", "logp", "mw", "tpsa", "constraints"];

export const DEFAULT_CONFIG: Config = {
  smiles: "CCO",
  objective: "qed",
  iterations: 30,
  candidates: 30,
  target_logp: 2,
  seed: 42,
  weights: { qed: 0.4, logp: 0.2, mw: 0.15, tpsa: 0.15, constraints: 0.1 },
};

export const PRESETS = [
  { name: "Ethanol", smiles: "CCO" },
  { name: "Phenol", smiles: "Oc1ccccc1" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
];

/** Mirrors backend/main.py RunConfig. Keep in sync. */
export const LIMITS = {
  iterations: { min: 1, max: 100, int: true },
  candidates: { min: 20, max: 50, int: true },
  target_logp: { min: -3, max: 6, int: false },
  seed: { min: 0, max: 4294967295, int: true },
} as const;

export const toDraft = (c: Config): ConfigDraft => ({
  smiles: c.smiles,
  objective: c.objective,
  iterations: String(c.iterations),
  candidates: String(c.candidates),
  target_logp: String(c.target_logp),
  seed: String(c.seed),
  weights: Object.fromEntries(
    WEIGHT_KEYS.map((k) => [k, String(c.weights?.[k] ?? DEFAULT_CONFIG.weights[k])]),
  ) as Record<WeightKey, string>,
});

export type FieldErrors = Partial<Record<keyof ConfigDraft | `weight_${WeightKey}` | "weights", string>>;

function numberField(value: string, { min, max, int }: { min: number; max: number; int: boolean }) {
  if (value.trim() === "") return { error: "Required" };
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: "Enter a number" };
  if (int && !Number.isInteger(n)) return { error: "Whole numbers only" };
  if (n < min || n > max) return { error: `Between ${min.toLocaleString()} and ${max.toLocaleString()}` };
  return { value: n };
}

export function parseDraft(d: ConfigDraft): { config?: Config; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const smiles = d.smiles.trim();
  if (!smiles) errors.smiles = "Enter a SMILES string";
  else if (smiles.length > 500) errors.smiles = "At most 500 characters";
  const out: Record<string, number> = {};
  for (const key of ["iterations", "candidates", "target_logp", "seed"] as const) {
    const r = numberField(d[key], LIMITS[key]);
    if (r.error) errors[key] = r.error;
    else out[key] = r.value!;
  }
  const weights = {} as Record<WeightKey, number>;
  if (d.objective === "multi") {
    for (const k of WEIGHT_KEYS) {
      const r = numberField(d.weights[k], { min: 0, max: 1, int: false });
      if (r.error) errors[`weight_${k}`] = r.error;
      else weights[k] = r.value!;
    }
    if (!WEIGHT_KEYS.some((k) => errors[`weight_${k}`]) && WEIGHT_KEYS.every((k) => weights[k] === 0))
      errors.weights = "At least one weight must be above 0";
  } else {
    // Weights are unused outside "multi"; send valid values either way.
    for (const k of WEIGHT_KEYS) {
      const n = Number(d.weights[k]);
      weights[k] = Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_CONFIG.weights[k];
    }
    if (WEIGHT_KEYS.every((k) => weights[k] === 0)) Object.assign(weights, DEFAULT_CONFIG.weights);
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    config: {
      smiles,
      objective: d.objective,
      iterations: out.iterations,
      candidates: out.candidates,
      target_logp: out.target_logp,
      seed: out.seed,
      weights,
    },
  };
}
