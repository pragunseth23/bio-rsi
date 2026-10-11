# Proof of Discovery

An immersive molecular lab with an interactive Three.js sculpture, a live research console, and a local, integrated demo of recursive molecular optimization with real RDKit scoring, a live Next.js dashboard, persisted experiments and a cryptographic audit trail. Solidity + viem can commit the same records to **Base Sepolia** when a funded account is configured.

## Run locally

Requirements: Node.js 22.9+ (or 24 LTS), Python 3.11–3.13, npm. macOS/Linux commands:

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp .env.example .env
npm run dev:all
```

Open **http://localhost:3000**. The API listens at `127.0.0.1:8000`; Next.js proxies `/api/*` to it. No keys are needed for the complete local optimization and integrity-verification flow.

Or run separate terminals (useful on Windows, with your virtualenv's Python executable):

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
npm run dev
```

Production frontend: `npm run build && npm start`, with the Python service running separately. Use a single API worker: optimization tasks and the commitment queue belong to that process. This is a local hackathon application, with no user authentication. Keep it bound to loopback; add authentication and a durable job queue before public deployment.

## Demo

1. Click **Enter the lab**, select **Ethanol**, **Maximize drug-likeness (QED)**, target logP **2** (default), **30 iterations**, batch size **30**, seed **42** (under *Reproducibility*). With the heuristic agent this run reproducibly climbs from QED 0.407 to 0.946.
2. Launch optimization. RDKit validates and scores generated candidates; best fitness cannot decrease because elites survive each generation.
3. Inspect molecular changes, best and average fitness, the agent's strategy, and the experiment trail (**Lab notebook**: change vs parent, parent → record hash, commitment status).
4. Open **Verification**, select an experiment, and click **Verify experiment**.
5. Compare two generations or export the complete run as JSON. Console tabs are linked in the URL (`#lab/history`, `#lab/verification`), so Back/Forward and refresh keep your place.

The seed preset is an actual starting point for stochastic search. No fitness trajectory is hardcoded. The search combines SELFIES token mutations, RDKit fragment attachment, atom replacement and terminal pruning. Up to 12 × batch size attempts per iteration limits stalled searches. Invalid molecules and canonical duplicates are excluded. The evaluated counter counts unique valid candidates actually scored, excluding the seed; attempts also count rejected mutations.

QED, calculated logP, molecular weight and TPSA are computational heuristics. They do not establish experimental efficacy, toxicity or safety. Search bounds: one connected fragment, organic supported elements, MW 10–650, calculated logP −4–7, ≤50 heavy atoms. These bounds are demo constraints, not clinical criteria.

Objectives:
- `qed`: RDKit QED, higher is better.
- `logp`: `−abs(calculated_logP − target_logP)`, optimal value 0.
- `multi`: configurable weighted mean of QED, normalized proximity to MW 300, target logP, TPSA 75, and rule-based structural constraints. Individual scores are in the exported records and API. Normalization equations are in `backend/chemistry.py`.

## Base Sepolia

Local-only mode is the default. It produces genuine SHA-256 hash-linked records and **never reports onchain success**. A transaction requires all three blockchain variables in `.env`:

```dotenv
BASE_SEPOLIA_RPC_URL=https://your-base-sepolia-rpc
WALLET_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT
```

Use a testnet-only wallet funded with Base Sepolia ETH. Set the RPC URL and private key first, then:

```bash
npm run contract:compile
npm run contract:deploy
```

Copy the returned `contract_address` into `.env`, then restart both services. Deployment and commitments use **chain ID 84532**. The deployment wallet becomes the contract owner and must be the commitment signer. The contract enforces owner-only writes, unique record hashes, exact generation ordering starting at 0, and parent continuity within each run.

The contract emits `ExperimentCommitted(runId, iteration, recordHash, candidateHash, fitness, parentHash)`. `runId` is Keccak-256 of the UUID string. Candidate and record commitments use SHA-256. Fitness is signed and scaled by `10^8`.

Simulation does not wait for transactions. A separate queue submits them sequentially and persists transaction hashes before waiting for receipts. A successful receipt produces the **Committed onchain** badge, block number and BaseScan link. **Verify experiment** additionally reads the stored contract tuple over RPC and compares every field. Only that read confirms the selected record matches contract state. One block confirmation is used for this testnet demo; it does not establish finality.

RPC or transaction errors become `failed`, preserve any submitted transaction hash, and do not crash the optimizer. Use **Retry failed commitments** in the verification view to reconcile failed transactions in generation order. Unconfirmed transactions are checked again before any resubmission. If the RPC remains inaccessible, verification reports unavailable. Pending commitments reload from SQLite on restart. Interrupted optimization runs remain inspectable; start a new run to optimize again.

Never commit `.env`, private keys or production wallet credentials. The frontend receives no private keys. Without configured credentials and funds, onchain deployment/verification cannot be demonstrated.

## Optional LLM strategy

Set `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` for an OpenAI-compatible Chat Completions endpoint supporting JSON object output. The agent reviews the elite molecule at generation 0 and every 5 generations, choosing `polar` or `explore` and explaining its strategy. No per-candidate LLM calls. With no key, or an API failure, a deterministic heuristic policy keeps the full run operational. To reproduce an exact search trajectory, use the heuristic policy, same random seed, objective, parameters and RDKit version; timestamps and run IDs intentionally differ.

## Independent integrity verification

Export JSON from the dashboard, then run this standalone standard-library verifier:

```bash
python3 scripts/verify_export.py path/to/export.json
```

Canonical format `proof-of-discovery/v1`:
1. Recursively replace floats with strings formatted to exactly 8 decimal places.
2. Serialize with sorted object keys, compact separators, ASCII escaping and no non-finite numbers.
3. SHA-256 the UTF-8 JSON bytes, prefix the hex digest with `0x`.
4. Candidate hash is SHA-256 of UTF-8 canonical SMILES.
5. The initial parent is 32 zero bytes; subsequent parent values are the previous record hash.

Only `record` is hashed. Mutable submission metadata lives in `proof` outside the commitment. Exports include the exact `canonical_json` bytes for independent hashing. The standalone verifier recomputes from records, checks candidate hashes, generation order, run identity and every parent link. Local validation checks consistency; it cannot detect rewriting the entire local chain without an externally retained hash or onchain anchor. A blockchain commitment establishes integrity and ordering, not correct execution of RDKit.

## API

Interactive docs: http://127.0.0.1:8000/docs

| Endpoint | Purpose |
| --- | --- |
| `POST /api/runs` | Validate input and launch asynchronous search |
| `GET /api/runs` | List persisted runs |
| `GET /api/runs/{id}` | Run state and counters |
| `GET /api/runs/{id}/experiments` | Immutable records and mutable proof metadata |
| `GET /api/runs/{id}/stream` | SSE snapshots, heartbeats and terminal event |
| `POST /api/runs/{id}/stop` | Stop after the in-flight evaluation batch |
| `POST /api/runs/{id}/retry` | Reconcile failed commitments |
| `GET /api/runs/{id}/export` | Full JSON + canonical serialized records |
| `POST /api/verify/{experiment_id}` | Recompute hashes and read onchain state if committed |
| `GET /api/molecule/svg?smiles=CCO` | RDKit-generated transparent SVG |
| `POST /api/molecule/evaluate` | Score a seed exactly as a launch would, without starting a run; returns `{valid, candidate}` or `{valid: false, error}` |
| `GET /api/molecule/scene?smiles=CCO` | Illustrative 3D conformer for the hero model |
| `GET /api/health` | Engine version and configured modes |

Example:

```bash
curl -X POST http://localhost:3000/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"smiles":"CCO","objective":"qed","iterations":30,"candidates":30,"seed":42}'
```

Data is stored in ignored `backend/data/discovery.sqlite`. Set `DATABASE_PATH` to change it.

## Checks

```bash
.venv/bin/python -m pytest backend/tests -q
npm run typecheck
npm run contract:compile
npm run build
```

Optional Solidity execution tests: install `.venv/bin/pip install -r backend/requirements-dev.txt`, then run the same pytest command. They deploy the compiled bytecode to an in-memory EVM and check emitted events, signed fitness, ownership, ordering, duplicate rejection and parent continuity. No testnet funds are used.

Tests cover three independently seeded 30-generation searches, ≥500 evaluated candidates, nondecreasing elite fitness, meaningful ethanol improvement, both additional objectives, invalid molecules, API launch/stop, persistence, exports and tamper detection.

References: [RDKit Python documentation](https://www.rdkit.org/docs/GettingStartedInPython.html), [viem contract actions](https://viem.sh/docs/contract/writeContract), [Next.js external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).

## Interactive molecular scene

The opening scene displays the current best molecule using deterministic RDKit ETKDG geometry (seed 42, with MMFF relaxation when supported). Drag to rotate. Geometry is an illustrative conformer, not a validated experimental structure; the optimization still uses the original descriptor scores. The renderer respects reduced-motion settings, pauses rendering offscreen, disposes GPU resources, and falls back to an RDKit SVG if WebGL or geometry is unavailable. `GET /api/molecule/scene?smiles=CCO` returns heavy-atom coordinates and connectivity.
