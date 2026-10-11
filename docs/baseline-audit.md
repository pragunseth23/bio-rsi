# Baseline UI audit

Severity: **S1** broken / misleading · **S2** degraded usability or accessibility · **S3** visual polish.

| ID | Sev | Area | Reproduction | Actual | Expected | Cause | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | S2 | Global | Load `/` | `GET /favicon.ico` → 404 | App icon served | No `app/icon.*` | Clean session, no 404 in network log |
| B2 | S1 | Hero / config | Type `C1CC` into SMILES | 3D hero and the seed card show broken images; 422s on every keystroke | The hero keeps the last valid molecule; inline "invalid SMILES" message | Scene and `<img>` bound directly to raw input | Type partial SMILES; no 4xx except the validation call; inline error is shown |
| B3 | S1 | Config | Empty "Iterations" → Launch | Generic "Check the configuration values" banner | Field-level error before any request | `Number("") === 0`; pydantic detail array is discarded | Launch is disabled and the field shows its range |
| B4 | S1 | Connection | Start the UI while the API is down, then start the API | Launch disabled until a manual reload | Banner with Retry; automatic recovery | Health is fetched once | Kill/restart the API during the browser test |
| B5 | S1 | Streaming | API restarts mid-run | "Reconnecting automatically…" can persist forever (EventSource closes on error responses) | Visible reconnect with back-off; state refreshes | Relies on native auto-reconnect | Restart the API during a run in the browser test |
| B6 | S2 | Export | Click Export JSON | Blank popup tab; failures invisible | In-page download, errors surfaced | `window.open` | Download event + JSON parse in the test |
| B7 | S2 | A11y | Tab through the experiment table | Rows not focusable; tabs lack ARIA roles; streaming status not announced | Row buttons, `tablist` semantics, polite live region | Markup | Keyboard pass in the browser test |
| B8 | S2 | Hero (desktop) | 1440×900 | Right specimen column overlaps the oxygen sphere; "INITIAL SPECIMEN" label hidden | Model and metadata in separate grid areas | Absolute overlay over a full-bleed canvas | Screenshot at 1024/1440/1920 |
| B9 | S2 | Header (mobile) | 390×844 | Tagline squeezes the logo; "Enter the lab" hidden; stats overlap hero copy | Brand + action only; molecule below headline | Three-column grid kept on mobile | Screenshot at 360/390 |
| B10 | S2 | Type | Any | Fonts fall back (Inter not loaded); labels at 8–9 px | Loaded fonts; ≥11 px labels | No `next/font`; tiny sizes | Computed `font-family` check |
| B11 | S3 | Chart | Completed run | X-axis ticks collide (`0 1 2 3 4 5 6 7 8 10…`) | Spaced ticks | No `minTickGap` | Screenshot |
| B12 | S3 | Copy | Hero | Filler ("Let curiosity become a molecule", "SEED", "EVOLVE + SELECT", "[ 01—∞ ]") | Concrete description of what the tool does | — | Review |
| B13 | S2 | Scientific consistency | Hero vs 2D drawings | 3D oxygen is periwinkle, 2D oxygen is red | One element palette (CPK-derived) | Separate palettes | Visual check with Ethanol/Phenol |
| B14 | S3 | CSS | — | 2,883 lines incl. dead green theme | One token system | Layered rewrites | `grep 78e4ba` returns nothing |
| B15 | S2 | Persistence | Private mode | `localStorage` throws, breaking load | Guarded | Unguarded access | Code review |
| B16 | S3 | Navigation | Switch tabs, press Back | Back leaves the page; refresh resets the tab | Tabs reflected in the URL hash | Local state only | Back/forward in the browser test |
| B17 | S3 | Hero | Scroll away during a run, take a full-page capture | Canvas shows a stale frame | Expected (rendering paused off-screen). Kept as a feature, not a bug | — | — |
