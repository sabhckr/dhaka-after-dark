# Engine

The game stays on Three.js, Vite, and TanStack Start. The playable build is the browser preview. A native Unreal or Godot port would throw away the OSM chunk stream, the road graph, and the collision grid, and it cannot run in this preview. That migration is not started.

The reference machine in the brief is a high-end PC at a declared resolution, with a 90 FPS budget of about 11 ms. This workspace can only time a software GPU. Those numbers are not a 90 FPS result and are not a prediction for that PC. Shadows stay off. See [perf.md](perf.md).

Coordinates stay EPSG:32646, origin easting 230000 / northing 2615000, X east, Z equals minus north, 500 m chunks.
