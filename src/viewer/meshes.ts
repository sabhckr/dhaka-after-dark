import * as THREE from "three";
import type { ChunkFile } from "../geo/types.ts";
import type { ReleaseBag } from "../geo/streaming.ts";
import { isFootSpan, solidsFromChunk } from "./solids.ts";
import { buildFootBridgeMeshes } from "./footbridge.ts";
import { kindFromCat, notableById } from "./landmarks.ts";
import { filletGentleBends, miterOutline, prepareVisualRoads } from "./roads.ts";
import { buildingCrown, facadeSlot, hash32, plasterTint, pointInOuter, ringCentroid, roadWantsMarks } from "./place.ts";

export const BLOCK = {
  ground: 0x141816,
  road: 0x6e736f,
  bridge: 0x8d877c,
  measured: 0xa39d94,
  estimated: 0x6a6660,
  water: 0x2c4c54,
  canal: 0x3a6268,
  park: 0x3c4d40,
  rail: 0x5a5146,
  plaza: 0x5c615e,
  deck: 0x7a756c,
  trunk: 0x5c4838,
  canopy: 0x2fa86a,
  canopyApprox: 0x4f9a62,
  landmark: 0xd4a24a,
  boundary: 0xe3a008,
};

type Range = { start: number; count: number; label: string };
type Tint = [number, number, number];

type Surface = {
  pos: number[];
  uv: number[];
  col: number[];
  idx: number[];
  ranges: Range[];
};

function blank(): Surface {
  return { pos: [], uv: [], col: [], idx: [], ranges: [] };
}

function pushV(s: Surface, x: number, y: number, z: number, u: number, v: number, tint: Tint) {
  s.pos.push(x, y, z);
  s.uv.push(u, v);
  s.col.push(tint[0], tint[1], tint[2]);
}

export type SurfaceLibrary = {
  roadMarked: THREE.Material;
  roadPlain: THREE.Material;
  bridge: THREE.Material;
  sidewalk: THREE.Material;
  water: THREE.Material;
  canal: THREE.Material;
  park: THREE.Material;
  plaza: THREE.Material;
  deck: THREE.Material;
  rail: THREE.Material;
  roof: THREE.Material;
  facades: THREE.Material[];
  trunk: THREE.Material;
  canopy: THREE.Material;
  landmark: THREE.Material;
  trim: THREE.Material;
};

