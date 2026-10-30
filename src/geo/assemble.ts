import { chunkKey, chunkRect, type ChunkCoord } from "./chunks.ts";
import { qCoord } from "./crs.ts";
import {
  bboxOf,
  ringArea,
  splitPolygonByChunks,
  splitPolylineByChunks,
  type XZ,
} from "./geometry.ts";
import { buildRoadGraph, edgeChunkKey, graphNodeId, type GraphEdge, type GraphNode } from "./graph.ts";
import type {
  BuildingAttrs,
  BuildingRec,
  CanalRec,
  ChunkFile,
  ChunkVersion,
  LanduseRec,
  LineRec,
  PointKind,
  PointRec,
  PowerRec,
  RoadAttrs,
  EdgeRec,
  LandmarkRec,
  NodeRec,
  PolyRec,
  RailRec,
  RoadRec,
  TreeRec,
} from "./types.ts";

export type WorldFeature =
  | {
      kind: "road";
      id: number;
      cls: string;
      width: number;
      widthEstimated: boolean;
      y: number;
      bridge: boolean;
      oneway: -1 | 0 | 1;
      pts: XZ[];
      attrs?: RoadAttrs;
    }
  | { kind: "plaza"; id: number; outer: XZ[]; holes: XZ[][] }
  | {
      kind: "building";
      id: number;
      h: number;
      hs: "measured" | "estimated";
      outer: XZ[];
      holes: XZ[][];
      attrs?: BuildingAttrs;
    }
  | { kind: "water"; id: number; outer: XZ[]; holes: XZ[][] }
  | { kind: "canal"; id: number; width: number; pts: XZ[] }
  | { kind: "park"; id: number; outer: XZ[]; holes: XZ[][] }
  | { kind: "rail"; id: number; y: number; pts: XZ[] }
  | { kind: "bridge"; id: number; outer: XZ[]; holes: XZ[][] }
  | { kind: "tree"; x: number; z: number; h: number; k: "mapped" | "approx" }
  | { kind: "landmark"; id: number; name: string; cat: string; x: number; z: number }
  // Schema v2 only; a v1 assembly skips these.
  | { kind: "point"; id: number; k: PointKind; x: number; z: number; ct?: string; nm?: string }
  | { kind: "landuse"; id: number; t: string; outer: XZ[]; holes: XZ[][] }
  | { kind: "barrier"; id: number; t: string; pts: XZ[] }
  | { kind: "power"; id: number; t: string; kv?: number; pts: XZ[] };

export type AssembleResult = {
  chunks: Map<string, ChunkFile>;
  counts: Record<string, number>;
  warnings: string[];
};

function flat(pts: XZ[]): number[] {
  const o: number[] = [];
  for (const [x, z] of pts) o.push(qCoord(x), qCoord(z));
  return o;
}

function emptyChunk(c: ChunkCoord, size: number, version: ChunkVersion): ChunkFile {
  const r = chunkRect(c.ix, c.iy, size);
  const chunk: ChunkFile = {
    v: version,
    ix: c.ix,
    iy: c.iy,
    origin: [r.minX, r.minZ],
    roads: [],
    buildings: [],
    water: [],
    canals: [],
    parks: [],
    rails: [],
    plazas: [],
    bridges: [],
    trees: [],
    landmarks: [],
    graph: { nodes: [], edges: [] },
  };
  if (version === 2) {
    chunk.points = [];
    chunk.landuse = [];
    chunk.barriers = [];
    chunk.power = [];
  }
  return chunk;
}

function polyRec(id: number, outer: XZ[], holes: XZ[][]): PolyRec {
  const rec: PolyRec = { id, outer: flat(outer) };
  if (holes.length) rec.holes = holes.map(flat);
  return rec;
}

function validRing(ring: XZ[], min = 3): boolean {
  if (ring.length < min) return false;
  for (const [x, z] of ring) if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return ringArea(ring) > 0.05;
}

