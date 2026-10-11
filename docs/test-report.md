# Test report

Branch `claude/sweet-curie-ohby39`, local commits only (nothing pushed). Rollback point: local tag `pre-redesign-baseline` (= `7407670`).

All browser tests ran in headless Chromium (Playwright 1.64) against the **real** FastAPI + RDKit backend on an isolated SQLite file. The developer database in `backend/data/` was never touched.

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| Types | `npm run typecheck` | pass |
| Production build | `npm run build` | pass (`/`, `/icon.svg` static) |
| Backend + contract tests | `.venv/bin/python -m pytest backend/tests -q` | **9 passed** (includes the new seed-evaluation test and the in-memory EVM contract tests) |
| End-to-end workflow | `npm run dev` then `CHROMIUM_PATH=… npm run test:e2e` | **39 / 39 passed** |
| Accessibility | axe-core 4.10 on all three console views | 0 violations |
| Horizontal overflow | 360, 390, 768, 1024, 1440, 1920 px | 0 px at every width |
| CSS consolidation | 9 full-page captures before/after, pixel diff | identical |

## End-to-end checklist (tests/e2e/workflow.mjs)

| # | Behavior | Result |
| --- | --- | --- |
| 1 | Fonts load through `next/font` (Newsreader, IBM Plex Sans/Mono) | ✅ |
| 2 | No `/favicon.ico` 404; `app/icon.svg` served | ✅ |
| 3 | Hero renders the real 3D conformer with an element legend (Ethanol: C 2, O 1) | ✅ |
| 4 | "Enter the lab" scrolls to the console and sets `#lab/optimization` | ✅ |
| 5 | Invalid SMILES → inline RDKit message, Launch disabled, hero does not fetch bad geometry | ✅ |
| 6 | Presets (Ethanol, Phenol, Aspirin) fill and validate | ✅ |
| 7 | Seed preview shows real RDKit fitness before launch (0.407) | ✅ |
| 8 | logP target validated (−3…6) | ✅ |
| 9 | Multi-objective weights validated (all-zero rejected) | ✅ |
| 10 | Empty iterations blocks launch; budget updates live (≤ 900) | ✅ |
| 11 | Launch → real run, SSE streams generations | ✅ |
| 12 | Stop → backend stop, status *Stopped* | ✅ |
| 13 | API crash mid-run → visible banner | ✅ |
| 14 | API back → stream reconnects automatically; run honestly shown *Interrupted* | ✅ |
| 15 | Full run Ethanol / QED / 30 / 30 / seed 42 completes (QED 0.407 → 0.946) | ✅ |
| 16 | "Improved +x" chip appears only on a real fitness increase | ✅ |
| 17 | Hero readout reflects the run | ✅ |
| 18 | 3D "Reset view" works | ✅ |
| 19 | Compare dialog: selectable generations | ✅ |
| 20 | Esc closes the dialog and returns focus to its trigger | ✅ |
| 21 | History lists runs (3) and records (31) | ✅ |
| 22 | Browser Back/Forward switch console tabs | ✅ |
| 23 | Refresh keeps the tab and the run | ✅ |
| 24 | Selecting a saved run loads its records | ✅ |
| 25 | Export JSON downloads; `scripts/verify_export.py` validates all 31 records | ✅ |
| 26 | Arrow keys move between tabs (ARIA tabs pattern) | ✅ |
| 27 | Keyboard: inspect button opens a record in Verification | ✅ |
| 28 | Genuine record verifies (local integrity, local-only mode stated) | ✅ |
| 29 | Copy hash writes the clipboard and confirms | ✅ |
| 30 | Tampering generation 10 in the test DB → generation 30 fails verification (parent chain broken) | ✅ |
| 31 | Restoring the record → verifies again | ✅ |
| 32 | Page loaded with API down → offline banner, Launch disabled | ✅ |
| 33 | "Retry now" recovers without a reload | ✅ |
| 34 | With chain credentials configured, header shows Base Sepolia mode | ✅ |
| 35 | Unreachable RPC → every commitment ends *Failed*; "0 onchain" (never shown as committed) | ✅ |
| 36 | Failed commitment reported separately from intact integrity | ✅ |
| 37 | "Retry failed commitments" → backend accepts the re-queue (`status: queued`) | ✅ |
| 38 | Reduced motion: content visible immediately, no running animations | ✅ |
| 39 | No unexpected console errors or failed requests | ✅ |

