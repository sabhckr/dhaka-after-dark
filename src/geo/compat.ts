import type { BuildingRec, ChunkFile, NodeRec, RoadRec } from "./types.ts";

/** Keys a v1 record had. Anything else on a road, building or graph node is a v2 attribute. */
const V1_ROAD_KEYS = ["id", "cls", "w", "we", "y", "bridge", "pts"] as const;
const V1_BUILDING_KEYS = ["id", "h", "hs", "outer", "holes"] as const;
const V1_NODE_KEYS = ["id", "x", "z"] as const;
const V2_LAYERS = ["points", "landuse", "barriers", "power"] as const;

function pick<T extends object>(rec: T, keys: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (rec as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * The v1 view of any chunk: v2 attributes and layers dropped, key order as the
 * v1 generator wrote it. `JSON.stringify(toV1(v2))` equals the v1 file when the
 * migration left geometry alone, which is what the staged diff checks.
 */
export function toV1(c: ChunkFile): ChunkFile {
  return {
    v: 1,
    ix: c.ix,
    iy: c.iy,
    origin: c.origin,
    roads: c.roads.map((r) => pick<RoadRec>(r, V1_ROAD_KEYS)),
    buildings: c.buildings.map((b) => pick<BuildingRec>(b, V1_BUILDING_KEYS)),
    water: c.water,
    canals: c.canals,
    parks: c.parks,
    rails: c.rails,
    plazas: c.plazas,
    bridges: c.bridges,
    trees: c.trees,
    landmarks: c.landmarks,
    graph: {
      nodes: c.graph.nodes.map((n) => pick<NodeRec>(n, V1_NODE_KEYS)),
      edges: c.graph.edges,
    },
  };
}

/**
 * What the runtime works with: any supported version, with every v2 layer
 * present (empty for v1 data), so code may read `chunk.points` without a
 * version check. v1 records are left as they are; their attributes are simply absent.
 */
export function normalizeChunk(c: ChunkFile): ChunkFile {
  if (V2_LAYERS.every((k) => Array.isArray(c[k]))) return c;
  const out: ChunkFile = { ...c };
  for (const k of V2_LAYERS) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

/** v1 data in the v2 shape, with no attributes: what a v2 reader sees when only v1 files exist. */
export function upgradeV1(c: ChunkFile): ChunkFile {
  return { ...normalizeChunk(toV1(c)), v: 2 };
}
