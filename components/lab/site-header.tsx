"use client";
import { ArrowRight } from "lucide-react";
import type { Connection } from "@/hooks/use-lab";
import type { Tab } from "@/hooks/use-hash-tab";
import { byKey } from "@/lib/chains";

export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" className="brand-mark">
      <circle cx="16" cy="16" r="16" fill="currentColor" />
      <g stroke="var(--paper)" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M10 20.5 16 11l6 9.5" />
        <path d="M10 20.5h12" opacity=".5" />
      </g>
      <circle cx="16" cy="11" r="2.4" fill="var(--paper)" />
      <circle cx="10" cy="20.5" r="2.4" fill="var(--paper)" />
      <circle cx="22" cy="20.5" r="2.4" fill="var(--accent-soft)" />
    </svg>
  );
}

const NAV: { tab: Tab; label: string }[] = [
  { tab: "optimization", label: "Console" },
  { tab: "history", label: "History" },
  { tab: "verification", label: "Verification" },
];

export function SiteHeader({
  chainMode,
  connection,
  goTo,
}: {
  chainMode?: string;
  connection: Connection;
  goTo: (tab: Tab) => void;
}) {
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Proof of Discovery, back to top">
        <BrandMark />
        <span>
          Proof of
          <br />
          Discovery
        </span>
      </a>
      <nav className="site-nav" aria-label="Sections">
        {NAV.map((n) => (
          <a
            key={n.tab}
            href={`#lab/${n.tab}`}
            onClick={(e) => {
              e.preventDefault();
              goTo(n.tab);
            }}
          >
            {n.label}
          </a>
        ))}
      </nav>
      <div className="site-header-end">
        <span className="mode-chip" data-connection={connection} title="Service status">
          <span className="badge-dot" aria-hidden="true" />
          {connection === "offline"
            ? "Service offline"
            : connection === "connecting"
              ? "Connecting"
              : byKey(chainMode)
                ? byKey(chainMode)!.short
                : "Local hash chain"}
        </span>
        <a
          className="btn btn-ink"
          href="#lab/optimization"
          onClick={(e) => {
            e.preventDefault();
            goTo("optimization");
          }}
        >
          Enter the lab
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}
