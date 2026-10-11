"use client";
import { explorerLink, networkName } from "@/lib/chain";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Molecule } from "./molecule";
import { PropertyGrid } from "./property-grid";
import { StatusBadge } from "./status";
import { postJson } from "@/lib/api";
import { fmt, pad, shortHash } from "@/lib/format";
import type { Experiment, Verification } from "@/lib/types";

type CheckRow = {
  label: string;
  detail: string;
  state: "pass" | "fail" | "skip";
};

// `v.status` is overwritten with "failed" by the server when integrity breaks, so the
// commitment state is taken from the record's own proof status instead.
function checksFor(v: Verification, proofStatus: string): CheckRow[] {
  return [
    {
      label: "Record hash recomputed",
      detail: v.hash_matches
        ? `SHA-256 of the canonical record matches ${shortHash(v.recomputed_hash)}`
        : `Recomputed ${shortHash(v.recomputed_hash)} differs from the stored hash`,
      state: v.hash_matches ? "pass" : "fail",
    },
    {
      label: "Parent chain walked",
      detail: v.chain_valid
        ? "Every ancestor from generation 0 links to its parent and re-hashes correctly"
        : "At least one ancestor was modified, is missing, or does not link to its parent",
      state: v.chain_valid ? "pass" : "fail",
    },
    {
      label: "Onchain commitment",
      detail:
        v.onchain_matches === true
          ? `Contract storage and commitment event match · ${v.onchain?.confirmations ?? "?"} confirmations`
          : v.onchain_matches === false
            ? "Contract storage does not match this record hash"
            : v.status === "unavailable"
              ? `RPC unavailable${v.error ? `: ${v.error}` : ""}`
              : proofStatus === "local-only"
                ? "Not applicable in local-only mode"
                : `Not checked (commitment ${proofStatus})`,
      state:
        v.onchain_matches === true
          ? "pass"
          : v.onchain_matches === false
            ? "fail"
            : "skip",
    },
  ];
}

