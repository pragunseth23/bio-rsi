"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Activity, GitBranch, ShieldCheck } from "lucide-react";
import type { Tab } from "@/hooks/use-hash-tab";

const ITEMS: { id: Tab; label: string; icon: typeof Activity }[] = [
  { id: "optimization", label: "Optimisation", icon: Activity },
  { id: "history", label: "History", icon: GitBranch },
  { id: "verification", label: "Verification", icon: ShieldCheck },
];

export const tabId = (t: Tab) => `tab-${t}`;
export const panelId = (t: Tab) => `panel-${t}`;

export function ConsoleTabs({
  tab,
  onChange,
  counts,
  end,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
  counts: Partial<Record<Tab, number>>;
  end?: React.ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = list.current?.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (list.current) ro.observe(list.current);
    return () => ro.disconnect();
  }, [tab, counts.history]);

  const onKey = (e: React.KeyboardEvent) => {
    const i = ITEMS.findIndex((t) => t.id === tab);
    const next =
      e.key === "ArrowRight" ? (i + 1) % ITEMS.length : e.key === "ArrowLeft" ? (i - 1 + ITEMS.length) % ITEMS.length : e.key === "Home" ? 0 : e.key === "End" ? ITEMS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(ITEMS[next].id);
    list.current?.querySelector<HTMLElement>(`[data-tab="${ITEMS[next].id}"]`)?.focus();
  };

  return (
    <div className="tabs-bar">
      <div className="tabs" role="tablist" aria-label="Console views" ref={list} onKeyDown={onKey}>
        {ITEMS.map((t) => (
          <button
            key={t.id}
            id={tabId(t.id)}
            data-tab={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={panelId(t.id)}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
          >
            <t.icon size={15} aria-hidden="true" />
            {t.label}
            {counts[t.id] !== undefined && <span className="count num">{counts[t.id]}</span>}
          </button>
        ))}
        {bar && <span className="tabs-indicator" aria-hidden="true" style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w})` }} />}
      </div>
      {end && <div className="tabs-end">{end}</div>}
    </div>
  );
}
