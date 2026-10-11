export const fmt = (n: number | undefined | null, digits = 3) =>
  n === undefined || n === null || Number.isNaN(n) ? "—" : n.toFixed(digits);

export const signed = (n: number, digits = 3) => {
  const rounded = Number(n.toFixed(digits));
  return `${rounded > 0 ? "+" : rounded < 0 ? "−" : "±"}${Math.abs(rounded).toFixed(digits)}`;
};

export const shortHash = (s?: string) =>
  s ? `${s.slice(0, 10)}…${s.slice(-6)}` : "—";

export const pad = (n: number) => String(n).padStart(2, "0");

export const statusLabel = (status: string) =>
  ({
    "local-only": "Local hash chain",
    verified: "Committed onchain",
    pending: "Commit pending",
    failed: "Failed",
    running: "Running",
    completed: "Completed",
    stopped: "Stopped",
    interrupted: "Interrupted",
  })[status] || status;

export const objectiveLabel = (o: string) =>
  ({ qed: "Drug-likeness (QED)", logp: "Target logP", multi: "Multi-objective" })[o] || o;

export const PROPERTY_LABELS = {
  qed: { label: "QED", unit: "", digits: 3 },
  mw: { label: "Mol. weight", unit: "Da", digits: 1 },
  logp: { label: "cLogP", unit: "", digits: 2 },
  tpsa: { label: "TPSA", unit: "Å²", digits: 1 },
} as const;

export const relativeTime = (iso: string) => {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};
