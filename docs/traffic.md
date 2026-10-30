# Traffic

Moving vehicles are `src/traffic/sim.ts`, drawn by `src/traffic/view.ts`, and ticked from the same viewer loop as the pedestrians.

They follow the loaded OSM road graph: primary through service and living streets. Footways, motorways, and trunks are not in this net. A one-way edge is only driven in the tagged direction. At the end of an edge the car prefers the link that continues forward. A dead end or a collider in the way stops the car; if that lasts, the car is removed rather than left reversing in place.

Junctions with three or more links get a two-phase signal (east-west, then north-south, eight seconds each). The phase a car obeys comes from the direction of its edge where it enters the junction, not from its heading mid-bend, and a car already past the stop line when the light changes clears the junction instead of jumping back. It is not a surveyed signal plan and it does not yet hold pedestrians. Edges shorter than 8 m are left out of the net, so a short link between two junctions breaks the route there. Cars also keep a gap behind the vehicle on the same directed edge.

The meshes are original boxes with shared materials: car, CNG, bus, bike. Parts that share a geometry and a material are one `InstancedMesh` (all wheels are a single batch). The sim is still the source of the pose. They are not the showroom catalog models, and they are not a driving simulation the player can enter. The player car is still the separate drive mode. Soft contact shadows exist in the view but stay off: on the software renderer one extra transparent batch did not improve the frame, and the later samples were too noisy to justify turning them on.

Cap is 14 on high quality and 7 on low, inside about 150 m, dropped past about 230 m. A chunk unload removes cars whose edge was in that chunk.
