/**
 * Sidecar shop names from the local OSM PBF. Does not rewrite map chunks.
 *
 *   node --max-old-space-size=2048 --experimental-strip-types scripts/geo/extract-shops.ts [pbf]
 *
 * Names are copied from name:bn, name, and name:en. Nothing is translated.
 * ODbL © OpenStreetMap contributors. Not field-verified.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { worldToChunk } from "../../src/geo/chunks.ts";
import { inPrefilter } from "../../src/geo/classify.ts";
import { lonLatToWorld, qCoord } from "../../src/geo/crs.ts";
import { pointInRing, type XZ } from "../../src/geo/geometry.ts";
import { isNamedShop, shopTags, type ShopRec } from "../../src/geo/shops.ts";

const require = createRequire(import.meta.url);
const parseOSM = require("osm-pbf-parser") as () => NodeJS.ReadWriteStream;

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const WORLD = process.env.WORLD_OUT || path.join(ROOT, "public/world");
const PBF = process.argv[2] || path.join(ROOT, "data/raw/bangladesh.osm.pbf");
const OUT = path.join(WORLD, "signs");
const OVERVIEW = path.join(WORLD, "overview.json");
const RETRIEVED = "2026-10-29";
const PBF_NOTE = "Geofabrik Bangladesh extract dated 2026-10-28, file bangladesh.osm.pbf";

type Tags = Record<string, string>;
type WayHit = { id: number; tags: Tags; refs: number[] };

function log(msg: string) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);
}

function scan(file: string, onItem: (item: { type: string; id: number; lat?: number; lon?: number; tags?: Tags; refs?: number[] }) => void) {
  return new Promise<void>((resolve, reject) => {
    const osm = parseOSM();
    fs.createReadStream(file)
      .pipe(osm)
      .on("data", (items: { type: string; id: number; lat?: number; lon?: number; tags?: Tags; refs?: number[] }[]) => {
        for (const item of items) onItem(item);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });
}

function keepTag(tags: Tags, key: string): string | undefined {
  const v = tags[key];
  return v && v.trim() ? v.trim() : undefined;
}

function recFrom(id: number, t: "node" | "way", tags: Tags, lon: number, lat: number): ShopRec | null {
  if (!inPrefilter(lat, lon)) return null;
  const kind = shopTags(tags);
  if (!kind || !isNamedShop(tags)) return null;
  const w = lonLatToWorld(lon, lat);
  const name = keepTag(tags, "name") || "";
  const bn = keepTag(tags, "name:bn");
  const en = keepTag(tags, "name:en");
  if (!bn && !name && !en) return null;
  const row: ShopRec = { id, t, name, x: qCoord(w.x), z: qCoord(w.z) };
  if (bn) row.bn = bn;
  if (en) row.en = en;
  if (kind.shop) row.shop = kind.shop;
  if (kind.amenity) row.amenity = kind.amenity;
  if (kind.craft) row.craft = kind.craft;
  const brand = keepTag(tags, "brand");
  if (brand) row.brand = brand;
  return row;
}

async function main() {
  if (!fs.existsSync(PBF)) throw new Error(`PBF not found: ${PBF}`);
  const boundary: XZ[] = [];
  if (fs.existsSync(OVERVIEW)) {
    const overview = JSON.parse(fs.readFileSync(OVERVIEW, "utf8")) as { boundary?: number[] };
    const ring = overview.boundary || [];
    for (let i = 0; i < ring.length; i += 2) boundary.push([ring[i], ring[i + 1]]);
  }

  log(`pass 1 shops ← ${PBF}`);
  const nodeShops: ShopRec[] = [];
  const ways: WayHit[] = [];
  await scan(PBF, (item) => {
    if (item.type === "node") {
      if (item.lat == null || item.lon == null || !item.tags) return;
      if (!inPrefilter(item.lat, item.lon)) return;
      const row = recFrom(item.id, "node", item.tags, item.lon, item.lat);
      if (row) nodeShops.push(row);
      return;
    }
    if (item.type === "way" && item.tags && item.refs && isNamedShop(item.tags)) {
      ways.push({ id: item.id, tags: { ...item.tags }, refs: item.refs.slice() });
    }
  });
  log(`named shop nodes ${nodeShops.length}, shop ways ${ways.length}`);

  const needed = new Set<number>();
  for (const w of ways) for (const id of w.refs) needed.add(id);
  log(`pass 2 resolving ${needed.size} way nodes`);
  const coords = new Map<number, { lon: number; lat: number }>();
  await scan(PBF, (item) => {
    if (item.type !== "node" || item.lat == null || item.lon == null) return;
    if (!needed.has(item.id)) return;
    coords.set(item.id, { lon: item.lon, lat: item.lat });
  });

  const wayShops: ShopRec[] = [];
  let unresolved = 0;
  for (const w of ways) {
    let slon = 0;
    let slat = 0;
    let n = 0;
    for (const id of w.refs) {
      const c = coords.get(id);
      if (!c) continue;
      slon += c.lon;
      slat += c.lat;
      n++;
    }
    if (n === 0) {
      unresolved++;
      continue;
    }
    const row = recFrom(w.id, "way", w.tags, slon / n, slat / n);
    if (row) wayShops.push(row);
  }
  log(`way centroids ${wayShops.length}, unresolved ${unresolved}`);

  const all = nodeShops.concat(wayShops).filter((s) => boundary.length < 3 || pointInRing(s.x, s.z, boundary));
  all.sort((a, b) => a.t.localeCompare(b.t) || a.id - b.id);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const groups = new Map<string, ShopRec[]>();
  let withBn = 0;
  for (const s of all) {
    if (s.bn) withBn++;
    const c = worldToChunk(s.x, s.z);
    const key = `${c.ix}_${c.iy}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  for (const [key, list] of groups) {
    fs.writeFileSync(path.join(OUT, `c_${key}.json`), JSON.stringify(list));
  }
  const index = {
    v: 1,
    source: "OpenStreetMap",
    license: "ODbL-1.0",
    attribution: "© OpenStreetMap contributors",
    retrieved: RETRIEVED,
    pbf: PBF_NOTE,
    verification: "osm-tag-only",
    note: "Display prefers name:bn, then name, then name:en. Tags are not field-verified. No Google data. No translated or invented business names. Facade side in the viewer is approximate.",
    counts: { shops: all.length, withBn, nodes: nodeShops.length, ways: wayShops.length, chunks: groups.size },
    chunkKeys: [...groups.keys()].sort(),
  };
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 2));
  log(`wrote ${groups.size} chunks, ${all.length} shops (${withBn} with name:bn)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
