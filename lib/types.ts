export type Objective = "qed" | "logp" | "multi";
export type WeightKey = "qed" | "logp" | "mw" | "tpsa" | "constraints";

export type Properties = {
  qed: number;
  mw: number;
  logp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotatable: number;
  heavy_atoms: number;
};

export type Candidate = {
  smiles: string;
  fitness: number;
  properties: Properties;
  scores: Record<string, number>;
};

export type Config = {
  smiles: string;
  objective: Objective;
  iterations: number;
  candidates: number;
  target_logp: number;
  seed: number;
  weights: Record<WeightKey, number>;
};

/** Form values are strings so fields can be empty or mid-edit. */
export type ConfigDraft = {
  smiles: string;
  objective: Objective;
  iterations: string;
  candidates: string;
  target_logp: string;
  seed: string;
  weights: Record<WeightKey, string>;
};

export type RunStatus = "running" | "completed" | "stopped" | "failed" | "interrupted";

export type Run = {
  id: string;
  config: Config;
  initial: Candidate;
  status: RunStatus | string;
  iteration: number;
  best_fitness: number;
  evaluated: number;
  attempted: number;
  chain_mode: string;
  created_at: string;
  updated_at?: string;
  error?: string;
};

export type Experiment = {
  record: Candidate & {
    id: string;
    run_id: string;
    iteration: number;
    parent_hash: string;
    candidate_hash: string;
    timestamp: string;
    simulator?: string;
    stats: {
      valid: number;
      attempted: number;
      average: number;
      invalid: number;
      duplicates: number;
    };
    agent: { explanation: string; source: string; strategy: string };
    mutation: { method: string; parent_smiles?: string; strategy?: string };
  };
  hash: string;
  proof: {
    status: string;
    transaction_hash?: string;
    block_number?: number;
    contract_address?: string;
    chain_id?: number | null;
    error?: string;
  };
};

export type Verification = {
  hash_matches: boolean;
  chain_valid: boolean;
  recomputed_hash: string;
  canonical_json: string;
  status: string;
  onchain_matches: boolean | null;
  error?: string;
};

export type Health = {
  status: string;
  /** Network key when commitments are configured, otherwise "local-only". */
  chain_mode: string;
  /** The network commitments target (configured or not). */
  network?: { key: string; name: string; chain_id: number; explorer: string };
  agent: string;
  simulator: string;
};
