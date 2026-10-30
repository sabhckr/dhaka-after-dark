# World data: regeneration and validation

How `public/world` is produced, what is hand-maintained, how a regeneration is checked before it replaces the shipped data, and how to roll it back. Every figure below was measured on 2026-10-30 on an Apple M1 with 8 GB of RAM. Nothing here is estimated unless it says so.

## Source

| Item | Value |
|---|---|
| File | `data/raw/bangladesh.osm.pbf` (gitignored) |
| Origin | Geofabrik, redirect target `bangladesh-261028.osm.pbf`, Last-Modified 2026-10-28 |
| Size | 355,896,654 bytes |
| MD5 | `0e9db373accaa20f98f1c344ee6543ee`, equal to the checksum Geofabrik publishes for that file |
| Licence | ODbL 1.0. The derived chunks are a derived database, so they stay ODbL with attribution. |

The shipped data was generated from this same extract (manifest `sources[0]`), so any difference between shipped and regenerated data comes from code, not from OSM edits.

## What owns what

| Path | Written by | Notes |
|---|---|---|
| `public/world/chunks/c_*.json` (1,298) | `scripts/geo/generate.ts` | Roads, buildings, water, canals, parks, rail, plazas, bridges, trees, landmarks, road-graph slice |
| `public/world/manifest.json` | `generate.ts` | One hand edit in history, see below |
| `public/world/overview.json`, `coverage.json`, `landmarks.json` | `generate.ts` | |
| `public/world/signs/` (594 files) | `scripts/geo/extract-shops.ts` | Reads only `overview.boundary` from generated data |
| `public/world/assets/manifest.json` | Hand-maintained | Not touched by either script |

### Hand edits found

Method: the unmodified `main` generator (c534279) was run against the same PBF into a separate folder, with only its two hard-coded `/workspace` paths changed, and compared byte for byte with `public/world`.

- All 1,298 chunks, `overview.json` and `coverage.json`: byte-identical. No hand edits.
- `manifest.json`: only `generatedAt` differs. The Sangsad spawn height (48 → 120 m) was edited by hand in 89068c0, and the same commit changed `SPAWN_SEEDS` in the generator, so a regeneration reproduces it.
- `landmarks.json`: 55 of 1,986 records differ in the last digit of `x` or `z`, at most 9.3 × 10⁻¹⁰ m. This is float noise from proj4 running on another machine, not an edit. Chunks round to 1 cm, so they are unaffected.
- `signs/` and `assets/` are not generator output. A data swap must leave them in place.

## Generator runs

All runs used `node --max-old-space-size=3072 --experimental-strip-types`. Each one ran alone, with no other heavy job, and wrote to its own folder under the session scratchpad, never into `public/world`.

| Run | Code | Wall time | Max RSS | Peak footprint | Swaps | Exit |
|---|---|---|---|---|---|---|
| Reproduction of shipped data | `main` c534279 | 139 s | 1.35 GB | 1.87 GB | 0 | 0 |
| Stage A: pinned simplification | f47d490 | 141 s | 1.31 GB | 1.88 GB | 0 | 0 |
| Stage B: plus 1 cm node ids, unique edge ids | uncommitted | 127 s | 1.36 GB | 2.38 GB | 0 | 0 |
| Stage C: plus stub merge | uncommitted | 118 s | 1.48 GB | 1.99 GB | 0 | 0 |
| **Final** | **9037ea4** | **122 s** | **1.56 GB** | **2.23 GB** | **0** | **0** |

The final run is identical to stage C apart from `generatedAt`, so the generator is deterministic for a given commit and extract. Peak footprint stayed under the 3 GB heap cap in every run. No run swapped.

## Shipped against final staging

Produced by `python3 -I scripts/geo/validate-world.py public/world <staged> <report.json>`.