/** Deterministic park trees. Positions are approximate, never mapped trunks. */
export function approximateParkTrees(osmId: number, outer: XZ[], step = 22, cap = 80): { x: number; z: number; h: number }[] {
  if (!validRing(outer)) return [];
  if (ringArea(outer) < 800) return [];
  const b = bboxOf(outer);
  const out: { x: number; z: number; h: number }[] = [];
  let n = 0;
  for (let z = b.minZ + step * 0.5; z < b.maxZ; z += step) {
    for (let x = b.minX + step * 0.5; x < b.maxX; x += step) {
      n++;
      const h1 = hash(osmId * 13 + n * 17);
      const h2 = hash(osmId * 29 + n * 31);
      const px = x + (h1 - 0.5) * step * 0.45;
      const pz = z + (h2 - 0.5) * step * 0.45;
      if (!pointRough(px, pz, outer)) continue;
      out.push({ x: px, z: pz, h: 5 + hash(osmId + n) * 7 });
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function pointRough(x: number, z: number, ring: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Adds the attributes that are set, after the v1 keys, so stripping them gives the v1 record back. */
function withAttrs<T extends object>(rec: T, attrs: object | undefined): T {
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined) (rec as Record<string, unknown>)[k] = v;
  return rec;
}

/**
 * Splits features into chunks. Version 1 writes exactly the v1 schema and
 * ignores v2 attributes and layers; version 2 writes the same v1 records with
 * their attributes appended, plus the v2 layers.
 */
export function assembleWorld(features: WorldFeature[], chunkSize: number, version: ChunkVersion = 1): AssembleResult {
  const v2 = version === 2;
  const chunks = new Map<string, ChunkFile>();
  const warnings: string[] = [];
  const counts: Record<string, number> = {
    roads: 0,
    buildings: 0,
    buildingsMeasured: 0,
    buildingsEstimated: 0,
    water: 0,
    canals: 0,
    parks: 0,
    rails: 0,
    plazas: 0,
    bridges: 0,
    treesMapped: 0,
    treesApprox: 0,
    landmarks: 0,
    skipped: 0,
    graphNodes: 0,
    graphEdges: 0,
  };
  if (v2) {
    for (const k of ["landuse", "barriers", "power", "graphSignals", "graphCrossings"]) counts[k] = 0;
  }
  const bump = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  const countAttrs = (prefix: string, attrs: object | undefined) => {
    if (!v2 || !attrs) return;
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined) bump(`${prefix}.${k}`);
  };
  const signalNodes = new Set<string>();
  const crossingNodes = new Set<string>();
  const roads: { wayId: number; cls: string; oneway: -1 | 0 | 1; pts: XZ[] }[] = [];

  const take = (ix: number, iy: number) => {
    const key = chunkKey(ix, iy);
    let c = chunks.get(key);
    if (!c) {
      c = emptyChunk({ ix, iy }, chunkSize, version);
      chunks.set(key, c);
    }
    return c;
  };

  for (const f of features) {
    if (f.kind === "road") {
      if (f.pts.length < 2) {
        counts.skipped++;
        warnings.push(`road ${f.id} has fewer than 2 points`);
        continue;
      }
      counts.roads++;
      countAttrs("roads", f.attrs);
      roads.push({ wayId: f.id, cls: f.cls, oneway: f.oneway, pts: f.pts });
      for (const part of splitPolylineByChunks(f.pts, chunkSize)) {
        const rec: RoadRec = {
          id: f.id,
          cls: f.cls,
          w: qCoord(f.width),
          we: f.widthEstimated,
          y: qCoord(f.y),
          bridge: f.bridge,
          pts: flat(part.pts),
        };
        take(part.ix, part.iy).roads.push(v2 ? withAttrs(rec, f.attrs) : rec);
      }
    } else if (f.kind === "canal" || f.kind === "rail") {
      if (f.pts.length < 2) {
        counts.skipped++;
        continue;
      }
      counts[f.kind === "canal" ? "canals" : "rails"]++;
      for (const part of splitPolylineByChunks(f.pts, chunkSize)) {
        const chunk = take(part.ix, part.iy);
        if (f.kind === "canal") {
          const rec: CanalRec = { id: f.id, w: f.width, pts: flat(part.pts) };
          chunk.canals.push(rec);
        } else {
          const rec: RailRec = { id: f.id, y: qCoord(f.y), pts: flat(part.pts) };
          chunk.rails.push(rec);
        }
      }
    } else if (f.kind === "tree") {
      if (!Number.isFinite(f.x) || !Number.isFinite(f.z)) {
        counts.skipped++;
        continue;
      }
      const c = takeChunkOf(take, f.x, f.z, chunkSize);
      const rec: TreeRec = { x: qCoord(f.x), z: qCoord(f.z), h: qCoord(f.h), k: f.k };
      c.trees.push(rec);
      counts[f.k === "mapped" ? "treesMapped" : "treesApprox"]++;
    } else if (f.kind === "landmark") {
      const c = takeChunkOf(take, f.x, f.z, chunkSize);
      const rec: LandmarkRec = { id: f.id, name: f.name, cat: f.cat, x: qCoord(f.x), z: qCoord(f.z) };
      c.landmarks.push(rec);
      counts.landmarks++;
    } else if (f.kind === "point") {
      if (!v2) continue;
      if (!Number.isFinite(f.x) || !Number.isFinite(f.z)) {
        counts.skipped++;
        continue;
      }
      const rec: PointRec = { id: f.id, k: f.k, x: qCoord(f.x), z: qCoord(f.z) };
      if (f.ct) rec.ct = f.ct;
      if (f.nm) rec.nm = f.nm;
      takeChunkOf(take, f.x, f.z, chunkSize).points!.push(rec);
      bump(`points.${f.k}`);
      if (f.k === "signal") signalNodes.add(graphNodeId(f.x, f.z));
      if (f.k === "crossing") crossingNodes.add(graphNodeId(f.x, f.z));
    } else if (f.kind === "barrier" || f.kind === "power") {
      if (!v2) continue;
      if (f.pts.length < 2) {
        counts.skipped++;
        continue;
      }
      bump(f.kind === "barrier" ? "barriers" : "power");
      for (const part of splitPolylineByChunks(f.pts, chunkSize)) {
        const chunk = take(part.ix, part.iy);
        if (f.kind === "barrier") {
          const rec: LineRec = { id: f.id, t: f.t, pts: flat(part.pts) };
          chunk.barriers!.push(rec);
        } else {
          const rec: PowerRec = { id: f.id, t: f.t, pts: flat(part.pts) };
          if (f.kv) rec.kv = f.kv;
          chunk.power!.push(rec);
        }
      }
    } else if (f.kind === "landuse") {
      if (!v2) continue;
      if (!validRing(f.outer)) {
        counts.skipped++;
        continue;
      }
      const parts = splitPolygonByChunks(f.outer, f.holes.filter((h) => validRing(h)), chunkSize);
      if (!parts.length) {
        counts.skipped++;
        continue;
      }
      bump("landuse");
      for (const part of parts) {
        const rec: LanduseRec = { ...polyRec(f.id, part.outer, part.holes), t: f.t };
        take(part.ix, part.iy).landuse!.push(rec);
      }
    } else {
      if (!validRing(f.outer)) {
        counts.skipped++;
        warnings.push(`${f.kind} ${f.id} dropped: invalid ring`);
        continue;
      }
      const holes = f.holes.filter((h) => validRing(h));
      const parts = splitPolygonByChunks(f.outer, holes, chunkSize);
      if (!parts.length) {
        counts.skipped++;
        continue;
      }
      const bucket =
        f.kind === "building"
          ? "buildings"
          : f.kind === "water"
            ? "water"
            : f.kind === "park"
              ? "parks"
              : f.kind === "plaza"
                ? "plazas"
                : "bridges";
      counts[bucket]++;
      if (f.kind === "building") {
        counts[f.hs === "measured" ? "buildingsMeasured" : "buildingsEstimated"]++;
        countAttrs("buildings", f.attrs);
      }
      for (const part of parts) {
        const chunk = take(part.ix, part.iy);
        if (f.kind === "building") {
          const rec: BuildingRec = {
            id: f.id,
            h: qCoord(f.h),
            hs: f.hs,
            outer: flat(part.outer),
          };
          if (part.holes.length) rec.holes = part.holes.map(flat);
          chunk.buildings.push(v2 ? withAttrs(rec, f.attrs) : rec);
        } else if (f.kind === "water") chunk.water.push(polyRec(f.id, part.outer, part.holes));
        else if (f.kind === "park") chunk.parks.push(polyRec(f.id, part.outer, part.holes));
        else if (f.kind === "plaza") chunk.plazas.push(polyRec(f.id, part.outer, part.holes));
        else chunk.bridges.push(polyRec(f.id, part.outer, part.holes));
      }
    }
  }

  const graph = buildRoadGraph(roads, chunkSize);
  counts.graphNodes = graph.nodes.length;
  counts.graphEdges = graph.edges.length;
  const nodesById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const edgesByChunk = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    const key = edgeChunkKey(e, chunkSize);
    const list = edgesByChunk.get(key);
    if (list) list.push(e);
    else edgesByChunk.set(key, [e]);
  }
  for (const [key, edges] of edgesByChunk) {
    const [ix, iy] = key.split("_").map(Number);
    const chunk = take(ix, iy);
    const nodeIds = new Set<string>();
    const edgeRecs: EdgeRec[] = edges.map((e) => {
      nodeIds.add(e.a);
      nodeIds.add(e.b);
      return {
        id: e.id,
        a: e.a,
        b: e.b,
        way: e.way,
        cls: e.cls,
        oneway: e.oneway,
        pts: flat(e.pts),
      };
    });
    const nodeRecs: NodeRec[] = [];
    for (const id of nodeIds) {
      const n = nodesById.get(id);
      if (!n) continue;
      const rec: NodeRec = { id, x: qCoord(n.x), z: qCoord(n.z) };
      if (v2 && signalNodes.has(id)) rec.sig = 1;
      if (v2 && crossingNodes.has(id)) rec.cr = 1;
      nodeRecs.push(rec);
    }
    chunk.graph.nodes.push(...nodeRecs);
    chunk.graph.edges.push(...edgeRecs);
  }

  if (v2) {
    for (const n of graph.nodes) {
      if (signalNodes.has(n.id)) counts.graphSignals++;
      if (crossingNodes.has(n.id)) counts.graphCrossings++;
    }
  }
  return { chunks, counts, warnings };
}

function takeChunkOf(
  take: (ix: number, iy: number) => ChunkFile,
  x: number,
  z: number,
  size: number,
): ChunkFile {
  return take(Math.floor(x / size), Math.floor(z / size));
}

export function chunkFeatureCounts(c: ChunkFile): Record<string, number> {
  return {
    roads: c.roads.length,
    buildings: c.buildings.length,
    water: c.water.length,
    canals: c.canals.length,
    parks: c.parks.length,
    rails: c.rails.length,
    plazas: c.plazas.length,
    bridges: c.bridges.length,
    trees: c.trees.length,
    landmarks: c.landmarks.length,
    graphEdges: c.graph.edges.length,
    ...(c.v === 2
      ? {
          points: c.points?.length ?? 0,
          landuse: c.landuse?.length ?? 0,
          barriers: c.barriers?.length ?? 0,
          power: c.power?.length ?? 0,
        }
      : {}),
  };
}