function meshFrom(s: Surface, material: THREE.Material): THREE.Mesh | null {
  if (s.idx.length < 3) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(s.pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(s.uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(s.col, 3));
  geo.setIndex(s.idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.ranges = s.ranges;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function ribbon(pts: number[], half: number, y: number, s: Surface, label: string, tint: Tint, along: number, uSpan = 1) {
  const outline = miterOutline(pts, half);
  const n = outline.dist.length;
  if (n < 2) return;
  const startTri = s.idx.length / 3;
  const base = s.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const v = outline.dist[i] / along;
    pushV(s, outline.left[i * 2], y, outline.left[i * 2 + 1], 0, v, tint);
    pushV(s, outline.right[i * 2], y, outline.right[i * 2 + 1], uSpan, v, tint);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = base + i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    s.idx.push(a, c, b, b, c, d);
  }
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
}

function addFlat(outer: number[], holes: number[][] | undefined, y: number, s: Surface, label: string, tint: Tint, tile: number) {
  if (outer.length < 6) return;
  const startTri = s.idx.length / 3;
  const contour: THREE.Vector2[] = [];
  const base = s.pos.length / 3;
  for (let i = 0; i < outer.length; i += 2) {
    contour.push(new THREE.Vector2(outer[i], outer[i + 1]));
    pushV(s, outer[i], y, outer[i + 1], outer[i] / tile, outer[i + 1] / tile, tint);
  }
  const holeVecs: THREE.Vector2[][] = [];
  for (const hole of holes || []) {
    const hv: THREE.Vector2[] = [];
    for (let i = 0; i < hole.length; i += 2) {
      hv.push(new THREE.Vector2(hole[i], hole[i + 1]));
      pushV(s, hole[i], y, hole[i + 1], hole[i] / tile, hole[i + 1] / tile, tint);
    }
    if (hv.length >= 3) holeVecs.push(hv);
  }
  let tris: number[][] = [];
  try {
    tris = THREE.ShapeUtils.triangulateShape(contour, holeVecs);
  } catch {
    return;
  }
  for (const t of tris) s.idx.push(base + t[0], base + t[1], base + t[2]);
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
}

const SHOP_H = 3.2;
const SHOP_V = 0.3;
const MAX_FLOOR_SLICES = 8;

function pushWallQuad(
  s: Surface,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y0: number,
  y1: number,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  tint: Tint,
) {
  const base = s.pos.length / 3;
  pushV(s, ax, y0, az, u0, v0, tint);
  pushV(s, ax, y1, az, u0, v1, tint);
  pushV(s, bx, y0, bz, u1, v0, tint);
  pushV(s, bx, y1, bz, u1, v1, tint);
  s.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function edgeBarrier(pts: number[], half: number, y0: number, y1: number, s: Surface, label: string) {
  const outline = miterOutline(pts, half);
  const tint: Tint = [0.72, 0.68, 0.62];
  const startTri = s.idx.length / 3;
  for (const side of [outline.left, outline.right]) {
    for (let i = 0; i < side.length / 2 - 1; i++) {
      const ax = side[i * 2];
      const az = side[i * 2 + 1];
      const bx = side[(i + 1) * 2];
      const bz = side[(i + 1) * 2 + 1];
      if (Math.hypot(bx - ax, bz - az) < 0.05) continue;
      const len = Math.hypot(bx - ax, bz - az);
      pushWallQuad(s, ax, az, bx, bz, y0, y1, 0, len / 8, 0, 1, tint);
    }
  }
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
}

function upright(s: Surface, x: number, z: number, y0: number, y1: number, hx: number, hz: number, tint: Tint) {
  pushWallQuad(s, x - hx, z - hz, x + hx, z - hz, y0, y1, 0, 1, 0, 1, tint);
  pushWallQuad(s, x + hx, z - hz, x + hx, z + hz, y0, y1, 0, 1, 0, 1, tint);
  pushWallQuad(s, x + hx, z + hz, x - hx, z + hz, y0, y1, 0, 1, 0, 1, tint);
  pushWallQuad(s, x - hx, z + hz, x - hx, z - hz, y0, y1, 0, 1, 0, 1, tint);
  const base = s.pos.length / 3;
  pushV(s, x - hx, y1, z - hz, 0, 0, tint);
  pushV(s, x + hx, y1, z - hz, 1, 0, tint);
  pushV(s, x + hx, y1, z + hz, 1, 1, tint);
  pushV(s, x - hx, y1, z + hz, 0, 1, tint);
  s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushMarker(s: Surface, x: number, z: number, h: number, kind: string) {
  const tint: Tint = kind === "mosque" ? [0.98, 0.9, 0.78] : kind === "memorial" ? [0.93, 0.93, 0.9] : [0.96, 0.78, 0.62];
  if (kind === "mosque") {
    upright(s, x, z, 0.2, h * 0.55, 2.2, 2.2, tint);
    upright(s, x, z, h * 0.55, h * 0.55 + 1.6, 1.3, 1.3, [0.86, 0.9, 0.88]);
    upright(s, x + 2.4, z, 0.2, h, 0.28, 0.28, tint);
  } else if (kind === "memorial") {
    upright(s, x - 1.1, z, 0.15, h, 0.22, 0.7, tint);
    upright(s, x + 1.1, z, 0.15, h, 0.22, 0.7, tint);
    upright(s, x, z, h * 0.72, h * 0.72 + 0.28, 1.3, 0.22, tint);
  } else if (kind === "stadium") {
    upright(s, x, z - 6, 0.2, 3.2, 8, 0.35, tint);
    upright(s, x, z + 6, 0.2, 3.2, 8, 0.35, tint);
    upright(s, x - 8, z, 0.2, 3.2, 0.35, 6, tint);
    upright(s, x + 8, z, 0.2, 3.2, 0.35, 6, tint);
  } else if (kind === "fort") {
    upright(s, x, z - 4, 0.2, h * 0.45, 5, 0.4, [0.86, 0.62, 0.48]);
    upright(s, x, z + 4, 0.2, h * 0.45, 5, 0.4, [0.86, 0.62, 0.48]);
    upright(s, x, z, h * 0.45, h * 0.45 + 1.1, 1.4, 1.4, tint);
  } else if (kind === "marker") {
    upright(s, x, z, 0.15, 1.4, 0.45, 0.45, tint);
  } else {
    upright(s, x, z, 0.2, h, 1.6, 1.6, tint);
    upright(s, x, z, h, h + 0.8, 2.1, 2.1, [0.98, 0.86, 0.7]);
  }
}

/** Shop band stays at the bottom. Upper floors repeat the window tile, capped so towers stay cheap. */
function addWalls(ring: number[], h: number, s: Surface, label: string, tint: Tint, uShift = 0) {
  const n = ring.length / 2;
  if (n < 2 || h <= 0.2) return;
  const startTri = s.idx.length / 3;
  const tileX = 10.4;
  let dist = 0;
  const shopTop = Math.min(h, SHOP_H);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = dist / tileX + uShift;
    const u1 = (dist + len) / tileX + uShift;
    dist += len;
    const vShop = SHOP_V * (shopTop / SHOP_H);
    pushWallQuad(s, ax, az, bx, bz, 0, shopTop, u0, u1, 0, vShop, tint);
    if (h <= shopTop + 0.15) continue;
    const upper = h - shopTop;
    const slices = Math.min(MAX_FLOOR_SLICES, Math.max(1, Math.round(upper / 3.2)));
    const sliceH = upper / slices;
    for (let sli = 0; sli < slices; sli++) {
      const y0 = shopTop + sli * sliceH;
      const y1 = sli === slices - 1 ? h : shopTop + (sli + 1) * sliceH;
      pushWallQuad(s, ax, az, bx, bz, y0, y1, u0, u1, SHOP_V, 1, tint);
    }
  }
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
}

/** Thin parapet on the footprint edge. Not a surveyed cornice. Returns the triangle count added. */
function addParapet(ring: number[], h: number, lip: number, s: Surface, label: string, tint: Tint): number {
  const n = ring.length / 2;
  if (n < 3 || h < 2.4 || lip <= 0) return 0;
  const startTri = s.idx.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.45) continue;
    pushWallQuad(s, ax, az, bx, bz, h + 0.03, h + 0.03 + lip, 0, len / 8, 0, 0.25, tint);
  }
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
  return count;
}

function footprintSpan(ring: number[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]);
    maxX = Math.max(maxX, ring[i]);
    minZ = Math.min(minZ, ring[i + 1]);
    maxZ = Math.max(maxZ, ring[i + 1]);
  }
  return { minX, maxX, minZ, maxZ, sx: maxX - minX, sz: maxZ - minZ };
}

