"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
const MolecularScene = dynamic(
  () => import("@/components/molecular-scene").then((m) => m.MolecularScene),
  { ssr: false },
);
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Atom,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Hexagon,
  Layers,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Terminal,
  X,
} from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog as DialogPrimitive } from "radix-ui";

type Properties = {
  qed: number;
  mw: number;
  logp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatable: number;
  heavy_atoms: number;
};
type Candidate = {
  smiles: string;
  fitness: number;
  properties: Properties;
  scores: Record<string, number>;
};
type Config = {
  smiles: string;
  objective: string;
  iterations: number;
  candidates: number;
  target_logp: number;
  seed: number;
  weights: Record<string, number>;
};
type Run = {
  id: string;
  config: Config;
  initial: Candidate;
  status: string;
  iteration: number;
  best_fitness: number;
  evaluated: number;
  attempted: number;
  chain_mode: string;
  created_at: string;
  error?: string;
};
type Experiment = {
  record: Candidate & {
    id: string;
    run_id: string;
    iteration: number;
    parent_hash: string;
    candidate_hash: string;
    timestamp: string;
    stats: {
      valid: number;
      attempted: number;
      average: number;
      invalid: number;
      duplicates: number;
    };
    agent: { explanation: string; source: string; strategy: string };
    mutation: { method: string; parent_smiles?: string };
  };
  hash: string;
  proof: {
    status: string;
    transaction_hash?: string;
    block_number?: number;
    contract_address?: string;
    error?: string;
  };
};
type Verification = {
  hash_matches: boolean;
  chain_valid: boolean;
  recomputed_hash: string;
  canonical_json: string;
  status: string;
  onchain_matches: boolean | null;
  error?: string;
};
const defaults: Config = {
  smiles: "CCO",
  objective: "qed",
  iterations: 30,
  candidates: 30,
  target_logp: 2,
  seed: 42,
  weights: { qed: 0.4, logp: 0.2, mw: 0.15, tpsa: 0.15, constraints: 0.1 },
};
const presets = [
  { name: "Ethanol", smiles: "CCO" },
  { name: "Phenol", smiles: "Oc1ccccc1" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
];
const short = (s: string) => (s ? `${s.slice(0, 10)}…${s.slice(-6)}` : "—");
const fmt = (n: number | undefined, d = 3) =>
  n === undefined ? "—" : n.toFixed(d);
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(path, options);
  if (!r.ok) {
    const body = await r
      .json()
      .catch(() => ({ detail: "Service unavailable" }));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Check the configuration values and try again.",
    );
  }
  return r.json();
}
function Molecule({
  smiles,
  small = false,
}: {
  smiles: string;
  small?: boolean;
}) {
  return (
    <div className={small ? "molecule molecule-small" : "molecule"}>
      {/* RDKit draws a dynamic SVG; native img avoids image optimizer rasterization. */}
      <img
        src={`/api/molecule/svg?smiles=${encodeURIComponent(smiles)}`}
        alt={`Molecular structure of ${smiles}`}
      />
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="status-dot" />
      {status === "local-only"
        ? "Local hash chain"
        : status === "verified"
          ? "Onchain committed"
          : status}
    </span>
  );
}
function PropertyGrid({
  candidate,
  initial,
}: {
  candidate?: Candidate;
  initial?: Candidate;
}) {
  return (
    <div className="properties">
      {(["qed", "mw", "logp", "tpsa"] as const).map((k) => (
        <div key={k}>
          <span>
            {{ qed: "QED", mw: "Mol. weight", logp: "LogP", tpsa: "TPSA" }[k]}
          </span>
          <strong>
            {fmt(candidate?.properties[k], k === "qed" ? 3 : 2)}
            <small>{k === "mw" ? " Da" : k === "tpsa" ? " Å²" : ""}</small>
          </strong>
          {initial && candidate && (
            <em>
              {candidate.properties[k] - initial.properties[k] >= 0 ? "+" : ""}
              {fmt(candidate.properties[k] - initial.properties[k], 2)}
            </em>
          )}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [config, setConfig] = useState<Config>(defaults),
    [run, setRun] = useState<Run | null>(null),
    [runs, setRuns] = useState<Run[]>([]),
    [experiments, setExperiments] = useState<Experiment[]>([]),
    [selected, setSelected] = useState<Experiment | null>(null),
    [verification, setVerification] = useState<Verification | null>(null),
    [health, setHealth] = useState<{
      chain_mode: string;
      agent: string;
      simulator: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [verifying, setVerifying] = useState(false),
    [tab, setTab] = useState("overview"),
    [compare, setCompare] = useState(false),
    [compareIds, setCompareIds] = useState<[number, number]>([0, 0]),
    [copied, setCopied] = useState(false),
    [connected, setConnected] = useState(true);
  const stream = useRef<EventSource | null>(null);
  const active = run?.status === "running";
  const best = experiments.at(-1)?.record || run?.initial;
  const initial = run?.initial;
  const latest = experiments.at(-1);
  const improvement = best && initial ? best.fitness - initial.fitness : 0;
  const verified = experiments.filter(
    (e) => e.proof.status === "verified",
  ).length;
  function attach(id: string) {
    stream.current?.close();
    const source = new EventSource(`/api/runs/${id}/stream`);
    stream.current = source;
    source.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setRun(data.run);
      setExperiments(data.experiments);
      setConnected(true);
    };
    source.onerror = () => setConnected(false);
    source.addEventListener("finished", () => {
      source.close();
      setConnected(true);
      api<Run[]>("/api/runs")
        .then(setRuns)
        .catch(() => {});
    });
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([api<typeof health>("/api/health"), api<Run[]>("/api/runs")])
      .then(([h, list]) => {
        if (cancelled) return;
        setHealth(h);
        setRuns(list);
        const id = localStorage.getItem("discovery-run");
        const saved = list.find((r) => r.id === id) || list[0];
        if (saved) {
          setRun(saved);
          setConfig(saved.config);
          attach(saved.id);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(`Backend connection: ${e.message}. Start npm run dev:all.`);
      });
    return () => {
      cancelled = true;
      stream.current?.close();
    };
  }, []);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const r = await api<Run>("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setRun(r);
      setExperiments([]);
      setSelected(null);
      setVerification(null);
      setTab("overview");
      localStorage.setItem("discovery-run", r.id);
      attach(r.id);
      setRuns((prev) => [r, ...prev]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!run) return;
    try {
      await api(`/api/runs/${run.id}/stop`, { method: "POST" });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function chooseRun(id: string) {
    try {
      const r = await api<Run>(`/api/runs/${id}`);
      setRun(r);
      setConfig(r.config);
      setExperiments(await api<Experiment[]>(`/api/runs/${id}/experiments`));
      setSelected(null);
      setVerification(null);
      localStorage.setItem("discovery-run", id);
      attach(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function verify(exp: Experiment) {
    setVerifying(true);
    setVerification(null);
    try {
      setVerification(
        await api<Verification>(
          `/api/verify/${encodeURIComponent(exp.record.id)}`,
          { method: "POST" },
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setVerifying(false);
    }
  }
  function inspect(exp: Experiment) {
    setSelected(exp);
    setVerification(null);
    setTab("verification");
  }
  async function retry() {
    if (!run) return;
    try {
      await api(`/api/runs/${run.id}/retry`, { method: "POST" });
      attach(run.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard unavailable. Select the hash to copy it.");
    }
  }
  const chart = experiments.map((e) => ({
    iteration: e.record.iteration,
    best: e.record.fitness,
    average: e.record.stats.average,
  }));
  return (
    <div className="shell">
      <main className="workspace">
        <header className="creative-header">
          <a
            className="creative-brand"
            href="/"
            aria-label="Proof of Discovery home"
          >
            <span className="creative-symbol">
              <Atom size={28} />
            </span>
            <span>
              PROOF OF
              <br />
              DISCOVERY<span className="brand-period">·</span>
            </span>
          </a>
          <h1>
            Evolution, at
            <br />
            molecular scale.
          </h1>
          <div className="creative-header-actions">
            <span className="creative-mode">
              <span className="status-dot" />
              {health?.chain_mode === "base-sepolia"
                ? "BASE SEPOLIA"
                : "LOCAL DEMO"}
            </span>
            <a className="header-lab-link" href="#research-console">
              ENTER THE LAB <ArrowRight size={15} />
            </a>
          </div>
        </header>
        <section
          className="discovery-hero"
          aria-label="Interactive molecular discovery"
        >
          <div className="hero-grid-lines" aria-hidden="true" />
          <div className="hero-topline">
            <span>01 / AUTONOMOUS MOLECULAR EXPLORATION</span>
            <span className="hero-live">
              <i className={active ? "pulsing" : ""} />
              {active
                ? "OPTIMIZATION IN PROGRESS"
                : run
                  ? "LIVE RESEARCH SPECIMEN"
                  : "READY TO EXPLORE"}
            </span>
          </div>
          <MolecularScene
            smiles={best?.smiles || config.smiles}
            running={!!active}
          />
          <div className="hero-copy">
            <h2>
              Discover.
              <br />
              Evolve.
              <br />
              <span>Prove.</span>
            </h2>
            <p>
              Let curiosity become a molecule.
              <br />
              Let every experiment leave a trace.
            </p>
            <a href="#research-console" className="hero-enter">
              <span>
                <ArrowRight size={22} />
              </span>
              OPEN RESEARCH CONSOLE
            </a>
          </div>
          <div className="specimen-readout">
            <div>
              <span>{best ? "BEST FITNESS" : "INITIAL SPECIMEN"}</span>
              <strong>{best ? fmt(best.fitness) : "SEED"}</strong>
            </div>
            <div>
              <span>{run ? "GENERATION" : "SEARCH POLICY"}</span>
              <strong>
                {run
                  ? `${String(run.iteration).padStart(2, "0")} / ${run.config.iterations}`
                  : "EVOLVE + SELECT"}
              </strong>
            </div>
            <div>
              <span>EVALUATED CANDIDATES</span>
              <strong>{run ? run.evaluated.toLocaleString() : "—"}</strong>
            </div>
          </div>
          <div className="hero-bottom">
            <span>COMPUTATIONAL CURIOSITY. CRYPTOGRAPHIC PROOF.</span>
            <span>ILLUSTRATIVE MOLECULAR CONFORMER</span>
          </div>
        </section>
        <div className="creative-divider">
          <span>+</span>
          <span>EXPLORE THE POSSIBILITIES</span>
          <a href="#research-console">SCROLL TO EXPERIMENT ↓</a>
          <span>+</span>
        </div>
        <section className="console-intro" id="research-console">
          <div>
            <span className="eyebrow">02 / THE RESEARCH CONSOLE</span>
            <h2>
              Small changes.
              <br />
              <span>New possibilities.</span>
            </h2>
          </div>
          <p>
            Start with a molecule. Set a direction.
            <br />
            Watch an autonomous agent search, score
            <br />
            and refine — one generation at a time.
          </p>
          <span className="console-index">[ 01—∞ ]</span>
        </section>
        <nav className="tabs" aria-label="Dashboard views">
          {[
            { id: "overview", label: "Optimization", icon: Activity },
            { id: "history", label: "Experiment history", icon: GitBranch },
            { id: "verification", label: "Verification", icon: ShieldCheck },
          ].map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "selected" : ""}
              onClick={() => {
                setTab(t.id);
                if (t.id === "verification" && !selected)
                  setSelected(latest || null);
              }}
            >
              <t.icon size={16} />
              {t.label}
              {t.id === "history" && <span>{experiments.length}</span>}
            </button>
          ))}
          <div className="tabs-end">
            {run && (
              <>
                <span className="run-label">RUN {run.id.slice(0, 8)}</span>
                <Badge status={run.status} />
              </>
            )}
          </div>
        </nav>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        {!connected && (
          <div className="error-banner">
            Live connection interrupted. Reconnecting automatically…
          </div>
        )}
        {tab === "overview" && (
          <>
            <div className="dashboard-grid">
              <section className="panel configuration">
                <div className="panel-heading">
                  <div>
                    <Terminal size={16} />
                    <h2>Run configuration</h2>
                  </div>
                  <span>01</span>
                </div>
                <div className="panel-content">
                  <label htmlFor="smiles">
                    Starting molecule <span>SMILES</span>
                  </label>
                  <textarea
                    id="smiles"
                    value={config.smiles}
                    disabled={!!active}
                    onChange={(e) =>
                      setConfig({ ...config, smiles: e.target.value })
                    }
                    spellCheck={false}
                  />
                  <div className="presets">
                    {presets.map((p) => (
                      <button
                        key={p.name}
                        disabled={!!active}
                        onClick={() =>
                          setConfig({ ...config, smiles: p.smiles })
                        }
                        className={p.smiles === config.smiles ? "chosen" : ""}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                  <label htmlFor="objective">Optimization objective</label>
                  <div className="select-wrap">
                    <select
                      id="objective"
                      disabled={!!active}
                      value={config.objective}
                      onChange={(e) =>
                        setConfig({ ...config, objective: e.target.value })
                      }
                    >
                      <option value="qed">Maximize drug-likeness (QED)</option>
                      <option value="logp">Target lipophilicity (logP)</option>
                      <option value="multi">Balanced multi-objective</option>
                    </select>
                    <ChevronDown size={15} />
                  </div>
                  <p className="field-hint">
                    {config.objective === "qed"
                      ? "A 0–1 heuristic of drug-like properties."
                      : config.objective === "logp"
                        ? "Fitness = −|calculated logP − target|."
                        : "Weighted QED, MW, logP, TPSA and constraints."}
                  </p>
                  {config.objective !== "qed" && (
                    <>
                      <label htmlFor="target">Target logP</label>
                      <input
                        id="target"
                        type="number"
                        min={-3}
                        max={6}
                        step={0.1}
                        value={config.target_logp}
                        disabled={!!active}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            target_logp: Number(e.target.value),
                          })
                        }
                      />
                    </>
                  )}
                  {config.objective === "multi" && (
                    <details className="tuning">
                      <summary>Objective weights</summary>
                      {Object.entries(config.weights).map(([k, v]) => (
                        <label key={k}>
                          {k.toUpperCase()}
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={v}
                            disabled={!!active}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                weights: {
                                  ...config.weights,
                                  [k]: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </details>
                  )}
                  <div className="input-pair">
                    <div>
                      <label htmlFor="iterations">Iterations</label>
                      <input
                        id="iterations"
                        type="number"
                        min={1}
                        max={100}
                        disabled={!!active}
                        value={config.iterations}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            iterations: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor="candidates">Batch size</label>
                      <input
                        id="candidates"
                        type="number"
                        min={20}
                        max={50}
                        disabled={!!active}
                        value={config.candidates}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            candidates: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="budget">
                    <span>Candidate evaluation budget</span>
                    <strong>
                      ~
                      {(config.iterations * config.candidates).toLocaleString()}
                    </strong>
                  </div>
                  <Button
                    onClick={start}
                    disabled={!!active || busy || !health}
                    className="start-button"
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Play size={15} fill="currentColor" />
                    )}
                    {busy ? "Initializing…" : "Launch optimization"}
                    <ArrowRight size={16} />
                  </Button>
                  {active && (
                    <Button
                      variant="outline"
                      className="stop-button"
                      onClick={stop}
                    >
                      <Square size={12} />
                      Stop run
                    </Button>
                  )}
                  <div className="config-note">
                    <ShieldCheck size={15} />
                    <span>
                      Every accepted iteration is hash-linked.
                      <br />
                      {health?.chain_mode === "base-sepolia"
                        ? "Commitments queued on Base Sepolia."
                        : "Local mode · no onchain transactions."}
                    </span>
                  </div>
                  <details className="advanced">
                    <summary>
                      Reproducibility settings <ChevronDown size={12} />
                    </summary>
                    <label htmlFor="seed">Random seed</label>
                    <input
                      id="seed"
                      type="number"
                      min={0}
                      max={4294967295}
                      disabled={!!active}
                      value={config.seed}
                      onChange={(e) =>
                        setConfig({ ...config, seed: Number(e.target.value) })
                      }
                    />
                    <small>{health?.simulator || "RDKit engine"}</small>
                  </details>
                  {runs.length > 0 && (
                    <>
                      <label htmlFor="run-history">Saved runs</label>
                      <select
                        id="run-history"
                        value={run?.id || ""}
                        onChange={(e) => chooseRun(e.target.value)}
                      >
                        {runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.id.slice(0, 8)} ·{" "}
                            {r.config.objective.toUpperCase()} · {r.status}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </section>
              <section className="panel evolution">
                <div className="panel-heading">
                  <div>
                    <Atom size={17} />
                    <h2>Molecular evolution</h2>
                  </div>
                  <span className="live-label">
                    <span
                      className={active ? "pulsing status-dot" : "status-dot"}
                    />
                    {active ? "LIVE" : "RDKit"}
                  </span>
                </div>
                <div className="molecule-pair">
                  <div className="molecule-card seed">
                    <div className="molecule-label">
                      <span>STARTING MOLECULE</span>
                      <span>GEN 00</span>
                    </div>
                    <Molecule smiles={initial?.smiles || config.smiles} />
                    <code>{initial?.smiles || config.smiles}</code>
                    <div className="molecule-score">
                      {initial ? fmt(initial.fitness) : "—"}
                      <small>INITIAL FITNESS</small>
                    </div>
                  </div>
                  <div className="evolution-arrow">
                    <ArrowRight size={17} />
                  </div>
                  <div className="molecule-card best">
                    <div className="molecule-label">
                      <span>CURRENT BEST</span>
                      <span>
                        GEN {String(run?.iteration || 0).padStart(2, "0")}
                      </span>
                    </div>
                    {best ? (
                      <Molecule smiles={best.smiles} />
                    ) : (
                      <div className="empty-molecule">
                        <Atom size={46} />
                        <span>Your next discovery starts here</span>
                      </div>
                    )}
                    <code>{best?.smiles || "Awaiting first experiment"}</code>
                    <div className="molecule-score">
                      {fmt(best?.fitness)}
                      <small>BEST FITNESS</small>
                      {best && (
                        <span className="delta">+{fmt(improvement)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="property-heading">
                  CURRENT MOLECULAR PROPERTIES <span>Δ FROM SEED</span>
                </div>
                <PropertyGrid candidate={best} initial={initial} />
                <div className="evolution-foot">
                  <span>
                    <Layers size={13} />
                    Elitist selection · top 5 retained
                  </span>
                  <button
                    disabled={experiments.length < 2}
                    onClick={() => {
                      setCompareIds([0, experiments.length - 1]);
                      setCompare(true);
                    }}
                  >
                    Compare molecules
                    <ArrowRight size={13} />
                  </button>
                </div>
              </section>
              <section className="panel progress">
                <div className="panel-heading">
                  <div>
                    <Activity size={17} />
                    <h2>Optimization progress</h2>
                  </div>
                  <span>FITNESS</span>
                </div>
                <div className="chart-top">
                  <div>
                    <strong>{fmt(best?.fitness)}</strong>
                    <span>BEST SCORE</span>
                  </div>
                  <div className="improvement">
                    <span>↑ {fmt(improvement)}</span>
                    <small>absolute improvement</small>
                  </div>
                </div>
                <div className="chart">
                  {chart.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={chart}
                        margin={{ top: 12, right: 8, bottom: 8, left: -20 }}
                      >
                        <defs>
                          <linearGradient
                            id="fitness"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#4b5bff"
                              stopOpacity={0.22}
                            />
                            <stop
                              offset="100%"
                              stopColor="#4b5bff"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="#e2e5eb"
                          strokeDasharray="3 5"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="iteration"
                          stroke="#707e89"
                          tickLine={false}
                          axisLine={false}
                          fontSize={10}
                        />
                        <YAxis
                          domain={
                            (run?.config.objective || config.objective) ===
                            "logp"
                              ? ["auto", 0]
                              : [0, 1]
                          }
                          stroke="#707e89"
                          tickLine={false}
                          axisLine={false}
                          fontSize={10}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#ffffff",
                            border: "1px solid #d4d9e2",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v) => Number(v).toFixed(4)}
                          labelFormatter={(v) => `Iteration ${v}`}
                        />
                        <Area
                          dataKey="best"
                          stroke="#4b5bff"
                          fill="url(#fitness)"
                          strokeWidth={2}
                          isAnimationActive={false}
                          name="Best fitness"
                        />
                        <Line
                          dataKey="average"
                          stroke="#7895b1"
                          dot={false}
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          isAnimationActive={false}
                          name="Batch average"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="chart-empty">
                      <Activity size={30} />
                      <span>
                        Fitness will appear as candidates are evaluated
                      </span>
                    </div>
                  )}
                </div>
                <div className="legend">
                  <span>
                    <i />
                    Best fitness
                  </span>
                  <span>
                    <i />
                    Batch average
                  </span>
                </div>
                <div className="progress-summary">
                  <div>
                    <span>ITERATION</span>
                    <strong>
                      {run?.iteration || 0}
                      <small>
                        {" "}
                        / {run?.config.iterations || config.iterations}
                      </small>
                    </strong>
                  </div>
                  <div>
                    <span>EVALUATED</span>
                    <strong>
                      {(run?.evaluated || 0).toLocaleString()}
                      <small> candidates</small>
                    </strong>
                  </div>
                </div>
                <div className="progress-track">
                  <div
                    style={{
                      width: `${run ? (run.iteration / run.config.iterations) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="progress-foot">
                  <span>
                    {active
                      ? "Searching chemical space…"
                      : run
                        ? `Run ${run.status}`
                        : "Ready to explore"}
                  </span>
                  <span>
                    {run
                      ? Math.round(
                          (run.iteration / run.config.iterations) * 100,
                        )
                      : 0}
                    %
                  </span>
                </div>
              </section>
            </div>
            <section className="agent-strip">
              <div className="agent-icon">
                <Atom size={19} />
              </div>
              <div>
                <div className="agent-label">
                  RESEARCH AGENT{" "}
                  <span>
                    {latest?.record.agent.source ||
                      health?.agent ||
                      "heuristic"}
                  </span>
                </div>
                <p>
                  {latest?.record.agent.explanation ||
                    "Ready to generate, validate and rank molecules. Start a run to activate the research loop."}
                </p>
              </div>
              <span className="agent-cadence">
                STRATEGY REVIEW / EVERY 5 ITERATIONS
              </span>
            </section>
            <div className="timeline-title">
              <div>
                <h2>Experiment trail</h2>
                <span>
                  {experiments.length} records · {verified} onchain
                </span>
              </div>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!run}
                  onClick={() => {
                    if (run)
                      window.open(`/api/runs/${run.id}/export`, "_blank");
                  }}
                >
                  <ArrowDownToLine size={14} />
                  Export JSON
                </Button>
                <button className="text-link" onClick={() => setTab("history")}>
                  View all
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
            <ExperimentTable
              experiments={experiments.slice(-4).reverse()}
              inspect={inspect}
            />
          </>
        )}
        {tab === "history" && (
          <section className="panel history-panel">
            <div className="panel-heading">
              <div>
                <GitBranch size={17} />
                <h2>Complete experiment history</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!run}
                onClick={() => {
                  if (run) window.open(`/api/runs/${run.id}/export`, "_blank");
                }}
              >
                <ArrowDownToLine size={14} />
                Export JSON
              </Button>
            </div>
            <div className="history-tools">
              <p>
                All accepted generations, including unchanged elites. Select a
                record to inspect its commitment.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={experiments.length < 2}
                onClick={() => {
                  setCompareIds([0, experiments.length - 1]);
                  setCompare(true);
                }}
              >
                Compare molecules
                <ArrowRight size={14} />
              </Button>
            </div>
            <ExperimentTable
              experiments={[...experiments].reverse()}
              inspect={inspect}
            />
          </section>
        )}
        {tab === "verification" && (
          <div className="verification-grid">
            <section className="panel verification-picker">
              <div className="panel-heading">
                <div>
                  <GitBranch size={17} />
                  <h2>Select experiment</h2>
                </div>
                <span>{experiments.length}</span>
              </div>
              {experiments.length === 0 ? (
                <div className="empty-state">
                  Launch a run to create a verification trail.
                </div>
              ) : (
                <div className="experiment-picker">
                  {[...experiments].reverse().map((e) => (
                    <button
                      key={e.hash}
                      className={selected?.hash === e.hash ? "selected" : ""}
                      onClick={() => {
                        setSelected(e);
                        setVerification(null);
                      }}
                    >
                      <span>
                        Generation {String(e.record.iteration).padStart(2, "0")}
                        <small>{short(e.hash)}</small>
                      </span>
                      <strong>{fmt(e.record.fitness)}</strong>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              )}
            </section>
            <section className="panel verification-detail">
              <div className="panel-heading">
                <div>
                  <ShieldCheck size={17} />
                  <h2>Cryptographic verification</h2>
                </div>
                {selected && (
                  <Badge
                    status={
                      experiments.find((e) => e.hash === selected.hash)?.proof
                        .status || selected.proof.status
                    }
                  />
                )}
              </div>
              {selected ? (
                <div className="verify-content">
                  <div className="verification-intro">
                    <ShieldCheck size={32} />
                    <div>
                      <h3>Verify the experiment. Trace the lineage.</h3>
                      <p>
                        Recompute the record’s SHA-256 hash and check every
                        parent link. For committed records, read the contract
                        directly on Base Sepolia.
                      </p>
                    </div>
                  </div>
                  <div className="verify-molecule">
                    <Molecule smiles={selected.record.smiles} small />
                    <div>
                      <span>GENERATION {selected.record.iteration}</span>
                      <code>{selected.record.smiles}</code>
                      <PropertyGrid candidate={selected.record} />
                    </div>
                  </div>
                  <div className="hash-row">
                    <label>RECORD HASH</label>
                    <code>{selected.hash}</code>
                    <button
                      aria-label="Copy record hash"
                      onClick={() => copyHash(selected.hash)}
                    >
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                  <div className="hash-row">
                    <label>PARENT HASH</label>
                    <code>{selected.record.parent_hash}</code>
                  </div>
                  <div className="hash-row">
                    <label>CANDIDATE HASH</label>
                    <code>{selected.record.candidate_hash}</code>
                  </div>
                  {(() => {
                    const proof =
                      experiments.find((e) => e.hash === selected.hash)
                        ?.proof || selected.proof;
                    return (
                      <>
                        <div className="transaction-details">
                          <div>
                            <span>NETWORK</span>
                            <strong>
                              {proof.contract_address
                                ? "Base Sepolia · 84532"
                                : "Local SHA-256 chain"}
                            </strong>
                          </div>
                          <div>
                            <span>BLOCK</span>
                            <strong>{proof.block_number || "—"}</strong>
                          </div>
                          <div>
                            <span>TRANSACTION</span>
                            {proof.transaction_hash ? (
                              <a
                                href={`https://sepolia.basescan.org/tx/${proof.transaction_hash}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {short(proof.transaction_hash)}
                                <ExternalLink size={12} />
                              </a>
                            ) : (
                              <strong>None</strong>
                            )}
                          </div>
                        </div>
                        {proof.error && (
                          <p className="proof-error">{proof.error}</p>
                        )}
                        {proof.status === "failed" && (
                          <Button variant="outline" size="sm" onClick={retry}>
                            <RotateCcw size={14} />
                            Retry queued commitments
                          </Button>
                        )}
                      </>
                    );
                  })()}
                  <Button
                    disabled={verifying}
                    onClick={() => {
                      const current =
                        experiments.find((e) => e.hash === selected.hash) ||
                        selected;
                      verify(current);
                    }}
                  >
                    {verifying ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}{" "}
                    {verifying ? "Checking record…" : "Verify experiment"}
                  </Button>
                  {verification && (
                    <div
                      className={`verification-result ${verification.hash_matches && verification.chain_valid && verification.status !== "failed" ? "success" : "failure"}`}
                      role="status"
                    >
                      <strong>
                        {verification.hash_matches && verification.chain_valid
                          ? verification.onchain_matches === true
                            ? "Record matches Base Sepolia commitment"
                            : verification.status === "local-only"
                              ? "Local integrity verified"
                              : verification.status === "unavailable"
                                ? "Local integrity verified · RPC unavailable"
                                : `Local integrity verified · onchain ${verification.status}`
                          : "Integrity check failed"}
                      </strong>
                      <span>
                        Record hash:{" "}
                        {verification.hash_matches ? "matches" : "mismatch"} ·
                        Parent chain:{" "}
                        {verification.chain_valid ? "consistent" : "broken"} ·
                        Onchain:{" "}
                        {verification.onchain_matches === null
                          ? "not verified"
                          : verification.onchain_matches
                            ? "matches"
                            : "mismatch"}
                      </span>
                      {verification.error && <span>{verification.error}</span>}
                    </div>
                  )}
                  <details className="record-json">
                    <summary>
                      Offchain experiment record <ChevronDown size={14} />
                    </summary>
                    <pre>{JSON.stringify(selected.record, null, 2)}</pre>
                  </details>
                  <p className="verification-disclaimer">
                    Commitments establish record integrity and ordering. They do
                    not independently prove correct RDKit execution or
                    experimental efficacy.
                  </p>
                </div>
              ) : (
                <div className="empty-state">
                  <ShieldCheck size={40} />
                  <h3>An auditable path to discovery</h3>
                  <p>
                    Select an experiment to inspect its record and parent chain.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
        <footer>
          <span>
            <Hexagon size={12} />
            PROOF OF DISCOVERY
          </span>
          <p>
            Computational properties are heuristics, not evidence of therapeutic
            efficacy or safety.
          </p>
          <span>
            RDKit +{" "}
            {health?.chain_mode === "base-sepolia" ? "BASE SEPOLIA" : "SHA-256"}
          </span>
        </footer>
      </main>
      <DialogPrimitive.Root open={compare} onOpenChange={setCompare}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="modal-backdrop" />
          <DialogPrimitive.Content className="comparison-modal">
            <DialogPrimitive.Description className="sr-only">
              Compare structures and computed properties from two generations.
            </DialogPrimitive.Description>
            <div className="panel-heading">
              <div>
                <Atom size={18} />
                <DialogPrimitive.Title asChild>
                  <h2>Compare molecules</h2>
                </DialogPrimitive.Title>
              </div>
              <button
                onClick={() => setCompare(false)}
                aria-label="Close comparison"
              >
                <X size={20} />
              </button>
            </div>
            <div className="comparison-pair">
              {compareIds.map((id, i) => (
                <div key={i}>
                  <label htmlFor={`compare-${i}`}>
                    {i === 0 ? "Reference" : "Comparison"}
                  </label>
                  <select
                    id={`compare-${i}`}
                    value={id}
                    onChange={(e) =>
                      setCompareIds((prev) =>
                        i === 0
                          ? [Number(e.target.value), prev[1]]
                          : [prev[0], Number(e.target.value)],
                      )
                    }
                  >
                    {experiments.map((e, j) => (
                      <option key={j} value={j}>
                        Generation {e.record.iteration} ·{" "}
                        {fmt(e.record.fitness)}
                      </option>
                    ))}
                  </select>
                  {experiments[id] && (
                    <>
                      <Molecule smiles={experiments[id].record.smiles} />
                      <code>{experiments[id].record.smiles}</code>
                      <PropertyGrid
                        candidate={experiments[id].record}
                        initial={
                          i === 1
                            ? experiments[compareIds[0]]?.record
                            : undefined
                        }
                      />
                      <div className="comparison-fitness">
                        Fitness{" "}
                        <strong>{fmt(experiments[id].record.fitness)}</strong>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
function ExperimentTable({
  experiments,
  inspect,
}: {
  experiments: Experiment[];
  inspect: (e: Experiment) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>GENERATION</th>
            <th>MOLECULE</th>
            <th>FITNESS</th>
            <th>EVALUATED</th>
            <th>COMMITMENT</th>
            <th>RECORD HASH</th>
            <th>
              <span className="sr-only">Inspect</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((e) => (
            <tr key={e.hash} onClick={() => inspect(e)}>
              <td>
                <span className="generation-number">
                  <GitBranch size={13} />
                  {String(e.record.iteration).padStart(2, "0")}
                </span>
              </td>
              <td>
                <div className="table-molecule">
                  <Molecule smiles={e.record.smiles} small />
                  <code title={e.record.smiles}>{e.record.smiles}</code>
                </div>
              </td>
              <td className="fitness-cell">{fmt(e.record.fitness)}</td>
              <td>
                {e.record.stats.valid}
                <small> / {e.record.stats.attempted} attempts</small>
              </td>
              <td>
                <Badge status={e.proof.status} />
                {e.proof.transaction_hash && (
                  <a
                    onClick={(event) => event.stopPropagation()}
                    href={`https://sepolia.basescan.org/tx/${e.proof.transaction_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="tx-link"
                  >
                    {short(e.proof.transaction_hash)}
                    <ExternalLink size={11} />
                  </a>
                )}
              </td>
              <td>
                <code className="hash-code">{short(e.hash)}</code>
              </td>
              <td>
                <button
                  aria-label={`Inspect generation ${e.record.iteration}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    inspect(e);
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {experiments.length === 0 && (
        <div className="empty-table">
          <GitBranch size={21} />
          <span>
            Your experiments will appear here. Every generation leaves a trace.
          </span>
        </div>
      )}
    </div>
  );
}
