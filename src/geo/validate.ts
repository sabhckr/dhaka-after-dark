import type { ChunkFile, Manifest, PointKind, Sidewalk } from "./types.ts";

const POINT_KINDS = new Set<PointKind>(["signal", "crossing", "bus_stop", "platform", "lamp", "tower", "gate"]);
const SIDEWALKS = new Set<Sidewalk>(["both", "left", "right", "no", "separate"]);

const optNumber = (v: unknown, min: number, max: number) =>
  v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max);
const optString = (v: unknown) => v === undefined || (typeof v === "string" && v.length > 0 && v.length <= 80);

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
  if (d.v !== 1 && d.v !== 2) errors.push("unsupported chunk version");
  if (!Number.isInteger(d.ix) || !Number.isInteger(d.iy)) errors.push("chunk index");
  if (!Array.isArray(d.roads)) errors.push("roads missing");
  for (const r of d.roads || []) {
    if (!finiteFlat(r.pts, 4)) errors.push(`road ${r.id} has invalid points`);
    if (!Number.isFinite(r.w) || r.w <= 0) errors.push(`road ${r.id} width`);
    if (d.v === 2) {
      if (!optNumber(r.ln, 1, 12) || !optNumber(r.mx, 1, 150) || !optNumber(r.ly, -5, 10)) errors.push(`road ${r.id} attribute`);
      if (r.sw !== undefined && !SIDEWALKS.has(r.sw)) errors.push(`road ${r.id} sidewalk`);
      if (r.lit !== undefined && r.lit !== 0 && r.lit !== 1) errors.push(`road ${r.id} lit`);
      if (!optString(r.sf) || !optString(r.nm) || !optString(r.nme)) errors.push(`road ${r.id} label`);
    }
  }
  for (const b of d.buildings || []) {
    if (!finiteFlat(b.outer, 6)) errors.push(`building ${b.id} outer`);
    if (!Number.isFinite(b.h) || b.h <= 0) errors.push(`building ${b.id} height`);
    if (b.hs !== "measured" && b.hs !== "estimated") errors.push(`building ${b.id} height source`);
    for (const h of b.holes || []) {
      if (!finiteFlat(h, 6)) errors.push(`building ${b.id} hole`);
    }
    if (d.v === 2) {
      if (!optNumber(b.lv, 0.5, 150) || !optNumber(b.mlv, 0.5, 150) || !optNumber(b.mh, 0, 600) || !optNumber(b.ly, -5, 10)) {
        errors.push(`building ${b.id} attribute`);
      }
      if (!optString(b.t) || !optString(b.mat) || !optString(b.roof) || !optString(b.nm)) errors.push(`building ${b.id} label`);
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
  if (d.v === 2) {
    for (const key of ["points", "landuse", "barriers", "power"] as const) {
      if (!Array.isArray(d[key])) errors.push(`${key} missing`);
    }
    for (const p of d.points || []) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !POINT_KINDS.has(p.k)) errors.push(`point ${p.id}`);
    }
    for (const p of d.landuse || []) {
      if (!finiteFlat(p.outer, 6) || typeof p.t !== "string" || !p.t) errors.push(`landuse ${p.id}`);
    }
    for (const l of [...(d.barriers || []), ...(d.power || [])]) {
      if (!finiteFlat(l.pts, 4) || typeof l.t !== "string") errors.push(`line ${l.id}`);
    }
  }
  return errors;
}

export function validateManifest(data: unknown): string[] {
  const errors: string[] = [];
  if (!data || typeof data !== "object") return ["manifest is not an object"];
  const m = data as Partial<Manifest>;
  if (m.v !== 1 && m.v !== 2) errors.push("manifest version");
  if (m.v === 2) {
    if (!Array.isArray(m.fields)) errors.push("fields");
    for (const f of m.fields || []) {
      if (f.src !== "osm" || !Array.isArray(f.tags) || !Number.isInteger(f.count)) errors.push(`field ${f.field}`);
    }
  }
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
