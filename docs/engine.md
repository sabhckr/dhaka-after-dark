# Engine

The game stays on Three.js, Vite, and TanStack Start. The playable build is the browser preview. A native Unreal or Godot port would throw away the OSM chunk stream, the road graph, and the collision grid, and it cannot run in this preview. That migration is not started.

The reference machine in the brief is a high-end PC at a declared resolution, with a 90 FPS budget of about 11 ms. This workspace can only time a software GPU. Those numbers are not a 90 FPS result and are not a prediction for that PC. Shadows stay off. See [perf.md](perf.md).

Coordinates stay EPSG:32646, origin easting 230000 / northing 2615000, X east, Z equals minus north, 500 m chunks.

## Runtime layout (P1, 30 Oct 2026)

- `src/viewer/WorldView.tsx`: renderer, frame loop, input, picking, HUD, panels and the `window.__*` test hooks.
- `src/engine/chunk-pipeline.ts`: chunk streaming from fetch to scene. The 5x5 streamed ring (meshes, dressing, collision, pedestrian graph, traffic), look-ahead prefetch, and the far ring.
- `src/engine/integrate.ts`: `IntegrationQueue`. Chunk work runs within 6 ms per frame (at least one task a frame) instead of in whichever frame its fetch resolved.
- `src/engine/far-ring.ts`: building masses and water from 1.25 km to 3.25 km (High), merged per 3x3 block of cells.
- `scripts/look/`: golden views, pixel compare and alternated A/B timing. See [look.md](look.md) and `docs/budgets.json`.

There are no Web Workers. Profiling after the P1 fixes put JSON parse at 0.4 to 1.4 ms a chunk; the remaining main-thread cost is building Three.js meshes and dressing (worst about 30 ms for one dense chunk), which a worker could only take over with a rewrite of the mesh builders to plain buffers. That was not needed to meet the P1 budgets.

