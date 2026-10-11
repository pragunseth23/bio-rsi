"use client";
import { modeName } from "@/lib/chain";
import { ArrowRight } from "lucide-react";
import type { Connection } from "@/hooks/use-lab";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGE_PATHS, type Tab } from "@/lib/navigation";

export function BrandMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden="true"
      className="brand-mark"
    >
      <circle cx="16" cy="16" r="16" fill="currentColor" />
      <g
        stroke="var(--paper)"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      >
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
}: {
  chainMode?: string;
  connection: Connection;
}) {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Proof of Discovery home">
        <BrandMark />
        <span>
          Proof of
          <br />
          Discovery
        </span>
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>
          Home
        </Link>
        {NAV.map((n) => (
          <Link
            key={n.tab}
            href={PAGE_PATHS[n.tab]}
            aria-current={pathname === PAGE_PATHS[n.tab] ? "page" : undefined}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="site-header-end">
        <span
          className="mode-chip"
          data-connection={connection}
          title="Service status"
        >
          <span className="badge-dot" aria-hidden="true" />
          {connection === "offline"
            ? "Service offline"
            : connection === "connecting"
              ? "Connecting"
              : modeName(chainMode)}
        </span>
        <Link className="btn btn-ink" href={PAGE_PATHS.optimization}>
          Enter the lab
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
