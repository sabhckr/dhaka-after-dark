import { HIGHWAY_WIDTH_M } from "../geo/classify.ts";
import type { ChunkFile } from "../geo/types.ts";
import { pointInOuter } from "../viewer/place.ts";
import { planFootBridge } from "../viewer/solids.ts";
import type { LinkKind, MoveMode, PathPoint } from "./types.ts";

/**
 * Pedestrian / light-vehicle graph built from the loaded OSM road graph.
 * Sidewalks are offsets of driveable ways. Footways are used as mapped.
 * Motorways, trunks, and rail are not walkable. Nodes that land in a
 * building, water, or on a rail are dropped. There is no navmesh library.
 */

const BANNED = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "raceway",
  "bus_guideway",
  "proposed",
  "abandoned",
  "razed",
  "construction",
  "platform",
  "corridor",
  "elevator",
  "via_ferrata",
  "no",
  "track",
]);

const FOOT = new Set(["footway", "path", "pedestrian", "steps", "cycleway", "living_street"]);

const ROAD = new Set([
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

const SNAP = 3;
const CELL = 16;

type Node = {
  x: number;
  z: number;
  key: string;
  walk: boolean;
  road: boolean;
};

type Link = { to: number; kind: LinkKind; len: number };

type CellMap = Map<string, number[]>;

function cellKey(x: number, z: number): string {
  return `${Math.floor(x / CELL)}_${Math.floor(z / CELL)}`;
}

function snapKey(x: number, z: number): string {
  return `${Math.round(x / SNAP)}_${Math.round(z / SNAP)}`;
}

function resample(pts: number[], step: number): Array<[number, number]> {
  const raw: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i += 2) raw.push([pts[i], pts[i + 1]]);
  if (raw.length < 2) return [];
  const out: Array<[number, number]> = [raw[0]];
  let acc = 0;
  let ax = raw[0][0];
  let az = raw[0][1];
  for (let i = 1; i < raw.length; i++) {
    const bx = raw[i][0];
    const bz = raw[i][1];
    let dx = bx - ax;
    let dz = bz - az;
    let seg = Math.hypot(dx, dz);
    if (seg < 1e-5) continue;
    dx /= seg;
    dz /= seg;
    while (acc + seg >= step) {
      const need = step - acc;
      ax += dx * need;
      az += dz * need;
      out.push([ax, az]);
      seg -= need;
      acc = 0;
    }
    ax = bx;
    az = bz;
    acc += seg;
  }
  const end = raw[raw.length - 1];
  const last = out[out.length - 1];
  if (Math.hypot(end[0] - last[0], end[1] - last[1]) > step * 0.35) out.push(end);
  return out;
}

function offsetChain(pts: Array<[number, number]>, dist: number, sign: number): Array<[number, number]> {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    return [p[0] - dz * sign * dist, p[1] + dx * sign * dist];
  });
}

function nearLine(x: number, z: number, pts: number[], half: number): boolean {
  const r2 = half * half;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i];
    const az = pts[i + 1];
    const bx = pts[i + 2];
    const bz = pts[i + 3];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1e-6;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    if (px * px + pz * pz <= r2) return true;
  }
  return false;
}

type Blocker = (x: number, z: number) => boolean;

function blockerFor(chunk: ChunkFile): Blocker {
  const buildings: { minX: number; maxX: number; minZ: number; maxZ: number; outer: number[] }[] = [];
  const grid = new Map<string, number[]>();
  for (const building of chunk.buildings) {
    if (building.outer.length < 6) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < building.outer.length; i += 2) {
      minX = Math.min(minX, building.outer[i]);
      maxX = Math.max(maxX, building.outer[i]);
      minZ = Math.min(minZ, building.outer[i + 1]);
      maxZ = Math.max(maxZ, building.outer[i + 1]);
    }
    const index = buildings.length;
    buildings.push({ minX, maxX, minZ, maxZ, outer: building.outer });
    for (let x = minX; x <= maxX + 0.01; x += CELL) {
      for (let z = minZ; z <= maxZ + 0.01; z += CELL) {
        const key = cellKey(x, z);
        const list = grid.get(key);
        if (list) list.push(index);
        else grid.set(key, [index]);
      }
    }
  }
  const water = chunk.water.filter((poly) => poly.outer.length >= 6);
  return (x, z) => {
    const list = grid.get(cellKey(x, z));
    if (list) {
      for (const index of list) {
        const box = buildings[index];
        if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
        if (pointInOuter(x, z, box.outer)) return true;
      }
    }
    for (const poly of water) if (pointInOuter(x, z, poly.outer)) return true;
    for (const canal of chunk.canals) {
      if (nearLine(x, z, canal.pts, Math.max(0.8, canal.w / 2) + 0.4)) return true;
    }
    for (const rail of chunk.rails) {
      if (nearLine(x, z, rail.pts, 1.7)) return true;
    }
    return false;
  };
}

function allows(kind: LinkKind, mode: MoveMode): boolean {
  if (mode === "road") return kind === "road";
  return kind !== "road";
}