function longestOuterEdge(ring: number[]) {
  const c = ringCentroid(ring);
  if (!c || ring.length < 6) return null;
  const n = ring.length / 2;
  let best: { ax: number; az: number; bx: number; bz: number; len: number; nx: number; nz: number } | null = null;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5 || (best && len <= best.len)) continue;
    let nx = -(bz - az) / len;
    let nz = (bx - ax) / len;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if ((c.x - mx) * nx + (c.z - mz) * nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    best = { ax, az, bx, bz, len, nx, nz };
  }
  return best;
}

function pushFacingQuad(
  s: Surface,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
  tint: Tint,
  outX: number,
  outZ: number,
) {
  const base = s.pos.length / 3;
  pushV(s, ax, ay, az, 0, 0, tint);
  pushV(s, bx, by, bz, 1, 0, tint);
  pushV(s, cx, cy, cz, 1, 1, tint);
  pushV(s, dx, dy, dz, 0, 1, tint);
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const nz = abx * acy - aby * acx;
  const mx = (ax + bx + cx + dx) / 4;
  const mz = (az + bz + cz + dz) / 4;
  const outward = nx * (mx - outX) + nz * (mz - outZ) >= 0;
  if (outward) s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else s.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/** Concrete sunshade on the longest edge. The street side is not in the data. */
function addChajja(ring: number[], h: number, s: Surface, label: string, tint: Tint): number {
  const edge = longestOuterEdge(ring);
  if (!edge || edge.len < 6 || h < 3.4) return 0;
  const y = Math.min(3.05, h - 0.22);
  if (y < 2.3) return 0;
  const depth = 0.62;
  const ox = edge.nx * depth;
  const oz = edge.nz * depth;
  const startTri = s.idx.length / 3;
  const base = s.pos.length / 3;
  pushV(s, edge.ax, y, edge.az, 0, 0, tint);
  pushV(s, edge.bx, y, edge.bz, 1, 0, tint);
  pushV(s, edge.bx + ox, y, edge.bz + oz, 1, 1, tint);
  pushV(s, edge.ax + ox, y, edge.az + oz, 0, 1, tint);
  s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
  pushWallQuad(s, edge.ax + ox, edge.az + oz, edge.bx + ox, edge.bz + oz, y - 0.1, y, 0, edge.len / 6, 0, 0.2, tint);
  pushWallQuad(s, edge.bx + ox, edge.bz + oz, edge.ax + ox, edge.az + oz, y - 0.1, y, 0, edge.len / 6, 0, 0.2, tint);
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
  return count;
}

function boxInside(x: number, z: number, hx: number, hz: number, outer: number[]): boolean {
  return (
    pointInOuter(x, z, outer) &&
    pointInOuter(x - hx, z - hz, outer) &&
    pointInOuter(x + hx, z - hz, outer) &&
    pointInOuter(x - hx, z + hz, outer) &&
    pointInOuter(x + hx, z + hz, outer)
  );
}

/** Rooftop tank or stair hut. Skipped when the box would leave the footprint. */
function addServiceBox(
  ring: number[],
  h: number,
  id: number,
  kind: "tank" | "stair",
  s: Surface,
  label: string,
  tint: Tint,
): number {
  const box = footprintSpan(ring);
  const c = ringCentroid(ring);
  if (!c || box.sx < 4.2 || box.sz < 4.2) return 0;
  const hsh = hash32(id + (kind === "tank" ? 11 : 19));
  const hx = kind === "tank" ? 0.55 + (hsh % 4) * 0.1 : 0.85;
  const hz = kind === "tank" ? 0.7 + (hsh % 3) * 0.08 : 0.65;
  const rise = kind === "tank" ? 1.05 + (hsh % 5) * 0.1 : 2.1;
  const ox = ((hsh % 7) - 3) * Math.min(1.2, box.sx * 0.14);
  const oz = (((hsh >>> 3) % 7) - 3) * Math.min(1.2, box.sz * 0.14);
  const flip = kind === "stair" ? -1 : 1;
  const marginX = hx + 0.3;
  const marginZ = hz + 0.3;
  let x = Math.min(box.maxX - marginX, Math.max(box.minX + marginX, c.x + ox * flip));
  let z = Math.min(box.maxZ - marginZ, Math.max(box.minZ + marginZ, c.z + oz * flip));
  if (!boxInside(x, z, hx, hz, ring)) {
    x = c.x;
    z = c.z;
  }
  if (!boxInside(x, z, hx, hz, ring)) return 0;
  const startTri = s.idx.length / 3;
  upright(s, x, z, h + 0.04, h + 0.04 + rise, hx, hz, tint);
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
  return count;
}

/** Pitched cap on a 4-corner tin shed. The flat roof plate underneath stays. */
function addTinRidge(ring: number[], h: number, rise: number, s: Surface, label: string, tint: Tint): number {
  if (ring.length !== 8 || rise <= 0) return 0;
  const ax = ring[0];
  const az = ring[1];
  const bx = ring[2];
  const bz = ring[3];
  const cx = ring[4];
  const cz = ring[5];
  const dx = ring[6];
  const dz = ring[7];
  const e01 = Math.hypot(bx - ax, bz - az);
  const e12 = Math.hypot(cx - bx, cz - bz);
  const y = h + 0.02;
  const yr = y + rise;
  const heart = ringCentroid(ring) ?? { x: ax, z: az };
  const startTri = s.idx.length / 3;
  const slope = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    rx: number,
    rz: number,
    sx: number,
    sz: number,
  ) => {
    pushFacingQuad(s, x0, y, z0, x1, y, z1, rx, yr, rz, sx, yr, sz, tint, heart.x, heart.z);
  };
  const gable = (x0: number, z0: number, x1: number, z1: number, px: number, pz: number) => {
    const base = s.pos.length / 3;
    pushV(s, x0, y, z0, 0, 0, tint);
    pushV(s, x1, y, z1, 1, 0, tint);
    pushV(s, px, yr, pz, 0.5, 1, tint);
    const abx = x1 - x0;
    const aby = 0;
    const abz = z1 - z0;
    const acx = px - x0;
    const acy = yr - y;
    const acz = pz - z0;
    const nx = aby * acz - abz * acy;
    const nz = abx * acy - aby * acx;
    const mx = (x0 + x1 + px) / 3;
    const mz = (z0 + z1 + pz) / 3;
    if (nx * (mx - heart.x) + nz * (mz - heart.z) >= 0) s.idx.push(base, base + 1, base + 2);
    else s.idx.push(base, base + 2, base + 1);
  };
  if (e01 >= e12) {
    const p1x = (bx + cx) / 2;
    const p1z = (bz + cz) / 2;
    const p2x = (dx + ax) / 2;
    const p2z = (dz + az) / 2;
    slope(ax, az, bx, bz, p1x, p1z, p2x, p2z);
    slope(cx, cz, dx, dz, p2x, p2z, p1x, p1z);
    gable(bx, bz, cx, cz, p1x, p1z);
    gable(dx, dz, ax, az, p2x, p2z);
  } else {
    const p1x = (ax + bx) / 2;
    const p1z = (az + bz) / 2;
    const p2x = (cx + dx) / 2;
    const p2z = (cz + dz) / 2;
    slope(bx, bz, cx, cz, p2x, p2z, p1x, p1z);
    slope(dx, dz, ax, az, p1x, p1z, p2x, p2z);
    gable(ax, az, bx, bz, p1x, p1z);
    gable(cx, cz, dx, dz, p2x, p2z);
  }
  const count = s.idx.length / 3 - startTri;
  if (count > 0) s.ranges.push({ start: startTri, count, label });
  return count;
}

