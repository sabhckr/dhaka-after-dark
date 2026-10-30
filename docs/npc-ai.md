# NPC AI foundation

People on the loaded streets are simulated by `src/npc/`. This is a foundation, not a finished life sim. Figures are the catalog blockouts in `src/assets/human.ts`, welded to one mesh per material so a person is about eight draws instead of about seventeen. None of them have a skeleton or animation clips. A walk is the mesh moving, plus a small bob. The clip name on the debug readout is an intent. Instancing every body part was tried and not kept: the spawned crowd shared only a few instances per batch, and uploading those buffers cost more than it saved.

The CNG driver has no mesh of their own. That role reuses the rickshaw-driver figure and is marked `placeholder-reuse`. The showroom CNG vehicle is not driven.

## How it sits in the game

There is one population, ticked from the existing viewer loop in `src/viewer/WorldView.tsx`. It does not start a second render loop and it does not replace walking or driving.

- Coordinates are the map's: x east, y up, z = −north.
- Routes come from the OSM road graph already stored on each chunk.
- Movement calls `moveSolid`, the same collision the player uses, so building walls, bridge rails, and footbridge decks stay solid.
- Chunk unload drops people whose sidewalk node was only in that chunk. Loading it again can spawn them again. Spawn slots are deterministic from the sidewalk node id and the time of day.
- The yard of static models north of the Sangsad pad is unchanged. Those are props. The walking people are separate.

## Navigation

`PedNav` builds a local graph when a chunk loads:

- Footways, paths, steps, pedestrian ways, and cycleways are walked as mapped.
- Residential, service, and primary-to-tertiary roads get two sidewalk offsets and crossing links. The centreline is kept for rickshaws, CNGs, and motorcycles.
- Motorways, trunks, raceways, and anything tagged like rail are omitted.
- Samples that land inside a building, a water polygon, a canal, or within 1.7 m of a rail are dropped.
- Footbridge decks and the generated stair runs are foot links. Climbing uses the existing step-up (0.85 m). There is no true vertical path search.

Each chunk's contribution (resampled chains, sidewalk offsets, the building, water, canal and rail tests) is planned once when it loads. A new chunk is joined onto the live graph in place, which gives the same graph a full rebuild would. When a chunk unloads, a replacement graph is built a few milliseconds per frame (`PedNav.step`, 3 ms) while the live one keeps answering; it is swapped in when complete, `version` changes, and walkers anchored in the unloaded chunk leave then. Before this (until P1, 30 Oct 2026) every chunk load rebuilt the whole graph from every loaded chunk, which made it the largest cost of a teleport.

Path search is A* with a cap (700 expansions). It runs when a destination changes, a chunk reloads, or someone is stuck. It does not run for every person every frame. If no path exists, the person waits and the failure is `no-path`. They are not moved through the building.

## Schedules

The city lights are still the look presets. They are not a clock. `SimClock` is the only schedule clock: it starts at 08:00 and advances 0.25 game-minutes per real second (one game hour is about four real minutes). Roles read early / day / evening / late from that clock. A scare during a shift is remembered; when it ends, the new part of the day is applied instead of walking back into a closed stall.

## What actually runs

| Role | Working in this phase | Not done |
| --- | --- | --- |
| Police | Patrols sidewalks. Investigates only a **reported** incident. Does not see through walls and does not know an unreported theft. | Wanted level, arrest, backup, cars |
| Rickshaw and second rickshaw | Wait, take a hail (G) or a timed fare, follow road links, return | No rickshaw mesh, no fare money |
| CNG | Same fare loop on road links | Placeholder body. Showroom CNG is not attached |
| Motorcycle | Follows road links | No bike mesh and not the player car |
| Tea stall, hawker, fruit cart | Stay on a pitch, serve while hailed, step away, walk back | No stock or prices. The stall/cart is parented to the person |
| Students, Gen Z, burqa, hujur | Walk, pause with a nearby friend, react if they can see an incident | Hujur and burqa are ordinary civilians. No special hostility |
| Government employee | Commute, stand outside, walk toward the home anchor in the evening, file a report | Does not enter the building |
| Conductor | Waits at the roadside anchor | No bus is bound to them |
| Construction, cleaner | Pace a short beat | Tools do not animate |
| Chintai | Walks as a civilian. One scripted snatch when you get close, then flees on the graph | Not always hostile. No combat or stars |
| Elder | Slower walk and a longer pause before a crossing | — |

Crime is a flag on the chintai role only.

## Incidents

`EventBus` carries collisions, dangerous driving, threats, theft, disturbance, assault, police intervention, and emergency arrival. The player car above 12 m/s posts dangerous driving if someone is nearby. A witness reacts from risk: some flee, some watch, some report, some ignore it. A report is a new event with status `reported`. Police hear those on a radio range. They do not hear the original theft unless it was in sight.

Occlusion is a 2D test against walls at eye height. It is not a full visibility solution.

G talks to the nearest person within 2.5 m, hails a rickshaw or CNG, or holds a vendor in a serve intent. One interaction at a time. It clears when you leave or the timer ends.

## Debug

Normal play only adds a population count and the sim clock to the HUD.

- **N** — debug line: nearest role, state, last transition or failure, path length, AI milliseconds. A magenta line shows that person's path.
- **G** — interact.
- In the browser console, `window.__npc` has `toggleDebug`, `snapshot`, `interact`, `snatch`, and `setMinutes`.

## Limits

- Cap is 26 people on high quality and 12 on low, inside about 145 m. Distant minds think less often. This was timed in unit tests (40 people, 30 ticks, under 400 ms on the dev machine) and is not a claim about the full city frame rate.
- No skeletal animation, lip sync, or gesture.
- No passenger economy, dialogue tree, mission graph, or wanted level.
- Road roles are kinematic. They are not a second vehicle simulator and they do not call `stepActor`.
- People do not enter buildings, metro tunnels, or the airport.
- Soft separation only. People do not become solid obstacles for the player.
- Spawn points are sidewalk nodes, not a surveyed curb.
