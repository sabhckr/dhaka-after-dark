# Golden views and A/B performance (P0)

Evidence harness for every engine and visual phase. It runs the real game in the
installed Google Chrome (headless, platform GPU) and writes into `out/look/`
(gitignored). Results describe the machine they ran on.

## Commands

```bash
# 27 captures: 3 districts x street/medium/aerial x day/night/rain
npm run look:capture -- http://127.0.0.1:8097/ out/look/after
# pixel comparison, triptychs (A | B | heat) and compare.md
npm run look:compare -- out/look/before out/look/after out/look/diff
# alternated A/B frame timing, checked against docs/budgets.json
npm run perf:ab -- http://127.0.0.1:8091/ http://127.0.0.1:8097/ out/look/perf-ab.json 3
```

## What makes captures repeatable

- `window.__golden.freeze(true)` hides traffic and pedestrians and stops the
  water animation; the rain streaks are not drawn while frozen.
- The browser context asks for reduced motion, so looks switch without the
  1.15 s blend.
- Views are fixed in `scripts/look/views.mjs`; street points are road
  centrelines clear of building footprints.
- Each view waits for the HUD to report no fetch in flight, then 4 s for
  building LOD to settle.

Moving actors are therefore not in golden views. Traffic and pedestrians are
judged from `perf:ab` and from dedicated captures, not from pixel diffs.

## Verdicts

`compare.mjs` calls a view "same" when at most 1% of pixels changed by more
than 24/255 and the mean 8x8 luma SSIM is at least 0.99 (`docs/budgets.json`,
`golden`). It also reports the changed share in five horizontal bands, so a
change confined to the horizon (top bands) is told apart from one in the
street (bottom bands).

## Self-test (30 Oct 2026, M1 MacBook Air 8 GB, ANGLE Metal)

Two consecutive captures of the same build (`dev/engine-core`, P0 commit):
27 of 27 views "same", largest changed share 0.00%, lowest SSIM 0.9988
(Gulshan aerial, day). Boot to first full ring: 6.6 s and 8.6 s.

Every capture logged five 404s for chunks outside the data coverage (for
example `c_9_-19` south of Old Dhaka). The scheduler requests cells that have
no file; P1 fixes this.
