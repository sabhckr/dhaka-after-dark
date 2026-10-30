import type { ShopRec } from "../geo/shops.ts";
import { displayShopName } from "../geo/shops.ts";

export function hash32(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

export function ringCentroid(outer: number[]): { x: number; z: number } | null {
  const n = outer.length / 2;
  if (n < 3) return null;
  let x = 0;
  let z = 0;
  for (let i = 0; i < n; i++) {
    x += outer[i * 2];
    z += outer[i * 2 + 1];
  }
  return { x: x / n, z: z / n };
}

export function pointInOuter(x: number, z: number, outer: number[]): boolean {
  const n = outer.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = outer[i * 2];
    const zi = outer[i * 2 + 1];
    const xj = outer[j * 2];
    const zj = outer[j * 2 + 1];
    const hit = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export type Facade = {
  len: number;
  mx: number;
  mz: number;
  nx: number;
  nz: number;
  yaw: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
};

/** Longest walls first. Normal points away from the footprint centroid. */
export function facadesOf(outer: number[]): Facade[] {
  const c = ringCentroid(outer);
  if (!c) return [];
  const n = outer.length / 2;
  const out: Facade[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = outer[i * 2];
    const az = outer[i * 2 + 1];
    const bx = outer[j * 2];
    const bz = outer[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1.1) continue;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    let nx = -(bz - az) / len;
    let nz = (bx - ax) / len;
    if ((mx - c.x) * nx + (mz - c.z) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    out.push({ len, mx, mz, nx, nz, yaw: Math.atan2(nx, nz), ax, az, bx, bz });
  }
  out.sort((a, b) => b.len - a.len);
  return out;
}

/** 0–2 plaster, 3 brick, 4 corrugated tin. Stable for a building id. */
export function facadeSlot(id: number, h: number): number {
  const hsh = hash32(id);
  if (h < 5.5 && hsh % 5 === 0) return 4;
  if (hsh % 7 === 0) return 3;
  return hsh % 3;
}

/**
 * Deterministic roof and street-edge extras. Not surveyed architecture.
 * Tin sheds skip the parapet and the concrete tank. The chajja is the longest
 * outer edge only, so it is a shop-front guess, not a known street side.
 */
export type BuildingCrown = {
  parapet: boolean;
  parapetH: number;
  tank: boolean;
  stair: boolean;
  chajja: boolean;
  tinRidge: boolean;
};

export function buildingCrown(id: number, h: number): BuildingCrown {
  const tin = facadeSlot(id, h) === 4;
  const parapet = h >= 5 && !tin && hash32(id) % 5 !== 4;
  return {
    parapet,
    parapetH: parapet ? (h >= 14 ? 1.15 : 0.9) : 0,
    tank: h >= 6 && !tin && hash32(id + 11) % 5 < 3,
    stair: h >= 14 && !tin && hash32(id + 19) % 3 === 0,
    chajja: h >= 4 && hash32(id + 3) % 3 !== 2,
    tinRidge: tin && h <= 9,
  };
}

/**
 * Podium plus a smaller upper mass. Not a surveyed setback.
 * Tin sheds and courtyard footprints stay a single extrusion.
 * About one in five ids also stays a full box so the block is not uniform.
 */
export function wantsSetback(id: number, h: number, holes: number): boolean {
  if (h < 6.4 || holes > 0) return false;
  if (facadeSlot(id, h) === 4) return false;
  return hash32(id + 29) % 5 !== 4;
}

/** Largest footprints win when a chunk is over this cap. */
export const SETBACK_CAP = 700;

const PLASTER: [number, number, number][] = [
  [0.86, 0.8, 0.7],
  [0.78, 0.72, 0.62],
  [0.7, 0.6, 0.5],
  [0.62, 0.58, 0.52],
  [0.72, 0.52, 0.48],
  [0.58, 0.64, 0.56],
  [0.9, 0.86, 0.78],
  [0.66, 0.58, 0.52],
];

export function plasterTint(id: number, hs: "measured" | "estimated"): [number, number, number] {
  const p = PLASTER[hash32(id) % PLASTER.length];
  const k = hs === "measured" ? 1 : 0.94;
  return [p[0] * k, p[1] * k, p[2] * k];
}

export type Footprint = { id: number; h: number; outer: number[] };

export type ShopMode = "footprint" | "nearby" | "freestanding";

export type ShopPose = {
  shop: ShopRec;
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  mode: ShopMode;
  /** Facade side is never surveyed. Always approximate. */
  approximate: true;
  buildingId?: number;
};

export function placeShop(shop: ShopRec, buildings: Footprint[]): ShopPose | null {
  if (!displayShopName(shop)) return null;
  const own = shop.t === "way" ? buildings.find((b) => b.id === shop.id) : undefined;
  let host: Footprint | undefined = own;
  let mode: ShopMode = own ? "footprint" : "freestanding";
  if (!host) {
    let best: Footprint | undefined;
    let bestD = 18;
    for (const b of buildings) {
      if (pointInOuter(shop.x, shop.z, b.outer)) {
        host = b;
        mode = "nearby";
        best = undefined;
        break;
      }
      const c = ringCentroid(b.outer);
      if (!c) continue;
      const d = Math.hypot(c.x - shop.x, c.z - shop.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!host && best) {
      host = best;
      mode = "nearby";
    }
  }
  const t = 0.3 + (hash32(shop.id) % 40) / 100;
  if (host) {
    const face = facadesOf(host.outer)[0];
    if (face) {
      const x = face.ax + (face.bx - face.ax) * t + face.nx * 0.18;
      const z = face.az + (face.bz - face.az) * t + face.nz * 0.18;
      const w = Math.max(1.6, Math.min(face.len * 0.62, 7.2));
      const signH = Math.min(1.15, w * 0.34);
      const y = host.h < 3 ? host.h + signH * 0.5 + 0.15 : Math.min(2.55, host.h - 0.4);
      return { shop, x, y, z, yaw: face.yaw, w, h: signH, mode, approximate: true, buildingId: host.id };
    }
  }
  const yaw = ((hash32(shop.id) % 628) / 100) - 3.14;
  return {
    shop,
    x: shop.x,
    y: 2.35,
    z: shop.z,
    yaw,
    w: 3.1,
    h: 1.05,
    mode: "freestanding",
    approximate: true,
  };
}

export function rankShops<T extends ShopRec>(shops: T[], limit: number): T[] {
  return shops
    .filter((s) => displayShopName(s))
    .slice()
    .sort((a, b) => {
      const ab = a.bn ? 0 : 1;
      const bb = b.bn ? 0 : 1;
      if (ab !== bb) return ab - bb;
      const ha = hash32(a.id);
      const hb = hash32(b.id);
      if (ha !== hb) return ha < hb ? -1 : 1;
      return a.id - b.id;
    })
    .slice(0, limit);
}

export function posterBudget(buildingCount: number, ix: number, iy: number, quality: "low" | "medium" | "high"): number {
  const n = hash32(ix * 374761393 + iy * 668265263);
  const density = 0.4 + (n % 100) / 250;
  const cap = quality === "high" ? 48 : quality === "medium" ? 22 : 10;
  return Math.max(0, Math.min(cap, Math.round(buildingCount * 0.12 * density)));
}

export function pickPosterHosts<T extends Footprint>(buildings: T[], count: number, salt: number): T[] {
  const scored: { b: T; s: number }[] = [];
  for (const b of buildings) {
    if (b.h < 3 || b.outer.length < 6) continue;
    const face = facadesOf(b.outer)[0];
    if (!face || face.len < 2.8) continue;
    const bias = Math.min(face.len, 28) / 80;
    scored.push({ b, s: (hash32(b.id ^ salt) / 4294967296) - bias });
  }
  scored.sort((a, b) => a.s - b.s || a.b.id - b.b.id);
  return scored.slice(0, count).map((row) => row.b);
}

export type PosterPose = {
  buildingId: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  w: number;
  h: number;
  specIndex: number;
};

export function posterPose(b: Footprint, specCount: number, salt: number): PosterPose | null {
  const faces = facadesOf(b.outer);
  const face = faces[Math.min(faces.length - 1, hash32(b.id + 3) % Math.max(1, Math.min(3, faces.length)))] ?? faces[0];
  if (!face) return null;
  const t = 0.22 + (hash32(b.id ^ salt) % 56) / 100;
  const x = face.ax + (face.bx - face.ax) * t + face.nx * 0.16;
  const z = face.az + (face.bz - face.az) * t + face.nz * 0.16;
  const tall = b.h > 14 && hash32(b.id) % 4 === 0;
  const w = Math.max(1.3, Math.min(face.len * (tall ? 0.55 : 0.42), tall ? 6.5 : 4.2));
  let ph = tall ? w * 1.15 : w * 0.62;
  ph = Math.min(ph, Math.max(1.1, b.h - 0.7));
  const y = Math.min(b.h - ph / 2 - 0.12, Math.max(ph / 2 + 0.7, tall ? b.h * 0.42 : 2.1));
  const roll = ((hash32(b.id) % 17) - 8) * 0.012;
  const specIndex = hash32(b.id ^ salt ^ 0x9e3779b9) % specCount;
  return { buildingId: b.id, x, y, z, yaw: face.yaw, roll, w, h: ph, specIndex };
}

/** One to three layered sheets on the same wall. Positions stay deterministic for a building id. */
export function posterCluster(b: Footprint, specCount: number, salt: number): PosterPose[] {
  const primary = posterPose(b, specCount, salt);
  if (!primary || specCount <= 0) return [];
  const faces = facadesOf(b.outer);
  const face = faces[Math.min(faces.length - 1, hash32(b.id + 3) % Math.max(1, Math.min(3, faces.length)))] ?? faces[0];
  if (!face) return [primary];
  const extra = hash32(b.id ^ salt) % 3;
  const out: PosterPose[] = [primary];
  const dx = (face.bx - face.ax) / face.len;
  const dz = (face.bz - face.az) / face.len;
  for (let k = 1; k <= extra; k++) {
    const hsh = hash32(b.id + k * 97 + salt);
    const along = face.len * (0.12 + (hsh % 76) / 100 - 0.5);
    const outset = 0.18 + k * 0.045;
    const w = Math.max(1.05, Math.min(primary.w * (0.7 + (hsh % 25) / 100), face.len * 0.46));
    let ph = Math.min(primary.h * (0.62 + (hsh % 30) / 100), Math.max(0.9, b.h - 0.45));
    ph = Math.max(0.8, ph);
    const y = Math.min(b.h - ph / 2 - 0.08, Math.max(ph / 2 + 0.4, 1.35 + (hsh % 90) / 40));
    out.push({
      buildingId: b.id,
      x: face.mx + dx * along + face.nx * outset,
      y,
      z: face.mz + dz * along + face.nz * outset,
      yaw: face.yaw,
      roll: ((hsh % 21) - 10) * 0.012,
      w,
      h: ph,
      specIndex: (primary.specIndex + k + (hsh % Math.max(1, specCount - 1))) % specCount,
    });
  }
  return out;
}

const MAJOR = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "motorway_link", "trunk_link", "primary_link"]);

export function roadWantsMarks(cls: string, w: number): boolean {
  return w >= 6.5 || MAJOR.has(cls);
}

export function lampPoints(
  roads: { cls: string; w: number; y: number; bridge: boolean; pts: number[] }[],
  limit: number,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const r of roads) {
    if (r.bridge || !MAJOR.has(r.cls)) continue;
    const n = r.pts.length / 2;
    let until = 22;
    for (let i = 1; i < n && out.length < limit; i++) {
      const ax = r.pts[(i - 1) * 2];
      const az = r.pts[(i - 1) * 2 + 1];
      const bx = r.pts[i * 2];
      const bz = r.pts[i * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.4) continue;
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      let walked = 0;
      while (walked + until <= len && out.length < limit) {
        walked += until;
        until = 36;
        const ox = -dz * (r.w / 2 + 0.75);
        const oz = dx * (r.w / 2 + 0.75);
        out.push({ x: ax + dx * walked + ox, y: r.y, z: az + dz * walked + oz });
      }
      until -= len - walked;
      if (until < 0.5) until = 0.5;
    }
  }
  return out;
}

export function roofProps(buildings: Footprint[], limit: number): { tanks: { x: number; y: number; z: number; s: number }[]; antennas: { x: number; y: number; z: number; h: number }[] } {
  const tanks: { x: number; y: number; z: number; s: number }[] = [];
  const antennas: { x: number; y: number; z: number; h: number }[] = [];
  for (const b of buildings) {
    if (tanks.length + antennas.length >= limit) break;
    const c = ringCentroid(b.outer);
    if (!c) continue;
    const hsh = hash32(b.id);
    if (b.h > 8 && hsh % 5 === 0 && tanks.length < limit) {
      tanks.push({ x: c.x + ((hsh % 7) - 3) * 0.4, y: b.h, z: c.z, s: 0.7 + (hsh % 5) * 0.08 });
    } else if (b.h > 6 && hsh % 6 === 1 && antennas.length < limit) {
      antennas.push({ x: c.x, y: b.h, z: c.z, h: 1.8 + (hsh % 4) * 0.35 });
    }
  }
  return { tanks, antennas };
}

export function cableSegments(buildings: Footprint[], limit: number): number[] {
  const cell = 22;
  const buckets = new Map<string, Footprint[]>();
  const keyOf = (x: number, z: number) => `${Math.floor(x / cell)}_${Math.floor(z / cell)}`;
  const cents: { b: Footprint; x: number; z: number }[] = [];
  for (const b of buildings) {
    if (b.h < 6) continue;
    const c = ringCentroid(b.outer);
    if (!c) continue;
    cents.push({ b, x: c.x, z: c.z });
    const k = keyOf(c.x, c.z);
    const list = buckets.get(k);
    if (list) list.push(b);
    else buckets.set(k, [b]);
  }
  const pos: number[] = [];
  const used = new Set<string>();
  for (const row of cents) {
    if (pos.length / 6 >= limit) break;
    if (hash32(row.b.id) % 3 !== 0) continue;
    const ix = Math.floor(row.x / cell);
    const iz = Math.floor(row.z / cell);
    let other: Footprint | null = null;
    let ox = 0;
    let oz = 0;
    for (let dz = -1; dz <= 1 && !other; dz++) {
      for (let dx = -1; dx <= 1 && !other; dx++) {
        const list = buckets.get(`${ix + dx}_${iz + dz}`);
        if (!list) continue;
        for (const b of list) {
          if (b.id === row.b.id) continue;
          const c = ringCentroid(b.outer);
          if (!c) continue;
          const d = Math.hypot(c.x - row.x, c.z - row.z);
          if (d > 8 && d < 26) {
            other = b;
            ox = c.x;
            oz = c.z;
            break;
          }
        }
      }
    }
    if (!other) continue;
    const pair = row.b.id < other.id ? `${row.b.id}-${other.id}` : `${other.id}-${row.b.id}`;
    if (used.has(pair)) continue;
    used.add(pair);
    const y1 = row.b.h + 0.4;
    const y2 = other.h + 0.6;
    const midY = Math.min(y1, y2) - 1.4;
    pos.push(row.x, y1, row.z, (row.x + ox) / 2, midY, (row.z + oz) / 2);
    pos.push((row.x + ox) / 2, midY, (row.z + oz) / 2, ox, y2, oz);
  }
  return pos;
}
