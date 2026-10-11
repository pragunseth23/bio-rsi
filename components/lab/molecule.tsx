"use client";
import { useEffect, useState } from "react";
import { svgUrl } from "@/lib/api";

/**
 * RDKit 2D depiction. When the structure changes, the new drawing crossfades over
 * the previous one; no geometric morph is implied between unrelated structures.
 */
export function Molecule({ smiles, size = "md" }: { smiles: string; size?: "sm" | "md" }) {
  const [layers, setLayers] = useState<{ smiles: string; loaded: boolean; failed: boolean }[]>([
    { smiles, loaded: false, failed: false },
  ]);

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top.smiles === smiles) return prev;
      // Keep only the last successfully drawn layer beneath the incoming one.
      const base = top.loaded && !top.failed ? [top] : prev.filter((l) => l.loaded && !l.failed).slice(-1);
      if (base[0]?.smiles === smiles) return base;
      return [...base, { smiles, loaded: false, failed: false }];
    });
  }, [smiles]);

  const update = (s: string, patch: Partial<{ loaded: boolean; failed: boolean }>) =>
    setLayers((prev) => {
      const next = prev.map((l) => (l.smiles === s ? { ...l, ...patch } : l));
      const top = next[next.length - 1];
      return top.loaded ? [top] : next;
    });

  const top = layers[layers.length - 1];
  return (
    <div className={`molecule molecule-${size}`}>
      {layers.map((l) =>
        l.failed ? null : (
          // RDKit returns SVG; a plain <img> keeps it vector and cacheable.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={l.smiles}
            src={svgUrl(l.smiles)}
            alt={l === top ? `2D structure of ${l.smiles}` : ""}
            aria-hidden={l === top ? undefined : true}
            data-loaded={l.loaded}
            onLoad={() => update(l.smiles, { loaded: true })}
            onError={() => update(l.smiles, { failed: true, loaded: true })}
            draggable={false}
          />
        ),
      )}
      {top.failed && <span className="molecule-missing">Structure unavailable</span>}
    </div>
  );
}
