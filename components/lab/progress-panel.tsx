"use client";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAnimatedNumber, useReducedMotion } from "@/hooks/use-motion";
import { fmt, pad, signed, statusLabel } from "@/lib/format";
import type { Experiment, Run } from "@/lib/types";

export function ProgressPanel({ run, experiments, objective }: { run: Run | null; experiments: Experiment[]; objective: string }) {
  const reduced = useReducedMotion();
  const best = experiments.at(-1)?.record;
  const bestFitness = useAnimatedNumber(best?.fitness);
  const evaluated = useAnimatedNumber(run?.evaluated);
  const gain = best && run ? best.fitness - run.initial.fitness : undefined;
  const pct = run ? Math.round((run.iteration / run.config.iterations) * 100) : 0;
  const data = experiments.map((e) => ({
    iteration: e.record.iteration,
    best: e.record.fitness,
    // Generation 0 is the seed alone; there is no batch to average.
    average: e.record.iteration === 0 ? undefined : e.record.stats.average,
  }));
  const kind = run?.config.objective || objective;
  const summary =
    run && best
      ? `Best fitness ${fmt(best.fitness)} at generation ${best.iteration}, ${gain !== undefined ? signed(gain) : ""} from the seed. ${run.evaluated.toLocaleString()} candidates evaluated.`
      : "No run yet.";

  return (
    <section className="panel progress" aria-labelledby="progress-title">
      <header className="panel-head">
        <h3 id="progress-title">Optimisation progress</h3>
        <span className="panel-meta">{kind === "logp" ? "−|logP − target|" : kind === "multi" ? "Weighted score" : "QED"}</span>
      </header>
      <div className="progress-top">
        <div className="metric metric-lg">
          <span className="metric-label">Best fitness</span>
          <span className="metric-value num">{run ? fmt(bestFitness) : "—"}</span>
        </div>
        <div className="metric metric-right">
          <span className="metric-label">From seed</span>
          <span className="metric-value num text-accent">{gain !== undefined ? signed(gain) : "—"}</span>
        </div>
      </div>
      <div className="chart" role="img" aria-label={`Fitness by generation. ${summary}`}>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fitness-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--rule)" strokeDasharray="2 6" vertical={false} />
              <XAxis
                dataKey="iteration"
                type="number"
                domain={[0, run?.config.iterations || "dataMax"]}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                minTickGap={18}
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
              />
              <YAxis
                domain={kind === "logp" ? ["auto", 0] : [0, 1]}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => v.toFixed(kind === "logp" ? 1 : 2)}
                tick={{ fontSize: 11, fill: "var(--ink-3)" }}
              />
              <Tooltip
                cursor={{ stroke: "var(--rule-strong)" }}
                contentStyle={{
                  background: "var(--paper)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 10,
                  fontSize: 12,
                  boxShadow: "var(--shadow-2)",
                }}
                formatter={(v, name) => [Number(v).toFixed(4), name]}
                labelFormatter={(v) => `Generation ${v}`}
              />
              <Area
                dataKey="best"
                type="stepAfter"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#fitness-fill)"
                name="Best"
                isAnimationActive={!reduced}
                animationDuration={450}
                dot={false}
              />
              <Line
                dataKey="average"
                stroke="var(--ink-3)"
                strokeDasharray="3 4"
                strokeWidth={1.25}
                dot={false}
                connectNulls
                name="Batch average"
                isAnimationActive={!reduced}
                animationDuration={450}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">
            <svg viewBox="0 0 200 70" aria-hidden="true">
              <path d="M0 62 L20 50 L40 50 L60 30 L80 30 L100 22 L140 22 L160 14 L200 14" />
            </svg>
            <p>
              Best fitness per generation is drawn here as results stream in. Elites survive, so the
              line never falls.
            </p>
          </div>
        )}
      </div>
      <div className="legend" aria-hidden="true">
        <span>
          <i className="legend-best" />
          Best
        </span>
        <span>
          <i className="legend-avg" />
          Batch average
        </span>
      </div>
      <div className="progress-stats">
        <div className="metric">
          <span className="metric-label">Generation</span>
          <span className="metric-value num">
            {run ? pad(run.iteration) : "—"}
            {run && <small> / {run.config.iterations}</small>}
          </span>
        </div>
        <div className="metric metric-right">
          <span className="metric-label">Evaluated</span>
          <span className="metric-value num">
            {run && evaluated !== undefined ? Math.round(evaluated).toLocaleString() : "—"}
            {run && <small> of {run.attempted.toLocaleString()} attempts</small>}
          </span>
        </div>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Run progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div style={{ transform: `scaleX(${pct / 100})` }} data-running={run?.status === "running" || undefined} />
      </div>
      <div className="progress-foot">
        <span>
          {run
            ? run.status === "running"
              ? "Searching chemical space…"
              : run.status === "failed"
                ? run.error || "Run failed"
                : `${statusLabel(run.status)}`
            : "Ready"}
        </span>
        <span className="num">{pct}%</span>
      </div>
      <p className="sr-only">{summary}</p>
    </section>
  );
}
