import type { ChunkFile, Manifest } from "./types.ts";

function finiteFlat(pts: number[] | undefined, minLen: number): boolean {
  if (!pts || pts.length < minLen || pts.length % 2 !== 0) return false;
  for (const n of pts) if (!Number.isFinite(n)) return false;
  return true;
}

/** Returns human-readable problems. Empty array means the chunk is usable. */
export function validateChunk(data: unknown): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== "object") return ["chunk is not an object"];
  const d = data as Partial<ChunkFile>;
  if (d.v !== 1) errors.push("unsupported chunk version");
  if (!Number.isInteger(d.ix) || !Number.isInteger(d.iy)) errors.push("chunk index");
  if (!Array.isArray(d.roads)) errors.push("roads missing");
  for (const r of d.roads || []) {
    if (!finiteFlat(r.pts, 4)) errors.push(`road ${r.id} has invalid points`);
    if (!Number.isFinite(r.w) || r.w <= 0) errors.push(`road ${r.id} width`);
  }
  for (const b of d.buildings || []) {
    if (!finiteFlat(b.outer, 6)) errors.push(`building ${b.id} outer`);
    if (!Number.isFinite(b.h) || b.h <= 0) errors.push(`building ${b.id} height`);
    if (b.hs !== "measured" && b.hs !== "estimated") errors.push(`building ${b.id} height source`);
    for (const h of b.holes || []) {
      if (!finiteFlat(h, 6)) errors.push(`building ${b.id} hole`);
    }
  }
  for (const list of [d.water, d.parks, d.plazas, d.bridges]) {
    for (const p of list || []) {
      if (!finiteFlat(p.outer, 6)) errors.push(`polygon ${p.id} outer`);
    }
  }
  for (const c of d.canals || []) if (!finiteFlat(c.pts, 4)) errors.push(`canal ${c.id}`);
  for (const c of d.rails || []) if (!finiteFlat(c.pts, 4)) errors.push(`rail ${c.id}`);
  for (const t of d.trees || []) {
    if (!Number.isFinite(t.x) || !Number.isFinite(t.z) || !Number.isFinite(t.h)) errors.push("tree");
    if (t.k !== "mapped" && t.k !== "approx") errors.push("tree kind");
  }
  if (!d.graph || !Array.isArray(d.graph.nodes) || !Array.isArray(d.graph.edges)) errors.push("graph");
  return errors;
}

export function validateManifest(data: unknown): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== "object") return ["manifest is not an object"];
  const m = data as Partial<Manifest>;
  if (m.v !== 1) errors.push("manifest version");
  if (m.crs !== "EPSG:32646") errors.push("crs");
  if (!m.origin || m.origin.easting !== 230000 || m.origin.northing !== 2615000) errors.push("origin");
  if (!m.boundary || (m.boundary.status !== "osm-relation" && m.boundary.status !== "provisional-bbox")) {
    errors.push("boundary status");
  }
  if (!Array.isArray(m.chunks)) errors.push("chunks");
  const seen = new Set<string>();
  for (const c of m.chunks || []) {
    if (seen.has(c.key)) errors.push(`duplicate chunk ${c.key}`);
    seen.add(c.key);
    if (c.key !== `${c.ix}_${c.iy}`) errors.push(`chunk key ${c.key}`);
  }
  if (!Array.isArray(m.sources) || m.sources.length === 0) errors.push("sources");
  if (!Array.isArray(m.spawns) || m.spawns.length === 0) errors.push("spawns");
  return errors;
}
