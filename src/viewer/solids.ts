import { CHUNK_SIZE } from "../geo/chunks.ts";
import type { ChunkFile, RoadRec } from "../geo/types.ts";
import { containedHoles, heroDrawHeight, heroSite } from "./heroes.ts";
import { pointInOuter } from "./place.ts";

/**
 * Static world collision for the loaded chunk set.
 * Visual meshes stay in the renderer. This grid is what walking and driving actually hit.
 * Footbridge stairs exist only at OSM way ends that are not a 500 m chunk cut.
 */

const FOOT = new Set(["footway", "path", "steps", "pedestrian", "cycleway"]);
const CELL = 48;

export type SegWall = {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y0: number;
  y1: number;
};

export type DeckSpan = {
  pts: number[];
  ys: number[];
  half: number;
  id: number;
  /** Walkers can stand here. Drivers only use spans marked drive. */
  drive: boolean;
};

export type RoofPlate = {
  id: number;
  outer: number[];
  holes: number[][];
  y: number;
};

export type Column = { x: number; z: number; r: number; y0: number; y1: number };

export type SolidBucket = {
  walls: SegWall[];
  decks: DeckSpan[];
  roofs: RoofPlate[];
  columns: Column[];
};

export type FootPlan = {
  id: number;
  cls: string;
  /** OSM highway way with bridge/layer, not a surveyed structural drawing. */
  source: "osm-elevated-way";
  note: string;
  deckY: number;
  half: number;
  deckPts: number[];
  deckYs: number[];
  stairs: { pts: number[]; ys: number[]; half: number }[];
  piers: Column[];
};

export function isFootSpan(r: RoadRec): boolean {
  return Boolean(r.bridge) && FOOT.has(r.cls) && r.pts.length >= 4 && r.y >= 2.5;
}

export function isVehicleBridge(r: RoadRec): boolean {
  return Boolean(r.bridge) && !isFootSpan(r) && r.y >= 2.5 && r.pts.length >= 4;
}

function onChunkBorder(x: number, z: number, origin: [number, number]): boolean {
  const u = x - origin[0];
  const v = z - origin[1];
  const e = 3;
  return u <= e || v <= e || u >= CHUNK_SIZE - e || v >= CHUNK_SIZE - e;
}

export function planFootBridge(r: RoadRec, origin: [number, number]): FootPlan | null {
  if (!isFootSpan(r)) return null;
  const n = r.pts.length / 2;
  const deckY = r.y;
  const half = Math.max(0.85, Math.min(2.1, r.w / 2));
  const stairs: FootPlan["stairs"] = [];
  const piers: Column[] = [];
  for (const end of [0, n - 1]) {
    const x = r.pts[end * 2];
    const z = r.pts[end * 2 + 1];
    if (onChunkBorder(x, z, origin)) continue;
    const other = end === 0 ? Math.min(n - 1, 1) : Math.max(0, n - 2);
    let tx = x - r.pts[other * 2];
    let tz = z - r.pts[other * 2 + 1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    const side = (r.id & 1) === 0 ? 1 : -1;
    const sx = -tz * side;
    const sz = tx * side;
    const run = Math.max(7, deckY / 0.5);
    const steps = 7;
    const pts: number[] = [];
    const ys: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      pts.push(x + sx * run * t, z + sz * run * t);
      ys.push(deckY + (0.18 - deckY) * t);
    }
    stairs.push({ pts, ys, half: Math.max(0.75, half * 0.92) });
    piers.push({ x, z, r: 0.42, y0: 0, y1: Math.max(0.4, deckY - 0.35) });
  }
  return {
    id: r.id,
    cls: r.cls,
    source: "osm-elevated-way",
    note: "Deck follows the OSM bridge way. Stairs and end piers are game approaches at real ends only. They are not a measured stair survey.",
    deckY,
    half,
    deckPts: r.pts.slice(),
    deckYs: Array.from({ length: n }, () => deckY),
    stairs,
    piers,
  };
}

