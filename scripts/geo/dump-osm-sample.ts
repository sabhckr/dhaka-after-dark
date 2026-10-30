/**
 * Raw OSM for a sample of a staged v2 world, for scripts/geo/check-v2-osm.py.
 *
 *   node --experimental-strip-types scripts/geo/dump-osm-sample.ts <pbf> <world> <out.json> [per-kind|all]
 *
 * Every v2 point node, and up to 3,000 (or the given number, or all) of each
 * attributed feature kind (every n-th, so the sample is deterministic). Ids are looked up as ways and as
 * relations, because a footprint or area id can be either. Writes only out.json.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { ChunkFile } from "../../src/geo/types.ts";

const [PBF, WORLD, OUT, LIMIT] = process.argv.slice(2);
if (!PBF || !WORLD || !OUT) {
  console.error("usage: dump-osm-sample.ts <pbf> <world> <out.json>");
  process.exit(2);
}
const require = createRequire(import.meta.url);
const parseOSM = require("osm-pbf-parser") as () => NodeJS.ReadWriteStream;

const SAMPLE = LIMIT === "all" ? Infinity : Number(LIMIT) || 3000;
const points = new Map<number, { k: string; x: number; z: number }>();
const byKind: Record<string, Map<number, Record<string, unknown>>> = {
  buildings: new Map(),
  roads: new Map(),
  // Features with no v2 attribute: OSM must have nothing to copy for them either.
  buildingsBare: new Map(),
  roadsBare: new Map(),
  landuse: new Map(),
  barriers: new Map(),
  power: new Map(),
};
const V1_ROAD = new Set(["id", "cls", "w", "we", "y", "bridge", "pts"]);
const V1_BUILDING = new Set(["id", "h", "hs", "outer", "holes"]);
for (const f of fs.readdirSync(path.join(WORLD, "chunks")).sort()) {
  const c = JSON.parse(fs.readFileSync(path.join(WORLD, "chunks", f), "utf8")) as ChunkFile;
  for (const p of c.points ?? []) points.set(p.id, { k: p.k, x: p.x, z: p.z });
  const keep = (kind: string, id: number, rec: object, v1: Set<string> | null) => {
    const attrs = v1 ? Object.fromEntries(Object.entries(rec).filter(([k]) => !v1.has(k))) : rec;
    if (v1 && !Object.keys(attrs).length) {
      if (!byKind[`${kind}Bare`].has(id)) byKind[`${kind}Bare`].set(id, {});
      return;
    }
    if (!byKind[kind].has(id))
      byKind[kind].set(
        id,
        v1 ? (attrs as Record<string, unknown>) : { t: (rec as { t: string }).t },
      );
  };
  for (const r of c.roads) keep("roads", r.id, r, V1_ROAD);
  for (const b of c.buildings) keep("buildings", b.id, b, V1_BUILDING);
  for (const l of c.landuse ?? []) keep("landuse", l.id, l, null);
  for (const l of c.barriers ?? []) keep("barriers", l.id, l, null);
  for (const l of c.power ?? []) keep("power", l.id, l, null);
}
const sample: Record<string, Map<number, Record<string, unknown>>> = {};
const wanted = new Set<number>();
for (const [kind, all] of Object.entries(byKind)) {
  const ids = [...all.keys()].sort((a, b) => a - b);
  const limit = kind.endsWith("Bare") ? Math.min(SAMPLE, 5000) : SAMPLE;
  const step = Math.max(1, Math.floor(ids.length / limit));
  sample[kind] = new Map(
    ids
      .filter((_, i) => i % step === 0)
      .slice(0, limit)
      .map((id) => [id, all.get(id)!]),
  );
  for (const id of sample[kind].keys()) wanted.add(id);
}

const nodes: Record<number, { lon: number; lat: number; tags: Record<string, string> }> = {};
const ways: Record<number, Record<string, string>> = {};
const relations: Record<number, Record<string, string>> = {};
await new Promise<void>((resolve, reject) => {
  fs.createReadStream(PBF)
    .pipe(parseOSM())
    .on(
      "data",
      (
        items: {
          type: string;
          id: number;
          lat?: number;
          lon?: number;
          tags?: Record<string, string>;
        }[],
      ) => {
        for (const it of items) {
          if (it.type === "node" && points.has(it.id))
            nodes[it.id] = { lon: it.lon!, lat: it.lat!, tags: it.tags ?? {} };
          else if (it.type === "way" && wanted.has(it.id)) ways[it.id] = it.tags ?? {};
          else if (it.type === "relation" && wanted.has(it.id)) relations[it.id] = it.tags ?? {};
        }
      },
    )
    .on("end", () => resolve())
    .on("error", reject);
});
fs.writeFileSync(
  OUT,
  JSON.stringify({
    points: Object.fromEntries(points),
    sample: Object.fromEntries(Object.entries(sample).map(([k, m]) => [k, Object.fromEntries(m)])),
    totals: Object.fromEntries(Object.entries(byKind).map(([k, m]) => [k, m.size])),
    nodes,
    ways,
    relations,
  }),
);
console.log(
  `points ${points.size}, nodes found ${Object.keys(nodes).length}, ways ${Object.keys(ways).length}, relations ${Object.keys(relations).length}`,
);