## Performance (production build, `next start`)

Measured with PerformanceObserver in headless Chromium. This machine has **no GPU**, so WebGL runs on the SwiftShader software rasterizer. That is a worst case for the 3D scene.

| Profile | LCP | CLS | Slowest interaction | JS transferred |
| --- | --- | --- | --- | --- |
| Desktop 1440×900 | 200–290 ms | 0.000–0.008 | 24 ms | 405 KB |
| Mobile 390×844, 4× CPU throttle, 1.6 Mbps / 150 ms RTT | 0.96–1.0 s | 0.005–0.035 | 40 ms | 405 KB |

Targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. All met. What changed to get there (first measurement: LCP 3.26 s, 280 ms interactions):
- Removed the opacity fade on the hero paragraph (it was the LCP element).
- WebGL initializes at idle time.
- Atoms and bonds are drawn as instanced meshes, with 1× pixel ratio on software GL.
- Heavy panels are memoized, and the tab panel is deferred so the tab bar responds instantly.

## Brief compliance (original hackathon prompt)

| Requirement | Status |
| --- | --- |
| SMILES input, presets, objective, iterations, Start/Stop | ✅ |
| QED / target logP / multi-objective with individual scores | ✅ (scores in records and export) |
| Mutation search with SELFIES + RDKit, validity, dedupe, bounds, elitism | ✅ (unchanged backend; tests) |
| ≥ 500 candidates per run; seeded demo improves | ✅ 900 scored; 0.407 → 0.946, deterministic across processes |
| Agent reviews strategy every 5 iterations; heuristic fallback without key | ✅ |
| Hash-linked records, deterministic serialization | ✅ |
| Base Sepolia commitments, tx hash, block, explorer link, statuses | ✅ implemented; **real testnet commit not exercised** (see limitations) |
| Dashboard: dark surface, molecule SVGs, live chart (best, average, valid %) | ✅ |
| Timeline: iteration, structure, fitness, property changes, parent, status, tx hash | ✅ |
| Compare any two molecules | ✅ |
| Verify Experiment: recompute hash, parent chain, onchain comparison, distinct statuses | ✅ |
| Endpoints `POST /api/runs`, `GET …/{id}`, `/experiments`, `/stream`, `POST /api/verify/{id}`, `GET /api/molecule/svg` | ✅ |
| Persistence across refresh | ✅ |
| Invalid molecules / unavailable chain handled without crashing | ✅ |

## Known limitations

- **No real Base Sepolia transaction was made.** No funded testnet wallet or RPC is available, and this environment's network policy blocks most external hosts. What was tested:
  - the failure path against an unreachable RPC (in the browser);
  - the contract in an in-memory EVM (pytest).

  A real commit needs `BASE_SEPOLIA_RPC_URL`, `WALLET_PRIVATE_KEY` and `CONTRACT_ADDRESS` (see README).
- **Browser coverage:** Chromium only. Safari and Firefox were not tested.
- **Interrupted runs:** a run interrupted by a server restart cannot be resumed (backend design). The UI labels it *Interrupted* and lets you start a new run.
- **3D geometry:** the 3D model is an illustrative ETKDG/MMFF conformer, labeled as such. Scores come from 2D descriptors.
- **No authentication:** this is a local hackathon app. Keep it bound to loopback.
- **Design research:** most reference sites were unreachable from the sandbox. See `docs/design-research.md` for what was actually consulted.
