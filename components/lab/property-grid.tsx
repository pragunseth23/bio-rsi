import { PROPERTY_LABELS, fmt, signed } from "@/lib/format";
import type { Candidate } from "@/lib/types";

const KEYS = ["qed", "mw", "logp", "tpsa"] as const;

/** RDKit-computed descriptors, optionally with the change from a reference molecule. */
export function PropertyGrid({ candidate, reference }: { candidate?: Candidate; reference?: Candidate }) {
  return (
    <dl className="properties">
      {KEYS.map((k) => {
        const meta = PROPERTY_LABELS[k];
        const value = candidate?.properties[k];
        const delta = candidate && reference ? value! - reference.properties[k] : undefined;
        return (
          <div key={k}>
            <dt>{meta.label}</dt>
            <dd>
              <span className="num">{fmt(value, meta.digits)}</span>
              {meta.unit && value !== undefined && <small>{meta.unit}</small>}
            </dd>
            {delta !== undefined && (
              <dd className="delta" data-sign={Math.sign(Number(delta.toFixed(meta.digits)))}>
                {signed(delta, meta.digits)}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
