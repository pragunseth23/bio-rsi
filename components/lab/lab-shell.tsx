"use client";
import { LoaderCircle, RefreshCw, WifiOff, X } from "lucide-react";
import { SiteHeader, BrandMark } from "./site-header";
import { CompareDialog } from "./compare-dialog";
import { useLabContext } from "./lab-provider";

export function LabShell({ children }: { children: React.ReactNode }) {
  const {
    lab,
    announcement,
    compareOpen,
    setCompareOpen,
    experiments,
    pair,
    setPair,
  } = useLabContext();
  return (
    <div className="page" id="top">
      <a className="skip-link" href="#main-content">
        Skip to page content
      </a>
      <SiteHeader
        chainMode={lab.health?.chain_mode}
        connection={lab.connection}
      />
      <main id="main-content" tabIndex={-1}>
        <div className="banners">
          {lab.health?.chain?.error && (
            <div className="banner" data-tone="bad" role="alert">
              <p>
                <strong>Onchain setup needs attention.</strong>{" "}
                {lab.health.chain.error}
              </p>
            </div>
          )}
          {lab.connection === "offline" && (
            <div className="banner" data-tone="bad" role="alert">
              <WifiOff size={16} aria-hidden="true" />
              <p>
                <strong>Research service unreachable.</strong> Start it with{" "}
                <code>npm run dev:all</code>. Retrying automatically; your
                configuration is kept.
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={lab.retryConnection}
              >
                <RefreshCw size={13} aria-hidden="true" /> Retry now
              </button>
            </div>
          )}
          {lab.connection !== "offline" && lab.stream === "reconnecting" && (
            <div className="banner" data-tone="warn" role="status">
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
              <p>
                <strong>Live updates interrupted.</strong> Reconnecting… The run
                continues on the server; nothing is lost.
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={lab.retryConnection}
              >
                Reconnect
              </button>
            </div>
          )}
          {lab.error && (
            <div className="banner" data-tone="bad" role="alert">
              <p>{lab.error}</p>
              <button
                type="button"
                className="icon-btn"
                onClick={() => lab.setError("")}
                aria-label="Dismiss message"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {children}
      </main>
      <footer className="site-footer">
        <span className="footer-brand">
          <BrandMark /> Proof of Discovery
        </span>
        <p>
          A hackathon build. Computed properties are heuristics, not evidence of
          efficacy or safety.
        </p>
        <span className="muted">
          {lab.health?.simulator || "RDKit"} · SHA-256
        </span>
      </footer>
      <CompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        experiments={experiments}
        pair={pair}
        setPair={setPair}
      />
    </div>
  );
}
