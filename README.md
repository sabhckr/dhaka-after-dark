# DHAKA: AFTER DARK — geographic city

Roads, building footprints, water, rail, parks, and bridges keep their OpenStreetMap positions. Materials, shop boards, and posters are drawn on top of that geometry. They do not move it.

The texture pack is procedural (`src/viewer/proc-tex.ts`): weathered plaster, brick, tin, shopfront bands, asphalt, sidewalks, roofs, bark. Real shop names come from OSM tags in `public/world/signs/`. Fictional Bangla posters live in `src/viewer/copy.ts`. Licenses and limits: [docs/signage-pack.md](docs/signage-pack.md).

## Boundary

Generation extent is **OSM relation 13663697**, `name:en = Dhaka Metropolitan`, `admin_level = 6` (ঢাকা মহানগর).

| Area | What it is | Used? |
| --- | --- | --- |
| DNCC | Dhaka North City Corporation, published 196.22 km² | Not a separate relation in this extract |
| DSCC | Dhaka South City Corporation, published 109.25 km² (post-2016) | Not a separate relation in this extract |
| DNCC + DSCC | 305.47 km² combined | The metropolitan relation measures about 302 km² and is the stand-in |
| Dhaka Metropolitan | OSM admin_level 6, relation 13663697 | **Yes — generation boundary** |
| Dhaka District | admin_level 5, includes Savar, Dhamrai, Dohar, Keraniganj, Nawabganj | No |
| Dhaka Division | admin_level 4 | No |
| RAJUK Detailed Area Plan | Wider planning region | Not in this extract as the adopted polygon |

The node index uses a larger **prefilter** (23.65–23.92°N, 90.30–90.55°E) only so ways that cross the outline are not cut off early. It is not the city boundary.

If DNCC and DSCC relations appear in a future extract, the generator prefers their union automatically.

## Coordinates

- CRS: **EPSG:32646** (WGS84 / UTM zone 46N), via proj4.
- World origin: easting **230000**, northing **2615000**.
- Axes: **X = east**, **Y = up** (local ground datum, not a DEM), **Z = −north**.
- Chunks: **500 m**, half-open on the maximum edge. A road that crosses a grid line is split so both chunks share a graph node id. Node ids use a 1 cm grid: roads join only where OSM gives them a shared node, never because they pass close together.
- Heights: `building:height` / `height` are **measured**. `building:levels × 3.2 m` and class defaults are **estimated**. The viewer draws measured footprints lighter than estimated ones.

Vertical stack (blockout, not a survey): parks 0.05 m, water 0.12 m, canals 0.14 m, plazas 0.22 m, at-grade roads 0.28 m, rail 0.36 m, bridge decks `6 + (layer-1)×5` m. Underpasses are not excavated.

## Data

- Source file: Geofabrik Bangladesh PBF (`bangladesh-261028.osm.pbf`, Last-Modified 2026-10-28), saved locally as `data/raw/bangladesh.osm.pbf`. Retrieved 2026-10-29.
- License: **ODbL 1.0**. © OpenStreetMap contributors.
- The pipeline does not scrape tile servers and does not use Google Earth as geometry.
- Raw PBF is gitignored. Runtime chunks live in `public/world/`.

## Generate

```bash
node --max-old-space-size=3072 --experimental-strip-types scripts/geo/generate.ts data/raw/bangladesh.osm.pbf
```

Outputs:

- `public/world/manifest.json` — boundary, counts, spawns, sources, gaps
- `public/world/coverage.json` — chunk histogram, empty chunks inside the boundary
- `public/world/chunks/c_<ix>_<iy>.json` — roads, buildings, water, canals, parks, rail, plazas, bridge decks, trees, landmarks, road-graph slice
- `public/world/overview.json` — major roads, water, boundary for the minimap
- `public/world/landmarks.json`

Latest generation (2026-10-30, Geofabrik Bangladesh extract dated 2026-10-28):