function pushEdges(walls: SegWall[], ring: number[], y0: number, y1: number) {
  const n = ring.length / 2;
  if (n < 2 || y1 <= y0) return;
  const closed = Math.hypot(ring[0] - ring[n * 2 - 2], ring[1] - ring[n * 2 - 1]) < 0.05;
  const last = closed ? n - 1 : n;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const ax = ring[i * 2];
    const az = ring[i * 2 + 1];
    const bx = ring[j * 2];
    const bz = ring[j * 2 + 1];
    if (Math.hypot(bx - ax, bz - az) < 0.05) continue;
    walls.push({ ax, az, bx, bz, y0, y1 });
  }
}

function railWalls(walls: SegWall[], pts: number[], ys: number[], half: number) {
  const n = pts.length / 2;
  if (n < 2) return;
  for (const sign of [1, -1]) {
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 2];
      const az = pts[i * 2 + 1];
      const bx = pts[(i + 1) * 2];
      const bz = pts[(i + 1) * 2 + 1];
      let dx = bx - ax;
      let dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const ox = -dz * sign * half;
      const oz = dx * sign * half;
      const y = Math.min(ys[i], ys[i + 1]);
      walls.push({
        ax: ax + ox,
        az: az + oz,
        bx: bx + ox,
        bz: bz + oz,
        y0: y + 0.15,
        y1: y + 1.15,
      });
    }
  }
}

function ringSpan(outer: number[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    minX = Math.min(minX, outer[i]);
    maxX = Math.max(maxX, outer[i]);
    minZ = Math.min(minZ, outer[i + 1]);
    maxZ = Math.max(maxZ, outer[i + 1]);
  }
  return Math.max(maxX - minX, maxZ - minZ);
}

export function solidsFromChunk(chunk: ChunkFile): { bucket: SolidBucket; plans: FootPlan[] } {
  const walls: SegWall[] = [];
  const decks: DeckSpan[] = [];
  const roofs: RoofPlate[] = [];
  const columns: Column[] = [];
  const plans: FootPlan[] = [];

  for (const b of chunk.buildings) {
    if (b.outer.length < 6 || b.h < 0.4) continue;
    const site = heroSite(b.id);
    const span = ringSpan(b.outer);
    const h = site ? heroDrawHeight(site, span) : b.h;
    const holes = site ? containedHoles(b.outer, b.holes) : b.holes || [];
    pushEdges(walls, b.outer, 0, h);
    for (const hole of holes) pushEdges(walls, hole, 0, h);
    roofs.push({ id: b.id, outer: b.outer, holes, y: h });
  }

  for (const r of chunk.roads) {
    const plan = planFootBridge(r, chunk.origin);
    if (!plan) continue;
    plans.push(plan);
    decks.push({ pts: plan.deckPts, ys: plan.deckYs, half: plan.half, id: plan.id, drive: false });
    for (const stair of plan.stairs) {
      decks.push({ pts: stair.pts, ys: stair.ys, half: stair.half, id: plan.id, drive: false });
      railWalls(walls, stair.pts, stair.ys, stair.half);
    }
    railWalls(walls, plan.deckPts, plan.deckYs, plan.half);
    columns.push(...plan.piers);
  }

  for (const deck of chunk.bridges) {
    if (deck.outer.length < 6) continue;
    pushEdges(walls, deck.outer, 5.4, 6.9);
    roofs.push({ id: deck.id, outer: deck.outer, holes: deck.holes || [], y: 6 });
  }

  return { bucket: { walls, decks, roofs, columns }, plans };
}

type Cell = SolidBucket;

function cellOf(x: number, z: number): string {
  return `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`;
}

function touchCells(x0: number, z0: number, x1: number, z1: number, into: Set<string>) {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minZ = Math.min(z0, z1);
  const maxZ = Math.max(z0, z1);
  for (let x = minX; x <= maxX + 0.01; x += CELL) {
    for (let z = minZ; z <= maxZ + 0.01; z += CELL) into.add(cellOf(x, z));
  }
  into.add(cellOf(maxX, maxZ));
}

