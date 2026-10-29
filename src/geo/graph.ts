import { chunkKey, worldToChunk } from "./chunks.ts";
import { insertChunkCrossings, type XZ } from "./geometry.ts";

/** Graph nodes snap to this grid so shared intersections get one stable id. */
export const GRAPH_SNAP_M = 1;

export type GraphNode = { id: string; x: number; z: number };
export type GraphEdge = {
  id: string;
  a: string;
  b: string;
  way: number;
  cls: string;
  oneway: -1 | 0 | 1;
  pts: XZ[];
};

export type RoadGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type GraphRoad = {
  wayId: number;
  cls: string;
  oneway: -1 | 0 | 1;
  pts: XZ[];
};

export function graphNodeId(x: number, z: number): string {
  const sx = Math.round(x / GRAPH_SNAP_M);
  const sz = Math.round(z / GRAPH_SNAP_M);
  return `n${sx}_${sz}`;
}

function onBoundary(p: XZ, size: number): boolean {
  const x = p[0] / size;
  const z = p[1] / size;
  return Math.abs(x - Math.round(x)) < 1e-4 || Math.abs(z - Math.round(z)) < 1e-4;
}

export function buildRoadGraph(roads: GraphRoad[], chunkSize: number): RoadGraph {
  const prepared = roads
    .filter((r) => r.pts.length >= 2)
    .map((r) => ({ ...r, pts: insertChunkCrossings(r.pts, chunkSize) }));

  const wayHits = new Map<string, number>();
  for (const road of prepared) {
    const seen = new Set<string>();
    for (const p of road.pts) {
      const id = graphNodeId(p[0], p[1]);
      if (seen.has(id)) continue;
      seen.add(id);
      wayHits.set(id, (wayHits.get(id) || 0) + 1);
    }
  }

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const ensure = (p: XZ): string => {
    const id = graphNodeId(p[0], p[1]);
    if (!nodes.has(id)) nodes.set(id, { id, x: p[0], z: p[1] });
    return id;
  };

  for (const road of prepared) {
    const keyAt = (index: number) => {
      const p = road.pts[index];
      const id = graphNodeId(p[0], p[1]);
      if (index === 0 || index === road.pts.length - 1) return true;
      if ((wayHits.get(id) || 0) >= 2) return true;
      if (onBoundary(p, chunkSize)) return true;
      return false;
    };
    let last = 0;
    let edgeIndex = 0;
    for (let i = 1; i < road.pts.length; i++) {
      if (!keyAt(i) && i !== road.pts.length - 1) continue;
      if (!keyAt(i)) continue;
      const slice = road.pts.slice(last, i + 1);
      if (slice.length >= 2) {
        const a = ensure(slice[0]);
        const b = ensure(slice[slice.length - 1]);
        if (a !== b) {
          edges.push({
            id: `w${road.wayId}:${edgeIndex}`,
            a,
            b,
            way: road.wayId,
            cls: road.cls,
            oneway: road.oneway,
            pts: slice,
          });
          edgeIndex++;
        }
      }
      last = i;
    }
  }

  return { nodes: [...nodes.values()], edges };
}

export type RoadIndex = {
  cell: number;
  buckets: Map<string, number[]>;
  edges: GraphEdge[];
};

export function indexEdges(edges: GraphEdge[], cell = 80): RoadIndex {
  const buckets = new Map<string, number[]>();
  edges.forEach((e, i) => {
    for (const [x, z] of e.pts) {
      const k = `${Math.floor(x / cell)}_${Math.floor(z / cell)}`;
      const arr = buckets.get(k);
      if (arr) {
        if (arr[arr.length - 1] !== i) arr.push(i);
      } else buckets.set(k, [i]);
    }
  });
  return { cell, buckets, edges };
}

export type NearestHit = {
  edgeId: string;
  way: number;
  cls: string;
  dist: number;
  x: number;
  z: number;
};

export function nearestRoad(index: RoadIndex, x: number, z: number, maxDist = 60): NearestHit | null {
  const c = index.cell;
  const cx = Math.floor(x / c);
  const cz = Math.floor(z / c);
  const reach = Math.ceil(maxDist / c);
  let best: NearestHit | null = null;
  const seen = new Set<number>();
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const bucket = index.buckets.get(`${cx + dx}_${cz + dz}`);
      if (!bucket) continue;
      for (const ei of bucket) {
        if (seen.has(ei)) continue;
        seen.add(ei);
        const e = index.edges[ei];
        for (let i = 0; i < e.pts.length - 1; i++) {
          const ax = e.pts[i][0];
          const az = e.pts[i][1];
          const bx = e.pts[i + 1][0];
          const bz = e.pts[i + 1][1];
          const vx = bx - ax;
          const vz = bz - az;
          const len2 = vx * vx + vz * vz || 1;
          let t = ((x - ax) * vx + (z - az) * vz) / len2;
          if (t < 0) t = 0;
          else if (t > 1) t = 1;
          const px = ax + vx * t;
          const pz = az + vz * t;
          const dist = Math.hypot(x - px, z - pz);
          if (dist <= maxDist && (!best || dist < best.dist)) {
            best = { edgeId: e.id, way: e.way, cls: e.cls, dist, x: px, z: pz };
          }
        }
      }
    }
  }
  return best;
}

export function edgeChunkKey(edge: GraphEdge, chunkSize: number): string {
  const a = edge.pts[0];
  const b = edge.pts[edge.pts.length - 1];
  const c = worldToChunk((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, chunkSize);
  return chunkKey(c.ix, c.iy);
}
