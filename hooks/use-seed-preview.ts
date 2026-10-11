"use client";
import { useEffect, useState } from "react";
import { ApiError, isNetworkError, postJson } from "@/lib/api";
import { DEFAULT_CONFIG } from "@/lib/config";
import type { Candidate, Config, ConfigDraft } from "@/lib/types";

export type SeedPreview =
  | { state: "idle" }
  | { state: "checking"; last?: Candidate }
  | { state: "valid"; candidate: Candidate }
  | { state: "invalid"; message: string }
  | { state: "unavailable" };

/**
 * Debounced server-side validation of the starting molecule. Uses the same RDKit
 * evaluation as launching a run, so a "valid" seed is exactly what the run will score.
 */
export function useSeedPreview(draft: ConfigDraft, config: Config | undefined, enabled: boolean) {
  const [preview, setPreview] = useState<SeedPreview>({ state: "idle" });
  const smiles = draft.smiles.trim();
  // Only fields that change the seed's score participate.
  const body = {
    ...DEFAULT_CONFIG,
    smiles,
    objective: draft.objective,
    target_logp: config?.target_logp ?? DEFAULT_CONFIG.target_logp,
    weights: config?.weights ?? DEFAULT_CONFIG.weights,
  };
  const key = JSON.stringify(body);

  useEffect(() => {
    if (!enabled || !smiles || smiles.length > 500) {
      setPreview({ state: "idle" });
      return;
    }
    const controller = new AbortController();
    setPreview((p) => ({ state: "checking", last: p.state === "valid" ? p.candidate : p.state === "checking" ? p.last : undefined }));
    const timer = window.setTimeout(() => {
      postJson<Candidate>("/api/molecule/evaluate", JSON.parse(key), controller.signal)
        .then((candidate) => setPreview({ state: "valid", candidate }))
        .catch((e) => {
          if ((e as Error).name === "AbortError") return;
          if (isNetworkError(e)) setPreview({ state: "unavailable" });
          else if (e instanceof ApiError && e.status === 422) setPreview({ state: "invalid", message: e.message });
          else setPreview({ state: "invalid", message: (e as Error).message });
        });
    }, 320);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, enabled, smiles]);

  return preview;
}
