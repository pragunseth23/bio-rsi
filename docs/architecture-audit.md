# Architecture audit

Audited on the baseline commit `7407670` (tagged locally as `pre-redesign-baseline`).

## Stack (installed versions)

| Layer | Package | Version |
| --- | --- | --- |
| Framework | next | 16.4.0 (App Router, Turbopack dev) |
| UI runtime | react / react-dom | 19.3.0 |
| Styling | tailwindcss + @tailwindcss/postcss | 4.x (only preflight is used; the UI is plain CSS classes) |
| 3D | three | 0.186.1 (`OrbitControls`, `RoomEnvironment`) |
| Charts | recharts | 3.10.1 |
| Primitives | radix-ui | Dialog, Slot |
| Backend | FastAPI + RDKit + selfies | Python 3.13 venv, RDKit 2026.09.1 |
| Persistence | SQLite (`DATABASE_PATH`, default `backend/data/discovery.sqlite`) | JSON blobs per run / experiment |
| Chain | `scripts/chain.mjs` (viem, solc) | optional Base Sepolia commitments |

No frontend test suite exists. Backend tests: `backend/tests` (pytest).

## Routes

Frontend: a single route `/` (`app/page.tsx`, client component, ~1,470 lines). Next rewrites `/api/:path*` to `BACKEND_URL` (default `http://127.0.0.1:8000`).

Backend (`backend/main.py`):

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | simulator version, `chain_mode`, agent mode |
| GET | `/api/runs` | all runs, newest first |
| POST | `/api/runs` | validate `RunConfig`, evaluate seed with RDKit, start async optimisation task (max 3 active → 429) |
| GET | `/api/runs/{id}` | one run |
| POST | `/api/runs/{id}/stop` | marks a *running* run `stopped`; the loop checks status each iteration |
| POST | `/api/runs/{id}/retry` | **re-queues failed onchain commitments** for the run. It does *not* re-run the optimisation. |
| GET | `/api/runs/{id}/experiments` | ordered experiment records |
| GET | `/api/runs/{id}/export` | JSON attachment: run + experiments + `canonical_json` |
| GET | `/api/runs/{id}/stream` | SSE. Every 0.4 s sends the full `{run, experiments}` snapshot when it changed, otherwise a heartbeat comment; sends `event: finished` once the run is not running and no proofs are pending |
| POST | `/api/verify/{record_id}` | recomputes SHA-256 of the record, walks the parent chain from generation 0, optionally checks the contract. Returns `hash_matches`, `chain_valid`, `recomputed_hash`, `canonical_json`, `status`, `onchain_matches`, `error?` |
| GET | `/api/molecule/svg` | RDKit 2D depiction (palette tuned for dark backgrounds) |
| GET | `/api/molecule/scene` | ETKDG + MMFF conformer (labelled "illustrative") or 2D fallback |

`RunConfig` limits (authoritative): `smiles` 1–500 chars; `objective` ∈ {qed, logp, multi}; `iterations` 1–100; `candidates` 20–50; `target_logp` −3…6; `seed` 0…2³²−1; `weights` exactly {qed, logp, mw, tpsa, constraints}, each 0–1, positive sum. Seed evaluation additionally rejects multi-fragment SMILES, unsupported elements and molecules outside MW 10–650 / logP −4…7 / ≤50 heavy atoms.

## Data flow of one run

1. UI POSTs config → FastAPI validates (pydantic) → `chemistry.evaluate` on the seed (422 with a readable message on failure) → run row saved as `running` → `asyncio` task `optimize`.
2. `optimize` writes generation 0 (the seed) then, per iteration, runs `chemistry.generation` in a thread (SELFIES/fragment/substitute/prune mutations, RDKit validation, canonical de-duplication, top-5 elitism), writes an experiment record whose `parent_hash` is the previous record's hash, and updates run counters.
3. The heuristic agent (or optional LLM) chooses `explore` / `polar` at iteration 0 and every 5 iterations.
4. UI subscribes to `/stream`; each message is a full snapshot, so reconnecting cannot duplicate data.
5. Verification is a single POST; the three checks (hash, chain, onchain) are computed server-side together.

## State ownership (baseline)

All state lives in one component (`Dashboard`): config, run, runs, experiments, selected record, verification result, health, error, busy flags, tab, compare dialog state, clipboard flag, connection flag. Active run id persists in `localStorage["discovery-run"]`.

## Risks found

- **Monolith**: rendering, API access, SSE lifecycle and domain formatting are interleaved in one 1,470-line component.
- **SSE recovery**: relies on `EventSource` auto-reconnect. If the server answers with an error status the browser closes the stream permanently, and the "Reconnecting automatically…" banner stays forever.
- **Health gate**: if `/api/health` fails at load, the Launch button stays disabled until a full reload.
- **Stylesheet**: `app/globals.css` is 2,883 lines: an earlier dark-green theme (lines 1–1654, `#78e4ba`, `#0b1115`) overridden by a later light theme (1655–2883). Many selectors are defined two or three times.
- **Fonts**: `Inter` is referenced but never loaded; the browser falls back to Helvetica/Arial.
- **3D scene**: rebuilt on every keystroke in the SMILES field (fetch → 422 → broken fallback image).
- `localStorage` access is not guarded (throws in some privacy modes).

## Decisions

- Keep the stack. No new runtime dependency is needed: motion is CSS + `IntersectionObserver` + `requestAnimationFrame`; three.js and Radix are already present.
- Split the UI into `lib/` (types, API client, formatting, validation), `hooks/` (lab state + SSE, hash-routed tabs, motion helpers) and `components/lab/*`.
- Add one backend endpoint, `POST /api/molecule/evaluate`, that runs the *same* `chemistry.evaluate` used at launch. It powers live SMILES validation and a real pre-launch seed preview. Existing contracts are unchanged.
- Rewrite `globals.css` as one token system and delete the dead theme.
