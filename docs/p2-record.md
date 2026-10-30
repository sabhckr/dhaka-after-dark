# P2 world data v2: running record

Branch `dev/engine-core` in the worktree `~/Documents/dhaka-after-dark-p1`. Nothing is pushed or merged. `public/world` has not been modified at any point in P2; every regeneration wrote to a staging folder.

## Status (2026-10-30)

| Part | State | Evidence |
|---|---|---|
| Audit of v1 data and generator | Done | Section "Audit" below |
| Schema v2 types, OSM extraction, generator | Done | 18a6169, 8d88223 |
| Validation, compatibility layer, runtime rules | Done | 18a6169 |
| Migration tooling (diff, OSM check, swap list, benchmark) | Done | 8d88223, 3137e57, docs commit |
| Tests | 17 new, all game tests pass | `npm test` TS suite: 135 of 135 |
| Staged regeneration and checks | Done, all pass | Section "Verification" |
| Benchmarks, old against new | Done | Section "Benchmarks" |
| Replacing `public/world` with v2 | **Waiting for approval** | Section "Approval request" |
| Rendering anything from v2 | Not started; P3, P4 and P6 work | |

## Audit

- `public/world` is 1,298 chunk files (89 MB), `manifest.json`, `overview.json`, `coverage.json`, `landmarks.json`, plus `signs/` (594 files, written by `extract-shops.ts`) and `assets/manifest.json` (hand-maintained). Only the first five are generator output.
- v1 keeps footprint, height and height source for buildings, and class, width, deck height and bridge flag for roads. It has no building type, levels, material, lanes, sidewalks, signals, crossings, stops, lamps, landuse or walls. The road graph has no signal data, so the traffic sim treats every node with three or more links as a signal (backlog T4).
- `scripts/geo/generate.ts` wrote into `public/world` by default and deleted `public/world/chunks` first. It now refuses to write there unless `WORLD_WRITE_PUBLIC=1` is set.
- The runtime fetched `/world/...` from three places and validated only `v === 1`.
- Chunks are consumed by meshes, dressing, collision, the pedestrian graph, traffic and the far ring. None of them reads a field v2 adds.

## Design

See `docs/world-schema-v2.md`. In short: additive only, OSM-only data with a source per field, rules in `src/geo/infer.ts` labelled `osm`, `rule` or `default`, and readers that accept v1 and v2.

## Commits

| Commit | Content |
|---|---|
| 18a6169 | v2 types, OSM tag extraction, v2 assembly, validation, `compat.ts`, `infer.ts`, generator schema switch and write guard, 16 tests |
| 8d88223 | `diff-schema.ts`, `dump-osm-sample.ts`, `check-v2-osm.py`; two parser bugs fixed |
| d5e8e14 | Type error in `dump-osm-sample.ts`. 8d88223 was committed with it: the typecheck output went through a pipe that hid its exit code |
| 3137e57 | Dev-only `?world=stage` switch, `/world-stage/` middleware, `bench-format.ts` |
| (docs commit) | `swap-plan.mjs`, `p2-swap-plan.tsv`, `world-schema-v2.md`, this record |

## Verification

All runs used the 2026-10-28 extract (`data/raw/bangladesh.osm.pbf`, MD5 `0e9db373accaa20f98f1c344ee6543ee`) and wrote to the session scratchpad.

1. **v1 path unchanged.** `WORLD_SCHEMA=1` reproduces shipped data: all 1,298 chunks, `overview`, `coverage` and `landmarks` are byte-identical, and the manifest differs only in `generatedAt`. 78 s, peak footprint 2.39 GB.
2. **v2 regeneration.** 1,303 chunks, 93.2 MB. 76 s, peak footprint 1.87 GB.
3. **`diff-schema.ts`, shipped against staged v2: PASS.**
   - All 1,298 old chunks are still there, and `toV1(new)` is byte-equal to each one.
   - 5 chunks were added, holding only v2 features; none was removed.
   - Every chunk passes `validateChunk`, and the manifest passes `validateManifest`.
   - Boundary, CRS, origin, spawns and sources are unchanged, and `overview.json` and `landmarks.json` are byte-identical.
4. **Raw OSM check (`check-v2-osm.py`): PASS.** It covers every attributed feature: 57,793 buildings, 11,154 roads, 993 landuse areas, 295 barriers and 42 power lines. All match the raw tags. All 2,578 points are within 7 mm of their OSM node, against a 1 cm limit (p99 6.6 mm). A sample of 5,000 untagged buildings and 5,000 untagged roads has nothing in OSM that v2 should have copied.
5. **Tests.** 17 new tests in `src/geo/world-v2.test.ts` cover:
   - parsing of every field, including the two bugs below;
   - that v1 assembly ignores v2 input;
   - `toV1` round trips;
   - signal-to-node matching;
   - chunk splitting of the new layers;
   - point positions;
   - v1 and v2 validation, and the manifest `fields` check;
   - `normalizeChunk` and `upgradeV1`;
   - byte round trips of four shipped chunks;
   - that the pedestrian plan and collision are identical for a chunk in v1 and v2 form;
   - the runtime rules;
   - the write guard and the stage switch.

   TS suite: 135 of 135 pass. Typecheck, now also covering `scripts/geo`, is clean, and lint has 0 errors.