function kindCost(kind: LinkKind): number {
  if (kind === "crossing") return 2.4;
  if (kind === "road") return 1;
  return 1;
}

export class PedNav {
  version = 0;
  private readonly chunks = new Map<string, ChunkFile>();
  private nodes: Node[] = [];
  private adj: Link[][] = [];
  private keyTo = new Map<string, number>();
  private cells: CellMap = new Map();
  private walkIds: number[] = [];
  private roadIds: number[] = [];

  setChunk(key: string, chunk: ChunkFile): void {
    this.chunks.set(key, chunk);
    this.rebuild();
  }

  deleteChunk(key: string): void {
    if (!this.chunks.delete(key)) return;
    this.rebuild();
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  get linkCount(): number {
    let n = 0;
    for (const row of this.adj) n += row.length;
    return n / 2;
  }

  stats(): { nodes: number; links: number; chunks: number; walk: number; road: number } {
    return {
      nodes: this.nodes.length,
      links: this.linkCount,
      chunks: this.chunks.size,
      walk: this.walkIds.length,
      road: this.roadIds.length,
    };
  }

  node(index: number): Node | undefined {
    return this.nodes[index];
  }

  hasAnchor(key: string): boolean {
    return this.keyTo.has(key);
  }

  nearest(x: number, z: number, mode: MoveMode, max = 24): number | null {
    let best = -1;
    let bestD = max;
    const reach = Math.ceil(max / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        const list = this.cells.get(`${ix}_${iz}`);
        if (!list) continue;
        for (const index of list) {
          const node = this.nodes[index];
          if (mode === "road" ? !node.road : !node.walk) continue;
          const d = Math.hypot(node.x - x, node.z - z);
          if (d < bestD) {
            bestD = d;
            best = index;
          }
        }
      }
    }
    return best < 0 ? null : best;
  }

  /**
   * A* capped at `limit` expansions. Returns null when no route exists.
   * Callers must not teleport to the goal on failure.
   */
  findPath(x: number, z: number, gx: number, gz: number, mode: MoveMode, limit = 700): PathPoint[] | null {
    const from = this.nearest(x, z, mode, 22);
    const to = this.nearest(gx, gz, mode, 22);
    if (from == null || to == null) return null;
    if (from === to) {
      const node = this.nodes[from];
      return [
        { x, z, kind: mode === "road" ? "road" : "sidewalk" },
        { x: node.x, z: node.z, kind: mode === "road" ? "road" : "sidewalk" },
        { x: gx, z: gz, kind: mode === "road" ? "road" : "sidewalk" },
      ];
    }
    const goal = this.nodes[to];
    const gScore = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, { id: number; kind: LinkKind }>();
    const open: number[] = [from];
    const closed = new Set<number>();
    let expanded = 0;
    let found = false;
    while (open.length && expanded < limit) {
      let bestI = 0;
      let bestF = Infinity;
      for (let i = 0; i < open.length; i++) {
        const id = open[i];
        const node = this.nodes[id];
        const f = (gScore.get(id) ?? 0) + Math.hypot(node.x - goal.x, node.z - goal.z);
        if (f < bestF) {
          bestF = f;
          bestI = i;
        }
      }
      const current = open.splice(bestI, 1)[0];
      if (closed.has(current)) continue;
      if (current === to) {
        found = true;
        break;
      }
      closed.add(current);
      expanded++;
      const base = gScore.get(current) ?? 0;
      for (const link of this.adj[current] ?? []) {
        if (!allows(link.kind, mode)) continue;
        const next = base + link.len * kindCost(link.kind);
        if (next >= (gScore.get(link.to) ?? Infinity)) continue;
        gScore.set(link.to, next);
        prev.set(link.to, { id: current, kind: link.kind });
        open.push(link.to);
      }
    }
    if (!found) return null;
    const out: PathPoint[] = [];
    let cursor = to;
    const stack: PathPoint[] = [];
    stack.push({ x: this.nodes[to].x, z: this.nodes[to].z, kind: "sidewalk" });
    while (cursor !== from) {
      const step = prev.get(cursor);
      if (!step) return null;
      stack[stack.length - 1].kind = step.kind;
      cursor = step.id;
      stack.push({ x: this.nodes[cursor].x, z: this.nodes[cursor].z, kind: step.kind });
    }
    while (stack.length) out.push(stack.pop()!);
    out.push({ x: gx, z: gz, kind: out[out.length - 1]?.kind ?? "sidewalk" });
    return out;
  }

