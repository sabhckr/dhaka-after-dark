# Asset index

The model index orbits the meshes in `src/assets/`. It does not show the reference posters.

| Status | Meaning |
| --- | --- |
| NOT STARTED | No mesh |
| BLOCKOUT | Untextured mass |
| MODELED | Geometry, no finished materials |
| TEXTURED | Mesh, materials, and a collider. Showroom only |
| INTEGRATED | That same mesh is placed in the city and blocks walking and driving |
| VERIFIED | Integrated, and checked in the running world. None are marked this yet |

`src/assets/catalog.ts` is the list. `PLACEMENTS` is the only thing allowed to flip a model to `INTEGRATED`.

Placed, not surveyed:

- Sangsad service road, just north of the default pad: police officer, two Gen Z figures, burqa, huzur, hawker, stall keeper, cycle rickshaw, CNG, motorcycle, police sedan, Green Line coach.
- Shahbagh shoulder: flower stall, tea stall, two students. The real flower market is in this area. The stall is the type, not a mapped kiosk.
- Uttara: easy-bike, plus a metro car sitting on a short display viaduct. That viaduct is not the Line 6 alignment.
- Kamalapur: Benapole-style loco and coach, offset from the station building.
- Shahjalal: one Biman-colored jet, offset from the terminal.

Not placed, on purpose:

- Jatiya Sangsad, Ahsan Manzil, Lalbagh, the National Museum, and Curzon Hall. OSM footprints already occupy those sites.
- Footbridges, flyovers, street lights, cables, and rooftop tanks. The map already builds those from OSM or the dressing pass.
- The Mustang. It is a Vice City prop, not local traffic.
- Airline meshes use color blocks only. No logos.

Police dress is navy. The poster paints it mint. Bangladesh Police service dress is the one used here. The cap has a plain disc, not a copied badge.

Characters have no skeleton. The street population instances these meshes and moves them; that motion is not a skeletal clip. Buses and cars are not drivable. The existing drive mode still uses its own small proxy car. The CNG driver role has no mesh and temporarily reuses the rickshaw driver.
