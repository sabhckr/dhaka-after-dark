/**
 * Kinematic traffic on the loaded OSM road graph.
 * Not a physics vehicle. Cars follow graph edges, keep a gap, and stop
 * short of a red phase at junctions with three or more links.
 * Sidewalks, footways, and motorways are not in this net. Links of any length are,
 * so the halves of a split junction stay joined.
 */

export const DRIVE_CLASS = new Set([
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
  "service",
  "living_street",
]);

export type VehKind = "car" | "cng" | "bus" | "bike";

export const VEH_SPEC: Record<VehKind, { len: number; cruise: number; radius: number }> = {
  car: { len: 4.6, cruise: 11, radius: 0.95 },
  cng: { len: 2.7, cruise: 8.2, radius: 0.7 },
  bus: { len: 10.4, cruise: 7.4, radius: 1.25 },
  bike: { len: 2.1, cruise: 13, radius: 0.45 },
};

export type RawEdge = {
  id: string;
  a: string;
  b: string;
  cls: string;
  oneway: -1 | 0 | 1;
  pts: number[];
};

export type TrafficCar = {
  id: number;
  kind: VehKind;
  edge: string;
  dir: 1 | -1;
  /** Metres travelled in `dir` from the start of that direction. */
  s: number;
  speed: number;
  cruise: number;
  x: number;
  z: number;
  yaw: number;
  stuck: number;
  held: "none" | "gap" | "signal" | "dead-end" | "blocked";
  /** Last edges entered, newest last. A closed loop is left instead of lapped. */
  trail: string[];
};

type NetEdge = {
  key: string;
  id: string;
  chunk: string;
  a: string;
  b: string;
  cls: string;
  oneway: -1 | 0 | 1;
  pts: Array<[number, number]>;
  cum: number[];
  len: number;
};

export type BlockFn = (x0: number, z0: number, x1: number, z1: number, radius: number) => boolean;

export type TrafficOptions = {
  max?: number;
  rand?: () => number;
  blocked?: BlockFn;
};

const KINDS: VehKind[] = ["car", "car", "car", "cng", "cng", "bike", "bus"];

/**
 * Short edges stay in the net: they are often the link between two halves of one junction,
 * and dropping them cut the route there. Only an edge this long gets a stop line, and only
 * one this long spawns cars; a shorter one is driven straight through.
 */
const STOP_LINE_EDGE_M = 8;
const TRAIL = 8;

function push(map: Map<string, string[]>, key: string, value: string) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function drop(map: Map<string, string[]>, key: string, value: string) {
  const arr = map.get(key);
  if (!arr) return;
  const next = arr.filter((item) => item !== value);
  if (next.length) map.set(key, next);
  else map.delete(key);
}

function chain(pts: number[]): { pts: Array<[number, number]>; cum: number[]; len: number } | null {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
  if (out.length < 2) return null;
  const cum = [0];
  let len = 0;
  for (let i = 1; i < out.length; i++) {
    len += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
    cum.push(len);
  }
  if (len < 0.01) return null;
  return { pts: out, cum, len };
}

export function poseAt(edge: { pts: Array<[number, number]>; cum: number[]; len: number }, dir: 1 | -1, s: number) {
  const travel = Math.min(edge.len, Math.max(0, dir === 1 ? s : edge.len - s));
  let i = 1;
  while (i < edge.cum.length - 1 && edge.cum[i] < travel) i++;
  const a = edge.pts[i - 1];
  const b = edge.pts[i];
  const seg = edge.cum[i] - edge.cum[i - 1] || 1;
  const u = (travel - edge.cum[i - 1]) / seg;
  const x = a[0] + (b[0] - a[0]) * u;
  const z = a[1] + (b[1] - a[1]) * u;
  let dx = b[0] - a[0];
  let dz = b[1] - a[1];
  if (dir === -1) {
    dx = -dx;
    dz = -dz;
  }
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  return { x, z, dx, dz, yaw: Math.atan2(-dx, -dz) };
}

function entryDir(edge: NetEdge, node: string): 1 | -1 | 0 {
  if (edge.a === node && edge.oneway !== -1) return 1;
  if (edge.b === node && edge.oneway !== 1) return -1;
  return 0;
}

export class TrafficSim {
  readonly cars: TrafficCar[] = [];
  max: number;
  time = 0;
  spawns = 0;
  private readonly edges = new Map<string, NetEdge>();
  private readonly byNode = new Map<string, string[]>();
  private readonly chunks = new Map<string, string[]>();
  private readonly rand: () => number;
  private readonly blocked?: BlockFn;
  private spawnIn = 0.05;
  private seq = 1;
  private px = 0;
  private pz = 0;

  constructor(opts: TrafficOptions = {}) {
    this.max = opts.max ?? 12;
    this.rand = opts.rand ?? Math.random;
    this.blocked = opts.blocked;
  }

  get edgeCount(): number {
    return this.edges.size;
  }

