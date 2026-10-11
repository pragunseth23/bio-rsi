"use client";
import { FRONTEND_ONLY } from "@/lib/hosting";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, postJson, storage } from "@/lib/api";
import type { Config, Experiment, Health, Run } from "@/lib/types";

export type Connection = "connecting" | "online" | "offline";
export type StreamState = "idle" | "connecting" | "live" | "reconnecting" | "closed";

const RUN_KEY = "discovery-run";
const backoff = (attempt: number, cap: number) => Math.min(cap, 1000 * 2 ** attempt);

export function useLab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [stream, setStream] = useState<StreamState>("idle");
  const [error, setError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [restored, setRestored] = useState<Config | null>(null);

  const source = useRef<EventSource | null>(null);
  const token = useRef(0); // invalidates handlers of superseded streams
  const timers = useRef<{ stream?: number; health?: number }>({});
  const attempts = useRef({ stream: 0, health: 0 });
  const restoredOnce = useRef(false);
  const connectRef = useRef<() => void>(() => {});
  const offlineLoop = useRef(false);

  const refreshRuns = useCallback(() => {
    api<Run[]>("/api/runs").then(setRuns).catch(() => {});
  }, []);

  const detach = useCallback(() => {
    token.current += 1;
    source.current?.close();
    source.current = null;
    window.clearTimeout(timers.current.stream);
  }, []);

  const attach: (id: string) => void = useCallback(
    (id: string) => {
      detach();
      const mine = token.current;
      setStream((s) => (s === "reconnecting" ? s : "connecting"));
      const es = new EventSource(`/api/runs/${id}/stream`);
      source.current = es;
      es.onmessage = (event) => {
        if (token.current !== mine) return;
        try {
          const data = JSON.parse(event.data) as { run: Run; experiments: Experiment[] };
          setRun(data.run);
          setExperiments(data.experiments);
          setRuns((list) => list.map((r) => (r.id === data.run.id ? data.run : r)));
          attempts.current.stream = 0;
          setStream("live");
        } catch {
          /* ignore a malformed frame; the next snapshot replaces it */
        }
      };
      es.addEventListener("finished", () => {
        if (token.current !== mine) return;
        es.close();
        setStream("closed");
        refreshRuns();
      });
      es.onerror = () => {
        if (token.current !== mine) return;
        // Take over from the browser's auto-reconnect so error responses are retried too.
        es.close();
        setStream("reconnecting");
        // Distinguish "service down" from a dropped stream so the right banner shows.
        api<Health>("/api/health").catch(() => {
          setConnection("offline");
          if (!offlineLoop.current) {
            offlineLoop.current = true;
            connectRef.current();
          }
        });
        const delay = backoff(attempts.current.stream++, 10000);
        timers.current.stream = window.setTimeout(() => {
          if (token.current === mine) attach(id);
        }, delay);
      };
    },
    [detach, refreshRuns],
  );

  const connect: () => Promise<void> = useCallback(async () => {
    window.clearTimeout(timers.current.health);
    if (FRONTEND_ONLY) {
      setConnection("offline");
      return;
    }
    try {
      const [h, list] = await Promise.all([api<Health>("/api/health"), api<Run[]>("/api/runs")]);
      setHealth(h);
      setRuns(list);
      setConnection("online");
      offlineLoop.current = false;
      attempts.current.health = 0;
      if (!restoredOnce.current) {
        restoredOnce.current = true;
        const savedId = storage.get(RUN_KEY);
        const saved = list.find((r) => r.id === savedId) || list[0];
        if (saved) {
          setRun(saved);
          setRestored(saved.config);
          attach(saved.id);
        }
      }
    } catch {
      setConnection("offline");
      const delay = backoff(attempts.current.health++, 15000);
      timers.current.health = window.setTimeout(connect, delay);
    }
  }, [attach]);

  useEffect(() => {
    connectRef.current = () => {
      window.clearTimeout(timers.current.health);
      timers.current.health = window.setTimeout(connect, 1000);
    };
  }, [connect]);

  useEffect(() => {
    connect();
    const t = timers.current;
    return () => {
      detach();
      window.clearTimeout(t.health);
    };
  }, [connect, detach]);

  const retryConnection = useCallback(() => {
    attempts.current.health = 0;
    setConnection("connecting");
    connect();
    if (run && stream === "reconnecting") {
      attempts.current.stream = 0;
      attach(run.id);
    }
  }, [connect, attach, run, stream]);

  const launch = useCallback(
    async (config: Config) => {
      setLaunching(true);
      setError("");
      try {
        const created = await postJson<Run>("/api/runs", config);
        setRun(created);
        setExperiments([]);
        setRuns((list) => [created, ...list.filter((r) => r.id !== created.id)]);
        storage.set(RUN_KEY, created.id);
        attempts.current.stream = 0;
        attach(created.id);
        return created;
      } catch (e) {
        setError((e as Error).message);
        if ((e as { status?: number }).status === 0) setConnection("offline");
        return null;
      } finally {
        setLaunching(false);
      }
    },
    [attach],
  );

  const stop = useCallback(async () => {
    if (!run) return;
    setStopping(true);
    try {
      const updated = await postJson<Run>(`/api/runs/${run.id}/stop`);
      setRun((r) => (r && r.id === updated.id ? { ...r, status: updated.status } : r));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStopping(false);
    }
  }, [run]);

  const chooseRun = useCallback(
    async (id: string) => {
      setError("");
      try {
        const [r, exps] = await Promise.all([
          api<Run>(`/api/runs/${id}`),
          api<Experiment[]>(`/api/runs/${id}/experiments`),
        ]);
        setRun(r);
        setExperiments(exps);
        storage.set(RUN_KEY, id);
        attempts.current.stream = 0;
        attach(id);
        return r;
      } catch (e) {
        setError((e as Error).message);
        return null;
      }
    },
    [attach],
  );

  const retryCommitments = useCallback(async () => {
    if (!run) return;
    try {
      await postJson(`/api/runs/${run.id}/retry`);
      attempts.current.stream = 0;
      attach(run.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [run, attach]);

  return {
    health,
    connection,
    runs,
    run,
    experiments,
    stream,
    error,
    setError,
    launching,
    stopping,
    restored,
    active: run?.status === "running",
    launch,
    stop,
    chooseRun,
    retryCommitments,
    retryConnection,
  };
}

export type Lab = ReturnType<typeof useLab>;
