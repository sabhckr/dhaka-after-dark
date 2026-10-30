import { chunkRect, chunksOverlappingRect, type Rect } from "./chunks.ts";

export type XZ = [number, number];

export type BBox = { minX: number; minZ: number; maxX: number; maxZ: number };

export function bboxOf(pts: XZ[]): BBox {
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

export function ringArea(ring: XZ[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) / 2;
}

export function closeRing(ring: XZ[]): XZ[] {
  if (ring.length === 0) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) return ring;
  return [...ring, [a[0], a[1]]];
}

export function pointInRing(x: number, z: number, ring: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const zi = ring[i][1];
    const xj = ring[j][0];
    const zj = ring[j][1];
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export type PolyRings = { outer: XZ[]; holes: XZ[][] };

export function pointInPolys(x: number, z: number, polys: PolyRings[]): boolean {
  for (const p of polys) {
    if (!pointInRing(x, z, p.outer)) continue;
    let inHole = false;
    for (const h of p.holes) {
      if (pointInRing(x, z, h)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

export function douglasPeucker(pts: XZ[], tol: number): XZ[] {
  if (pts.length < 3 || tol <= 0) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    const ax = pts[s][0];
    const az = pts[s][1];
    const bx = pts[e][0];
    const bz = pts[e][1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    for (let i = s + 1; i < e; i++) {
      const px = pts[i][0];
      const pz = pts[i][1];
      const t = ((px - ax) * dx + (pz - az) * dz) / len2;
      const qx = ax + dx * t;
      const qz = az + dz * t;
      const d = (px - qx) ** 2 + (pz - qz) ** 2;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2 && idx >= 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: XZ[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/** 1 cm key for a source vertex. Copies of one OSM node produce the same key. */
export function vertexKey(x: number, z: number): string {
  return `${Math.round(x * 100)}_${Math.round(z * 100)}`;
}

/**
 * Douglas-Peucker that never drops a pinned vertex. A road vertex shared with
 * another road is a junction: removing it from one way (it is often collinear on
 * the through road) disconnects the T in the graph. The line is simplified
 * between pins, so pins and both ends always survive.
 */
export function douglasPeuckerPinned(pts: XZ[], tol: number, pinned: (p: XZ) => boolean): XZ[] {
  if (pts.length < 3) return pts.slice();
  const out: XZ[] = [];
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (i !== pts.length - 1 && !pinned(pts[i])) continue;
    const run = douglasPeucker(pts.slice(start, i + 1), tol);
    for (let k = out.length ? 1 : 0; k < run.length; k++) out.push(run[k]);
    start = i;
  }
  return out;
}

const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

function outCode(x: number, z: number, r: Rect): number {
  let c = INSIDE;
  if (x < r.minX) c |= LEFT;
  else if (x > r.maxX) c |= RIGHT;
  if (z < r.minZ) c |= BOTTOM;
  else if (z > r.maxZ) c |= TOP;
  return c;
}

/** Inclusive rectangle clip. Boundary points are kept so neighbouring chunks meet. */
export function clipSegmentToRect(a: XZ, b: XZ, r: Rect): [XZ, XZ] | null {
  let ax = a[0];
  let az = a[1];
  let bx = b[0];
  let bz = b[1];
  let ca = outCode(ax, az, r);
  let cb = outCode(bx, bz, r);
  for (let guard = 0; guard < 8; guard++) {
    if (!(ca | cb)) return [[ax, az], [bx, bz]];
    if (ca & cb) return null;
    const c = ca || cb;
    let x = 0;
    let z = 0;
    if (c & TOP) {
      x = ax + ((bx - ax) * (r.maxZ - az)) / (bz - az);
      z = r.maxZ;
    } else if (c & BOTTOM) {
      x = ax + ((bx - ax) * (r.minZ - az)) / (bz - az);
      z = r.minZ;
    } else if (c & RIGHT) {
      z = az + ((bz - az) * (r.maxX - ax)) / (bx - ax);
      x = r.maxX;
    } else {
      z = az + ((bz - az) * (r.minX - ax)) / (bx - ax);
      x = r.minX;
    }
    if (c === ca) {
      ax = x;
      az = z;
      ca = outCode(ax, az, r);
    } else {
      bx = x;
      bz = z;
      cb = outCode(bx, bz, r);
    }
  }
  return null;
}

function near(a: XZ, b: XZ): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

export function clipPolylineToRect(pts: XZ[], r: Rect): XZ[][] {
  if (pts.length < 2) return [];
  const parts: XZ[][] = [];
  let cur: XZ[] | null = null;
  const flush = () => {
    if (cur && cur.length >= 2) parts.push(cur);
    cur = null;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const clipped = clipSegmentToRect(pts[i], pts[i + 1], r);
    if (!clipped) {
      flush();
      continue;
    }
    const [p, q] = clipped;
    if (!cur) cur = [p];
    else if (!near(cur[cur.length - 1], p)) {
      flush();
      cur = [p];
    }
    cur.push(q);
  }
  flush();
  return parts;
}

function clipPolyEdge(poly: XZ[], inside: (p: XZ) => boolean, intersect: (a: XZ, b: XZ) => XZ): XZ[] {
  if (poly.length === 0) return [];
  const out: XZ[] = [];
  let prev = poly[poly.length - 1];
  let prevIn = inside(prev);
  for (const cur of poly) {
    const curIn = inside(cur);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) out.push(intersect(prev, cur));
    prev = cur;
    prevIn = curIn;
  }
  return out;
}

/** Sutherland–Hodgman against an axis-aligned rectangle (convex). */
export function clipPolygonToRect(ring: XZ[], r: Rect): XZ[] {
  let poly = ring;
  if (poly.length > 1 && near(poly[0], poly[poly.length - 1])) poly = poly.slice(0, -1);
  if (poly.length < 3) return [];
  poly = clipPolyEdge(
    poly,
    (p) => p[0] >= r.minX,
    (a, b) => {
      const t = (r.minX - a[0]) / (b[0] - a[0]);
      return [r.minX, a[1] + t * (b[1] - a[1])];
    },
  );
  poly = clipPolyEdge(
    poly,
    (p) => p[0] <= r.maxX,
    (a, b) => {
      const t = (r.maxX - a[0]) / (b[0] - a[0]);
      return [r.maxX, a[1] + t * (b[1] - a[1])];
    },
  );
  poly = clipPolyEdge(
    poly,
    (p) => p[1] >= r.minZ,
    (a, b) => {
      const t = (r.minZ - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), r.minZ];
    },
  );
  poly = clipPolyEdge(
    poly,
    (p) => p[1] <= r.maxZ,
    (a, b) => {
      const t = (r.maxZ - a[1]) / (b[1] - a[1]);
      return [a[0] + t * (b[0] - a[0]), r.maxZ];
    },
  );
  return poly.length >= 3 ? poly : [];
}

export function splitPolylineByChunks(pts: XZ[], size: number): { ix: number; iy: number; pts: XZ[] }[] {
  if (pts.length < 2) return [];
  const rect = bboxOf(pts);
  rect.maxX += 1e-6;
  rect.maxZ += 1e-6;
  const out: { ix: number; iy: number; pts: XZ[] }[] = [];
  for (const c of chunksOverlappingRect(rect, size)) {
    const parts = clipPolylineToRect(pts, chunkRect(c.ix, c.iy, size));
    for (const part of parts) out.push({ ix: c.ix, iy: c.iy, pts: part });
  }
  return out;
}

export function splitPolygonByChunks(
  ring: XZ[],
  holes: XZ[][],
  size: number,
): { ix: number; iy: number; outer: XZ[]; holes: XZ[][] }[] {
  if (ring.length < 3) return [];
  const rect = bboxOf(ring);
  rect.maxX += 1e-6;
  rect.maxZ += 1e-6;
  const out: { ix: number; iy: number; outer: XZ[]; holes: XZ[][] }[] = [];
  for (const c of chunksOverlappingRect(rect, size)) {
    const cr = chunkRect(c.ix, c.iy, size);
    const outer = clipPolygonToRect(ring, cr);
    if (outer.length < 3) continue;
    const clippedHoles: XZ[][] = [];
    for (const h of holes) {
      const ch = clipPolygonToRect(h, cr);
      if (ch.length >= 3) clippedHoles.push(ch);
    }
    out.push({ ix: c.ix, iy: c.iy, outer, holes: clippedHoles });
  }
  return out;
}

/** Insert vertices where a polyline crosses chunk grid lines, so graphs can share a node. */
export function insertChunkCrossings(pts: XZ[], size: number): XZ[] {
  if (pts.length === 0) return [];
  const out: XZ[] = [[pts[0][0], pts[0][1]]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const hits: { t: number; p: XZ }[] = [];
    if (Math.abs(b[0] - a[0]) > 1e-12) {
      const x0 = Math.min(a[0], b[0]);
      const x1 = Math.max(a[0], b[0]);
      for (let k = Math.floor(x0 / size) + 1; k <= Math.floor(x1 / size); k++) {
        const x = k * size;
        const t = (x - a[0]) / (b[0] - a[0]);
        if (t > 1e-8 && t < 1 - 1e-8) hits.push({ t, p: [x, a[1] + t * (b[1] - a[1])] });
      }
    }
    if (Math.abs(b[1] - a[1]) > 1e-12) {
      const z0 = Math.min(a[1], b[1]);
      const z1 = Math.max(a[1], b[1]);
      for (let k = Math.floor(z0 / size) + 1; k <= Math.floor(z1 / size); k++) {
        const z = k * size;
        const t = (z - a[1]) / (b[1] - a[1]);
        if (t > 1e-8 && t < 1 - 1e-8) hits.push({ t, p: [a[0] + t * (b[0] - a[0]), z] });
      }
    }
    hits.sort((p, q) => p.t - q.t);
    let lastT = -1;
    for (const h of hits) {
      if (h.t - lastT < 1e-8) continue;
      lastT = h.t;
      out.push(h.p);
    }
    out.push([b[0], b[1]]);
  }
  return out;
}

/**
 * Even-odd coverage mask. Cells the boundary passes through (plus a 1-cell halo)
 * are "edge": callers must clip precisely. Interior cells are a fast accept.
 */
export class CoverageMask {
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly cols: number;
  readonly rows: number;
  readonly mask: Uint8Array;

  constructor(polys: PolyRings[], cell = 20) {
    this.cell = cell;
    const rings: XZ[][] = [];
    for (const p of polys) {
      rings.push(p.outer);
      for (const h of p.holes) rings.push(h);
    }
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const ring of rings) {
      for (const [x, z] of ring) {
        if (x < minX) minX = x;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (z > maxZ) maxZ = z;
      }
    }
    if (!Number.isFinite(minX)) {
      this.minX = 0;
      this.minZ = 0;
      this.cols = 0;
      this.rows = 0;
      this.mask = new Uint8Array(0);
      return;
    }
    this.minX = Math.floor(minX / cell) * cell;
    this.minZ = Math.floor(minZ / cell) * cell;
    this.cols = Math.max(1, Math.ceil((maxX - this.minX) / cell));
    this.rows = Math.max(1, Math.ceil((maxZ - this.minZ) / cell));
    this.mask = new Uint8Array(this.cols * this.rows);
    const edges: { x0: number; z0: number; x1: number; z1: number }[] = [];
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        edges.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1] });
      }
    }
    for (let row = 0; row < this.rows; row++) {
      const z = this.minZ + (row + 0.5) * cell;
      const xs: number[] = [];
      for (const e of edges) {
        if (e.z0 === e.z1) continue;
        const zMin = e.z0 < e.z1 ? e.z0 : e.z1;
        const zMax = e.z0 < e.z1 ? e.z1 : e.z0;
        if (z < zMin || z >= zMax) continue;
        const t = (z - e.z0) / (e.z1 - e.z0);
        xs.push(e.x0 + t * (e.x1 - e.x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.floor((xs[k] - this.minX) / cell));
        const c1 = Math.min(this.cols - 1, Math.floor((xs[k + 1] - this.minX) / cell));
        for (let c = c0; c <= c1; c++) this.mask[row * this.cols + c] = 1;
      }
    }
    const mark = (x: number, z: number) => {
      const c = Math.floor((x - this.minX) / cell);
      const r = Math.floor((z - this.minZ) / cell);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const cc = c + dc;
          const rr = r + dr;
          if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) continue;
          const i = rr * this.cols + cc;
          if (this.mask[i] !== 2) this.mask[i] = 2;
        }
      }
    };
    for (const e of edges) {
      const dist = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
      const steps = Math.max(1, Math.ceil(dist / (cell * 0.5)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        mark(e.x0 + (e.x1 - e.x0) * t, e.z0 + (e.z1 - e.z0) * t);
      }
    }
  }

  cellAt(x: number, z: number): number {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((z - this.minZ) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 0;
    return this.mask[r * this.cols + c];
  }

  classifyBBox(b: BBox): "in" | "out" | "edge" {
    if (this.cols === 0) return "out";
    const c0 = Math.floor((b.minX - this.minX) / this.cell);
    const r0 = Math.floor((b.minZ - this.minZ) / this.cell);
    const c1 = Math.floor((b.maxX - this.minX) / this.cell);
    const r1 = Math.floor((b.maxZ - this.minZ) / this.cell);
    let sawIn = false;
    let sawOut = false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) {
          sawOut = true;
          continue;
        }
        const v = this.mask[r * this.cols + c];
        if (v === 2) return "edge";
        if (v === 1) sawIn = true;
        else sawOut = true;
        if (sawIn && sawOut) return "edge";
      }
    }
    if (sawIn && !sawOut) return "in";
    return "out";
  }
}

