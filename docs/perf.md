# Performance notes

Measured in headless Chromium on this machine's software GPU:

`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))`, 1280×720, device pixel ratio 1, antialias on, shadow maps off.

The HUD frame time is the **median gap** between animation callbacks, not the last `Clock` delta. A single multi-second sample is kept in the max, and it is not the number the HUD treats as typical. `window.__perf.summary()` also reports p95 and p99. Samples taken while the tab is hidden, or during `beginCapture` / `endCapture`, are excluded. `window.__perf.capture()` calls `canvas.toBlob` outside the loop. That readback can still stall; it is not a non-blocking capture. `?shot=1` is the only path that sets `preserveDrawingBuffer`.

## What the draws actually are

At the parliament pad, 25 chunks loaded, day look, no console errors:

| Group | Before | After |
| --- | --- | --- |
| Chunk meshes | 508, of which 143 instanced (trees, lamps, tanks, antennas). Roads, facades, and roofs are already one mesh per material per chunk. | unchanged |
| Asset yard | 146 individual meshes, 79 materials | unchanged |
| Pedestrians | 261 meshes for 15 people (about 17 each), 0 instanced | 173 meshes for 21 people (about 8 each) after welding |
| Traffic | 19–28 individual meshes for 3–4 vehicles | 6 instanced batches for 2 vehicles |

Visible draws in the best baseline window: median **428** (p95 491), about **108k** triangles. After the weld, same neighbourhood, higher camera and 21 people: median **430** draws, **117k** triangles. The map, not the actors, is the triangle count. Parapets do not add a draw.

## Frame time

JS inside `renderer.render` was about **6–11 ms**. The gap until the next frame was much larger, which is SwiftShader presenting the city, not the HUD timer.

| Window | Frames | Median gap | p95 gap | Median render JS |
| --- | --- | --- | --- | --- |
| Baseline drive, first 6 s (best sustained window) | 8 | 701 ms | 1873 ms | 5.9 ms |
| Later baseline windows | 0–3 | often one 5–9 s hitch | — | — |
| After pedestrian weld, stationary fly | 4 | 549 ms | 1236 ms | 11.0 ms |
| Contact shadows enabled, next window | 3 | 4164 ms | 4540 ms | 14.1 ms |

The shadow window is not evidence that one transparent quad costs four seconds. The same multi-second collapse showed up in the baseline once the software renderer fell behind. Shadows stay off because there was no measured win. Heap during the weld run was about 107 MB used / 193 MB allocated (`performance.memory`). There is no GPU memory counter in this WebGL context.

Screenshot capture (`page.screenshot` and `canvas.toBlob`) did not finish within 12–15 s while a frame was outstanding. Those failures are capture stalls, not a 1250 ms gameplay frame.

Repeat with `node scripts/perf-compare.mjs http://127.0.0.1:8080/ /tmp/perf-after.json`.

## 2026-10-29 atmosphere pass

Same machine, SwiftShader, 1280×720, DPR 1, Sangsad drive pose `(2824, 8, -15370)`.

Before (`node scripts/perf-sample.mjs`, most 6 s windows contained 0–1 included frames because `reset()` drops the first gap and the next callback often landed outside the window):

| Signal | Value |
| --- | --- |
| HUD draws / triangles | 395–451 draws, about 121k–125k triangles |
| Scene census | 25 chunks, 508 chunk meshes, 430,201 chunk triangles, 852 meshes total |
| Included-frame render JS | 11.2 ms and 14.1 ms on the two frames that qualified |
| HUD gap | 1356 ms, 3666 ms, 4525 ms, then 5–9 s while flying |
| Screenshot | timed out at 15 s |

After FogExp2, far-prop hiding, and the road nudge, one stationary day sample (22 included frames, loading already 0):

| Signal | Value |
| --- | --- |
| HUD | 412 draws, 109,405 triangles, frame 178 ms, 23 people, 2 traffic, no console errors |
| Included frames | median gap 178 ms, p95 gap 1132 ms, median `renderer.render` 12.1 ms, p95 render 476 ms |
| Draw calls in the probe | median 239, p95 409 (the median includes frames before the view filled in) |
| Census | still 430,201 chunk triangles. Hiding a parent group does not clear `mesh.visible` on children, so the census still counts far trees |
| Geometries / textures | 347 / 53 |

Fog did not change the triangle census. The p95 gap is still the software renderer, not the fog shader. Do not treat 178 ms as a GPU-bound city frame.

## 2026-10-29 render pass

Same machine, SwiftShader, 1280×720, device pixel ratio 1, day, clear. `renderer.render` stays about 4–12 ms. The frame gap is the software GPU presenting the city. That is not a 30 FPS result, and it is not evidence about an i3 with integrated graphics.

### Where the old cost was