export function VerificationView({
  experiments,
  selected,
  onSelect,
  onRetryCommitments,
  onError,
}: {
  experiments: Experiment[];
  selected: Experiment | null;
  onSelect: (e: Experiment) => void;
  onRetryCommitments: () => void;
  onError: (message: string) => void;
}) {
  const [result, setResult] = useState<{
    hash: string;
    v: Verification;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [shown, setShown] = useState(0); // checks revealed so far, after the server answered
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const request = useRef(0);
  const current = selected
    ? experiments.find((e) => e.hash === selected.hash) || selected
    : null;
  const verification =
    result && current && result.hash === current.hash ? result.v : null;

  useEffect(() => {
    if (!verification) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      setShown(3);
      return;
    }
    setShown(0);
    const timers = [1, 2, 3].map((n) =>
      window.setTimeout(() => setShown(n), n * 220),
    );
    return () => timers.forEach(clearTimeout);
  }, [verification]);

  async function verify() {
    if (!current) return;
    const id = ++request.current;
    setVerifying(true);
    setResult(null);
    try {
      const v = await postJson<Verification>(
        `/api/verify/${encodeURIComponent(current.record.id)}`,
      );
      if (id === request.current) setResult({ hash: current.hash, v });
    } catch (e) {
      if (id === request.current) onError((e as Error).message);
    } finally {
      if (id === request.current) setVerifying(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.setTimeout(() => setCopied(null), 1800);
  }

  // Integrity (hash + parent chain) and the onchain commitment are separate questions.
  const intact =
    !!verification && verification.hash_matches && verification.chain_valid;
  const verdict = !verification
    ? null
    : !intact
      ? {
          tone: "bad",
          text: "Integrity check failed: this record or one of its ancestors no longer matches its hash.",
        }
      : verification.onchain_matches === true
        ? {
            tone: "ok",
            text: `Verified: the record, event and contract storage match on ${networkName(current?.proof.chain_id)}.`,
          }
        : verification.onchain_matches === false
          ? {
              tone: "bad",
              text: "Mismatch: the local record is intact but differs from what was committed onchain.",
            }
          : current?.proof.status === "local-only"
            ? {
                tone: "ok",
                text: "Local integrity verified. This run used local-only mode, so nothing was committed onchain.",
              }
            : current?.proof.status === "pending"
              ? {
                  tone: "warn",
                  text: "Local integrity verified. The onchain commitment is still pending.",
                }
              : verification.status === "unavailable"
                ? {
                    tone: "warn",
                    text: "Local integrity verified. The onchain check could not reach the RPC endpoint.",
                  }
                : {
                    tone: "warn",
                    text: "Local integrity verified. The onchain commitment failed; retry it below.",
                  };
  const checks =
    verification && current
      ? checksFor(verification, current.proof.status)
      : [];

  return (
    <div className="verification">
      <section className="panel picker" aria-labelledby="picker-title">
        <header className="panel-head">
          <h3 id="picker-title">Records</h3>
          <span className="panel-meta num">{experiments.length}</span>
        </header>
        {experiments.length === 0 ? (
          <p className="panel-empty">
            Launch or select a run to create a verifiable record chain.
          </p>
        ) : (
          <ul className="record-list">
            {[...experiments].reverse().map((e) => (
              <li key={e.hash}>
                <button
                  type="button"
                  aria-current={current?.hash === e.hash || undefined}
                  onClick={() => onSelect(e)}
                >
                  <span>
                    Generation {pad(e.record.iteration)}
                    <code>{shortHash(e.hash)}</code>
                  </span>
                  <strong className="num">{fmt(e.record.fitness)}</strong>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel verify" aria-labelledby="verify-title">
        <header className="panel-head">
          <h3 id="verify-title">Integrity verification</h3>
          {current && <StatusBadge status={current.proof.status} />}
        </header>
        {!current ? (
          <div className="panel-empty verify-empty">
            <ShieldCheck size={28} aria-hidden="true" />
            <p>
              Pick a record. Verification recomputes its SHA-256 hash from the
              canonical JSON and walks the parent chain back to generation 0, so
              any edit to any ancestor is detected.
            </p>
          </div>
        ) : (
          <div className="verify-body">
            <div className="verify-subject">
              <div className="verify-molecule">
                <Molecule smiles={current.record.smiles} />
              </div>
              <div>
                <p className="section-label">
                  <span>Generation {current.record.iteration}</span>
                  <span className="num">
                    fitness {fmt(current.record.fitness)}
                  </span>
                </p>
                <code className="verify-smiles">{current.record.smiles}</code>
                <PropertyGrid candidate={current.record} />
              </div>
            </div>

            <dl className="hashes">
              <div>
                <dt>Record hash</dt>
                <dd>
                  <code>{current.hash}</code>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => copy(current.hash)}
                    aria-label={copied === "ok" ? "Copied" : "Copy record hash"}
                  >
                    {copied === "ok" ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                  </button>
                  <span className="copy-status" role="status">
                    {copied === "ok"
                      ? "Copied"
                      : copied === "fail"
                        ? "Clipboard blocked: select the hash to copy"
                        : ""}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Parent hash</dt>
                <dd>
                  <code>{current.record.parent_hash}</code>
                </dd>
              </div>
              <div>
                <dt>Candidate hash</dt>
                <dd>
                  <code>{current.record.candidate_hash}</code>
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>
                  {`${networkName(current.proof.chain_id)}${current.proof.chain_id ? ` · ${current.proof.chain_id}` : ""}`}
                  {current.proof.block_number
                    ? ` · block ${current.proof.block_number}`
                    : ""}
                  {current.proof.transaction_hash && (
                    <a
                      href={explorerLink(
                        current.proof.chain_id,
                        "tx",
                        current.proof.transaction_hash,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortHash(current.proof.transaction_hash)}
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </dd>
              </div>
              {current.proof.contract_address && (
                <div>
                  <dt>Registry</dt>
                  <dd>
                    <a
                      href={explorerLink(
                        current.proof.chain_id,
                        "address",
                        current.proof.contract_address,
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <code>{current.proof.contract_address}</code>
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              )}
              {current.proof.confirmations !== undefined && (
                <div>
                  <dt>Confirmations</dt>
                  <dd>
                    {current.proof.confirmations} observed ·{" "}
                    {current.proof.confirmations_required} required
                  </dd>
                </div>
              )}
            </dl>

            {current.proof.error && (
              <p className="field-error">{current.proof.error}</p>
            )}
            <div className="verify-actions">
              <button
                type="button"
                className="btn btn-ink"
                onClick={verify}
                disabled={verifying}
              >
                {verifying ? (
                  <LoaderCircle size={15} className="spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck size={15} aria-hidden="true" />
                )}
                {verifying
                  ? "Verifying on the server…"
                  : verification
                    ? "Verify again"
                    : "Verify experiment"}
              </button>
              {current.proof.status === "failed" && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={onRetryCommitments}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  Retry failed commitments
                </button>
              )}
            </div>

            <div className="checks" aria-live="polite">
              {verification && (
                <>
                  <ol>
                    {checks.map((c, i) => (
                      <li
                        key={c.label}
                        data-state={c.state}
                        data-shown={i < shown || undefined}
                      >
                        <span className="check-icon" aria-hidden="true">
                          {c.state === "pass" ? (
                            <Check size={13} />
                          ) : c.state === "fail" ? (
                            <X size={13} />
                          ) : (
                            "–"
                          )}
                        </span>
                        <span>
                          <strong>{c.label}</strong>
                          <small>{c.detail}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p
                    className="verdict"
                    data-tone={verdict!.tone}
                    data-shown={shown >= 3 || undefined}
                    role="status"
                  >
                    {verdict!.text}
                  </p>
                </>
              )}
            </div>

            <details className="record-json">
              <summary>
                Canonical record JSON{" "}
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <pre>{JSON.stringify(current.record, null, 2)}</pre>
            </details>
            <p className="disclaimer">
              Hashes prove record integrity and ordering. They do not prove that
              RDKit ran correctly, nor anything about efficacy or safety.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