  pickDest(x: number, z: number, mode: MoveMode, seed: number, min = 16, max = 72): { x: number; z: number } | null {
    const ids = mode === "road" ? this.roadIds : this.walkIds;
    if (!ids.length) return null;
    const choices: number[] = [];
    const start = seed % ids.length;
    for (let n = 0; n < ids.length && choices.length < 24; n++) {
      const index = ids[(start + n * 7) % ids.length];
      const node = this.nodes[index];
      const d = Math.hypot(node.x - x, node.z - z);
      if (d >= min && d <= max) choices.push(index);
    }
    if (!choices.length) {
      let best = ids[start % ids.length];
      let bestD = Infinity;
      for (let n = 0; n < Math.min(ids.length, 40); n++) {
        const index = ids[(start + n) % ids.length];
        const d = Math.hypot(this.nodes[index].x - x, this.nodes[index].z - z);
        if (d > 4 && d < bestD) {
          bestD = d;
          best = index;
        }
      }
      if (bestD === Infinity) return null;
      return { x: this.nodes[best].x, z: this.nodes[best].z };
    }
    const pick = this.nodes[choices[seed % choices.length]];
    return { x: pick.x, z: pick.z };
  }

  walkNodesNear(x: number, z: number, radius: number): Node[] {
    const out: Node[] = [];
    const reach = Math.ceil(radius / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let ix = cx - reach; ix <= cx + reach; ix++) {
      for (let iz = cz - reach; iz <= cz + reach; iz++) {
        const list = this.cells.get(`${ix}_${iz}`);
        if (!list) continue;
        for (const index of list) {
          const node = this.nodes[index];
          if (!node.walk) continue;
          if (Math.hypot(node.x - x, node.z - z) <= radius) out.push(node);
        }
      }
    }
    return out;
  }

  private rebuild(): void {
    this.nodes = [];
    this.adj = [];
    this.keyTo.clear();
    this.cells.clear();
    this.walkIds = [];
    this.roadIds = [];
    for (const chunk of this.chunks.values()) this.addChunk(chunk);
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].walk && (this.adj[i]?.length ?? 0) > 0) this.walkIds.push(i);
      if (this.nodes[i].road && (this.adj[i]?.length ?? 0) > 0) this.roadIds.push(i);
    }
    this.version++;
  }

  private addChunk(chunk: ChunkFile): void {
    const blocked = blockerFor(chunk);
    const elevated = new Set<number>();
    for (const road of chunk.roads) {
      if (road.bridge && road.y >= 2.5 && !FOOT.has(road.cls)) elevated.add(road.id);
      const plan = planFootBridge(road, chunk.origin);
      if (!plan) continue;
      this.addChain(resample(plan.deckPts, 6), "foot", blocked);
      for (const stair of plan.stairs) this.addChain(resample(stair.pts, 2.5), "foot", blocked);
    }
    for (const edge of chunk.graph.edges) {
      if (edge.pts.length < 4) continue;
      if (elevated.has(edge.way)) continue;
      if (BANNED.has(edge.cls) || /rail|tram|subway|monorail/.test(edge.cls)) continue;
      const sampled = resample(edge.pts, edge.cls === "steps" ? 3 : 8);
      if (sampled.length < 2) continue;
      if (FOOT.has(edge.cls)) {
        this.addChain(sampled, edge.cls === "living_street" ? "sidewalk" : "foot", blocked);
        continue;
      }
      if (!ROAD.has(edge.cls)) continue;
      this.addChain(sampled, "road", blocked);
      const half = (HIGHWAY_WIDTH_M[edge.cls] ?? 5.5) / 2 + 1.05;
      const left = offsetChain(sampled, half, 1);
      const right = offsetChain(sampled, half, -1);
      this.addChain(left, "sidewalk", blocked);
      this.addChain(right, "sidewalk", blocked);
      for (let i = 0; i < sampled.length; i += 2) {
        if (blocked(left[i][0], left[i][1]) || blocked(right[i][0], right[i][1])) continue;
        this.addChain([left[i], right[i]], "crossing", blocked);
      }
    }
  }

  private addChain(pts: Array<[number, number]>, kind: LinkKind, blocked: Blocker): void {
    let prev = -1;
    for (const [x, z] of pts) {
      if (blocked(x, z)) {
        prev = -1;
        continue;
      }
      const index = this.nodeAt(x, z, kind);
      if (prev >= 0 && prev !== index) this.link(prev, index, kind);
      prev = index;
    }
  }

  private nodeAt(x: number, z: number, kind: LinkKind): number {
    const key = snapKey(x, z);
    let index = this.keyTo.get(key);
    if (index == null) {
      index = this.nodes.length;
      this.nodes.push({ x, z, key, walk: false, road: false });
      this.adj.push([]);
      this.keyTo.set(key, index);
      const cell = cellKey(x, z);
      const list = this.cells.get(cell);
      if (list) list.push(index);
      else this.cells.set(cell, [index]);
    }
    const node = this.nodes[index];
    if (kind === "road") node.road = true;
    else node.walk = true;
    return index;
  }

  private link(a: number, b: number, kind: LinkKind): void {
    const len = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
    if (len < 0.4) return;
    const row = this.adj[a];
    if (!row.some((link) => link.to === b && link.kind === kind)) row.push({ to: b, kind, len });
    const back = this.adj[b];
    if (!back.some((link) => link.to === a && link.kind === kind)) back.push({ to: a, kind, len });
  }
}