Committed builder, Dhanmondi 5×5 (25 chunks), every building at full detail, no people and no dressing. Counted from the scene graph, not the frustum:

| Group | Meshes | Triangles |
| --- | --- | --- |
| Buildings | 129 | 850,965 |
| Vegetation | 72 | 61,344 |
| Roads | 80 | 15,882 |
| Footbridges | 20 | 10,640 |
| Everything else | 67 | 7,254 |
| Total | 368 | 946,085 |

Buildings were about 90% of the triangles. Most of that was coplanar floor quads: the window tile was repeated by stacking a quad per storey. Roads were a small triangle count and a large mesh count (one mesh per material per chunk).

A rendered frame of 308 draws and 645,780 triangles was the number to explain. This census is the unculled 25-chunk neighbourhood, so it is higher than a single view. The draws track the mesh count. The triangles track the buildings.

### After, same camera family

Sangsad was already loaded, then the camera moved to Dhanmondi. Chebyshev unload is 4, so the neighbourhoods overlap and **32 chunks** stay loaded. Elevated fly pose `(2342, 80, -13588)`, then the same pose at street level, then Motijheel on foot after streaming settled.

| Pose | Chunks | Draws | Triangles | Render JS median | Gap median | Gap p95 | Frames in the window |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dhanmondi elevated, high | 32 | 243 | 518,422 | 8 ms | 1676 ms | 2974 ms | 5 |
| Dhanmondi elevated, medium | 32 | 225 | 466,640 | — | one 8 s hitch, no included frame | — | 0 |
| Dhanmondi elevated, low | 32 | 232 | 361,865 | 4 ms | 4468 ms | 4468 ms | 1 |
| Dhanmondi street, high | 32 | 258 | 500,206 | — | HUD 5583 ms, window missed | — | 0 |
| Motijheel street, high | 25 | 185 | 263,712 | 5 ms | 1261 ms | 1261 ms | 1 |

High scene-graph census at the elevated pose: chunk buildings 196 meshes / 737,881 triangles, loaded-set batches 22 meshes / 117,621 triangles, people 50 meshes, the Sangsad asset yard 146 meshes / 13,350 triangles (culled from this view), traffic 7 instanced batches. JS heap was about 165 MB and fell to 137 MB after the stream moved to Motijheel. No GPU memory counter.

Low at the same 32 chunks cut rendered triangles from 518k to 362k and tree instances from 3,376 to 1,384. Draws stayed near 230 because each loaded chunk still has its own building mesh and each person is still several meshes. Medium sits between them on triangles (467k) with the mid band covering the loaded set except the current chunk.

30 FPS was not achieved here. The software renderer is not the target PC.

### What changed

- Near walls keep the shop band and repeat the window tile in UV. Far walls are one quad. Setbacks and courtyard holes stay at every level. Parapets stay on near and mid. Tanks, chajjas, stairs, and tin ridges stay on near.
- Roads, ground, rails, landmarks, footbridges, trees, lamps, tanks, antennas, and sleepers batch across the loaded chunks, one mesh per material. Buildings do not, so chunk culling and LOD swaps still work.
- Low / medium / high are separate caps for LOD distance, trees, dressing, pedestrians (10 / 16 / 26), traffic (6 / 10 / 14), pixel ratio, and texture anisotropy. Shadows stay off on every preset.

### Still expensive

Per-chunk building meshes, pedestrian clones (about eight meshes each), and the 146-mesh asset yard when the Sangsad pad is on screen. A merged building mesh would cut draws and would also shade every off-screen wall. That was left undone on purpose.

## 2026-10-30 hardware GPU, streaming route

First runs on a real GPU. Machine: Apple M1 (MacBook Air, 8 GB), `ANGLE (Apple, ANGLE Metal Renderer: Apple M1)`, installed Google Chrome headless, 1600×900, DPR 1, quality high, day, clear. Headless Chrome is capped at 60 Hz, so the median is the vsync interval. These runs measure **streaming stalls**. They are not a 90 FPS result, and the M1 Air is not the reference PC.

Route: `node scripts/bench-stream.mjs <url> <out.json> 45 <label>`. The camera flies from Motijheel `(6688, 28, -11384)` north at 40 m/s for 45 s (1.8 km, about four chunk rows), so chunks stream the whole time. Frame gaps come from an rAF probe in the page. A and B ran alternately against two dev servers: untouched `main` (c534279) and this branch.

| Build | Avg FPS | p95 | p99 | Max | Frames > 50 ms | > 250 ms | Time in > 50 ms frames |
| --- | --- | --- | --- | --- | --- | --- | --- |
| main, run 1 | 28.2 | 83 ms | 317 ms | 1183 ms | 116 | 24 | 19.5 s |
| main, run 2 | 32.4 | 67 ms | 317 ms | 1350 ms | 102 | 21 | 18.1 s |
| main, run 3 | 36.9 | 50 ms | 217 ms | 1400 ms | 81 | 15 | 14.6 s |
| branch, run 1 | 49.0 | 17 ms | 133 ms | 933 ms | 36 | 8 | 7.9 s |
| branch, run 2 | 46.3 | 33 ms | 167 ms | 1050 ms | 51 | 7 | 9.8 s |

