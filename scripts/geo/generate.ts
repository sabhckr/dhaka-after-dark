/**
 * Offline Dhaka blockout generator.
 *
 *   node --max-old-space-size=3072 --experimental-strip-types scripts/geo/generate.ts [pbf]
 *
 * Reads a local Geofabrik (or other ODbL) OSM PBF. Does not download tiles.
 * Heavy work stays here; the browser only fetches chunk JSON.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { assembleWorld, approximateParkTrees, chunkFeatureCounts, type WorldFeature } from "../../src/geo/assemble.ts";
import { CHUNK_SIZE } from "../../src/geo/chunks.ts";
import {
  DHAKA_PREFILTER,
  classifyHeight,
  classifyRoad,
  inPrefilter,
  isBridgeDeck,
  isBuilding,
  isLandmarkNode,
  isMappedTree,
  isPark,
  isRail,
  isWaterArea,
  linearWaterWidth,
  railElevation,
} from "../../src/geo/classify.ts";
import { WORLD_ORIGIN, lonLatToWorld, worldToLonLat } from "../../src/geo/crs.ts";
import { CoverageMask, douglasPeucker, pointInPolys, ringArea, type PolyRings, type XZ } from "../../src/geo/geometry.ts";
import { indexEdges, nearestRoad, type GraphEdge } from "../../src/geo/graph.ts";
import type { Manifest, Spawn } from "../../src/geo/types.ts";

const require = createRequire(import.meta.url);
const parseOSM = require("osm-pbf-parser") as () => NodeJS.ReadWriteStream;
const polygonClipping = require("polygon-clipping") as {
  intersection: (a: number[][][][], b: number[][][][]) => number[][][][];
};

const PBF = process.argv[2] || "/workspace/data/raw/bangladesh.osm.pbf";
const OUT = "/workspace/public/world";
const RETRIEVED = "2026-10-29";

type Tags = Record<string, string>;
type WayRec = { id: number; refs: Int32Array; tags: Tags | null };
type RelRec = { id: number; tags: Tags; members: { type: string; id: number; role: string }[] };

const SPAWN_SEEDS: { id: string; name: string; lon: number; lat: number; y: number; yaw: number }[] = [
  { id: "sangsad", name: "Jatiya Sangsad", lon: 90.3786, lat: 23.7625, y: 48, yaw: 0.4 },
  { id: "shahbagh", name: "Shahbagh", lon: 90.3958, lat: 23.7389, y: 32, yaw: 0 },
  { id: "motijheel", name: "Motijheel", lon: 90.4172, lat: 23.727, y: 36, yaw: 0 },
  { id: "gulshan", name: "Gulshan 1", lon: 90.4168, lat: 23.7806, y: 40, yaw: 0 },
  { id: "uttara", name: "Uttara", lon: 90.3915, lat: 23.868, y: 48, yaw: 0 },
  { id: "sadarghat", name: "Sadarghat", lon: 90.4105, lat: 23.7065, y: 36, yaw: 0.2 },
  { id: "dhanmondi", name: "Dhanmondi", lon: 90.3742, lat: 23.7461, y: 32, yaw: 0 },
  { id: "kamalapur", name: "Kamalapur station", lon: 90.4256, lat: 23.7326, y: 36, yaw: 0 },
  { id: "airport", name: "Shahjalal airport", lon: 90.3978, lat: 23.8433, y: 70, yaw: 0 },
];

function log(msg: string) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);
}

function scan(file: string, onItem: (item: { type: string; id: number; lat?: number; lon?: number; tags?: Tags; refs?: number[]; members?: RelRec["members"] }) => void) {
  return new Promise<void>((resolve, reject) => {
    const osm = parseOSM();
    fs.createReadStream(file)
      .pipe(osm)
      .on("data", (items: { type: string; id: number; lat?: number; lon?: number; tags?: Tags; refs?: number[]; members?: RelRec["members"] }[]) => {
        for (const item of items) onItem(item);
      })
      .on("end", () => resolve())
      .on("error", reject);
  });
}

function relKind(tags: Tags): "dncc" | "dscc" | "metro" | null {
  const blob = `${tags["name:en"] || ""} | ${tags.name || ""} | ${tags["name:bn"] || ""}`;
  if (/dhaka north city corporation|ঢাকা উত্তর সিটি কর্পোরেশন/i.test(blob)) return "dncc";
  if (/dhaka south city corporation|ঢাকা দক্ষিণ সিটি কর্পোরেশন/i.test(blob)) return "dscc";
  if (tags["name:en"] === "Dhaka Metropolitan" || tags.name === "ঢাকা মহানগর") return "metro";
  return null;
}

function interestingWay(tags: Tags | undefined): boolean {
  if (!tags) return false;
  if (tags.highway || tags.building || tags.railway || tags.waterway || tags.water) return true;
  if (tags.natural === "water" || tags.natural === "wood" || tags.natural === "tree") return true;
  if (tags.leisure || tags.landuse) return true;
  if (tags.man_made === "bridge" || tags.man_made === "viaduct") return true;
  return false;
}

function featureRelation(tags: Tags): boolean {
  if (relKind(tags)) return true;
  if (isBuilding(tags) || isWaterArea(tags) || isPark(tags) || isBridgeDeck(tags)) return true;
  return false;
}

class NodeIndex {
  ids = new Float64Array(1 << 20);
  lats = new Int32Array(1 << 20);
  lons = new Int32Array(1 << 20);
  n = 0;
  sorted = false;

  push(id: number, lat: number, lon: number) {
    if (this.n >= this.ids.length) {
      const n = this.ids.length * 2;
      const ids = new Float64Array(n);
      const lats = new Int32Array(n);
      const lons = new Int32Array(n);
      ids.set(this.ids);
      lats.set(this.lats);
      lons.set(this.lons);
      this.ids = ids;
      this.lats = lats;
      this.lons = lons;
    }
    this.ids[this.n] = id;
    this.lats[this.n] = Math.round(lat * 1e7);
    this.lons[this.n] = Math.round(lon * 1e7);
    this.n++;
  }

  finish() {
    const n = this.n;
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => this.ids[a] - this.ids[b]);
    const ids = new Float64Array(n);
    const lats = new Int32Array(n);
    const lons = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const j = order[i];
      ids[i] = this.ids[j];
      lats[i] = this.lats[j];
      lons[i] = this.lons[j];
    }
    this.ids = ids;
    this.lats = lats;
    this.lons = lons;
    this.sorted = true;
  }

  find(id: number): number {
    let lo = 0;
    let hi = this.n - 1;
    const ids = this.ids;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = ids[mid];
      if (v === id) return mid;
      if (v < id) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  world(i: number): XZ {
    const lon = this.lons[i] / 1e7;
    const lat = this.lats[i] / 1e7;
    const w = lonLatToWorld(lon, lat);
    return [w.x, w.z];
  }
}

function linesFromRefs(refs: Int32Array, nodes: NodeIndex): XZ[][] {
  const parts: XZ[][] = [];
  let cur: XZ[] = [];
  for (let i = 0; i < refs.length; i++) {
    const ix = refs[i];
    if (ix < 0) {
      if (cur.length) parts.push(cur);
      cur = [];
      continue;
    }
    cur.push(nodes.world(ix));
  }
  if (cur.length) parts.push(cur);
  return parts;
}

function dist2(a: XZ, b: XZ): number {
  const dx = a[0] - b[0];
  const dz = a[1] - b[1];
  return dx * dx + dz * dz;
}

function chain(lines: XZ[][]): XZ[][] {
  const pool = lines.filter((l) => l.length >= 2).map((l) => l.slice());
  const rings: XZ[][] = [];
  const tol = 1.2 * 1.2;
  while (pool.length) {
    const ring = pool.pop()!;
    let guard = 0;
    let grew = true;
    while (grew && guard++ < 20000) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const l = pool[i];
        const a = ring[0];
        const b = ring[ring.length - 1];
        const c = l[0];
        const d = l[l.length - 1];
        if (dist2(b, c) <= tol) {
          ring.push(...l.slice(1));
          pool.splice(i, 1);
          grew = true;
          break;
        }
        if (dist2(b, d) <= tol) {
          ring.push(...l.slice(0, -1).reverse());
          pool.splice(i, 1);
          grew = true;
          break;
        }
        if (dist2(a, d) <= tol) {
          ring.unshift(...l.slice(0, -1));
          pool.splice(i, 1);
          grew = true;
          break;
        }
        if (dist2(a, c) <= tol) {
          ring.unshift(...l.slice(1).reverse());
          pool.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    rings.push(ring);
  }
  return rings;
}

function closeEnough(ring: XZ[]): boolean {
  return ring.length >= 3 && dist2(ring[0], ring[ring.length - 1]) < 4;
}

function asPoly(ring: XZ[]): number[][] {
  const pts = ring.map((p) => [p[0], p[1]]);
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) pts.push([a[0], a[1]]);
  return pts;
}

function mpFrom(polys: PolyRings[]): number[][][][] {
  return polys.map((p) => [asPoly(p.outer), ...p.holes.map(asPoly)]);
}

function polysFromMp(mp: number[][][][]): PolyRings[] {
  const out: PolyRings[] = [];
  for (const poly of mp) {
    if (!poly[0] || poly[0].length < 4) continue;
    const outer = poly[0].slice(0, -1).map((p) => [p[0], p[1]] as XZ);
    const holes = poly.slice(1).map((h) => h.slice(0, -1).map((p) => [p[0], p[1]] as XZ));
    if (outer.length >= 3) out.push({ outer, holes });
  }
  return out;
}

function clipPolys(polys: PolyRings[], boundary: number[][][][], mask: CoverageMask): PolyRings[] {
  const kept: PolyRings[] = [];
  for (const p of polys) {
    const box = boxOf(p.outer);
    const cls = mask.classifyBBox(box);
    if (cls === "out") continue;
    if (cls === "in") {
      kept.push(p);
      continue;
    }
    try {
      const hit = polygonClipping.intersection(boundary, mpFrom([p]));
      kept.push(...polysFromMp(hit));
    } catch {
      if (pointInPolys((box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2, polys)) kept.push(p);
    }
  }
  return kept;
}

function boxOf(pts: XZ[]) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  return { minX, minZ, maxX, maxZ };
}

class EdgeGrid {
  cell = 50;
  buckets = new Map<string, [XZ, XZ][]>();
  constructor(polys: PolyRings[]) {
    for (const p of polys) {
      this.add(p.outer);
      for (const h of p.holes) this.add(h);
    }
  }
  add(ring: XZ[]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const c0 = Math.floor(Math.min(a[0], b[0]) / this.cell);
      const c1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
      const r0 = Math.floor(Math.min(a[1], b[1]) / this.cell);
      const r1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const k = `${c},${r}`;
          const arr = this.buckets.get(k);
          if (arr) arr.push([a, b]);
          else this.buckets.set(k, [[a, b]]);
        }
      }
    }
  }
}

function segHit(a: XZ, b: XZ, c: XZ, d: XZ): { t: number; p: XZ } | null {
  const rx = b[0] - a[0];
  const rz = b[1] - a[1];
  const sx = d[0] - c[0];
  const sz = d[1] - c[1];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  if (t > 1e-7 && t < 1 - 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) return { t, p: [a[0] + t * rx, a[1] + t * rz] };
  return null;
}

function clipLine(pts: XZ[], inside: (x: number, z: number) => boolean, grid: EdgeGrid, mask: CoverageMask): XZ[][] {
  const parts: XZ[][] = [];
  let cur: XZ[] | null = null;
  const flush = () => {
    if (cur && cur.length >= 2) parts.push(cur);
    cur = null;
  };
  const push = (p: XZ, q: XZ) => {
    if (!cur) cur = [p];
    else if (dist2(cur[cur.length - 1], p) > 0.01) {
      flush();
      cur = [p];
    }
    cur.push(q);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const ca = mask.cellAt(a[0], a[1]);
    const cb = mask.cellAt(b[0], b[1]);
    const cm = mask.cellAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    if (ca === 0 && cb === 0 && cm === 0) {
      flush();
      continue;
    }
    if (ca === 1 && cb === 1 && cm === 1) {
      push(a, b);
      continue;
    }
    const hits: { t: number; p: XZ }[] = [];
    const c0 = Math.floor(Math.min(a[0], b[0]) / grid.cell);
    const c1 = Math.floor(Math.max(a[0], b[0]) / grid.cell);
    const r0 = Math.floor(Math.min(a[1], b[1]) / grid.cell);
    const r1 = Math.floor(Math.max(a[1], b[1]) / grid.cell);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const edges = grid.buckets.get(`${c},${r}`);
        if (!edges) continue;
        for (const e of edges) {
          const hit = segHit(a, b, e[0], e[1]);
          if (hit) hits.push(hit);
        }
      }
    }
    hits.sort((p, q) => p.t - q.t);
    const seq: XZ[] = [a];
    let last = 0;
    for (const h of hits) {
      if (h.t - last < 1e-5) continue;
      last = h.t;
      seq.push(h.p);
    }
    seq.push(b);
    for (let s = 0; s < seq.length - 1; s++) {
      const p = seq[s];
      const q = seq[s + 1];
      if (!inside((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) {
        flush();
        continue;
      }
      push(p, q);
    }
  }
  flush();
  return parts;
}

function simplifyRing(ring: XZ[], tol: number): XZ[] {
  const closed = dist2(ring[0], ring[ring.length - 1]) < 0.01;
  const body = closed ? ring.slice(0, -1) : ring;
  const s = douglasPeucker(body, tol);
  return s.length >= 3 ? s : body;
}

async function main() {
  if (!fs.existsSync(PBF)) throw new Error(`PBF not found: ${PBF}`);
  log(`pass 1 relations ← ${PBF}`);
  const relations: RelRec[] = [];
  const memberWays = new Set<number>();
  await scan(PBF, (item) => {
    if (item.type !== "relation" || !item.tags) return;
    if (!featureRelation(item.tags) && !relKind(item.tags)) return;
    const members = item.members || [];
    relations.push({ id: item.id, tags: { ...item.tags }, members });
    for (const m of members) if (m.type === "way") memberWays.add(m.id);
  });
  log(`kept ${relations.length} relations, ${memberWays.size} member ways`);

  log("pass 2 nodes + ways");
  const nodes = new NodeIndex();
  const ways: WayRec[] = [];
  const wayById = new Map<number, WayRec>();
  const landmarks: { id: number; name: string; cat: string; lon: number; lat: number }[] = [];
  const trees: { lon: number; lat: number }[] = [];
  let nodeCount = 0;
  let waySeen = 0;
  let sorted = false;
  await scan(PBF, (item) => {
    if (item.type === "node") {
      nodeCount++;
      if (item.lat == null || item.lon == null) return;
      if (!inPrefilter(item.lat, item.lon)) return;
      nodes.push(item.id, item.lat, item.lon);
      const tags = item.tags;
      if (tags && isMappedTree(tags)) trees.push({ lon: item.lon, lat: item.lat });
      else if (tags) {
        const cat = isLandmarkNode(tags);
        if (cat && landmarks.length < 6000) landmarks.push({ id: item.id, name: tags.name, cat, lon: item.lon, lat: item.lat });
      }
      if (nodes.n % 1_000_000 === 0) log(`nodes in prefilter ${nodes.n}`);
      return;
    }
    if (item.type !== "way" || !item.refs) return;
    waySeen++;
    if (!sorted) {
      log(`sorting ${nodes.n} nodes (file nodes seen ${nodeCount})`);
      nodes.finish();
      sorted = true;
      log("node index ready");
    }
    const tagged = interestingWay(item.tags);
    if (!tagged && !memberWays.has(item.id)) return;
    const refs = new Int32Array(item.refs.length);
    let hit = 0;
    for (let i = 0; i < item.refs.length; i++) {
      const ix = nodes.find(item.refs[i]);
      refs[i] = ix;
      if (ix >= 0) hit++;
    }
    if (hit < 2) return;
    const rec: WayRec = { id: item.id, refs, tags: item.tags ? { ...item.tags } : null };
    ways.push(rec);
    wayById.set(item.id, rec);
    if (ways.length % 200_000 === 0) log(`stored ways ${ways.length} (scanned ${waySeen})`);
  });
  log(`stored ways ${ways.length}`);

  const warnings: string[] = [];
  const warn = (m: string) => {
    if (warnings.length < 40) warnings.push(m);
  };

  function ringsFor(members: RelRec["members"], role: string): XZ[][] {
    const lines: XZ[][] = [];
    for (const m of members) {
      if (m.type !== "way") continue;
      if (role !== "*" && (m.role || "outer") !== role) continue;
      const w = wayById.get(m.id);
      if (!w) continue;
      lines.push(...linesFromRefs(w.refs, nodes));
    }
    return chain(lines);
  }

  const boundaryRels = relations.filter((r) => relKind(r.tags));
  const byKind = new Map<string, RelRec[]>();
  for (const r of boundaryRels) {
    const k = relKind(r.tags)!;
    const list = byKind.get(k) || [];
    list.push(r);
    byKind.set(k, list);
  }

  function polysOf(rel: RelRec): PolyRings[] {
    const outers = ringsFor(rel.members, "outer").filter(closeEnough);
    const inners = ringsFor(rel.members, "inner").filter((r) => r.length >= 3);
    if (!outers.length) {
      const any = ringsFor(rel.members, "*").filter(closeEnough);
      return any.map((outer) => ({ outer, holes: [] }));
    }
    return outers.map((outer) => ({ outer, holes: inners }));
  }

  let boundaryPolys: PolyRings[] = [];
  let boundaryStatus: Manifest["boundary"]["status"] = "provisional-bbox";
  let boundaryKind = "provisional-prefilter";
  let boundaryId = "prefilter";
  let boundaryNote =
    "DNCC and DSCC were not separate administrative relations in the extract, and no metropolitan polygon was usable. Generation uses the documented prefilter rectangle. Replace it by editing the boundary selector in scripts/geo/generate.ts.";
  const relationIds: number[] = [];

  const dncc = byKind.get("dncc") || [];
  const dscc = byKind.get("dscc") || [];
  const metro = byKind.get("metro") || [];
  if (dncc.length && dscc.length) {
    boundaryPolys = [...dncc, ...dscc].flatMap(polysOf);
    boundaryStatus = "osm-relation";
    boundaryKind = "dhaka-north-and-south-city-corporations";
    boundaryId = `r${dncc.map((r) => r.id).join("+")}+${dscc.map((r) => r.id).join("+")}`;
    relationIds.push(...dncc.map((r) => r.id), ...dscc.map((r) => r.id));
    boundaryNote =
      "Union of OSM administrative relations named Dhaka North City Corporation and Dhaka South City Corporation.";
  } else if (metro.length) {
    boundaryPolys = metro.flatMap(polysOf);
    boundaryStatus = "osm-relation";
    boundaryKind = "dhaka-metropolitan-osm-admin-6";
    boundaryId = `r${metro.map((r) => r.id).join("+")}`;
    relationIds.push(...metro.map((r) => r.id));
    boundaryNote =
      "Separate Dhaka North and Dhaka South City Corporation relations are not in this Geofabrik extract (all 1,379 administrative relations were listed). OSM relation 'Dhaka Metropolitan' / ঢাকা মহানগর (admin_level 6) is used instead. Its area is about 301 km², against the published DNCC 196.22 km² + DSCC 109.25 km² = 305.47 km². It is not Dhaka District (admin_level 5, which includes Savar, Dhamrai, Dohar, Keraniganj and Nawabganj) and not the RAJUK planning area.";
  }

  let areaKm2 = 0;
  for (const p of boundaryPolys) {
    areaKm2 += ringArea(p.outer) / 1e6;
    for (const h of p.holes) areaKm2 -= ringArea(h) / 1e6;
  }
  if (boundaryPolys.length && (areaKm2 < 40 || areaKm2 > 800)) {
    warn(`boundary area ${areaKm2.toFixed(1)} km² rejected as implausible`);
    boundaryPolys = [];
  }
  if (!boundaryPolys.length) {
    const sw = lonLatToWorld(DHAKA_PREFILTER.minLon, DHAKA_PREFILTER.minLat);
    const ne = lonLatToWorld(DHAKA_PREFILTER.maxLon, DHAKA_PREFILTER.maxLat);
    const outer: XZ[] = [
      [sw.x, sw.z],
      [ne.x, sw.z],
      [ne.x, ne.z],
      [sw.x, ne.z],
    ];
    boundaryPolys = [{ outer, holes: [] }];
    areaKm2 = ringArea(outer) / 1e6;
    boundaryStatus = "provisional-bbox";
    boundaryKind = "provisional-prefilter";
    boundaryId = "prefilter";
  }
  log(`boundary ${boundaryKind} ${areaKm2.toFixed(2)} km² rings ${boundaryPolys.length}`);

  const mask = new CoverageMask(boundaryPolys, 24);
  const grid = new EdgeGrid(boundaryPolys);
  const boundaryMP = mpFrom(boundaryPolys);
  const inside = (x: number, z: number) => pointInPolys(x, z, boundaryPolys);

  const consumed = new Set<number>();
  const features: WorldFeature[] = [];
  let clippedPolys = 0;
  let dropped = 0;

  function pushPolys(kind: "building" | "water" | "park" | "plaza" | "bridge", id: number, polys: PolyRings[], extra?: { h: number; hs: "measured" | "estimated" }) {
    const clipped = clipPolys(polys, boundaryMP, mask);
    if (!clipped.length) {
      dropped++;
      return;
    }
    if (clipped.length !== polys.length) clippedPolys++;
    for (const p of clipped) {
      const outer = simplifyRing(p.outer, 0.35);
      const holes = p.holes.map((h) => simplifyRing(h, 0.35)).filter((h) => h.length >= 3);
      if (outer.length < 3 || ringArea(outer) < 1) continue;
      if (kind === "building" && extra) features.push({ kind, id, h: extra.h, hs: extra.hs, outer, holes });
      else if (kind === "water") features.push({ kind, id, outer, holes });
      else if (kind === "park") features.push({ kind, id, outer, holes });
      else if (kind === "plaza") features.push({ kind, id, outer, holes });
      else if (kind === "bridge") features.push({ kind, id, outer, holes });
    }
  }

  for (const rel of relations) {
    if (relKind(rel.tags)) continue;
    const tags = rel.tags;
    const outers = ringsFor(rel.members, "outer").filter(closeEnough);
    const holes = ringsFor(rel.members, "inner").filter((r) => r.length >= 3);
    const polys = (outers.length ? outers : ringsFor(rel.members, "*").filter(closeEnough)).map((outer) => ({
      outer,
      holes,
    }));
    if (!polys.length) continue;
    let used = false;
    if (isBuilding(tags) && tags.building !== "part") {
      const h = classifyHeight(tags);
      pushPolys("building", rel.id, polys, { h: h.metres, hs: h.source });
      used = true;
    } else if (isWaterArea(tags)) {
      pushPolys("water", rel.id, polys);
      used = true;
    } else if (isPark(tags)) {
      pushPolys("park", rel.id, polys);
      used = true;
    } else if (isBridgeDeck(tags)) {
      pushPolys("bridge", rel.id, polys);
      used = true;
    }
    if (used) for (const m of rel.members) if (m.type === "way") consumed.add(m.id);
  }

  const majorRoads: { cls: string; pts: XZ[] }[] = [];
  for (const way of ways) {
    if (consumed.has(way.id)) continue;
    const tags = way.tags;
    if (!tags) continue;
    if (tags.building === "part") continue;
    const lines = linesFromRefs(way.refs, nodes).map((l) => douglasPeucker(l, 0.3));
    if (isBuilding(tags)) {
      for (const line of lines) {
        if (!closeEnough(line)) {
          dropped++;
          continue;
        }
        const h = classifyHeight(tags);
        pushPolys("building", way.id, [{ outer: line, holes: [] }], { h: h.metres, hs: h.source });
      }
      continue;
    }
    if (isWaterArea(tags) && closeEnough(lines[0] || [])) {
      pushPolys(
        "water",
        way.id,
        lines.filter(closeEnough).map((outer) => ({ outer, holes: [] })),
      );
      continue;
    }
    if (isPark(tags)) {
      pushPolys(
        "park",
        way.id,
        lines.filter(closeEnough).map((outer) => ({ outer, holes: [] })),
      );
      continue;
    }
    if (isBridgeDeck(tags)) {
      pushPolys(
        "bridge",
        way.id,
        lines.filter(closeEnough).map((outer) => ({ outer, holes: [] })),
      );
      continue;
    }
    const road = classifyRoad(tags);
    if (road) {
      for (const line of lines) {
        if (line.length < 2) continue;
        if (road.area && closeEnough(line)) {
          pushPolys("plaza", way.id, [{ outer: line, holes: [] }]);
          continue;
        }
        for (const part of clipLine(line, inside, grid, mask)) {
          const pts = douglasPeucker(part, 0.4);
          if (pts.length < 2) continue;
          features.push({
            kind: "road",
            id: way.id,
            cls: road.cls,
            width: road.width,
            widthEstimated: road.widthEstimated,
            y: road.y,
            bridge: road.bridge,
            oneway: road.oneway,
            pts,
          });
          if (/^(motorway|trunk|primary|secondary|tertiary)/.test(road.cls)) {
            majorRoads.push({ cls: road.cls, pts: douglasPeucker(pts, 10) });
          }
        }
      }
      continue;
    }
    const canalW = linearWaterWidth(tags);
    if (canalW) {
      for (const line of lines) {
        for (const part of clipLine(line, inside, grid, mask)) {
          const pts = douglasPeucker(part, 0.6);
          if (pts.length >= 2) features.push({ kind: "canal", id: way.id, width: canalW, pts });
        }
      }
      continue;
    }
    if (isRail(tags)) {
      const y = railElevation(tags);
      for (const line of lines) {
        for (const part of clipLine(line, inside, grid, mask)) {
          const pts = douglasPeucker(part, 0.6);
          if (pts.length >= 2) features.push({ kind: "rail", id: way.id, y, pts });
        }
      }
    }
  }

  let approxTrees = 0;
  const parkFeatures = features.filter((f) => f.kind === "park");
  for (const park of parkFeatures) {
    if (park.kind !== "park") continue;
    if (approxTrees > 40_000) break;
    for (const t of approximateParkTrees(park.id, park.outer, 24, 60)) {
      const cell = mask.cellAt(t.x, t.z);
      if (cell === 0) continue;
      if (cell === 2 && !inside(t.x, t.z)) continue;
      features.push({ kind: "tree", x: t.x, z: t.z, h: t.h, k: "approx" });
      approxTrees++;
      if (approxTrees > 40_000) break;
    }
  }
  let mappedTrees = 0;
  for (const t of trees) {
    const w = lonLatToWorld(t.lon, t.lat);
    const cell = mask.cellAt(w.x, w.z);
    if (cell === 0) continue;
    if (cell === 2 && !inside(w.x, w.z)) continue;
    features.push({ kind: "tree", x: w.x, z: w.z, h: 7, k: "mapped" });
    mappedTrees++;
  }
  const landmarkFeatures: { id: number; name: string; cat: string; lon: number; lat: number; x: number; z: number }[] = [];
  for (const lm of landmarks) {
    const w = lonLatToWorld(lm.lon, lm.lat);
    if (!inside(w.x, w.z)) continue;
    features.push({ kind: "landmark", id: lm.id, name: lm.name, cat: lm.cat, x: w.x, z: w.z });
    landmarkFeatures.push({ ...lm, x: w.x, z: w.z });
  }
  log(`features ${features.length} dropped ${dropped} clipped ${clippedPolys} trees mapped ${mappedTrees} approx ${approxTrees}`);

  const assembled = assembleWorld(features, CHUNK_SIZE);
  for (const w of assembled.warnings) warn(w);
  log(`chunks ${assembled.chunks.size} buildings ${assembled.counts.buildings} roads ${assembled.counts.roads}`);

  fs.rmSync(path.join(OUT, "chunks"), { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "chunks"), { recursive: true });

  const chunkMeta: Manifest["chunks"] = [];
  let bytes = 0;
  const buildingHist: number[] = [];
  for (const [key, chunk] of assembled.chunks) {
    const json = JSON.stringify(chunk);
    const file = path.join(OUT, "chunks", `c_${key}.json`);
    fs.writeFileSync(file, json);
    const n = Buffer.byteLength(json);
    bytes += n;
    const counts = chunkFeatureCounts(chunk);
    buildingHist.push(counts.buildings);
    chunkMeta.push({ key, ix: chunk.ix, iy: chunk.iy, bytes: n, counts });
  }
  chunkMeta.sort((a, b) => a.key.localeCompare(b.key));
  buildingHist.sort((a, b) => a - b);
  const pct = (p: number) => buildingHist[Math.min(buildingHist.length - 1, Math.floor(p * (buildingHist.length - 1)))] ?? 0;

  const graphEdges: GraphEdge[] = [];
  for (const chunk of assembled.chunks.values()) {
    for (const e of chunk.graph.edges) {
      if (!/^(motorway|trunk|primary|secondary|tertiary)/.test(e.cls)) continue;
      const pts: XZ[] = [];
      for (let i = 0; i < e.pts.length; i += 2) pts.push([e.pts[i], e.pts[i + 1]]);
      graphEdges.push({ id: e.id, a: e.a, b: e.b, way: e.way, cls: e.cls, oneway: e.oneway, pts });
    }
  }
  const roadIndex = indexEdges(graphEdges, 120);

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const boundaryFlat: number[] = [];
  for (const p of boundaryPolys) {
    const s = douglasPeucker(p.outer, 12);
    for (const [x, z] of s) {
      boundaryFlat.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
      if (x < minX) minX = x;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }
    boundaryFlat.push(Number.NaN, Number.NaN);
  }
  const spawns: Spawn[] = [];
  for (const seed of SPAWN_SEEDS) {
    const w = lonLatToWorld(seed.lon, seed.lat);
    if (!inside(w.x, w.z)) {
      warn(`spawn ${seed.id} is outside the boundary and was dropped`);
      continue;
    }
    const near = nearestRoad(roadIndex, w.x, w.z, 90);
    spawns.push({
      id: seed.id,
      name: seed.name,
      lon: seed.lon,
      lat: seed.lat,
      x: near ? near.x : w.x,
      z: near ? near.z : w.z,
      y: seed.y,
      yaw: seed.yaw,
    });
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const mid = worldToLonLat(cx, cz);
  spawns.push({ id: "overview", name: "City overview", lon: mid.lon, lat: mid.lat, x: cx, z: cz, y: 1600, yaw: 0.2 });

  const waterLines: number[][] = [];
  for (const f of features) {
    if (f.kind !== "water") continue;
    const s = douglasPeucker(f.outer, 18);
    const flat: number[] = [];
    for (const [x, z] of s) flat.push(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    if (flat.length >= 4) waterLines.push(flat);
    if (waterLines.length > 2500) break;
  }
  const overview = {
    bounds: { minX, minZ, maxX, maxZ },
    roads: majorRoads.slice(0, 20000).map((r) => ({
      cls: r.cls,
      pts: r.pts.flatMap(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]),
    })),
    water: waterLines,
    boundary: boundaryFlat.filter((n) => Number.isFinite(n)),
  };

  const insideChunks = new Set<string>();
  for (let r = 0; r < mask.rows; r++) {
    for (let c = 0; c < mask.cols; c++) {
      if (mask.mask[r * mask.cols + c] === 0) continue;
      const x = mask.minX + (c + 0.5) * mask.cell;
      const z = mask.minZ + (r + 0.5) * mask.cell;
      insideChunks.add(`${Math.floor(x / CHUNK_SIZE)}_${Math.floor(z / CHUNK_SIZE)}`);
    }
  }
  const emptyInside = [...insideChunks].filter((k) => !assembled.chunks.has(k));

  const gaps = [
    "Dhaka North and Dhaka South City Corporation are not separate polygons in the 2026-10-28 Geofabrik Bangladesh extract. The generator uses OSM relation 13663697 (Dhaka Metropolitan, admin_level 6) when present.",
    "No digital elevation model. Vertical positions are a local ground datum: measured building:height when tagged, otherwise disclosed estimates (levels × 3.2 m, or a class default).",
    "Road and canal widths are estimates unless OSM width=* is set. Bridge decks use layer/bridge tags, not surveyed elevations. Underpasses are not excavated.",
    "building=part is skipped so footprints are not extruded twice. Multipolygon holes are kept when the relation is present.",
    "Trees tagged natural=tree are mapped positions. Other trees are a deterministic fill inside parks and are marked approximate.",
    "Empty chunks inside the boundary mean OSM had no included features there, not that the ground was invented.",
    `Prefilter bbox ${DHAKA_PREFILTER.minLat},${DHAKA_PREFILTER.minLon} – ${DHAKA_PREFILTER.maxLat},${DHAKA_PREFILTER.maxLon} only limits the node index. It is not the city boundary.`,
    "Dhaka District and Dhaka Division are larger administrative units and are not the generation extent. The RAJUK Detailed Area Plan boundary was not used.",
  ];

  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  for (const p of boundaryPolys) {
    for (const [x, z] of p.outer) {
      const g = worldToLonLat(x, z);
      if (g.lon < minLon) minLon = g.lon;
      if (g.lat < minLat) minLat = g.lat;
      if (g.lon > maxLon) maxLon = g.lon;
      if (g.lat > maxLat) maxLat = g.lat;
    }
  }

  const manifest: Manifest = {
    v: 1,
    name: "DHAKA: AFTER DARK",
    generatedAt: new Date().toISOString(),
    crs: "EPSG:32646",
    origin: { easting: WORLD_ORIGIN.easting, northing: WORLD_ORIGIN.northing },
    axis: "x=east, y=up (local datum, not DEM), z=-north",
    chunkSize: CHUNK_SIZE,
    boundary: {
      status: boundaryStatus,
      kind: boundaryKind,
      id: boundaryId,
      note: boundaryNote,
      relationIds,
      areaKm2: Math.round(areaKm2 * 100) / 100,
      bbox: { minLon, minLat, maxLon, maxLat },
    },
    counts: {
      ...assembled.counts,
      chunks: assembled.chunks.size,
      chunksInsideBoundary: insideChunks.size,
      emptyChunksInsideBoundary: emptyInside.length,
      mappedTrees,
      approxTrees,
      landmarks: landmarkFeatures.length,
      outputBytes: bytes,
    },
    chunks: chunkMeta,
    warnings,
    spawns,
    sources: [
      {
        name: "OpenStreetMap, Geofabrik Bangladesh extract",
        url: "https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf",
        license: "Open Database License (ODbL) 1.0",
        retrieved: RETRIEVED,
        note: "Local file data/raw/bangladesh.osm.pbf from Geofabrik redirect bangladesh-261028.osm.pbf, Last-Modified 2026-10-28. Not a tile scrape. Google Earth was not a geometry source.",
      },
    ],
    gaps,
  };

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(OUT, "overview.json"), JSON.stringify(overview));
  fs.writeFileSync(path.join(OUT, "landmarks.json"), JSON.stringify(landmarkFeatures));
  const coverage = {
    boundary: manifest.boundary,
    counts: manifest.counts,
    chunkBuildingHistogram: {
      min: buildingHist[0] ?? 0,
      p50: pct(0.5),
      p90: pct(0.9),
      max: buildingHist[buildingHist.length - 1] ?? 0,
    },
    emptyChunksInsideBoundarySample: emptyInside.slice(0, 80),
    warnings,
    gaps,
  };
  fs.writeFileSync(path.join(OUT, "coverage.json"), JSON.stringify(coverage, null, 2));
  log(`wrote ${chunkMeta.length} chunks, ${(bytes / 1e6).toFixed(1)} MB`);
  log(`empty inside boundary ${emptyInside.length} / ${insideChunks.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
