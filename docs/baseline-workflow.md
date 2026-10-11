# Baseline workflow (real backend)

Environment: Chromium (Playwright, `/opt/pw-browsers/chromium`, SwiftShader WebGL), 1440×900. Backend started with an isolated `DATABASE_PATH` in a scratch directory so the developer database in `backend/data/` was not touched. `chain_mode = local-only`, agent `heuristic`.

Settings: Ethanol (`CCO`), QED, 30 iterations, batch 30, seed 42.

| # | Step | Result |
| --- | --- | --- |
| 1 | Load `/` | Renders. Console: one `404` (browser request for `/favicon.ico`; no icon exists). |
| 2 | Type partial SMILES `C1CC` | Hero 3D scene re-fetches geometry on every keystroke → `422`; hero falls back to a broken `<img>`; console card also shows a broken image. Three `422`s logged. |
| 3 | Clear "Iterations", press Launch | Request sent with `iterations: 0` → `422` → banner "Check the configuration values and try again." No field is identified. |
| 4 | Launch with valid config | Run starts, SSE streams, chart and table update. |
| 5 | Stop | Real `POST /stop`; status becomes `Stopped`. |
| 6 | "Retry" | No run-level retry exists. The backend `retry` endpoint re-queues **failed onchain commitments** and the UI only shows it when a proof failed. In local-only mode it never appears. Re-running = launching again. |
| 7 | Relaunch → completes | 30/30 generations, 900 evaluated, best QED 0.946 (from 0.407). |
| 8 | Compare molecules | Dialog opens with reference/comparison selectors; selecting generation 3 updates correctly. |
| 9 | History | 31 rows (generation 0–30). Rows are clickable but **not keyboard focusable** (only the small chevron button is). |
| 10 | Verification → Verify | "Local integrity verified · Record hash: matches · Parent chain: consistent · Onchain: not verified". |
| 11 | Export JSON | `window.open` of the attachment URL. The download works, but a blank popup tab is opened and errors (e.g. 404) are invisible. |
| 12 | Reload | Last run is restored from `localStorage` and shows `Completed`. |

Backend tamper behaviour is covered by `backend/tests/test_discovery.py::test_api_persistence_verification_and_tamper` (a modified record breaks `chain_valid`). The redesigned UI is tested against the same failure in the browser (see `docs/test-report.md`).