/**
 * Visual-only centreline nudge. Does not insert vertices and does not run a spline
 * through pinned points (road ends, chunk joins, intersection snaps).
 * Straight runs and sharp corners stay on the source polyline so the mesh still
 * meets the logical graph. Displacement is capped in metres.
 */
export function nudgeVerifiedCurves(flat: number[], pinned: readonly boolean[], maxMove = 1.25): number[] {
  const n = flat.length / 2;
  if (n < 3 || pinned.length < n) return flat.slice();
  const out = flat.slice();
  for (let i = 1; i < n - 1; i++) {
    if (pinned[i]) continue;
    const ax = flat[(i - 1) * 2];
    const az = flat[(i - 1) * 2 + 1];
    const bx = flat[i * 2];
    const bz = flat[i * 2 + 1];
    const cx = flat[(i + 1) * 2];
    const cz = flat[(i + 1) * 2 + 1];
    const abx = bx - ax;
    const abz = bz - az;
    const bcx = cx - bx;
    const bcz = cz - bz;
    const lab = Math.hypot(abx, abz) || 1;
    const lbc = Math.hypot(bcx, bcz) || 1;
    const dot = (abx * bcx + abz * bcz) / (lab * lbc);
    // Colinear OSM points are already the curve samples. Sharp kinks are junctions.
    if (dot > 0.992 || dot < 0.72) continue;
    let nx = ax * 0.25 + bx * 0.5 + cx * 0.25;
    let nz = az * 0.25 + bz * 0.5 + cz * 0.25;
    let dx = nx - bx;
    let dz = nz - bz;
    const mag = Math.hypot(dx, dz);
    if (mag < 1e-4) continue;
    if (mag > maxMove) {
      dx *= maxMove / mag;
      dz *= maxMove / mag;
      nx = bx + dx;
      nz = bz + dz;
    }
    out[i * 2] = nx;
    out[i * 2 + 1] = nz;
  }
  return out;
}