| Metric | Shipped | Staged | Difference | Classification |
|---|---|---|---|---|
| Chunk files | 1,298 | 1,298 | 0 | Same set |
| Road graph nodes (deduplicated) | 56,732 | 58,673 | +1,941 | Expected improvement: junction vertices kept |
| Road graph edges | 56,057 | 73,080 | +17,023 | Expected improvement: roads split at real junctions |
| Connected components | 5,565 | 174 | −5,391 | Expected improvement |
| Largest component, share of nodes | 71.8 % | 98.6 % | +26.8 pts | Expected improvement |
| Components with 2 nodes or fewer | 3,546 | 72 | −3,474 | Expected improvement |
| Dead ends | 22,037 | 9,458 | −12,579 | Expected improvement |
| Dead ends within 5 cm of another road | 6,710 | 30 | −6,680 | Expected improvement. The rest are unverified, see below |
| Dead ends within 1 m of another road | 12,606 | 74 | −12,532 | As above |
| Duplicate edge ids | 6 | 0 | −6 | Defect fixed |
| Edge endpoint more than 2 cm from its node | 272 | 44 | −228 | Defect fixed; the 44 are deliberate merges, under 5 cm |
| Zero-length or self-loop edges | 2 | 0 | −2 | Defect fixed |
| Duplicate edge geometries | 1 | 5 | +4 | OSM source: pairs of different ways with identical geometry |
| Missing node references | 0 | 0 | 0 | |
| Node id with two positions across chunks | 0 | 0 | 0 | |
| Non-finite or null coordinates | 0 | 0 | 0 | |
| Bridge edges with both ends in the largest component | 1,597 of 1,970 | 2,124 of 2,294 | +527 | Expected improvement |
| Graph a car can drive (edges of 8 m or more), largest share | 66.0 % | 92.6 % | +26.6 pts | Expected improvement |
| Road pieces | 40,316 | 40,316 | 0 | Same pieces, same attributes |
| Road vertices | 172,696 | 187,071 | +14,375 | Expected: pinned junction vertices |
| Buildings | 519,573 | 519,573 | 0 | Identical in every chunk |
| Water, canals, parks, rail, plazas, bridge decks, trees, landmarks | 2,213 / 2,296 / 1,444 / 550 / 13 / 23 / 15,215 / 1,986 | Same | 0 | Identical in every chunk |
| Output size | 86.8 MB | 90.5 MB | +3.7 MB | Longer node ids, more edges |

Feature counts are pieces after chunk clipping. The manifest counts whole features (28,889 roads, 495,002 buildings).

### Every difference, explained

- **Road geometry.** 29,996 road pieces are identical. 10,320 changed, all by keeping vertices that two or more roads share. Measured over whole ways across every chunk they touch, 7,410 changed ways moved by less than 0.5 m and one moved further: way 1461813244, a path that runs 13.5 m past its last junction and turns back. The old run dropped that junction vertex; it is kept now. Per piece, 53 pieces moved 1 m or more. Every vertex behind those moves is either a chunk-border cut point that slid along the border because the road meets it at a shallow angle (26 old, 26 new) or a kept junction (2). None is unexplained. No road attribute (class, width, height, bridge flag, oneway) changed.
- **Spawns.** Sangsad keeps y = 120. Kamalapur moved 0.35 m and Shahbagh 0.29 m, because the generator snaps those spawns to the nearest road and that road kept a vertex. Heights, names and yaw are unchanged. Boundary, CRS, origin, axes and chunk size are identical.
- **`overview.json`.** Only `roads` changed (the simplified major-road map layer), for the same reason. `boundary` is identical, so `signs/` stays valid.
- **`coverage.json`.** Only `counts` changed: graph nodes, graph edges, bytes.
- **Remaining 30 dead ends within 5 cm of a road.** OSM does not give these a shared node, so they are not joined. They are unverified: some may be mapping errors, some may be real (a path that stops at a wall). Proximity is not used as evidence of a connection.
- **Remaining 174 components.** Near Farmgate, Science Lab, New Market and Shahjalal Terminal 3, every edge outside the largest component is `steps`, `footway` or `pedestrian`: footbridge stairs and footpath networks that OSM does not join to the road. Every vehicle road at those points is in the largest component.

### Generator changes behind the difference