No console errors in any run. The end state was 30 chunks loaded, about 97 draws and 518k triangles.

What changed:

- `SolidWorld` indexes each chunk once on load. It used to re-index every loaded chunk on the first query after any change.
- `BlockBatches.absorb` rebuilds each touched merged mesh once per chunk instead of once per absorbed mesh.
- The scheduler takes queued chunks nearest first and drops jobs outside the load radius. A fetch that lands beyond the unload radius is discarded.
- Each chunk build carries a generation number, so an unload and reload during the signs fetch cannot leave two copies of a chunk.
- Picking raycasts the chunks around the camera and the actors, not every loaded mesh.
- `solidsFromChunk` is memoised per chunk object. Load used to compute it twice.

Still on the main thread, and the likely source of the remaining 0.9–1 s stalls (not yet profiled one by one):

- JSON parse and validation
- `buildChunkObjects` and `buildDressing`
- `PedNav.rebuild` over every loaded chunk, which also clears every NPC path
- the full `rebuildEdges` road index

## 2026-10-30 P1: streaming without long frames, far ring

Machine and method as above (M1 Air 8 GB, ANGLE Metal, headless Chrome, 60 Hz cap), with 2.4 GB of swap in use. `npm run perf:ab` alternated build A (the P0 commit `a6b8b10`, game code as `6f320b0`) and build B (this branch) for 3 rounds, twice. Figures are medians over rounds; the second run, after the code moved into `src/engine/`, is shown.

| | A: P0 | B: P1 |
| --- | --- | --- |
| Teleport to Old Dhaka (8 km): worst frame | 517 ms | 52 ms |
| same: p99 / p95 | 128 / 73 ms | 45 / 35 ms |
| same: frames over 100 ms | 4 | 0 |
| same: ring loaded (no fetch in flight, queue empty) | 1.61 s | 0.82 s |
| Teleport to Uttara (18 km): worst frame | 389 ms | 44 ms |
| same: p99 / p95 | 119 / 66 ms | 26 / 20 ms |
| same: ring loaded | 1.42 s | 0.81 s |
| Steady median, 3 views | 16.7 ms (vsync) | 16.7 ms (vsync) |
| Draws at Kawran street / Gulshan aerial | 129 / 103 | 153 / 141 |
| Triangles drawn, Kawran street / Gulshan aerial | 335k / 381k | 465k / 556k |
| JS heap, Kawran street | 248 MB | 275 MB |

The first run gave the same picture (worst 552 → 59 ms and 417 → 43 ms; heap 154 → 275 MB at Kawran street in that run). Steady state is at the 60 Hz cap on both builds, so this machine cannot show whether the far ring costs frame time below the cap.

Where the A-side time went, from a CPU profile of a ring load: `PedNav` rebuilt the whole pedestrian graph from every loaded chunk each time one chunk arrived (about 2 s of main-thread time per ring). After the fix the per-stage timer (`window.__perf.loads()`) reads, for one ring of 21-25 chunks: meshes 140-250 ms in total (worst chunk 28 ms), dressing 75-120 ms (worst 17 ms), pedestrian graph 45-56 ms (worst 14 ms), parse 6-8 ms (worst 1.4 ms).

What changed:

- `PedNav` plans a chunk once, joins new chunks in place and builds the replacement after an unload in 3 ms slices. A script compared it with the old code over 101 load and unload steps in three districts: identical graph after every step.
- Chunk work goes through `IntegrationQueue`, 6 ms a frame.
- The far ring (`src/engine/far-ring.ts`) draws building masses and water to radius 6 on High: about 290k triangles around Kawran, 3 materials per 3x3 block, built only when the streamed ring is idle (worst 6.5 ms a cell).
- The scheduler prefetches around a point 2.5 s ahead along recent travel and no longer requests cells that have no chunk file.

Golden views (`npm run look:compare`, P0 against P1): all 9 street views and all medium views are "same". The aerial views differ in the horizon band, where the city now continues instead of ending in a white band 1.25 km out (Kawran aerial day: 29% of the second band changed, under 1.1% anywhere below it). Day fog is still FogExp2 0.00062: at 2.5 km it hides about 91% and at 3 km about 97%, so in practice the visible city ends around 2.5 km. The fog itself was not changed in P1.

Not done in P1: Web Workers (not needed for the budgets, see engine.md); a BVH for picking; a memory cap with LRU unload beyond the existing unload radius.
