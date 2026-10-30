# World data schema v2

Schema v2 adds what OSM says about buildings and roads, plus point and line features the game had no data for: signals, crossings, bus stops, lamps, landuse, walls and power lines. It changes nothing that v1 already had. Status on 2026-10-30: implemented, checked on a staged regeneration, and shipped. `public/world` has been v2 since the swap commit `World data: schema v2` (see `docs/p2-record.md`). The pre-swap v1 files stay in git history, and two of them are kept as test fixtures in `src/geo/fixtures/`.

## Rules the format follows

1. **v1 is untouched.** Every v1 record keeps its geometry, ids, order and key order. v2 attributes are appended after the v1 keys, and the new layers are separate arrays. `toV1(chunk)` (src/geo/compat.ts) strips them, and on the shipped data it gives back each pre-swap v1 chunk byte for byte.
2. **Data is OSM only.** Every v2 field copies one OSM tag and is absent when the tag is missing or unreadable. Nothing in the files is inferred. The manifest's `fields` table names the tag behind each field and how many features carry it.
3. **Rules live in code, labelled.** Where the game needs a value OSM does not give (levels, sidewalks, lanes, a district name), `src/geo/infer.ts` computes it at runtime and returns `{ value, src }` with `src` set to `osm`, `rule` or `default`. Each rule is documented in that file.
4. **Readers accept both versions.** `validateChunk` and `validateManifest` accept v1 and v2. The chunk pipeline passes every chunk through `normalizeChunk`, which gives v1 chunks empty v2 layers, so code may read `chunk.points` without checking the version.

## Chunk fields

Coverage is from the staged regeneration of the 2026-10-28 extract, counted per whole OSM feature inside the city boundary (28,889 roads, 495,002 buildings).

### Buildings

| Field | OSM tag | Parsing | Features |
|---|---|---|---|
| `t` | `building` | lower case; omitted for `yes` | 33,289 (6.7 %) |
| `lv` | `building:levels` | plain number only, ASCII or Bangla digits, rounded to 0.5; "5th Floor" or "G+4" is skipped | 29,609 (6.0 %) |
| `mlv` | `building:min_level` | as `lv` | 21 |
| `mh` | `min_height` | metres; feet converted | 6 |
| `mat` | `building:material` | lower case | 18,869 (3.8 %) |
| `roof` | `roof:shape` | lower case | 169 |
| `ly` | `layer` | integer −5 to 10, omitted when 0 | 1,145 |
| `nm` | `name` | trimmed, at most 80 characters | 7,619 |

### Roads

| Field | OSM tag | Parsing | Features |
|---|---|---|---|
| `ln` | `lanes` | integer 1 to 12 | 1,650 (5.7 %) |
| `sw` | `sidewalk`, `sidewalk:both`, `:left`, `:right` | reduced to `both`, `left`, `right`, `no` or `separate` | 1,058 |
| `sf` | `surface` | lower case | 5,772 |
| `lit` | `lit` | `yes` → 1, `no` → 0 | 812 |
| `mx` | `maxspeed` | km/h; mph converted; zone codes such as `BD:urban` skipped | 1,178 |
| `nm`, `nme` | `name`, `name:en` | `nme` only when it differs from `nm` | 7,826 and 2,557 |
| `ly` | `layer` | integer, omitted when 0 | 1,391 |
| `tn` | `tunnel` | `yes`, `culvert` or `building_passage` → 1 | 14 |

### Graph nodes

| Field | Meaning | Nodes |
|---|---|---|
| `sig` | an OSM `highway=traffic_signals` node sits on this graph node, to the centimetre | 51 of the 95 signals |
| `cr` | an OSM crossing node sits on this graph node | 147 of the 254 crossings |

Signals and crossings that are not junction vertices are in `points` only. Snapping them to the nearest node would be a guess, so v2 does not do it.

### New layers

| Layer | Record | OSM source | Features (pieces in chunks) |
|---|---|---|---|
| `points` | `{ id, k, x, z, ct?, nm? }` | `k` is `signal` (`highway=traffic_signals`), `crossing` (`highway=crossing`, `footway=crossing`; `ct` = `crossing=*`), `bus_stop`, `platform` (`public_transport=platform` with `bus=yes`), `lamp` (`highway=street_lamp`), `tower` (`power=tower`), `gate` (`barrier=gate`) | 95 signals, 254 crossings, 494 bus stops, 1 platform, 912 lamps, 374 towers, 448 gates |
| `landuse` | `{ id, t, outer, holes? }` | `landuse=*`, and `leisure=*` that is not already a park (`t` = `leisure:<value>`); water, parks and buildings are never repeated here | 997 (1,574) |
| `barriers` | `{ id, t, pts }` | `barrier=wall|fence|retaining_wall|city_wall|hedge` | 296 (453) |
| `power` | `{ id, t, pts, kv? }` | `power=line|minor_line`, `voltage` | 44 (278) |