1. `douglasPeuckerPinned` (src/geo/geometry.ts): road simplification never removes a vertex shared by two or more road ways. Before, simplification ran per way and deleted shared junction vertices, so roads that met in OSM did not meet in the graph.
2. Node ids on a 1 cm grid instead of 1 m (src/geo/graph.ts). The 1 m grid merged any two road vertices in the same metre square: 139 joins between different ways, 21 of them tying a bridge to a road below it.
3. A way clipped into several parts by the city boundary keeps counting its edge ids, so ids are unique.
4. When a junction lies within 5 cm of the chunk-border crossing on the same way, the two merge into the border node. Different ways are never merged.

## Geographic regression points

Graph nodes within 300 m. Points marked approx. are hand-picked coordinates, projected with an independent UTM implementation that matches every unsnapped manifest spawn to 0.00 m.

| Point | Shipped: nodes, in largest, components, dead ends | Staged |
|---|---|---|
| Jatiya Sangsad | 18, 9, 5, 10 | 18, 18, 1, 2 |
| Kawran Bazar (approx.) | 97, 71, 11, 29 | 108, 108, 1, 5 |
| New Market (approx.) | 116, 70, 19, 51 | 118, 110, 4, 23 |
| Kamalapur station | 57, 37, 9, 23 | 58, 58, 1, 13 |
| Shahbagh | 72, 43, 12, 23 | 79, 77, 2, 9 |
| Motijheel | 85, 74, 6, 22 | 88, 88, 1, 2 |
| Farmgate junction (approx.) | 110, 62, 18, 50 | 110, 69, 10, 35 |
| Science Lab junction (approx.) | 94, 61, 14, 40 | 98, 84, 2, 25 |
| Mohakhali junction (approx.) | 72, 56, 6, 23 | 72, 66, 2, 14 |
| Jatrabari (approx.) | 103, 74, 9, 28 | 105, 105, 1, 7 |
| Agargaon, Metro Line 6 corridor (approx.) | 39, 31, 4, 8 | 43, 43, 1, 1 |
| Tejgaon rail corridor (approx.) | 24, 21, 2, 7 | 24, 24, 1, 4 |
| Shahjalal airport spawn | 0 | 0 (the spawn is on the apron) |
| Shahjalal Terminal 3 (OSM node 5243691404) | not measured | 73, 45, 9, 23; all 21 edges outside the largest component are footways |

The metro corridor point measures roads only. The Line 6 viaduct is not in the data as a rail feature.

## Runtime checks

### Traffic, headless

`node --experimental-strip-types scripts/traffic-probe.ts <world> <label>` runs the game's `TrafficSim` on the same 5 × 5 chunk ring the game loads, at the High cap of 14 vehicles, with a seeded RNG, for 600 simulated seconds at 60 Hz. The point is the parked player position.

The first run of the regenerated graph exposed a signal livelock in the sim. Cars on a bending approach flipped between red and green every frame, and the sim pulled them back to the stop line. Shahbagh jammed, with the moving share falling from 0.997 to 0.517. The same bug was already costing Jatrabari on the shipped data. Fixed in c0890b7, with a test that fails on the old sim.

With c0890b7:

| Point | Data | Driveable edges | Moving share | Junction crossings / min | Dead-end vanishes / min | Vanishes per 100 crossings |
|---|---|---|---|---|---|---|
| Kawran Bazar | shipped | 1,211 | 0.916 | 44.8 | 4.8 | 10.7 |
| | staged | 1,484 | 0.829 | 88.3 | 10.4 | 11.8 |
| Motijheel | shipped | 1,407 | 0.872 | 67.8 | 8.9 | 13.1 |
| | staged | 1,793 | 0.796 | 100.6 | 9.8 | 9.7 |
| Farmgate | shipped | 1,018 | 0.922 | 41.4 | 8.1 | 19.6 |
| | staged | 1,227 | 0.878 | 72.6 | 11.0 | 15.2 |
| Shahbagh | shipped | 1,321 | 0.997 | 42.9 | 1.2 | 2.8 |
| | staged | 1,689 | 0.907 | 72.7 | 2.3 | 3.2 |
| Jatrabari | shipped | 1,530 | 0.875 | 78.4 | 10.4 | 13.3 |
| | staged | 1,886 | 0.819 | 88.5 | 11.3 | 12.8 |
| Gulshan 1 | shipped | 1,438 | 0.864 | 67.6 | 0 | 0 |
| | staged | 1,810 | 0.852 | 99.7 | 0 | 0 |

