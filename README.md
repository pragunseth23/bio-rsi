# Proof of Discovery

An immersive molecular lab with an interactive Three.js sculpture, a live research console, and a local, integrated demo of recursive molecular optimization with real RDKit scoring, a live Next.js dashboard, persisted experiments and a cryptographic audit trail. Solidity + viem can commit the same records to **BSC Testnet** (or opBNB Testnet / Base Sepolia) when a funded account is configured.

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
5. Compare two generations or export the complete run as JSON. Console pages have dedicated URLs (`/history`, `/verification`), so Back/Forward and refresh keep your place.

The seed preset is an actual starting point for stochastic search. No fitness trajectory is hardcoded. The search combines SELFIES token mutations, RDKit fragment attachment, atom replacement and terminal pruning. Up to 12 × batch size attempts per iteration limits stalled searches. Invalid molecules and canonical duplicates are excluded. The evaluated counter counts unique valid candidates actually scored, excluding the seed; attempts also count rejected mutations.

QED, calculated logP, molecular weight and TPSA are computational heuristics. They do not establish experimental efficacy, toxicity or safety. Search bounds: one connected fragment, organic supported elements, MW 10–650, calculated logP −4–7, ≤50 heavy atoms. These bounds are demo constraints, not clinical criteria.

Objectives:
- `qed`: RDKit QED, higher is better.
- `logp`: `−abs(calculated_logP − target_logP)`, optimal value 0.
- `multi`: configurable weighted mean of QED, normalized proximity to MW 300, target logP, TPSA 75, and rule-based structural constraints. Individual scores are in the exported records and API. Normalization equations are in `backend/chemistry.py`.

## YZi Labs: trusted agent infrastructure × AI-native science

