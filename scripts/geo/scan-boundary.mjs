/**
 * List administrative relations in a local OSM PBF (names only).
 * Usage: node scripts/geo/scan-boundary.mjs [path]
 */
import fs from "node:fs";
import parseOSM from "osm-pbf-parser";

const pbf = process.argv[2] || "/workspace/data/raw/bangladesh.osm.pbf";
const osm = parseOSM();
const rows = [];
let rels = 0;

fs.createReadStream(pbf)
  .pipe(osm)
  .on("data", (items) => {
    for (const item of items) {
      if (item.type !== "relation") continue;
      rels++;
      const t = item.tags || {};
      if (t.boundary !== "administrative") continue;
      rows.push({
        id: item.id,
        level: t.admin_level || "",
        name: t.name || "",
        en: t["name:en"] || "",
        members: (item.members || []).length,
      });
    }
  })
  .on("end", () => {
    rows.sort((a, b) => String(a.level).localeCompare(String(b.level)) || a.en.localeCompare(b.en));
    console.log("relations", rels, "admin", rows.length);
    for (const r of rows) {
      console.log(`${r.level}\t${r.id}\tm=${r.members}\t${r.en}\t${r.name}`);
    }
  })
  .on("error", (err) => {
    console.error(err);
    process.exit(1);
  });