Cars cross 1.1 to 2.0 times as many junctions. The moving share is a few points lower because more junctions now have three or more links and so get a signal. The sim still removes a car 1.6 s after it reaches a dead end. That is a traffic-system limitation, not a data defect.

### In the game

The stage worktree (`~/Documents/dhaka-after-dark-stage`, detached at c0890b7, `public/world` replaced by the staged files, `signs/` and `assets/` kept) builds with `npm run build` (exit 0). In the dev server the HUD showed `errors none` at the Sangsad spawn (25 chunks loaded) and after teleporting to Kawran Bazar (30 chunks loaded, 12 cars, 3 holding at a signal).

### Streaming

`node scripts/bench-stream.mjs <url> <out.json> 45 <label>`: headless installed Chrome, ANGLE Metal on the Apple M1, 1600 × 900, High quality, flying north from Motijheel at 40 m/s for 45 s (1.8 km). The display caps it at 60 Hz. Same code (c0890b7), shipped and staged data served side by side, runs alternated.

| Data | Run | Avg FPS | Median | p95 | p99 | Max | Frames > 50 ms | > 250 ms | Time in > 50 ms frames | Errors |
|---|---|---|---|---|---|---|---|---|---|---|
| shipped | 1 | 55.5 | 16.7 ms | 16.8 ms | 33.4 ms | 400 ms | 23 | 3 | 3.53 s | 0 |
| staged | 1 | 55.1 | 16.7 ms | 16.8 ms | 49.9 ms | 650 ms | 24 | 3 | 3.95 s | 0 |
| shipped | 2 | 55.6 | 16.7 ms | 16.8 ms | 33.3 ms | 417 ms | 23 | 3 | 3.55 s | 0 |
| staged | 2 | 55.7 | 16.7 ms | 16.8 ms | 33.3 ms | 467 ms | 22 | 3 | 3.40 s | 0 |

With two runs each, the staged data shows no streaming cost beyond run-to-run noise. One staged run had a single 650 ms frame. Draw calls (101 to 104) and triangles (about 518,000 to 520,000) at the end of the route are the same. These runs are not comparable with the 2026-10-30 entries in `docs/perf.md`, which ran at another time under another machine load. This is a streaming-stall measurement on an M1 with a 60 Hz cap, not a 90 FPS test.

## Integration and rollback

**Integrated on 2026-10-30.** The user approved it, and the final staging copy (the generator-owned files) was copied into `public/world`. After the copy:

- every generator file hashes equal to the validated final staging;
- `signs/` and `assets/` hash equal to the shipped files;
- the validator gives the same figures against the git copy of the shipped data;
- 156 of 156 game tests pass, typecheck passes and the build exits 0;
- in the game, the HUD shows `errors none` at the Sangsad spawn and at Shahbagh (14 cars, 3 holding at a signal);
- one streaming run gave 55.7 FPS average, p99 33.3 ms and 3.42 s in frames over 50 ms, with no console errors.


Integration replaces only generator-owned files and keeps `signs/` and `assets/`:

```bash
STAGE=<final staging folder>
cd ~/Documents/dhaka-after-dark
rsync -a --delete "$STAGE/chunks/" public/world/chunks/
cp "$STAGE"/{manifest,overview,coverage,landmarks}.json public/world/
```

The shipped data stays recoverable from git (`public/world` is tracked, last changed in 89068c0). Rollback before a commit:

```bash
git checkout -- public/world
```

Rollback after the data commit:

```bash
git revert <data commit>
```

Afterwards, run `python3 -I scripts/geo/validate-world.py <old> public/world <report>` once more against the integrated folder, the game test list, typecheck and build.

## Limits that remain

- Elevation is not modelled. Bridge and flyover heights come from tags or class defaults, not from a DEM or survey.
- The traffic sim skips edges shorter than 8 m, and 5,172 graph edges are that short, mostly short links between close junctions. Cars still vanish at dead ends. Trunk roads are not in the traffic class list.
- Footbridge and footway networks are mostly not joined to the road graph in OSM.
- 5 pairs of OSM ways have identical geometry. Both copies are kept, as in the source.
