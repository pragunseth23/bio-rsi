import { statusLabel } from "@/lib/format";

const tone = (status: string) =>
  ({
    running: "live",
    completed: "ok",
    verified: "ok",
    "local-only": "neutral",
    pending: "warn",
    stopped: "neutral",
    interrupted: "warn",
    failed: "bad",
  })[status] || "neutral";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="badge" data-tone={tone(status)}>
      <span className="badge-dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

export function Metric({
  label,
  value,
  unit,
  hint,
  size = "md",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className={`metric metric-${size}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}
