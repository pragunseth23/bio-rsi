# Design research and direction

## What was actually consulted

This environment's network policy blocks most of the reference sites. Each source below is marked with how it was accessed. **Observed** means read during this task. **Prior knowledge** means general familiarity, not re-verified today.

| Source | Access | Used for |
| --- | --- | --- |
| Apple HIG – Motion (developer.apple.com/design/human-interface-guidelines/motion) | Fetch returned only the page title; principles below are prior knowledge | Purposeful, brief, interruptible motion; Reduce Motion alternatives |
| web.dev – "How to create high-performance CSS animations" (web.dev/articles/animations-guide) and "Animations and performance" | Search-result excerpts (observed) | Animate `transform`/`opacity` only; `will-change` sparingly and only for a known problem |
| W3C WCAG 2.3.3 and technique C39 / SCR40 (w3.org/WAI/WCAG22/Techniques/css/C39) | Search-result excerpts (observed) | `prefers-reduced-motion` in CSS (C39) and JS (SCR40); motion triggered by interaction must be suppressible |
| CPK colouring (en.wikipedia.org/wiki/CPK_coloring), RCSB Mol* docs (rcsb.org/docs/3d-viewers/mol*/common-actions) | Search-result excerpts (observed) | Element colour convention: C dark/grey, N blue, O red, S yellow, halogens green; ball-and-stick for small molecules |
| Linear, Stripe, Vercel, Resend, Framer, Lusion, Awwwards | Blocked (DNS / proxy). Prior knowledge only | See "patterns" below. Nothing here is presented as a fresh observation. |
| Installed Next.js 16.4 docs (`node_modules/next/dist/docs/01-app/…/13-fonts.md`, `font.md`) | Read locally (observed) | `next/font/google` self-hosting, `variable` CSS-variable method, `display: swap` default |

## Patterns worth adopting (recommendations)

1. **Show the real instrument, not an illustration of one** (Linear/Stripe practice, prior knowledge). The console *is* the product, so the landing hero should hand off to it within one scroll, and every number in the hero must come from the live run.
2. **One accent, used for meaning.** Periwinkle/indigo marks interactive focus, the best-fitness series and "live". Everything else is ink and neutrals. Status colours (green verified, red failed, amber pending) appear only on status.
3. **Instrument typography.** A neutral grotesque for prose and headings, a monospace with tabular figures for every measured value and hash. Labels in sentence case at ≥11 px. Uppercase only for very short metadata.
4. **Hairlines over boxes.** Structure comes from 1 px rules and a shared grid. Cards nest at most once, and the radius scale is limited to 6 / 10 / 16 / 28 px.
5. **Motion explains state change** (Apple HIG, web.dev):
   - 120–180 ms for press and hover, 220–320 ms for tabs and panels, 500–700 ms for one-off reveals.
   - One ease-out curve `cubic-bezier(.2,.8,.2,1)` and one standard curve `cubic-bezier(.4,0,.2,1)`.
   - Only `transform` and `opacity` animate. Nothing blocks input.
6. **Reduced motion is a first-class mode** (WCAG C39/SCR40): no auto-rotation, no parallax, no reveals. Crossfades become instant. All information stays.
7. **Element colours follow CPK** so the 3D model, the RDKit 2D drawing and the legend agree. Carbon stays metallic graphite to keep the art direction; oxygen becomes a muted CPK red, nitrogen a CPK blue that sits next to the accent.

## Patterns rejected for this product

- Scroll hijacking, pinned scroll scenes and long intro animations. They delay access to a working tool.
- Glassmorphism, glow borders, gradient blobs and particle fields. They add no information and lower contrast.
- Fake terminal logs, simulated progress or a verification "animation" that runs before the server answers.
- Molecule morphing between generations. Atoms are not in correspondence across structures, so a morph would imply chemistry that did not happen. A crossfade is honest.
- Custom cursors and sound.

## Final direction (what changes and why)

| Area | Change | Why |
| --- | --- | --- |
| Header | Brand + section nav + mode chip + "Enter the lab". Tagline moves into the hero. On mobile: brand + action only. | Fixes B9; one job per row. |
| Hero | Two-column grid: copy (headline, concrete description, primary/secondary actions) and a dedicated specimen cell. The 3D canvas fits the molecule to the cell, and a readout strip sits *below* the model (SMILES, atoms, best fitness, generation). The element legend is built from real atoms. | Fixes B8/B12/B13; nothing overlaps at any width. |
| Console | Hash-routed tabs (`#optimization`, `#history`, `#verification`) with a sliding indicator. Config, evolution and progress columns stay, with inline validation, live seed preview, crossfading best molecule, improvement chip from real deltas, count-up metrics and spaced chart ticks. | Fixes B2/B3/B11/B16. |
| Reliability | Health polling with Retry, an SSE reconnect loop with back-off and visible state, in-page export with error reporting, guarded storage. | Fixes B4/B5/B6/B15. |
| Verification | One real request. Results for each check (hash, parent chain, onchain) are revealed in sequence only after the server answers. Failures are explained. | Honest motion. |
| System | New `globals.css` built on tokens; `next/font` with Inter, Inter Tight and JetBrains Mono; `app/icon.svg`. | Fixes B1/B10/B14. |