6. **In the game.** The dev server served the staged data with `?world=stage`. A check of the loaded resources showed 34 chunks fetched from `/world-stage/` (sample chunk `v: 2`) and none from `/world/`. The plain URL loaded 35 chunks from `/world/` (`v: 1`). Both had 0 page errors.
7. **Golden views.** 27 of 27 are the same, v1 against staged v2 on the same build, with 0 console errors in either capture. The current build against the build before P2 also gives 27 of 27 the same.

## Bugs found and fixed

| Bug | Found by | Fix |
|---|---|---|
| `building:levels="5th Floor"` (an address note) was stored as 5 levels | the raw OSM check | v2 reads only plain counts |
| Levels in Bangla digits (`২`, `৮`, `৯`) were dropped: JavaScript `\d` matches ASCII only | the raw OSM check, full run | v2 numeric fields convert Bangla digits |
| A compatibility test compared `.length` of an object, so it checked nothing | review of the first test run | it now compares the full collision bucket |
| 8d88223 was committed with a type error | the next typecheck | d5e8e14 |

## Benchmarks

Machine: M1 Air, 8 GB, with about 2 GB of swap in use.

### File size (chunks only)

| | v1 shipped | v2 staged | Change |
|---|---|---|---|
| Files | 1,298 | 1,303 | +5 |
| Raw | 90.50 MB | 93.15 MB | +2.9 % |
| gzip −9 | 22.81 MB | 23.62 MB | +3.6 % |
| brotli 11 | 17.07 MB | 17.73 MB | +3.8 % |

The roadmap budget was +25 %. `places.json` (120 KB) is new, and the manifest grew from 244 KB to 314 KB.

### Load cost, Node 5 alternated rounds (`bench-format.ts`)

Times are for parse + validate + normalise of every chunk, read from memory.

| | v1 | v2 | Change |
|---|---|---|---|
| All chunks | 359 ms | 418 ms | +16 % |
| of which JSON.parse | 293 ms | 313 ms | +7 % |
| of which validate | 66 ms | 105 ms | +60 % (the v2 field checks) |
| Per chunk, median / p95 / max | 0.20 / 0.71 / 2.56 ms | 0.24 / 0.82 / 3.19 ms | |
| Heap retained, whole city parsed | 154 MB | 174 MB | +13 % |

The game holds a 5 × 5 ring plus the far ring at a time, not the whole city. For scale, building the meshes for one ring of 21 to 25 chunks took 140 to 250 ms in P1, 28 ms for the worst single chunk (docs/perf.md).

### In the game

`npm run perf:ab` on one dev server: A is shipped v1 (`/`), B is staged v2 (`/?world=stage`). Same code, 3 alternated rounds, medians over rounds. The display caps at 60 Hz. Report: `out/look/perf-ab-p2.json` (gitignored).

| | A: v1 | B: v2 |
|---|---|---|
| Steady median, 3 views | 16.7 / 16.7 / 16.7 ms | 16.7 / 16.7 / 16.7 ms |
| Steady p99, 3 views | 18.5 / 18.4 / 18.5 ms | 18.5 / 18.5 / 18.4 ms |
| Teleport to Old Dhaka: nearby chunks loaded / p99 / worst | 807 ms / 40.5 ms / 58.8 ms | 804 ms / 42.0 ms / 61.4 ms |
| Teleport to Uttara: nearby chunks loaded / p99 / worst | 805 ms / 23.1 ms / 44.0 ms | 805 ms / 21.5 ms / 43.7 ms |
| Frames over 100 ms | 0 | 0 |
| JS heap at Kawran street / Old Dhaka / Gulshan | 278 / 247 / 248 MB | 284 / 249 / 258 MB |
| Draws at the 3 views | 157 / 94 / 138 | 151 / 93 / 143 |

Every budget in `docs/budgets.json` passes for B. The differences are within the run-to-run spread seen in P1. The draw counts move by a few because traffic and pedestrians keep moving during the steady sample. No 90 FPS claim: this is an M1 at a 60 Hz cap.

## Outstanding issues