The [YZi Labs track](https://app.notion.com/p/B-BHacks-2-0-Tracks-Judges-3f243bcc211c80189a72e1f9b8583a67#3f243bcc211c809bbeb6e2714b96fb2b) is open to any chain; its setup guide recommends BSC Testnet or opBNB Testnet. This project addresses provenance for computational molecular discovery: a research agent's accepted generations become independently auditable, immutable commitments. The objective, descriptor values, mutation strategy, simulator version and timestamp are all bound by each record hash. This attests what the authorized agent recorded, not the truth of the chemistry.

### Deploy and run on BSC Testnet

Local-only mode works without a wallet and never reports onchain success. Copy `.env.example` to `.env`, configure a **testnet-only** private key, and fund its address using the [BNB faucet](https://www.bnbchain.org/en/testnet-faucet). Keep private keys out of chat, Git and the frontend.

```dotenv
CHAIN_NETWORK=bsc-testnet
CHAIN_RPC_URL=https://bsc-testnet-dataseed.bnbchain.org
CHAIN_CONFIRMATIONS=3
WALLET_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
CONTRACT_ADDRESS=
CONTRACT_DEPLOYMENT_BLOCK=0
```

```bash
npm run contract:compile
npm run contract:deploy
```

Copy the returned `contract_address` and `deployment_block` into `.env` as `CONTRACT_ADDRESS` and `CONTRACT_DEPLOYMENT_BLOCK`. Then run `npm run chain:status` and restart the Python service. The status command checks RPC chain ID, exact compiled runtime bytecode, signer ownership and gas balance. Onchain launches repeat preflight and reject an invalid setup. Use **one** backend worker and a dedicated signer; do not send outside transactions from that wallet while it runs.

Deployment persists signed transaction bytes before broadcast under ignored `contracts/artifacts/deployment-<chain>-<owner>.json`. If receipt polling times out, rerun the deploy command to reconcile the same transaction. It also saves a public deployment manifest. Keep these files until deployment is confirmed. A reverted deployment or a changed compiler/contract requires explicit inspection of that saved intent before creating another deployment; the tool does not silently redeploy.

| Network | Chain ID | RPC | Explorer |
| --- | --- | --- | --- |
| `bsc-testnet` (default) | 97 | `https://bsc-testnet-dataseed.bnbchain.org` | [BscScan](https://testnet.bscscan.com) |
| `opbnb-testnet` | 5611 | `https://opbnb-testnet-rpc.bnbchain.org` | [opBNBScan](https://testnet.opbnbscan.com) |
| `base-sepolia` | 84532 | Your Base Sepolia RPC | [BaseScan](https://sepolia.basescan.org) |

Set both `CHAIN_NETWORK` and `CHAIN_RPC_URL` when changing networks. Mainnet is intentionally unsupported. Old runs retain their network and contract; verification refuses to use a mismatched RPC. Official network information: [BSC](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/), [opBNB](https://docs.bnbchain.org/bnb-opbnb/get-started/network-info/).

### Commitment and recovery guarantees

The contract enforces immutable owner authorization, unique nonzero identities and record hashes, generation order from 0, and parent continuity per run. `recordsByIteration(runId, iteration)` gives a publicly queryable trail; `heads` and `counts` identify each run's latest commitment. Independent runs have independent histories.

`ExperimentCommitted(runId, iteration, recordHash, candidateHash, fitness, parentHash)` binds the generation to its event and stored tuple. Run ID is Keccak-256 of the UUID; candidate and record hashes are SHA-256. Signed fitness is scaled by `10^8`, derived directly from the canonical eight-decimal string, including negative logP scores. The compiler targets Paris for compatibility with supported EVM testnets; use the locked npm dependencies to reproduce bytecode.

Optimization continues independently of RPC delays. The single commitment worker prepares and signs a transaction, **atomically saves its bytes and computed hash in SQLite**, then broadcasts. A lost response or process restart cannot create a fresh transaction for that intent. Failed parents block descendants; unresolved signed transactions block allocating another nonce. Only a confirmed revert permits a new signed intent on retry. The backend retains signed bytes privately and omits them from API responses and exports.

A **Committed onchain** badge requires a successful receipt, matching canonical block hash, matching contract event, all five stored fields, and the configured confirmations (default 3). Verification re-reads this evidence; confirmations are a testnet confirmation policy, not a guarantee of finality. RPC failures remain visible and never become success. Pending work resumes from SQLite; failed work is retried explicitly through **Retry failed commitments**. Changing the database, signing from another process, or editing transaction intent files breaks these recovery guarantees.

### Judge verification without the app

Export a committed run, then:

```bash
python3 scripts/verify_export.py discovery-export.json
python3 scripts/verify_onchain.py discovery-export.json --contract 0xYOUR_TRUSTED_REGISTRY
```

Supply the registry address from your deployment manifest or another independently trusted source; do not derive the trust anchor solely from the export. The second command recomputes every record and ancestor link, checks the configured RPC network and exact contract bytecode, and compares contract storage and receipt events. It needs Node dependencies and a matching RPC configured in `.env`, **no wallet key and no application database**. The registry address and transaction links also appear on the Verification page. Without configured credentials and testnet funds, no public deployment is claimed.

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
| `GET /api/health` | Engine version, configured network and onchain readiness/errors |

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

Optional Solidity execution tests: install `.venv/bin/pip install -r backend/requirements-dev.txt`, then run the same pytest command. They deploy the compiled bytecode to an in-memory EVM and check emitted events, signed fitness, ownership, ordering, duplicate rejection and parent continuity. No testnet funds are used. The optional real viem integration test exercises signed outbox recovery after a lost broadcast response, restart/retry ordering, negative fitness, receipt mismatch, confirmation thresholds and wrong-network rejection:

```bash
# Terminal 1: local development EVM only (not public BSC)
npm exec --yes --package ganache -- ganache --server.port 8545 --chain.chainId 97 --wallet.deterministic --logging.quiet
# Terminal 2
CHAIN_TEST_RPC=http://127.0.0.1:8545 .venv/bin/python -m pytest backend/tests/test_chain_integration.py -q
```

Tests cover three independently seeded 30-generation searches, ≥500 evaluated candidates, nondecreasing elite fitness, meaningful ethanol improvement, both additional objectives, invalid molecules, API launch/stop, persistence, exports and tamper detection.

References: [RDKit Python documentation](https://www.rdkit.org/docs/GettingStartedInPython.html), [viem contract actions](https://viem.sh/docs/contract/writeContract), [Next.js external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).

## Interactive molecular scene

The opening scene displays the current best molecule using deterministic RDKit ETKDG geometry (seed 42, with MMFF relaxation when supported). Drag to rotate. Geometry is an illustrative conformer, not a validated experimental structure; the optimization still uses the original descriptor scores. The renderer respects reduced-motion settings, pauses rendering offscreen, disposes GPU resources, and falls back to an RDKit SVG if WebGL or geometry is unavailable. `GET /api/molecule/scene?smiles=CCO` returns heavy-atom coordinates and connectivity.

## Separate application pages

- `/` — introduction and interactive molecular specimen.
- `/optimization` — run configuration, molecular evolution and live progress.
- `/history` — persisted runs and experiment records.
- `/verification` — hash-chain and onchain checks.

The root layout preserves one live API connection, configuration drafts, and the selected run across client-side navigation. Browser Back/Forward and direct page refresh work. Inspecting a record opens `/verification?experiment=<run-id>:<generation>`; these links restore the corresponding persisted run and record on refresh. Old `#lab/optimization`, `#lab/history`, and `#lab/verification` links redirect to their new pages.

## Vercel frontend deployment

The frontend is deployed at https://bio-rsi.vercel.app. Set `NEXT_PUBLIC_FRONTEND_ONLY=true` for an interface preview without a research backend. This mode shows an explicit preview notice, keeps optimization disabled, stops API reconnect polling and displays a bundled RDKit-generated ethanol conformer. It generates no simulated runs or verification results.

To enable the full app, host the Python service on a persistent host with a persistent database volume, set Vercel's `BACKEND_URL` to that service's HTTPS base URL, remove `NEXT_PUBLIC_FRONTEND_ONLY`, and redeploy (the proxy is configured at build time). The local `.env` and wallet key are excluded from deployments; configure backend secrets only on its host. Keep one backend worker and add authentication before exposing a funded commitment signer.