  setChunk(chunkKey: string, edges: RawEdge[]): void {
    this.deleteChunk(chunkKey);
    const keys: string[] = [];
    for (const raw of edges) {
      if (!DRIVE_CLASS.has(raw.cls)) continue;
      const built = chain(raw.pts);
      if (!built) continue;
      const key = `${chunkKey}|${raw.id}`;
      const edge: NetEdge = {
        key,
        id: raw.id,
        chunk: chunkKey,
        a: raw.a,
        b: raw.b,
        cls: raw.cls,
        oneway: raw.oneway,
        pts: built.pts,
        cum: built.cum,
        len: built.len,
      };
      this.edges.set(key, edge);
      keys.push(key);
      push(this.byNode, raw.a, key);
      push(this.byNode, raw.b, key);
    }
    this.chunks.set(chunkKey, keys);
  }

  deleteChunk(chunkKey: string): void {
    const keys = this.chunks.get(chunkKey);
    if (!keys) return;
    const gone = new Set(keys);
    for (const key of keys) {
      const edge = this.edges.get(key);
      this.edges.delete(key);
      if (!edge) continue;
      drop(this.byNode, edge.a, key);
      drop(this.byNode, edge.b, key);
    }
    this.chunks.delete(chunkKey);
    for (let i = this.cars.length - 1; i >= 0; i--) {
      if (gone.has(this.cars[i].edge)) this.cars.splice(i, 1);
    }
  }

  /** True when the approach may enter the node. Degree < 3 is not a signal. */
  green(node: string, axis: 0 | 1): boolean {
    const links = this.byNode.get(node);
    if (!links || links.length < 3) return true;
    return Math.floor(this.time / 8) % 2 === axis;
  }