- **v1 height parser.** `classifyHeight` still reads levels leniently. "5th Floor" becomes 5 levels (16 m), and Bangla-digit levels are ignored, which falls back to the class default. Fixing it changes v1 building heights, which is a geometry change. So it is left for a separate, approved data change. The whole-country extract has 38,650 building ways with `building:levels`. Of these, 38,547 are plain ASCII numbers, 9 use Bangla digits, 40 contain a number that is not a count ("5-6", ">2", "-4", "5th Floor", "3 Level"), and 54 have no digit at all. So the v1 misreading affects at most 49 ways in the country.
- **Nothing renders v2 yet.** Building types, levels, materials, lanes, sidewalks, landuse and lamps feed P3, P4 and P6.
- **Signals.** Only 51 of the 95 OSM signals sit on a graph node, so P6 must use `points` for the others.
- **Elevated structures (D4).** `mh`/`mlv` are rare (27 buildings) and `ly` is on 1,145. `buildingElevated` returns `rule` for layer alone, and how to draw these is P4 work.
- **District names.** These come from the nearest place node (`rule`), not from polygons.
- **Coverage.** OSM coverage is thin for every field (6 % of buildings have levels, 5.7 % of roads have lanes). v2 does not fill the gaps. That is what the labelled rules are for.
- **Staging copy.** The validated copy is at `~/Documents/dhaka-after-dark-staging/world-v2-2026-10-30`, with `SHA256SUMS` and the reports from its checks (`diff-final.json`, `geo-check-all.json`, `bench-format.json`, the generator log). The scratchpad copies under `/private/tmp` are not durable.

## Approval request: replace generator files in `public/world` with v2

Nothing below has been done. It needs your explicit approval.

**Source.** The validated staged regeneration, copied with a SHA-256 list to `~/Documents/dhaka-after-dark-staging/world-v2-2026-10-30` (outside every repository).

**Exact file list.** [`docs/p2-swap-plan.tsv`](p2-swap-plan.tsv) has one row per generator-owned file: action, path, old and new bytes, old and new SHA-256. Totals:

| Action | Files | Shipped bytes | v2 bytes |
|---|---|---|---|
| replace | 1,300 (1,298 chunks, `manifest.json`, `coverage.json`) | 90,754,712 | 93,470,936 |
| add | 6 (chunks `-1_-26`, `-4_-28`, `11_-49`, `22_-59`, `24_-32`, and `places.json`) | 0 | 122,038 |
| unchanged | 2 (`overview.json`, `landmarks.json`, byte-identical) | 702,876 | 702,876 |
| delete | 0 | | |

Generator-owned total: 91.58 MB → 94.30 MB (+3.0 %). Its `SHA256SUMS` lists all 1,308 staged files, and `shasum -a 256 -c SHA256SUMS` passes.

`signs/` (594 files) and `assets/manifest.json` are not touched. They are not generator output, and the overview boundary that `signs/` depends on is byte-identical.

**Plan.** Run it in the `dhaka-after-dark-p1` worktree on `dev/engine-core`, never on `main`:

1. Check preconditions: the worktree is clean; `diff-schema.ts` still passes against the staging copy; the staging copy's hashes match the TSV.
2. Copy the files in. No file is deleted, so no `--delete`:
   ```bash
   STAGE=~/Documents/dhaka-after-dark-staging/world-v2-2026-10-30
   rsync -a "$STAGE/chunks/" public/world/chunks/
   cp "$STAGE"/{manifest,overview,coverage,landmarks,places}.json public/world/
   ```
3. Verify:
   - every file hashes to its TSV `new_sha256`;
   - `signs/` and `assets/` hashes are unchanged;
   - `git status` shows exactly 1,300 modified and 6 new files under `public/world`.
4. Re-run the checks: the game tests, typecheck and build; golden views (27 of 27 the same against the pre-swap commit); an in-game load with 0 errors; one A/B run against the pre-swap commit.
5. Commit the swap as one commit, `World data: schema v2`. Do not push.

**Risks.**

- **Git history.** The swap adds about 93 MB of changed chunk blobs (roughly 23 MB compressed) to a public repository's history once pushed. The shipped v1 data stays in history.
- **Old builds.** A build older than 18a6169 rejects v2 chunks ("unsupported chunk version"). Code and data deploy together from one commit, so this matters only for a stale cached bundle meeting new data. The chunk URLs are not versioned.
- **Load cost.** 5 more chunk files are fetched near the city edge. Validation costs about 0.04 ms more per chunk, and a fully parsed city takes 13 % more heap.
- **Nothing visible changes.** Golden views are identical. Any later renderer change that uses v2 fields is separate work.

**Rollback.**

- Before the commit: `git restore --source=HEAD --staged --worktree public/world`, then move the 6 added files to the Trash with `/usr/bin/trash`. Nothing else needs undoing.
- After the commit: `git revert <swap commit>`. The code reads v1 and v2, so it needs no change, and the shipped v1 files stay in history at the commit before the swap.