export class SolidWorld {
  private readonly chunks = new Map<string, SolidBucket>();
  private cells = new Map<string, Cell>();
  private dirty = false;

  setChunk(key: string, bucket: SolidBucket): void {
    this.chunks.set(key, bucket);
    this.dirty = true;
  }

  deleteChunk(key: string): void {
    if (!this.chunks.delete(key)) return;
    this.dirty = true;
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  stats(): { walls: number; decks: number; roofs: number; columns: number } {
    let walls = 0;
    let decks = 0;
    let roofs = 0;
    let columns = 0;
    for (const b of this.chunks.values()) {
      walls += b.walls.length;
      decks += b.decks.length;
      roofs += b.roofs.length;
      columns += b.columns.length;
    }
    return { walls, decks, roofs, columns };
  }

  private rebuild(): void {
    if (!this.dirty) return;
    const cells = new Map<string, Cell>();
    const take = (key: string): Cell => {
      let c = cells.get(key);
      if (!c) {
        c = { walls: [], decks: [], roofs: [], columns: [] };
        cells.set(key, c);
      }
      return c;
    };
    for (const bucket of this.chunks.values()) {
      for (const w of bucket.walls) {
        const keys = new Set<string>();
        touchCells(w.ax, w.az, w.bx, w.bz, keys);
        for (const k of keys) take(k).walls.push(w);
      }
      for (const d of bucket.decks) {
        const keys = new Set<string>();
        const n = d.pts.length / 2;
        for (let i = 0; i < n - 1; i++) {
          touchCells(d.pts[i * 2], d.pts[i * 2 + 1], d.pts[(i + 1) * 2], d.pts[(i + 1) * 2 + 1], keys);
        }
        if (n === 1) keys.add(cellOf(d.pts[0], d.pts[1]));
        for (const k of keys) take(k).decks.push(d);
      }
      for (const roof of bucket.roofs) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;
        const n = roof.outer.length / 2;
        for (let i = 0; i < n; i++) {
          minX = Math.min(minX, roof.outer[i * 2]);
          maxX = Math.max(maxX, roof.outer[i * 2]);
          minZ = Math.min(minZ, roof.outer[i * 2 + 1]);
          maxZ = Math.max(maxZ, roof.outer[i * 2 + 1]);
        }
        const keys = new Set<string>();
        touchCells(minX, minZ, maxX, maxZ, keys);
        for (const k of keys) take(k).roofs.push(roof);
      }
      for (const c of bucket.columns) take(cellOf(c.x, c.z)).columns.push(c);
    }
    this.cells = cells;
    this.dirty = false;
  }

  nearby(x: number, z: number): Cell {
    return this.gather(x, z, CELL);
  }

  private gather(x: number, z: number, pad: number): Cell {
    this.rebuild();
    const walls: SegWall[] = [];
    const decks: DeckSpan[] = [];
    const roofs: RoofPlate[] = [];
    const columns: Column[] = [];
    const seenW = new Set<SegWall>();
    const seenD = new Set<DeckSpan>();
    const seenR = new Set<RoofPlate>();
    const seenC = new Set<Column>();
    for (let dx = -pad; dx <= pad; dx += CELL) {
      for (let dz = -pad; dz <= pad; dz += CELL) {
        const cell = this.cells.get(cellOf(x + dx, z + dz));
        if (!cell) continue;
        for (const w of cell.walls) if (!seenW.has(w)) {
          seenW.add(w);
          walls.push(w);
        }
        for (const d of cell.decks) if (!seenD.has(d)) {
          seenD.add(d);
          decks.push(d);
        }
        for (const r of cell.roofs) if (!seenR.has(r)) {
          seenR.add(r);
          roofs.push(r);
        }
        for (const c of cell.columns) if (!seenC.has(c)) {
          seenC.add(c);
          columns.push(c);
        }
      }
    }
    return { walls, decks, roofs, columns };
  }