- Boundary area **302.43 km²** (relation 13663697)
- **1,298** chunks with features, **1,333** chunks touch the boundary, **37** empty inside it
- **495,002** building footprints — **630 measured** heights, **494,372 estimated** (OSM almost never tags `building:height` here)
- **28,889** roads, **73,080** graph edges, **58,673** graph nodes. The graph has **174** connected parts and the largest holds **98.6 %** of its nodes; the rest are mostly footpaths and footbridge stairs that OSM does not join to a road ([docs/world-data.md](docs/world-data.md))
- **1,462** water polygons, **1,779** canals/drains, **1,130** parks, **194** rail ways, **21** bridge decks
- **7,992** mapped trees, **7,223** approximate park trees
- **1,986** named landmarks
- Runtime chunks **90.5 MB**
- Densest 500 m chunk: **4,480** buildings (median 270, 90th percentile 940)

## Run

```bash
npm run dev
```

The viewer is free-fly, walk, and drive. **A/D strafe** in fly and walk (A is left when looking north). In drive, **A turns left** and **D turns right**. Q/E yaw, Space up, Ctrl down, Shift faster, **R** returns to the selected spawn. Click the view for mouse look. Click the minimap to jump. The HUD shows world position, WGS84, chunk, load counts, FPS, draw calls, traffic, and the feature under the crosshair.

**N** shows what the nearest pedestrian is doing. **G** talks, hails a rickshaw or CNG, or buys tea. People use the loaded sidewalks and the same building collision as walk mode. They are catalog blockouts with no skeleton. The schedule clock is separate from the light presets. Details and limits: [docs/npc-ai.md](docs/npc-ai.md).

Cars, CNGs, buses, and motorcycles drive the loaded road graph, leave a gap, and hold at a simple two-phase signal. Those meshes are not the showroom models. Limits: [docs/traffic.md](docs/traffic.md).

Daylight is a grounded grade (natural blue sky, restrained saturation). Sunset and night lamps are the warm accent, not a second color grade. Building walls and roofs use shared procedural materials. Textures are generated in the client; they are not a downloaded photo pack.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

Unit tests cover UTM round-trip, chunk assignment, boundary clipping, cross-chunk graph ids, height measured vs estimated, manifest integrity, missing and corrupt chunks, in-flight dedupe, hysteresis, resource disposal, and free-fly strafe signs.

Verified 2026-10-29: `npm test` passed (197 script tests and 70 TypeScript tests, including 11 geo tests), `npm run typecheck` passed, `npm run build` passed. TanStack Start is 1.168.60. Free-fly check: holding A decreased X, holding D increased X, and A did not change yaw. After the Sangsad neighborhood finished streaming (25 chunks, loading 0, about 8,000 features, 71 draw calls, 33k triangles) the frame time was still about 117 ms (~9 fps) in this environment. Triangle count is not the limiter; chunk mesh construction and the single-threaded viewer are. Dense Old Dhaka chunks (up to 4,480 buildings) will hitch harder.

## Model index

Original meshes for the cast, vehicles, transit, stalls, landmark blockouts, and street props live in `src/assets/`. Open **Models** in the city, or the model index, to orbit the actual meshes. Status is `TEXTURED` until that same mesh is also standing in the city with a collider, which makes it `INTEGRATED`. Nothing is marked `VERIFIED` — that would mean a checked in-world review, and these are procedural stand-ins, not scanned vehicles.

They do not move OSM roads or building footprints. Landmark masses stay in the index only, because the map already has those footprints. Liveries are approximate public colors, not official brand kits. The 1967 fastback is a showcase prop, not a Dhaka fleet car. Easy-bikes are placed at Uttara rather than on the Sangsad roads, where they are restricted.

Details and the placement list: [docs/asset-index.md](docs/asset-index.md).

## Not in this phase

Traffic simulation, missions, combat, animated crowds, a DEM. Figures in the Sangsad and Shahbagh yards are posed meshes, not pedestrians. There is no screen-space rain reflection and no unique photo per building. Shop boards are only as complete as the OSM name tags.
