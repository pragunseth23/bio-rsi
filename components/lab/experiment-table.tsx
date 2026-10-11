"use client";
import { useEffect, useRef } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Molecule } from "./molecule";
import { StatusBadge } from "./status";
import { fmt, pad, shortHash } from "@/lib/format";
import type { Experiment } from "@/lib/types";

/** Rows newer than the first render of this table get a brief highlight on arrival. */
export function ExperimentTable({
  experiments,
  onInspect,
  selectedHash,
  empty,
}: {
  experiments: Experiment[];
  onInspect: (e: Experiment) => void;
  selectedHash?: string;
  empty: React.ReactNode;
}) {
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current) experiments.forEach((e) => !seen.current!.has(e.hash) && fresh.add(e.hash));
  useEffect(() => {
    seen.current = new Set(experiments.map((e) => e.hash));
  }, [experiments]);

  if (experiments.length === 0) return <div className="table-empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="records">
        <thead>
          <tr>
            <th scope="col">Gen</th>
            <th scope="col">Best molecule</th>
            <th scope="col" className="num-col">Fitness</th>
            <th scope="col" className="num-col hide-sm">Evaluated</th>
            <th scope="col" className="hide-sm">Commitment</th>
            <th scope="col" className="hide-md">Record hash</th>
            <th scope="col">
              <span className="sr-only">Inspect</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((e) => (
            <tr
              key={e.hash}
              data-fresh={fresh.has(e.hash) || undefined}
              data-selected={selectedHash === e.hash || undefined}
              onClick={() => onInspect(e)}
            >
              <td className="num">{pad(e.record.iteration)}</td>
              <td>
                <div className="cell-molecule">
                  <Molecule smiles={e.record.smiles} size="sm" />
                  <code title={e.record.smiles}>{e.record.smiles}</code>
                </div>
              </td>
              <td className="num num-col strong">{fmt(e.record.fitness)}</td>
              <td className="num num-col hide-sm">
                {e.record.iteration === 0 ? (
                  <span className="muted">seed</span>
                ) : (
                  <>
                    {e.record.stats.valid}
                    <small> / {e.record.stats.attempted}</small>
                  </>
                )}
              </td>
              <td className="hide-sm">
                <StatusBadge status={e.proof.status} />
                {e.proof.transaction_hash && (
                  <a
                    className="tx-link"
                    href={`https://sepolia.basescan.org/tx/${e.proof.transaction_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    {shortHash(e.proof.transaction_hash)}
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                )}
              </td>
              <td className="hide-md">
                <code className="hash">{shortHash(e.hash)}</code>
              </td>
              <td className="cell-action">
                <button
                  type="button"
                  aria-label={`Inspect generation ${e.record.iteration}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onInspect(e);
                  }}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
