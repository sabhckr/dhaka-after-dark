# Traffic

Moving vehicles are `src/traffic/sim.ts`, drawn by `src/traffic/view.ts`, and ticked from the same viewer loop as the pedestrians.

They follow the loaded OSM road graph: primary through service and living streets. Footways, motorways, and trunks are not in this net. A one-way edge is only driven in the tagged direction. At the end of an edge the car prefers the link that continues forward. A dead end or a collider in the way stops the car; if that lasts, the car is removed rather than left reversing in place.

Junctions with three or more links get a two-phase signal (east-west, then north-south, eight seconds each). The phase a car obeys comes from the direction of its edge where it enters the junction, not from its heading mid-bend, and a car already past the stop line when the light changes clears the junction instead of jumping back. It is not a surveyed signal plan and it does not yet hold pedestrians. Only an edge of 8 m or more has a stop line. A shorter one, usually the link between the two halves of a split junction, is in the net and is driven straight through, so a car is never held inside the junction. Cars also keep a gap behind the vehicle on the same directed edge.

Each car remembers the last eight edges it entered. At a node, a link it drove moments ago ranks below any turn, so a car leaves a small closed loop (a service ring, a block circuit) by its exit instead of lapping it. When a step runs past a link shorter than the step, the rest of the travel carries into the edge after it. Cars spawn only on edges of 8 m or more.

The meshes are original boxes with shared materials: car, CNG, bus, bike. Parts that share a geometry and a material are one `InstancedMesh` (all wheels are a single batch). The sim is still the source of the pose. They are not the showroom catalog models, and they are not a driving simulation the player can enter. The player car is still the separate drive mode. Soft contact shadows exist in the view but stay off: on the software renderer one extra transparent batch did not improve the frame, and the later samples were too noisy to justify turning them on.

Cap is 14 on high quality and 7 on low, inside about 150 m, dropped past about 230 m. A chunk unload removes cars whose edge was in that chunk.

## Short links (T1, 2026-10-30)

Until T1 the sim dropped every edge under 8 m. On the current `public/world` that is 4,499 drive-class edges, 1,105 of them on primary, secondary or tertiary roads and their links, and it split the net the sim loads into 905 parts. The nearest major-road node to Kawran Bazar and to Shahbagh was cut off from the main part.

With every edge of 1 cm or more kept, the sim net is the whole drive-class network: 258 parts, with 97.38 % of its nodes in the largest (was 90.8 %). All 12 major-road anchors in the audit (Kawran Bazar, Motijheel, Farmgate, Shahbagh, Jatrabari, Gulshan 1, Mohakhali, Sangsad, Kamalapur, New Market, Uttara, Sadarghat) are now in that main part. Kawran Bazar and Shahbagh were not before. No drive edge is shorter than 1 cm (`scripts/geo/validate-world.py`, `sim_network_*`).

Closing those links also closed small loops. The first measured build trapped cars in them: at Shahbagh six cars lapped a 39 m service ring (way 951474238, whose fourth part is 2.4 m) and stood in a stack for up to 454 s. Motijheel and Jatrabari showed the same. The edge trail above fixed that. Each fix has a test that fails without it.

`scripts/traffic-probe.ts` on `public/world`, 600 simulated seconds, seeded, High cap. Before is 897dba7, after is T1:

| Point | Driveable edges | Moving share | Mean speed m/s | Longest standstill s | Dead-end vanishes / min | Largest one-frame move m |
|---|---|---|---|---|---|---|
| Kawran Bazar | 1,484 → 1,584 | 0.829 → 0.830 | 6.45 → 6.64 | 7.9 → 9.7 | 10.4 → 8.7 | 0.48 → 0.47 |
| Motijheel | 1,793 → 1,962 | 0.796 → 0.763 | 6.21 → 5.93 | 7.9 → 7.9 | 9.8 → 0 | 0.42 → 0.43 |
| Farmgate | 1,227 → 1,301 | 0.878 → 0.872 | 6.65 → 7.10 | 7.9 → 7.9 | 11.0 → 10.0 | 0.43 → 0.49 |
| Shahbagh | 1,689 → 1,843 | 0.907 → 0.892 | 7.98 → 7.75 | 10.5 → 14.8 | 2.3 → 2.3 | 0.43 → 0.43 |
| Jatrabari | 1,886 → 2,033 | 0.819 → 0.809 | 6.70 → 6.34 | 7.9 → 7.9 | 11.3 → 0 | 0.45 → 0.46 |
| Gulshan 1 | 1,810 → 1,968 | 0.852 → 0.813 | 6.76 → 6.30 | 7.9 → 7.9 | 0 → 0 | 0.41 → 0.48 |

The largest one-frame move is 0.43 to 0.49 m after and 0.41 to 0.48 m before, so carrying travel through short links adds no visible jump. The longest standstill is one or two red phases. The moving share and mean speed fall by up to 4 points and 7 % at four points and rise at Kawran Bazar and Farmgate. The fall comes from signals, not from the links: every node with three or more links is a signal (T4), and the newly kept short side links raise the number of such nodes in the loaded ring by 10 to 19 % (Kawran Bazar 609 → 696, Gulshan 1 728 → 863).

Cost: one sim frame takes 5 to 7 µs at the median before and after, with p99 at or under 0.25 ms in both (Node, M1, 18,000 frames per point, alternated). A streaming A/B in headless Chrome on the M1, two alternated runs each, gave 37.7 and 40.6 FPS average before and 38.0 and 36.6 after. That spread is run-to-run noise on a machine with 1.6 GB in swap, not a T1 cost, and these runs are not comparable with the 55 FPS runs earlier the same day. The HUD showed `errors none` at Shahbagh (8 cars), Jatrabari (11 cars, 2 at a signal) and Kawran Bazar (14 cars).