  support(x: number, z: number, feet: number, stepUp: number, allowHigh: boolean): number {
    const near = this.gather(x, z, CELL);
    let best = 0;
    const limit = feet + stepUp;
    for (const deck of near.decks) {
      if (!allowHigh && deck.ys.some((y) => y > 1.4)) continue;
      const hit = spanAt(deck, x, z);
      if (!hit) continue;
      if (hit.y <= limit + 0.02 && hit.y >= best) best = hit.y;
    }
    for (const roof of near.roofs) {
      if (!allowHigh && roof.y > 1.4) continue;
      if (roof.y > limit + 0.02 || roof.y < best) continue;
      if (!inMass(roof, x, z)) continue;
      best = roof.y;
    }
    return best;
  }

  covered(x: number, y: number, z: number): boolean {
    const near = this.gather(x, z, CELL);
    for (const roof of near.roofs) {
      if (y < roof.y - 0.2 && inMass(roof, x, z)) return true;
    }
    for (const deck of near.decks) {
      const hit = spanAt(deck, x, z);
      if (hit && y < hit.y - 0.3 && y > hit.y - 8) return true;
    }
    return false;
  }
}

function inMass(roof: RoofPlate, x: number, z: number): boolean {
  if (!pointInOuter(x, z, roof.outer)) return false;
  for (const hole of roof.holes) {
    if (hole.length >= 6 && pointInOuter(x, z, hole)) return false;
  }
  return true;
}

function spanAt(span: DeckSpan, x: number, z: number): { y: number } | null {
  const n = span.pts.length / 2;
  let best = Infinity;
  let y = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = span.pts[i * 2];
    const az = span.pts[i * 2 + 1];
    const bx = span.pts[(i + 1) * 2];
    const bz = span.pts[(i + 1) * 2 + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-8;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + dx * t;
    const pz = az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best) {
      best = dist;
      y = span.ys[i] * (1 - t) + span.ys[i + 1] * t;
    }
  }
  if (best > span.half) return null;
  return { y };
}

function closestOnSeg(ax: number, az: number, bx: number, bz: number, x: number, z: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-8;
  let t = ((x - ax) * dx + (z - az) * dz) / l2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { x: ax + dx * t, z: az + dz * t, nx: -dz, nz: dx };
}

export type SolidMove = {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  radius: number;
  height: number;
  stepUp: number;
  /** Walkers use roofs and footbridges. Drivers stay on the street. */
  climb: boolean;
  fly: boolean;
};

export type SolidHit = {
  x: number;
  y: number;
  z: number;
  grounded: boolean;
  blocked: boolean;
  support: number;
};

function overlapsY(feet: number, height: number, y0: number, y1: number): boolean {
  return feet + height > y0 + 0.04 && feet < y1 - 0.04;
}

function depenetrate(x: number, z: number, feet: number, height: number, radius: number, near: Cell): { x: number; z: number; hit: boolean } {
  let hit = false;
  for (let iter = 0; iter < 5; iter++) {
    for (const w of near.walls) {
      if (!overlapsY(feet, height, w.y0, w.y1)) continue;
      const p = closestOnSeg(w.ax, w.az, w.bx, w.bz, x, z);
      const dx = x - p.x;
      const dz = z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist >= radius) continue;
      hit = true;
      if (dist > 1e-5) {
        const k = (radius + 0.02) / dist;
        x = p.x + dx * k;
        z = p.z + dz * k;
      } else {
        const len = Math.hypot(p.nx, p.nz) || 1;
        x = p.x + (p.nx / len) * (radius + 0.02);
        z = p.z + (p.nz / len) * (radius + 0.02);
      }
    }
    for (const c of near.columns) {
      if (!overlapsY(feet, height, c.y0, c.y1)) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const dist = Math.hypot(dx, dz);
      const need = radius + c.r;
      if (dist >= need) continue;
      hit = true;
      if (dist > 1e-5) {
        const k = (need + 0.02) / dist;
        x = c.x + dx * k;
        z = c.z + dz * k;
      } else {
        x = c.x + need + 0.02;
      }
    }
  }
  return { x, z, hit };
}

