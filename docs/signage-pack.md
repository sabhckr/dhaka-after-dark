# Signage and materials

Procedural textures and street copy for the existing Dhaka map. Footprints, roads, water, and landmarks are unchanged.

## Licenses

| Asset | License | Where |
| --- | --- | --- |
| Map geometry and shop names | ODbL 1.0, © OpenStreetMap contributors | `public/world/`, `public/world/signs/` |
| Noto Sans Bengali | SIL OFL 1.1 | `public/fonts/OFL.txt` |
| Facade, road, roof, bark, water canvases | Original code, no third-party images | `src/viewer/proc-tex.ts` |
| Meme, movie, and fictional campaign posters | Original copy | `src/viewer/copy.ts` |

No Google tiles, logos, or scraped business listings. No real political party names, symbols, or portraits.

## What a sign means

- A shop board uses the OSM name as stored. Bengali `name:bn` wins when the tag exists. Missing names stay off the board. The crosshair says the placement is approximate.
- Posters are fictional. The required tea line is `ইচ্ছা মতো চা খান, ইচ্ছা মতো থাপ্পড় খান`, marked কাল্পনিক. Campaign sheets use invented groups only.
- Real shop boards and fictional posters do not share a building, so a joke never overwrites a mapped name.

## Limits

- Normals use shader derivatives. There is no screen-space reflection; wet roads pick up a small sky-and-neon environment map.
- One shared texture per material, not a unique image per building. Dense chunks show at most 28 real shop boards and 48 poster hosts.
- Shop rows are OSM tags from the 2026-10-28 Geofabrik extract, not a field survey.
- Regenerate names with `scripts/geo/extract-shops.ts` without rebuilding chunk geometry.
