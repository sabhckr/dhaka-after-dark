# Environment, collision, and bridges

The map geometry is still the OpenStreetMap extract. This pass does not move roads or footprints.

## Collision

Loaded chunks publish footprint walls, roof plates, footbridge decks, stair spans, and end piers into one grid (`src/viewer/solids.ts`). Walk and drive use that grid. Fly slides along the same walls instead of passing through them, and can still go over a roof.

A chunk unload drops that chunk's colliders. Loading the same key again replaces them; it does not stack a second copy.

Drivers ignore decks and roofs above 1.4 m, so a car stays on the street under a footbridge. Walkers can use stairs and decks. Rain particles hide when the camera is under a roof or deck.

## Footbridges

OSM ways tagged as an elevated `footway`, `path`, `steps`, `pedestrian`, or `cycleway` (`bridge` / positive `layer` in the chunk record) become a deck, rails, and end piers. The deck uses the same miter as a road, so a bent span keeps its width. Stairs are added only at ends that are not a 500 m chunk boundary, running to the side of the span so the landing is not the middle of the crossing. They are gameplay approaches, not a surveyed stair model. There is no invented bridge where OSM has none. The chunks contain 353 of these spans.

Major elevated roads get side barriers and a soffit. Piers are not dropped into the lanes under those roads.

## Landmarks

`src/viewer/landmarks.ts` lists a few OSM nodes (parliament south plaza, Ahsan Manzil, Lalbagh Fort, Tara Mosque, Army Stadium, Old High Court Gate). The mesh is an original marker. It is not a measured reconstruction. The solid shape, when a footprint exists, is the building collider.

## Roads and rail

Road meshes still follow the stored OSM polyline. A 90° corner is a limited miter (`half × √2` on the bisector) instead of the old averaged normal, which cut a triangular bite out of the bend. Hairpins bevel before the miter can spike. Gentle bends gain a short fillet; graph nodes, ends, and junctions stay pinned. Two similar-width ways that meet end to end are drawn as one ribbon, including two pieces that share one OSM way id. A side road that ends on another carriageway is shortened to that carriageway’s edge. Crossings get a small pad 12 mm above the asphalt. Marked roads keep one texture across the carriageway and repeat it about every 12 m. Plain asphalt tiles about every 4 m in both directions. None of this writes the traffic graph. Straight chords stay straight.

Chunk rails are `{id, y, pts}` only. They are drawn as broad-gauge track (1676 mm), a shared gravel ballast texture, and dark sleepers at the stored height. `y` above 0.36 is still the old `bridge`/`layer` heuristic, which is not enough to build a viaduct, so there are no rail pillars. `classifyRailStructure` allows supports only for `location=elevated|overhead`, `bridge=viaduct`, `man_made=viaduct`, or `bridge:structure=viaduct|beam`. The shipped chunks do not carry those tags.

## Light and weather

One grade is shared by every time of day (`src/viewer/grade.ts`). It is aimed at grounded urban daylight: natural blue sky, warm but limited sun, darker asphalt, and saturation just under neutral. Sunset, shop glass, and street lamps carry the tropical warmth. They do not repaint the whole city.

Clear, overcast, rain, storm, and post-rain only change wetness, cloud amount, fog density, and sun strength. Fog is `THREE.FogExp2`. The mix is `1 - exp(-(density * metres)^2)`. That formula has no distance where coverage is exactly 100%, and at very long range a float can round the mix to 1. Fog does not unload chunks. Camera far stays 8000 m. Chunks still load at Chebyshev radius 2 and unload at 4. Trees and street dressing on a chunk two or more steps from the camera are hidden, not disposed. Storm lightning is a short lift of the same sun, not a white frame. The sky is a gradient with a sun disc and drifting clouds; only the horizon band takes the fog colour. Water uses a small shader ripple and a murkier albedo, separate from wet asphalt.

Where `wantsSetback` is true, the ground floor keeps the OSM footprint and the upper floors step in 1.8 m (2.6 m above 16 m). The ledge is not surveyed. Courtyards, tin sheds, and short buildings stay one extrusion. A chunk keeps the largest 700 steps. Four landmarks keep their OSM ring and use a reference height instead of the estimated default: Sangsad way 18085267 (33.5 m peripheral, 47 m inner block), Ahsan Manzil way 624025793, the Shahbagh museum way 7392256, and Curzon Hall way 1132918478. Collision for those ways uses the same reference height. Lalbagh is a separate courtyard mesh on the fort node. Window rows are a repeated UV on one quad per wall, not a stack of coplanar floors. Building detail then has three levels (`selectBuildingLod`). Near keeps the step, the shop band, parapets, tanks, and chajjas, and uses every facade material. Mid keeps the step and parapet, one facade material, and drops the small roof clutter. Far keeps the step, the footprint, and the height as one wall and one roof, including courtyard holes, and drops the parapet. A chunk holds its level until the camera is one chunk past that band, then steps down one level. Inward moves upgrade immediately. Low uses near only on the current chunk, mid on the next, and far after that. It also hides trees from the neighbouring chunk outward, caps the pixel ratio at 1, and uses the smaller pedestrian, traffic, and dressing caps. Medium keeps mid detail out to two chunks and sits between those caps. High keeps full detail out to one chunk. Roads, ground, and repeated props (trees, lamps, tanks, sleepers) share a mesh per material across the chunks in memory. Buildings stay on their chunk so a LOD swap does not redraw off-screen walls. A full-city shadow map is still not enabled.

## Not claimed

No digital elevation model. Bridge heights are still the layer rule (about 6 m). Building heights are measured only when OSM says so. A full-city real-time shadow map stalled the frame (about 250 ms on the software renderer) and Three.js r186 no longer supports soft PCF, so shadows are not enabled. The sun, fog, and sky still change with the time of day.
