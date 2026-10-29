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

