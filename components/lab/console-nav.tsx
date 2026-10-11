"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Activity, GitBranch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PAGE_PATHS, type Tab } from "@/lib/navigation";

const ITEMS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "optimization", label: "Optimization", icon: Activity },
  { id: "history", label: "History", icon: GitBranch },
  { id: "verification", label: "Verification", icon: ShieldCheck },
];

export function ConsoleNav({
  tab,
  counts,
  end,
}: {
  tab: Tab;
  counts: Partial<Record<Tab, number>>;
  end?: React.ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = list.current?.querySelector<HTMLElement>(
        `[data-tab="${tab}"]`,
      );
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (list.current) ro.observe(list.current);
    return () => ro.disconnect();
  }, [tab, counts.history]);

  return (
    <nav className="tabs-bar" aria-label="Research pages">
      <div className="tabs" ref={list}>
        {ITEMS.map((t) => (
          <Link
            key={t.id}
            href={PAGE_PATHS[t.id]}
            data-tab={t.id}
            aria-current={tab === t.id ? "page" : undefined}
          >
            <t.icon size={15} aria-hidden="true" />
            {t.label}
            {counts[t.id] !== undefined && (
              <span className="count num">{counts[t.id]}</span>
            )}
          </Link>
        ))}
        {bar && (
          <span
            className="tabs-indicator"
            aria-hidden="true"
            style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w})` }}
          />
        )}
      </div>
      {end && <div className="tabs-end">{end}</div>}
    </nav>
  );
}
