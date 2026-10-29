/** Resolve one relation's rings from a local PBF. Two full scans. */
import fs from "node:fs";
import parseOSM from "osm-pbf-parser";

const pbf = process.argv[2];
const relId = Number(process.argv[3]);
if (!pbf || !relId) {
  console.error("usage: extract-relation.mjs file.pbf RELATION_ID");
  process.exit(1);
}

function scan(onItem) {
  return new Promise((resolve, reject) => {
    const osm = parseOSM();
    fs.createReadStream(pbf)
      .pipe(osm)
      .on("data", (items) => {
        for (const item of items) onItem(item);
      })
      .on("end", resolve)
      .on("error", reject);
  });
}

const wantedWays = new Set();
let rel = null;
console.log("pass 1 relations");
await scan((item) => {
  if (item.type === "relation" && item.id === relId) rel = item;
});
if (!rel) {
  console.error("relation not found");
  process.exit(1);
}
for (const m of rel.members || []) if (m.type === "way") wantedWays.add(m.id);
console.log("tags", rel.tags);
console.log("way members", wantedWays.size);

const wayRefs = new Map();
const nodeIds = new Set();
console.log("pass 2 ways");
await scan((item) => {
  if (item.type !== "way" || !wantedWays.has(item.id)) return;
  wayRefs.set(item.id, item.refs);
  for (const id of item.refs) nodeIds.add(id);
});
console.log("resolved ways", wayRefs.size, "nodes", nodeIds.size);

const coords = new Map();
console.log("pass 3 nodes");
await scan((item) => {
  if (item.type === "node" && nodeIds.has(item.id)) coords.set(item.id, [item.lon, item.lat]);
});
console.log("coords", coords.size);

function line(refs) {
  const pts = [];
  for (const id of refs) {
    const c = coords.get(id);
    if (c) pts.push(c);
  }
  return pts;
}

const outers = [];
const inners = [];
for (const m of rel.members) {
  if (m.type !== "way") continue;
  const refs = wayRefs.get(m.id);
  if (!refs) continue;
  const pts = line(refs);
  const role = m.role || "outer";
  if (role === "inner") inners.push(pts);
  else outers.push(pts);
}

function chain(lines) {
  const unused = lines.map((l) => l.slice());
  const rings = [];
  while (unused.length) {
    const ring = unused.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < unused.length; i++) {
        const l = unused[i];
        const a = ring[0];
        const b = ring[ring.length - 1];
        const c = l[0];
        const d = l[l.length - 1];
        const close = (p, q) => Math.abs(p[0] - q[0]) < 1e-5 && Math.abs(p[1] - q[1]) < 1e-5;
        if (close(b, c)) {
          ring.push(...l.slice(1));
          unused.splice(i, 1);
          grew = true;
          break;
        }
        if (close(b, d)) {
          ring.push(...l.slice(0, -1).reverse());
          unused.splice(i, 1);
          grew = true;
          break;
        }
        if (close(a, d)) {
          ring.unshift(...l.slice(0, -1));
          unused.splice(i, 1);
          grew = true;
          break;
        }
        if (close(a, c)) {
          ring.unshift(...l.slice(1).reverse());
          unused.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    rings.push(ring);
  }
  return rings;
}

const rings = chain(outers.filter((l) => l.length > 1));
let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
let verts = 0;
for (const r of rings) {
  verts += r.length;
  for (const [lon, lat] of r) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
}
// rough area (equirectangular)
let area = 0;
const mlat = ((minLat + maxLat) / 2) * Math.PI / 180;
const kx = 111320 * Math.cos(mlat);
const ky = 110540;
for (const r of rings) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += r[j][0] * kx * r[i][1] * ky - r[i][0] * kx * r[j][1] * ky;
  }
  area += Math.abs(a) / 2;
}
console.log(JSON.stringify({
  rings: rings.length,
  inners: inners.length,
  verts,
  bbox: { minLat, maxLat, minLon, maxLon },
  areaKm2: area / 1e6,
  ringLengths: rings.map((r) => r.length),
}, null, 2));
fs.writeFileSync("/tmp/rel-rings.json", JSON.stringify({ tags: rel.tags, rings, inners }));