function ejectMass(x: number, z: number, feet: number, height: number, radius: number, roofs: RoofPlate[]): { x: number; z: number; hit: boolean } {
  let hit = false;
  for (const roof of roofs) {
    if (feet >= roof.y - 0.08) continue;
    if (feet + height <= 0.05) continue;
    if (!inMass(roof, x, z)) continue;
    let best = Infinity;
    let px = x;
    let pz = z;
    const rings = [roof.outer, ...roof.holes];
    for (const ring of rings) {
      const n = ring.length / 2;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const p = closestOnSeg(ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1], x, z);
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < best) {
          best = d;
          px = p.x;
          pz = p.z;
        }
      }
    }
    const ox = px - x;
    const oz = pz - z;
    const olen = Math.hypot(ox, oz);
    if (olen < 1e-4) {
      x = px + radius + 0.05;
    } else {
      x = px + (ox / olen) * (radius + 0.05);
      z = pz + (oz / olen) * (radius + 0.05);
    }
    hit = true;
  }
  return { x, z, hit };
}

function flySlab(y0: number, y1: number, x: number, z: number, near: Cell): number {
  let y = y1;
  const blocks: number[] = [];
  for (const deck of near.decks) {
    const hit = spanAt(deck, x, z);
    if (hit) blocks.push(hit.y);
  }
  for (const roof of near.roofs) {
    if (inMass(roof, x, z)) blocks.push(roof.y);
  }
  for (const top of blocks) {
    const slab0 = top - 0.45;
    const slab1 = top + 0.08;
    const wasAbove = y0 >= top - 0.15;
    const nowCross = y1 < slab1 && y1 + 1.6 > slab0;
    if (!nowCross) continue;
    if (wasAbove) y = Math.max(y, top + 0.02);
    else y = Math.min(y, slab0 - 1.6);
  }
  return y;
}

export function moveSolid(world: SolidWorld, q: SolidMove): SolidHit {
  const dx = q.x1 - q.x0;
  const dz = q.z1 - q.z0;
  const dy = q.y1 - q.y0;
  const dist = Math.hypot(dx, dz);
  const step = Math.max(0.2, q.radius * 0.45);
  const steps = Math.max(1, Math.ceil(dist / step));
  const sx = dx / steps;
  const sz = dz / steps;
  const sy = dy / steps;
  let x = q.x0;
  let y = q.y0;
  let z = q.z0;
  let blocked = false;
  let grounded = false;
  let support = 0;
  for (let i = 0; i < steps; i++) {
    const tx = x + sx;
    const tz = z + sz;
    const ty = q.fly ? y + sy : q.y0 + sy * (i + 1);
    const near = world.nearby(tx, tz);
    let horiz = depenetrate(tx, tz, q.fly ? ty : ty, q.height, q.radius, near);
    const ejected = ejectMass(horiz.x, horiz.z, q.fly ? ty : ty, q.height, q.radius, near.roofs);
    horiz = { x: ejected.x, z: ejected.z, hit: horiz.hit || ejected.hit };
    if (ejected.hit) {
      const again = depenetrate(horiz.x, horiz.z, ty, q.height, q.radius, world.nearby(horiz.x, horiz.z));
      horiz = again;
    }
    if (Math.hypot(horiz.x - tx, horiz.z - tz) > 0.08) blocked = true;
    x = horiz.x;
    z = horiz.z;
    if (q.fly) {
      y = flySlab(y, ty, x, z, near);
    } else {
      support = world.support(x, z, ty, q.stepUp, q.climb);
      if (ty <= support + 0.03) {
        y = support;
        grounded = true;
      } else {
        y = ty;
        grounded = false;
      }
    }
  }
  if (!q.fly) support = world.support(x, z, y, q.stepUp, q.climb);
  return { x, y, z, grounded, blocked, support };
}