  private choices(node: string, fromKey: string, dx: number, dz: number, trail: string[]) {
    const keys = this.byNode.get(node) ?? [];
    const out: { key: string; dir: 1 | -1; score: number }[] = [];
    for (const key of keys) {
      const edge = this.edges.get(key);
      if (!edge) continue;
      const dir = entryDir(edge, node);
      if (!dir) continue;
      const sample = poseAt(edge, dir, 1);
      let score = dx * sample.dx + dz * sample.dz;
      if (key === fromKey) score -= 1.4;
      // A link driven moments ago ranks below any turn, so a car does not lap a small loop.
      else if (trail.includes(key)) score -= 1.2;
      out.push({ key, dir, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  private place(car: TrafficCar, edge: NetEdge) {
    const p = poseAt(edge, car.dir, car.s);
    car.x = p.x;
    car.z = p.z;
    car.yaw = p.yaw;
    return p;
  }

  private legalDir(edge: NetEdge, prefer: 1 | -1): 1 | -1 {
    if (edge.oneway === 1) return 1;
    if (edge.oneway === -1) return -1;
    return prefer;
  }

  private trySpawn() {
    if (this.cars.length >= this.max || this.edges.size === 0) return;
    const near: NetEdge[] = [];
    for (const edge of this.edges.values()) {
      const mid = poseAt(edge, 1, edge.len * 0.5);
      const dist = Math.hypot(mid.x - this.px, mid.z - this.pz);
      if (edge.len >= STOP_LINE_EDGE_M && dist >= 26 && dist <= 160) near.push(edge);
    }
    if (!near.length) return;
    const edge = near[Math.floor(this.rand() * near.length) % near.length];
    const spot = poseAt(edge, 1, edge.len * 0.5);
    for (const car of this.cars) {
      if (Math.hypot(car.x - spot.x, car.z - spot.z) < 18) return;
    }
    const kind = KINDS[Math.floor(this.rand() * KINDS.length) % KINDS.length];
    const spec = VEH_SPEC[kind];
    const dir = this.legalDir(edge, this.rand() > 0.5 ? 1 : -1);
    const s = 4 + this.rand() * Math.max(1, edge.len - 12);
    const car: TrafficCar = {
      id: this.seq++,
      kind,
      edge: edge.key,
      dir,
      s,
      speed: spec.cruise,
      cruise: spec.cruise * (0.85 + this.rand() * 0.25),
      x: 0,
      z: 0,
      yaw: 0,
      stuck: 0,
      held: "none",
      trail: [edge.key],
    };
    this.place(car, edge);
    this.cars.push(car);
    this.spawns++;
  }

  /** Test hook. Refuses a direction the oneway tag does not allow. */
  addCar(partial: Pick<TrafficCar, "kind" | "edge" | "dir" | "s"> & Partial<TrafficCar>): TrafficCar | null {
    const edge = this.edges.get(partial.edge);
    if (!edge) return null;
    const dir = this.legalDir(edge, partial.dir);
    const spec = VEH_SPEC[partial.kind];
    const car: TrafficCar = {
      id: partial.id ?? this.seq++,
      kind: partial.kind,
      edge: edge.key,
      dir,
      s: Math.min(edge.len - 0.5, Math.max(0, partial.s)),
      speed: partial.speed ?? spec.cruise,
      cruise: partial.cruise ?? spec.cruise,
      x: 0,
      z: 0,
      yaw: 0,
      stuck: 0,
      held: "none",
      trail: [edge.key],
    };
    this.place(car, edge);
    this.cars.push(car);
    return car;
  }

  tick(dt: number, player: { x: number; z: number }): void {
    let left = Math.min(2, Math.max(0, dt));
    this.px = player.x;
    this.pz = player.z;
    while (left > 1e-4) {
      const step = Math.min(0.05, left);
      left -= step;
      this.step(step);
    }
  }

  private step(step: number): void {
    this.time += step;
    this.spawnIn -= step;
    if (this.spawnIn <= 0) {
      this.spawnIn = 0.7;
      this.trySpawn();
    }

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (Math.hypot(car.x - this.px, car.z - this.pz) > 230) {
        this.cars.splice(i, 1);
        continue;
      }
      const edge = this.edges.get(car.edge);
      if (!edge) {
        this.cars.splice(i, 1);
        continue;
      }
      car.dir = this.legalDir(edge, car.dir);
      const wasStuckHold = car.held === "blocked" || car.held === "dead-end";
      const here = poseAt(edge, car.dir, car.s);
      let limit = car.cruise;
      car.held = "none";

      let bestGap = Infinity;
      let leader = car.cruise;
      for (const other of this.cars) {
        if (other.id === car.id || other.edge !== car.edge || other.dir !== car.dir || other.s <= car.s) continue;
        const gap = other.s - car.s - VEH_SPEC[other.kind].len;
        if (gap < bestGap) {
          bestGap = gap;
          leader = other.speed;
        }
      }
      const want = 5.2 + car.speed * 0.5;
      if (bestGap < want) {
        limit = Math.min(limit, Math.max(0, leader) * Math.max(0, bestGap / want));
        car.held = "gap";
      }

      const remain = edge.len - car.s;
      const node = car.dir === 1 ? edge.b : edge.a;
      // The phase follows the approach into the node, not the car's local heading: on a
      // bending edge the local heading can swap axis between two frames and never settle.
      const into = poseAt(edge, car.dir, edge.len);
      const axis: 0 | 1 = Math.abs(into.dx) >= Math.abs(into.dz) ? 0 : 1;
      const stopAt = edge.len - 6.5;
      // A car already past the stop line clears the junction instead of jumping back to it.
      if (
        edge.len >= STOP_LINE_EDGE_M &&
        remain < 16 &&
        !this.green(node, axis) &&
        car.s <= stopAt + 0.5
      ) {
        if (car.s >= stopAt - 0.4) {
          limit = 0;
          car.s = Math.min(car.s, stopAt);
        } else if (remain < 14) {
          limit = Math.min(limit, 2.4);
        }
        car.held = "signal";
      }

      const accel = limit === 0 ? 36 : limit >= car.speed ? 7 : 14;
      if (car.speed < limit) car.speed = Math.min(limit, car.speed + accel * step);
      else car.speed = Math.max(limit, car.speed - accel * step);

      if (car.held === "signal" && car.s >= edge.len - 6.9) {
        this.place(car, edge);
        continue;
      }

      const advance = car.speed * step;
      if (advance <= 0.001) {
        this.place(car, edge);
        if (wasStuckHold && car.held !== "signal") {
          car.held = "blocked";
          car.stuck += step;
          if (car.stuck > 1.6) this.cars.splice(i, 1);
        }
        continue;
      }

      const nextS = car.s + advance;
      if (nextS < edge.len) {
        const next = poseAt(edge, car.dir, nextS);
        if (this.blocked?.(car.x, car.z, next.x, next.z, VEH_SPEC[car.kind].radius)) {
          car.speed = 0;
          car.held = "blocked";
          car.stuck += step;
          this.place(car, edge);
          if (car.stuck > 1.6) this.cars.splice(i, 1);
          continue;
        }
        car.s = nextS;
        car.stuck = car.held === "gap" ? car.stuck : 0;
        this.place(car, edge);
        continue;
      }

      let over = nextS - edge.len;
      const options = this.choices(node, edge.key, here.dx, here.dz, car.trail);
      if (!options.length) {
        car.s = edge.len;
        car.speed = 0;
        car.held = "dead-end";
        car.stuck += step;
        this.place(car, edge);
        if (car.stuck > 1.6) this.cars.splice(i, 1);
        continue;
      }
      let pick = options[0];
      const first = this.edges.get(pick.key);
      if (!first) continue;
      let nxt: NetEdge = first;
      // One step can run past a link shorter than the step; carry the rest into the next edge.
      for (let hop = 0; hop < 8 && over >= nxt.len; hop++) {
        const end = poseAt(nxt, pick.dir, nxt.len);
        const on = pick.dir === 1 ? nxt.b : nxt.a;
        const after = this.choices(on, nxt.key, end.dx, end.dz, car.trail)[0];
        const then = after && this.edges.get(after.key);
        if (!after || !then) break;
        car.trail.push(nxt.key);
        over -= nxt.len;
        pick = after;
        nxt = then;
      }
      car.edge = nxt.key;
      car.dir = pick.dir;
      car.trail.push(nxt.key);
      if (car.trail.length > TRAIL) car.trail.splice(0, car.trail.length - TRAIL);
      car.s = Math.min(nxt.len, Math.max(Math.min(0.2, nxt.len / 2), over));
      car.stuck = 0;
      car.held = "none";
      this.place(car, nxt);
    }
  }
}