function nodeNear(nodes: { x: number; z: number }[]): (x: number, z: number) => boolean {
  const cell = 4;
  const buckets = new Map<string, { x: number; z: number }[]>();
  for (const node of nodes) {
    const key = `${Math.floor(node.x / cell)}_${Math.floor(node.z / cell)}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(node);
  }
  const r2 = 1.25 * 1.25;
  return (x, z) => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = buckets.get(`${cx + dx}_${cz + dz}`);
        if (!bucket) continue;
        for (const node of bucket) {
          const ddx = node.x - x;
          const ddz = node.z - z;
          if (ddx * ddx + ddz * ddz <= r2) return true;
        }
      }
    }
    return false;
  };
}

function pinsForRoad(pts: number[], near: (x: number, z: number) => boolean): boolean[] {
  const n = pts.length / 2;
  const pinned = new Array<boolean>(n).fill(false);
  if (n > 0) {
    pinned[0] = true;
    pinned[n - 1] = true;
  }
  for (let i = 1; i < n - 1; i++) {
    if (near(pts[i * 2], pts[i * 2 + 1])) pinned[i] = true;
  }
  return pinned;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const part of parts) {
    const attr = part.getAttribute("position");
    const index = part.getIndex();
    for (let i = 0; i < attr.count; i++) {
      const wobble = 1 + (((i * 17) % 9) - 4) * 0.025;
      pos.push(attr.getX(i) * wobble, attr.getY(i), attr.getZ(i) * wobble);
    }
    if (index) for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + base);
    base += attr.count;
    part.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Three offset cones. Not a sphere, and not a second tree at a new coordinate. */
function layeredCanopy(): THREE.BufferGeometry {
  const lower = new THREE.ConeGeometry(1.35, 0.5, 7);
  const mid = new THREE.ConeGeometry(1.02, 0.55, 6);
  const top = new THREE.ConeGeometry(0.58, 0.4, 5);
  lower.translate(0.06, -0.02, -0.04);
  mid.translate(-0.05, 0.3, 0.04);
  top.translate(0.02, 0.58, 0);
  return mergeParts([lower, mid, top]);
}

/** Seven fronds. Shared by every palm instance. */
function palmFan(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const b = pos.length / 3;
    pos.push(0, 0.05, 0, c * 0.26, 0.14, s * 0.26, c * 1.4, -0.46, s * 1.4);
    idx.push(b, b + 1, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export type ChunkObjects = ReleaseBag & { group: THREE.Group };

export function buildChunkObjects(chunk: ChunkFile, lib: SurfaceLibrary): ChunkObjects {
  const group = new THREE.Group();
  group.name = `chunk-${chunk.ix}_${chunk.iy}`;
  const geometries: { dispose: () => void }[] = [];
  const instanced: { dispose: () => void }[] = [];

  const add = (m: THREE.Mesh | null) => {
    if (!m) return;
    group.add(m);
    geometries.push(m.geometry);
  };

  const marked = blank();
  const plain = blank();
  const bridge = blank();
  const walk = blank();
  const roadTint: Tint = [0.72, 0.7, 0.66];
  const walkTint: Tint = [0.62, 0.58, 0.52];
  const nearNode = nodeNear(chunk.graph.nodes);
  const visual = prepareVisualRoads(
    chunk.roads
      .filter((r) => !isFootSpan(r))
      .map((r) => ({
        id: r.id,
        half: Math.max(0.4, r.w / 2),
        y: r.y,
        bridge: r.bridge,
        marked: roadWantsMarks(r.cls, r.w),
        pts: r.pts,
      })),
    chunk.origin,
  );
  for (const r of visual.roads) {
    const label = `road ${r.id}${r.bridge ? " bridge" : ""} w=${(r.half * 2).toFixed(1)}m`;
    const target = r.bridge ? bridge : r.marked ? marked : plain;
    const pts = r.bridge ? r.pts : filletGentleBends(r.pts, pinsForRoad(r.pts, nearNode));
    const plainSpan = Math.max(1, (r.half * 2) / 4);
    ribbon(pts, r.half, r.y, target, label, roadTint, r.marked ? 12 : 4, r.marked ? 1 : plainSpan);
    if (!r.bridge && r.half >= 3) ribbon(pts, r.half + 1.15, 0.16, walk, `sidewalk ${r.id}`, walkTint, 4, 1);
    if (r.bridge && r.y >= 2.5) {
      edgeBarrier(pts, Math.max(0.6, r.half), r.y, r.y + 0.9, bridge, `barrier ${r.id}`);
      ribbon(pts, Math.max(0.5, r.half) * 0.72, r.y - 0.42, bridge, `soffit ${r.id}`, [0.55, 0.52, 0.48], 8);
    }
  }
  for (const pad of visual.pads) {
    addFlat(pad.ring, undefined, pad.y, pad.marked ? marked : plain, "junction", roadTint, 8);
  }
  add(meshFrom(marked, lib.roadMarked));
  add(meshFrom(plain, lib.roadPlain));
  add(meshFrom(bridge, lib.bridge));
  add(meshFrom(walk, lib.sidewalk));

  const foot = solidsFromChunk(chunk);
  for (const mesh of buildFootBridgeMeshes(foot.plans, lib.deck, lib.trim)) {
    group.add(mesh);
    geometries.push(mesh.geometry);
  }

  const buildOne = (
    items: { outer: number[]; holes?: number[][]; id: number }[],
    y: number,
    mat: THREE.Material,
    kind: string,
    tint: Tint,
    tile: number,
  ) => {
    const s = blank();
    for (const p of items) addFlat(p.outer, p.holes, y, s, `${kind} ${p.id}`, tint, tile);
    add(meshFrom(s, mat));
  };
  buildOne(chunk.water, 0.12, lib.water, "water", [0.5, 0.58, 0.56], 18);
  buildOne(chunk.parks, 0.05, lib.park, "park", [0.62, 0.68, 0.56], 14);
  buildOne(chunk.plazas, 0.22, lib.plaza, "plaza", [0.9, 0.88, 0.84], 10);
  buildOne(chunk.bridges, 6, lib.deck, "bridge deck", [0.86, 0.84, 0.78], 8);

  const canal = blank();
  for (const c of chunk.canals) ribbon(c.pts, c.w / 2, 0.14, canal, `canal ${c.id} est w=${c.w}m`, [0.52, 0.62, 0.6], 16);
  add(meshFrom(canal, lib.canal));

  const railBed = blank();
  const railSteel = blank();
  const sleeperSpots: { x: number; y: number; z: number; yaw: number }[] = [];
  let railLen = 0;
  for (const c of chunk.rails) {
    for (let i = 1; i < c.pts.length / 2; i++) {
      railLen += Math.hypot(c.pts[i * 2] - c.pts[(i - 1) * 2], c.pts[i * 2 + 1] - c.pts[(i - 1) * 2 + 1]);
    }
  }
  const sleeperStep = Math.max(0.8, railLen / 220);
  for (const c of chunk.rails) {
    // Broad gauge, 1676 mm. Chunk rails do not record railway=* or tunnel=*, so metro
    // lines are not given a separate gauge and elevated ribbons get no invented piers.
    ribbon(c.pts, 2.05, c.y, railBed, `ballast ${c.id}`, [0.72, 0.7, 0.66], 3.2, 4.1 / 3.2);
    const edge = miterOutline(c.pts, 0.838);
    if (edge.dist.length >= 2) {
      ribbon(edge.left, 0.07, c.y + 0.2, railSteel, `rail ${c.id}`, [0.42, 0.44, 0.46], 1.5);
      ribbon(edge.right, 0.07, c.y + 0.2, railSteel, `rail ${c.id}`, [0.42, 0.44, 0.46], 1.5);
    }
    let walked = 0;
    let next = sleeperStep * 0.5;
    const n = c.pts.length / 2;
    for (let i = 1; i < n && sleeperSpots.length < 220; i++) {
      const ax = c.pts[(i - 1) * 2];
      const az = c.pts[(i - 1) * 2 + 1];
      const bx = c.pts[i * 2];
      const bz = c.pts[i * 2 + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      while (next <= walked + len && sleeperSpots.length < 220) {
        const t = (next - walked) / len;
        sleeperSpots.push({
          x: ax + dx * t,
          y: c.y + 0.08,
          z: az + dz * t,
          yaw: Math.atan2(-dx, -dz),
        });
        next += sleeperStep;
      }
      walked += len;
    }
  }
  add(meshFrom(railBed, lib.rail));
  add(meshFrom(railSteel, lib.trim));
  if (sleeperSpots.length) {
    const sleeperGeo = new THREE.BoxGeometry(2.65, 0.14, 0.26);
    const sleepers = new THREE.InstancedMesh(sleeperGeo, lib.roof, sleeperSpots.length);
    sleepers.name = "sleepers";
    const dummy = new THREE.Object3D();
    const sleeperTint = new THREE.Color(0x4e453c);
    for (let i = 0; i < sleeperSpots.length; i++) {
      const spot = sleeperSpots[i];
      dummy.position.set(spot.x, spot.y, spot.z);
      dummy.rotation.set(0, spot.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      sleepers.setMatrixAt(i, dummy.matrix);
      sleepers.setColorAt(i, sleeperTint);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    if (sleepers.instanceColor) sleepers.instanceColor.needsUpdate = true;
    group.add(sleepers);
    geometries.push(sleeperGeo);
    instanced.push(sleepers);
  }

  const walls = [0, 1, 2, 3, 4].map(() => blank());
  const roofs = blank();
  let parapetTris = 0;
  let parapetBuildings = 0;
  let serviceTris = 0;
  let chajjaTris = 0;
  let tinRidgeTris = 0;
  const tankRank: { id: number; area: number }[] = [];
  const chajjaRank: { id: number; len: number }[] = [];
  for (const b of chunk.buildings) {
    const crown = buildingCrown(b.id, b.h);
    if (crown.tank) {
      const box = footprintSpan(b.outer);
      tankRank.push({ id: b.id, area: box.sx * box.sz });
    }
    if (crown.chajja) {
      const edge = longestOuterEdge(b.outer);
      if (edge) chajjaRank.push({ id: b.id, len: edge.len });
    }
  }
  tankRank.sort((a, b) => b.area - a.area);
  chajjaRank.sort((a, b) => b.len - a.len);
  const tankIds = new Set(tankRank.slice(0, 280).map((item) => item.id));
  const chajjaIds = new Set(chajjaRank.slice(0, 420).map((item) => item.id));
  for (const b of chunk.buildings) {
    const plaster = plasterTint(b.id, b.hs);
    const slot = facadeSlot(b.id, b.h) % lib.facades.length;
    const tint: Tint = slot >= 3 ? [0.84, 0.82, 0.78] : plaster;
    const shift = (hash32(b.id) % 1000) / 1000;
    const label = `building ${b.id} ${b.hs} ${b.h}m`;
    const crown = buildingCrown(b.id, b.h);
    addWalls(b.outer, b.h, walls[slot], label, tint, shift);
    for (const hole of b.holes || []) addWalls(hole, b.h, walls[slot], label, tint, shift);
    const roofTint: Tint = [0.72, 0.68, 0.62];
    addFlat(b.outer, b.holes, b.h, roofs, label, roofTint, 10);
    if (crown.parapet) {
      const added = addParapet(b.outer, b.h, crown.parapetH, roofs, label, roofTint);
      parapetTris += added;
      if (added > 0) parapetBuildings++;
    }
    if (crown.tank && tankIds.has(b.id)) {
      serviceTris += addServiceBox(b.outer, b.h, b.id, "tank", roofs, label, [0.22, 0.24, 0.26]);
    }
    if (crown.stair) serviceTris += addServiceBox(b.outer, b.h, b.id, "stair", roofs, label, [0.55, 0.52, 0.48]);
    if (crown.chajja && chajjaIds.has(b.id)) chajjaTris += addChajja(b.outer, b.h, roofs, label, [0.78, 0.74, 0.66]);
    if (crown.tinRidge) {
      tinRidgeTris += addTinRidge(b.outer, b.h, 0.62 + (hash32(b.id) % 4) * 0.1, roofs, label, [0.62, 0.66, 0.62]);
    }
  }
  walls.forEach((s, i) => add(meshFrom(s, lib.facades[i] ?? lib.facades[0])));
  const roofMesh = meshFrom(roofs, lib.roof);
  if (roofMesh) {
    roofMesh.userData.parapetTris = parapetTris;
    roofMesh.userData.parapetBuildings = parapetBuildings;
    roofMesh.userData.serviceTris = serviceTris;
    roofMesh.userData.chajjaTris = chajjaTris;
    roofMesh.userData.tinRidgeTris = tinRidgeTris;
    roofMesh.userData.roofTris = roofs.idx.length / 3;
  }
  add(roofMesh);

  const trees = chunk.trees;
  if (trees.length) {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1, 5);
    const canopyGeo = layeredCanopy();
    const palmGeo = palmFan();
    const broad: typeof trees = [];
    const palms: typeof trees = [];
    for (const t of trees) {
      if (hash32(Math.round(t.x * 3) + Math.round(t.z * 5)) % 5 === 0) palms.push(t);
      else broad.push(t);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, lib.trunk, trees.length);
    const canopies = new THREE.InstancedMesh(canopyGeo, lib.canopy, Math.max(1, broad.length));
    const palmMesh = palms.length ? new THREE.InstancedMesh(palmGeo, lib.canopy, palms.length) : null;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const placeTrunk = (t: (typeof trees)[number], i: number, thin: boolean) => {
      const trunkH = Math.max(1.2, t.h * (thin ? 0.62 : 0.42));
      dummy.position.set(t.x, trunkH / 2, t.z);
      dummy.scale.set(thin ? 0.55 : 1, trunkH, thin ? 0.55 : 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      return trunkH;
    };
    let trunkI = 0;
    broad.forEach((t, i) => {
      const trunkH = placeTrunk(t, trunkI++, false);
      const canopyH = Math.max(1.4, t.h * 0.58);
      const spread = (t.k === "approx" ? 0.82 : 1) * (0.85 + (hash32(i + 3) % 20) / 80);
      dummy.position.set(t.x, trunkH + canopyH * 0.42, t.z);
      dummy.scale.set(spread, canopyH, spread * (0.9 + (hash32(i + 11) % 15) / 80));
      dummy.rotation.set(0, (hash32(i + 9) % 628) / 100, 0);
      dummy.updateMatrix();
      canopies.setMatrixAt(i, dummy.matrix);
      const greens = [0x2a6a40, 0x3c7a38, 0x4a6e32, 0x245848, 0x5a7030, 0x2f6844];
      color.setHex(greens[hash32(Math.round(t.x * 10) + i) % greens.length]);
      canopies.setColorAt(i, color);
    });
    if (broad.length === 0) {
      dummy.scale.set(0, 0, 0);
      dummy.updateMatrix();
      canopies.setMatrixAt(0, dummy.matrix);
      canopies.count = 0;
    }
    palms.forEach((t, i) => {
      const trunkH = placeTrunk(t, trunkI++, true);
      dummy.position.set(t.x, trunkH + 0.15, t.z);
      const spread = 1.15 + (hash32(i + 4) % 10) / 25;
      dummy.scale.set(spread, spread, spread);
      dummy.rotation.set(0, (hash32(i + 2) % 628) / 100, 0);
      dummy.updateMatrix();
      palmMesh?.setMatrixAt(i, dummy.matrix);
      color.setHex([0x6a7a32, 0x5c7038, 0x7a8440][hash32(i + 6) % 3]);
      palmMesh?.setColorAt(i, color);
    });
    trunks.count = trunkI;
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    if (palmMesh) {
      palmMesh.instanceMatrix.needsUpdate = true;
      if (palmMesh.instanceColor) palmMesh.instanceColor.needsUpdate = true;
      palmMesh.name = "palms";
    }
    const veg = new THREE.Group();
    veg.name = "trees";
    veg.add(trunks, canopies);
    if (palmMesh) veg.add(palmMesh);
    group.add(veg);
    geometries.push(trunkGeo, canopyGeo, palmGeo);
    instanced.push(trunks, canopies);
    if (palmMesh) instanced.push(palmMesh);
  }

  if (chunk.landmarks.length) {
    const marker = blank();
    chunk.landmarks.forEach((lm) => {
      const kind = kindFromCat(lm.cat, lm.id);
      const note = notableById(lm.id);
      const h = note ? 11 : kind === "marker" ? 2.2 : 6.5;
      pushMarker(marker, lm.x, lm.z, h, kind);
    });
    const mesh = meshFrom(marker, lib.landmark);
    if (mesh) {
      mesh.userData.landmarks = chunk.landmarks;
      add(mesh);
    }
  }

  return { group, geometries, instanced };
}

export function labelFromHit(hit: THREE.Intersection): string | null {
  const labels = hit.object.userData.instanceLabels as string[] | undefined;
  if (hit.instanceId != null && labels?.[hit.instanceId]) return labels[hit.instanceId];
  const direct = hit.object.userData.label as string | undefined;
  if (direct) return direct;
  const landmarks = hit.object.userData.landmarks as { name: string; cat: string; id: number; x?: number; z?: number }[] | undefined;
  if (landmarks?.length) {
    if (hit.instanceId != null && landmarks[hit.instanceId]) {
      const lm = landmarks[hit.instanceId];
      return `${lm.name} · ${lm.cat} · node ${lm.id}`;
    }
    let best = landmarks[0];
    let bestD = Infinity;
    for (const lm of landmarks) {
      if (lm.x == null || lm.z == null) continue;
      const d = (lm.x - hit.point.x) ** 2 + (lm.z - hit.point.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = lm;
      }
    }
    if (best && bestD < 40 * 40) {
      const note = notableById(best.id);
      const extra = note ? " · approximate marker, not a surveyed model" : "";
      return `${best.name} · ${best.cat} · node ${best.id}${extra}`;
    }
  }
  const ranges = hit.object.userData.ranges as Range[] | undefined;
  if (!ranges?.length || hit.faceIndex == null) return null;
  const fi = hit.faceIndex;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (fi < r.start) hi = mid - 1;
    else if (fi >= r.start + r.count) lo = mid + 1;
    else return r.label;
  }
  return null;
}
