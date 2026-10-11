"use client";
import { Dialog } from "radix-ui";
import { ChevronDown, X } from "lucide-react";
import { Molecule } from "./molecule";
import { PropertyGrid } from "./property-grid";
import { fmt, signed } from "@/lib/format";
import type { Experiment } from "@/lib/types";

export function CompareDialog({
  open,
  onOpenChange,
  experiments,
  pair,
  setPair,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  experiments: Experiment[];
  pair: [number, number];
  setPair: (p: [number, number]) => void;
}) {
  const byGen = (g: number) => experiments.find((e) => e.record.iteration === g);
  const [a, b] = [byGen(pair[0]), byGen(pair[1])];
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog compare">
          <header className="dialog-head">
            <div>
              <Dialog.Title>Compare generations</Dialog.Title>
              <Dialog.Description>RDKit structures and descriptors of two recorded generations.</Dialog.Description>
            </div>
            <Dialog.Close className="icon-btn" aria-label="Close comparison">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className="compare-grid">
            {([0, 1] as const).map((side) => {
              const exp = side === 0 ? a : b;
              const other = side === 0 ? undefined : a;
              return (
                <div className="compare-col" key={side}>
                  <label className="field-label" htmlFor={`compare-${side}`}>
                    {side === 0 ? "Reference" : "Comparison"}
                  </label>
                  <div className="select">
                    <select
                      id={`compare-${side}`}
                      value={pair[side]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setPair(side === 0 ? [v, pair[1]] : [pair[0], v]);
                      }}
                    >
                      {experiments.map((e) => (
                        <option key={e.hash} value={e.record.iteration}>
                          Generation {e.record.iteration} · {fmt(e.record.fitness)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={15} aria-hidden="true" />
                  </div>
                  {exp && (
                    <>
                      <div className="compare-specimen">
                        <Molecule smiles={exp.record.smiles} />
                      </div>
                      <code className="compare-smiles">{exp.record.smiles}</code>
                      <div className="compare-fitness">
                        <span>Fitness</span>
                        <strong className="num">{fmt(exp.record.fitness)}</strong>
                        {other && <em className="num">{signed(exp.record.fitness - other.record.fitness)}</em>}
                      </div>
                      <PropertyGrid candidate={exp.record} reference={other?.record} />
                      <p className="compare-method">
                        {exp.record.iteration === 0
                          ? "Seed molecule"
                          : `Mutation: ${exp.record.mutation.method}${exp.record.mutation.strategy ? ` · ${exp.record.mutation.strategy}` : ""}`}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {a && b && a.record.smiles === b.record.smiles && (
            <p className="compare-note">Same structure: the elite survived unchanged between these generations.</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