One kind per point node, checked in the order above. A node tagged both `highway=traffic_signals` and `crossing=traffic_signals` is a signal.

## Other files

- `manifest.json`: `v: 2`, plus `fields`: one `{ field, src: "osm", tags, count }` per field above. Boundary, CRS, origin, spawns and sources are unchanged. `gaps` gains two notes, on OSM-only attributes and on where `sig` and `cr` appear. `counts` gains one entry per field and layer, `emptyChunksInsideBoundary` drops from 37 to 32 (the five new chunks below now exist), and `chunks` lists 1,303 chunks.
- `places.json` (new): 732 `place=*` nodes inside the boundary (400 quarters, 160 neighbourhoods, 157 suburbs, 15 others), with name, `name:en`, lon/lat and world x/z. `districtAt` in infer.ts uses the nearest suburb, quarter or neighbourhood within 1.5 km, labelled `rule`.
- `overview.json` and `landmarks.json`: byte-identical to v1. `signs/` depends on the overview boundary, so it stays valid.
- `coverage.json`: `counts` and `gaps` change as in the manifest. Because the five new chunks now exist, `emptyChunksInsideBoundarySample` loses them and `chunkBuildingHistogram` moves by one (p50 270 → 269, p90 940 → 939). Nothing at runtime reads this file.

Five chunks are new: `-1_-26`, `-4_-28`, `11_-49`, `22_-59` and `24_-32`. They hold only v2 features (four power-line pieces, one landuse piece, one point) and no v1 record. The runtime fetches them like any other chunk, and nothing draws v2 layers yet.

## Runtime rules (src/geo/infer.ts)

| Function | osm | rule | default |
|---|---|---|---|
| `buildingLevels` | `lv` | round(measured height ÷ 3.2 m) | round(estimated height ÷ 3.2 m) |
| `buildingElevated` | `mh` or `mlv` above 0 | `ly` above 0 | on the ground |
| `buildingBase` | `mh` | `mlv` × 3.2 m | 0 |
| `roadSidewalk` | `sw` | | both sides on trunk, primary, secondary and tertiary roads; none elsewhere |
| `roadLanes` | `ln` | round(tagged width ÷ 3.25 m) | 2 on motorway, trunk and primary roads; 1 elsewhere |
| `districtAt` | | nearest suburb, quarter or neighbourhood node within 1.5 km | null |

Nothing renders these yet. They are the data API for P3 (ground and roads), P4 (architecture) and P6 (traffic).

## Generating

```bash
WORLD_OUT=<staging folder> node --max-old-space-size=3072 --experimental-strip-types \
  scripts/geo/generate.ts data/raw/bangladesh.osm.pbf
```

`WORLD_SCHEMA=1` writes v1. With it, the generator reproduces the pre-swap v1 `public/world` exactly: all 1,298 chunks, `overview.json`, `coverage.json` and `landmarks.json` are byte-identical, and only the manifest's `generatedAt` differs. The generator refuses to write into `public/world` unless `WORLD_WRITE_PUBLIC=1` is set.

## Checking a staged run

`diff-schema.ts` needs a v1 folder as its old side. Since the swap, `public/world` is v2, so use a `WORLD_SCHEMA=1` run of the same extract, or the pre-swap tree from git (`git archive <commit before the swap> public/world | tar -x -C <dir>`).

```bash
node --experimental-strip-types scripts/geo/diff-schema.ts <v1 world> <stage> <report.json>
node --experimental-strip-types scripts/geo/dump-osm-sample.ts data/raw/bangladesh.osm.pbf <stage> <osm.json> all
python3 -I scripts/geo/check-v2-osm.py <osm.json> <report.json>
node --expose-gc --experimental-strip-types scripts/geo/bench-format.ts public/world <stage> <bench.json> 5
```

- **`diff-schema.ts`** fails unless every old chunk is still there and `toV1(new)` equals the old file. It also checks that boundary, CRS, origin, spawns and sources are unchanged, that `overview.json` and `landmarks.json` are identical, and that new chunks hold no v1 record. It reports sizes.
- **`dump-osm-sample.ts` and `check-v2-osm.py`** re-read the raw PBF for the staged data. The Python side projects positions with its own UTM code (from `validate-world.py`, not proj4) and parses every tag again by itself.
- **In the game:** run the dev server with `WORLD_STAGE_DIR=<stage>` and open `/?world=stage`. Production builds ignore the parameter. `npm run look:capture` and `npm run perf:ab` accept such URLs.
