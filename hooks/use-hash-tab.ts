"use client";
import { useCallback, useEffect, useState } from "react";

export const TABS = ["optimization", "history", "verification"] as const;
export type Tab = (typeof TABS)[number];

const parse = (hash: string): Tab | null => {
  const match = /^#lab\/(\w+)$/.exec(hash);
  return match && (TABS as readonly string[]).includes(match[1]) ? (match[1] as Tab) : null;
};

/** Console tab mirrored in the URL (#lab/<tab>) so Back/Forward and refresh work. */
export function useHashTab() {
  const [tab, setTabState] = useState<Tab>("optimization");

  useEffect(() => {
    const initial = parse(window.location.hash);
    if (initial) {
      setTabState(initial);
      // Restore the reader's place after a refresh on a console tab.
      requestAnimationFrame(() =>
        document.getElementById("lab")?.scrollIntoView({ block: "start" }),
      );
    }
    const sync = () => setTabState(parse(window.location.hash) || "optimization");
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const hash = `#lab/${next}`;
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
  }, []);

  return [tab, setTab] as const;
}
