import { decideNpc, hail, type BrainWorld } from "./brain.ts";
import { SimClock } from "./clock.ts";
import { EventBus, type IncidentDraft } from "./events.ts";
import { intentFor } from "./anim.ts";
import { tryTransition } from "./machine.ts";
import { PedNav } from "./nav.ts";
import { PROFILE_LIST, PROFILES } from "./profiles.ts";
import { Counter, PITCHES, type Pitch } from "./purchase.ts";
import { moveSolid, type SolidWorld } from "../viewer/solids.ts";
import type { ChunkFile } from "../geo/types.ts";
import { approachAngle, hashStr, type DayPart, type Npc, type PlayerSample, type RoleId } from "./types.ts";

/** Per-frame time for building the replacement pedestrian graph after an unload. */
const NAV_STEP_MS = 3;
const MOVING = new Set(["WALKING", "RUNNING", "FLEEING", "CROSSING_ROAD", "INVESTIGATING", "RETURNING_TO_ROUTINE"]);

export type PopulationOptions = {
  max?: number;
  spawnRadius?: number;
  despawnRadius?: number;
};

function blank(role: RoleId, x: number, z: number, chunk: string, key: string, seed: number): Npc {
  const profile = PROFILES[role];
  return {
    id: `npc-${seed.toString(16)}-${role}`,
    role,
    chunk,
    anchorKey: key,
    seed,
    x,
    y: 0,
    z,
    yaw: (seed % 628) / 100,
    state: "SPAWNING",
    resume: null,
    activity: profile.schedule.early,
    part: "early",
    scheduleDirty: false,
    anchorX: x,
    anchorZ: z,
    destX: null,
    destZ: null,
    path: [],
    pathI: 0,
    navVersion: 0,
    mode: "walk",
    stuck: 0,
    repaths: 0,
    stateAge: 0,
    think: (seed % 10) / 40,
    reaction: 0,
    pendingEvent: null,
    awareEvent: null,
    seen: [],
    interact: null,
    interactAge: 0,
    partner: null,
    socialLeft: 0,
    fail: null,
    lastTransition: "spawn",
    history: [],
    crossArm: 0,
    crossFor: -1,
    fareX: null,
    fareZ: null,
    patrol: [],
    patrolI: 0,
    investigateT: 0,
    scripted: false,
    alive: true,
    anim: "idle",
    bob: (seed % 100) / 100,
  };
}

/**
 * NPC lifecycle for the loaded chunks. One population, ticked from the
 * existing viewer loop. Movement goes through the same `moveSolid` walker
 * the player uses, so building walls stay solid.
 */
export class Population {
  readonly nav = new PedNav();
  readonly bus = new EventBus();
  readonly clock = new SimClock();
  readonly npcs: Npc[] = [];
  readonly world: SolidWorld;
  readonly counter = new Counter();
  debug = false;
  max: number;
  spawnRadius: number;
  despawnRadius: number;
  player: PlayerSample = { x: 0, y: 40, z: 0, mode: "fly", speed: 0 };
  aiMs = 0;
  failures = 0;
  spawnRejected = 0;
  private refreshIn = 0;
  private threatIn = 0;
  private interactLock: string | null = null;
  private seq = 1;

  constructor(world: SolidWorld, opts: PopulationOptions = {}) {
    this.world = world;
    this.max = opts.max ?? 26;
    this.spawnRadius = opts.spawnRadius ?? 145;
    this.despawnRadius = opts.despawnRadius ?? 185;
  }

  onChunk(key: string, chunk: ChunkFile): void {
    this.nav.setChunk(key, chunk);
    this.refreshIn = 0;
  }

  onUnload(key: string): void {
    this.nav.deleteChunk(key);
    this.dropUnanchored(key);
  }

  /**
   * Removes walkers that belonged to an unloaded chunk. Streamed walkers are
   * checked against the live graph, which keeps an unloaded chunk's nodes until
   * its replacement is swapped in, so the tick checks them again after a swap.
   */
  private dropUnanchored(key: string | null): void {
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      const gone = (key !== null && npc.chunk === key) || (npc.chunk === "stream" && !this.nav.hasAnchor(npc.anchorKey));
      if (!gone) continue;
      npc.alive = false;
      npc.lastTransition = "chunk-unload";
      this.npcs.splice(i, 1);
    }
  }

  setQuality(quality: "low" | "medium" | "high"): void {
    this.max = quality === "high" ? 26 : quality === "medium" ? 16 : 10;
  }

  spawnAgent(role: RoleId, x: number, z: number, chunk = "test"): Npc | null {
    const spot = this.clearSpot(x, z);
    if (!spot) {
      this.spawnRejected++;
      return null;
    }
    const seed = this.seq++;
    const npc = blank(role, spot.x, spot.z, chunk, `${chunk}:${seed}`, seed);
    npc.y = spot.y;
    npc.part = this.clock.part;
    npc.activity = PROFILES[role].schedule[npc.part];
    if (npc.activity === "off") npc.activity = "commute";
    this.npcs.push(npc);
    return npc;
  }

  tick(dt: number): void {
    const step = Math.min(Math.max(dt, 0), 0.1);
    if (step <= 0) return;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (this.nav.step(NAV_STEP_MS)) this.dropUnanchored(null);
    this.clock.advance(step);
    this.bus.advance(step);
    this.noteDanger(step);
    this.counter.tick(step, this.player.x, this.player.z, this.player.y, this.player.mode);
    this.refreshIn -= step;
    if (this.refreshIn <= 0) {
      this.refresh();
      this.refreshIn = 1;
    }
    const ctx: BrainWorld = {
      nav: this.nav,
      bus: this.bus,
      world: this.world,
      minutes: this.clock.minutes,
      player: this.player,
      npcs: this.npcs,
    };
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      if (!npc.alive) {
        this.npcs.splice(i, 1);
        continue;
      }
      npc.stateAge += step;
      if (npc.interactAge > 0) {
        npc.interactAge -= step;
        if (npc.interactAge <= 0) npc.interact = null;
      }
      const dist = Math.hypot(npc.x - this.player.x, npc.z - this.player.z);
      npc.think -= step;
      if (npc.think <= 0) {
        npc.think = dist < 48 ? 0.14 : dist < 110 ? 0.45 : 1.15;
        const before = npc.fail;
        decideNpc(npc, ctx);
        if (npc.fail && npc.fail !== before) this.failures++;
      }
      this.stepBody(npc, step, dist);
      npc.anim = intentFor(npc.state, PROFILES[npc.role].capabilities.includes("phone") && npc.state === "IDLE" && npc.seed % 2 === 0);
      const sale = this.counter.sale;
      if (sale && npc.id === `pitch-${sale.pitchId}`) {
        npc.anim = "serve";
        npc.interact = "player";
        npc.interactAge = 0.5;
        const dx = this.player.x - npc.x;
        const dz = this.player.z - npc.z;
        if (Math.hypot(dx, dz) > 0.3) npc.yaw = Math.atan2(-dx, -dz);
      }
      if (npc.state === "DESPAWNING" && npc.stateAge > 0.6) {
        npc.alive = false;
        this.npcs.splice(i, 1);
      }
    }
    if (this.interactLock) {
      const locked = this.npcs.find((npc) => npc.id === this.interactLock);
      if (!locked || Math.hypot(locked.x - this.player.x, locked.z - this.player.z) > 4.5) this.interactLock = null;
    }
    this.aiMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
  }

  interact(): string | null {
    if (this.counter.sale && this.counter.sale.phase !== "served") return `sale:${this.counter.sale.pitchId}`;
    if (this.interactLock) {
      const locked = this.npcs.find((npc) => npc.id === this.interactLock);
      if (locked && locked.interact) return locked.id;
      this.interactLock = null;
    }
    let best: Npc | null = null;
    let bestD = 2.5;
    let fare: Npc | null = null;
    let fareD = 2.5;
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.x - this.player.x, npc.z - this.player.z);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
      if (d < fareD && PROFILES[npc.role].capabilities.includes("fare")) {
        fareD = d;
        fare = npc;
      }
    }
    if (fare) best = fare;
    else {
      const sale = this.counter.begin(this.player.x, this.player.z, this.player.y, this.player.mode);
      if (sale && this.counter.sale) return `sale:${this.counter.sale.pitchId}`;
    }
    if (!best) return null;
    const ctx: BrainWorld = {
      nav: this.nav,
      bus: this.bus,
      world: this.world,
      minutes: this.clock.minutes,
      player: this.player,
      npcs: this.npcs,
    };
    if (!hail(best, ctx)) return null;
    this.interactLock = best.id;
    return best.id;
  }

  /** Scripted snatch. Only the chintai role flees as the suspect. */
  scriptSnatch(id?: string): Npc | null {
    const npc =
      (id ? this.npcs.find((item) => item.id === id) : null) ??
      this.npcs.find((item) => item.role === "chintai" && !item.scripted && item.alive);
    if (!npc || !PROFILES[npc.role].capabilities.includes("crime")) return null;
    npc.scripted = true;
    const event = this.bus.post({
      type: "theft",
      x: npc.x,
      z: npc.z,
      severity: 0.72,
      source: npc.id,
      participants: [npc.id],
      ttl: 16,
    });
    npc.awareEvent = event.id;
    npc.seen.push(event.id);
    const away = this.nav.pickDest(npc.x + 6, npc.z + 4, "walk", npc.seed + 99, 18, 55);
    npc.resume = npc.resume ?? "IDLE";
    if (away) {
      const path = this.nav.findPath(npc.x, npc.z, away.x, away.z, "walk");
      if (path && path.length > 1) {
        npc.path = path;
        npc.pathI = 0;
        npc.destX = away.x;
        npc.destZ = away.z;
        npc.mode = "walk";
        npc.navVersion = this.nav.version;
        tryTransition(npc, "FLEEING", "snatch");
        return npc;
      }
    }
    tryTransition(npc, "FLEEING", "snatch");
    return npc;
  }

  post(draft: IncidentDraft): ReturnType<EventBus["post"]> {
    return this.bus.post(draft);
  }

  snapshot(): NpcDebug {
    let selected: Npc | null = null;
    let best = Infinity;
    const byRole: Record<string, number> = {};
    const byState: Record<string, number> = {};
    for (const npc of this.npcs) {
      byRole[npc.role] = (byRole[npc.role] ?? 0) + 1;
      byState[npc.state] = (byState[npc.state] ?? 0) + 1;
      const d = Math.hypot(npc.x - this.player.x, npc.z - this.player.z);
      if (d < best) {
        best = d;
        selected = npc;
      }
    }
    const nav = this.nav.stats();
    return {
      count: this.npcs.length,
      byRole,
      byState,
      aiMs: this.aiMs,
      navNodes: nav.nodes,
      navLinks: nav.links,
      events: this.bus.events.length,
      failures: this.failures,
      clock: this.clock.label,
      debug: this.debug,
      selected: selected
        ? {
            id: selected.id,
            role: selected.role,
            name: PROFILES[selected.role].name,
            state: selected.state,
            activity: selected.activity,
            dest: selected.destX == null ? null : { x: selected.destX, z: selected.destZ ?? 0 },
            x: selected.x,
            z: selected.z,
            pathLeft: Math.max(0, selected.path.length - selected.pathI),
            fail: selected.fail,
            last: selected.lastTransition,
            event: selected.awareEvent,
            interact: selected.interact,
          }
        : null,
    };
  }

  hudLine(): string {
    const sale = this.counter.line();
    const near = !sale && this.player.mode !== "fly" && this.player.y <= 8 ? this.counter.nearest(this.player.x, this.player.z) : null;
    const tail = sale || (near ? `G buys ${near.name} for ${near.price} taka` : "");
    if (!this.debug) {
      const base = `people ${this.npcs.length}    ${this.clock.label}`;
      return tail ? `${base}    ${tail}` : base;
    }
    const snap = this.snapshot();
    const sel = snap.selected;
    const base = sel
      ? `people ${snap.count}  ${sel.name}  ${sel.state}  ${sel.fail ?? sel.last}  path ${sel.pathLeft}  ai ${snap.aiMs.toFixed(2)} ms`
      : `people ${snap.count}  nobody near  ai ${snap.aiMs.toFixed(2)} ms`;
    return tail ? `${base}    ${tail}` : base;
  }

  nearest(x = this.player.x, z = this.player.z): Npc | null {
    let best: Npc | null = null;
    let bestD = Infinity;
    for (const npc of this.npcs) {
      const d = Math.hypot(npc.x - x, npc.z - z);
      if (d < bestD) {
        bestD = d;
        best = npc;
      }
    }
    return best;
  }

  dispose(): void {
    this.bus.dispose();
    this.npcs.length = 0;
    this.interactLock = null;
  }

  private noteDanger(dt: number): void {
    this.threatIn -= dt;
    const close = this.npcs.some((npc) => Math.hypot(npc.x - this.player.x, npc.z - this.player.z) < 22);
    if (!close || this.threatIn > 0) return;
    if (this.player.mode === "drive" && this.player.speed > 12 && this.player.y < 8) {
      this.bus.post({
        type: "dangerous-driving",
        x: this.player.x,
        z: this.player.z,
        severity: Math.min(1, this.player.speed / 18),
        source: "player",
        ttl: 7,
      });
      this.threatIn = 3.5;
    }
  }

  private refresh(): void {
    const part = this.clock.part;
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const npc = this.npcs[i];
      const dist = Math.hypot(npc.x - this.player.x, npc.z - this.player.z);
      if (dist > this.despawnRadius && !npc.interact) {
        npc.alive = false;
        npc.lastTransition = "distance-despawn";
        this.npcs.splice(i, 1);
      }
    }
    this.ensurePitches();
    if (this.npcs.length >= this.max) return;
    if (this.player.y > 80) return;
    const nodes = this.nav.walkNodesNear(this.player.x, this.player.z, this.spawnRadius);
    nodes.sort((a, b) => (a.key < b.key ? -1 : 1));
    const used = new Set(this.npcs.map((npc) => npc.anchorKey));
    let budget = Math.min(3, this.max - this.npcs.length);
    for (const node of nodes) {
      if (budget <= 0) break;
      if (used.has(node.key)) continue;
      const dist = Math.hypot(node.x - this.player.x, node.z - this.player.z);
      if (dist < 14 || dist > this.spawnRadius) continue;
      if (hashStr(node.key + part) % 100 > 55) continue;
      const role = this.pickRole(node.key, part);
      if (!role) continue;
      const spot = this.clearSpot(node.x, node.z);
      if (!spot) {
        this.spawnRejected++;
        continue;
      }
      const seed = hashStr(node.key + role);
      const npc = blank(role, spot.x, spot.z, "stream", node.key, seed);
      npc.y = spot.y;
      npc.part = part;
      npc.activity = PROFILES[role].schedule[part];
      if (npc.activity === "off") continue;
      npc.id = `npc-${node.key}-${role}`;
      this.npcs.push(npc);
      used.add(node.key);
      budget--;
    }
    this.considerSnatch();
    this.greetPitches();
  }

  /** Keep a seller beside each placed tea and flower stall while the player is near. */
  private ensurePitches(): void {
    if (this.player.y > 80) return;
    for (const pitch of PITCHES) {
      const id = `pitch-${pitch.id}`;
      if (this.npcs.some((npc) => npc.id === id)) continue;
      const dist = Math.hypot(pitch.x - this.player.x, pitch.z - this.player.z);
      if (dist > this.spawnRadius) continue;
      if (this.npcs.length >= this.max) {
        let far: Npc | null = null;
        let farD = -1;
        for (const npc of this.npcs) {
          if (npc.id.startsWith("pitch-")) continue;
          const d = Math.hypot(npc.x - this.player.x, npc.z - this.player.z);
          if (d > farD) {
            farD = d;
            far = npc;
          }
        }
        if (!far) continue;
        this.npcs.splice(this.npcs.indexOf(far), 1);
      }
      const spot = this.placePitch(pitch);
      const seed = hashStr(pitch.id);
      const npc = blank(pitch.role, spot.x, spot.z, "pitch", `pitch:${pitch.id}`, seed);
      npc.id = id;
      npc.y = spot.y;
      npc.activity = "vend";
      npc.state = "WORKING";
      npc.part = this.clock.part;
      const dx = pitch.x - spot.x;
      const dz = pitch.z - spot.z;
      if (Math.hypot(dx, dz) > 0.2) npc.yaw = Math.atan2(-dx, -dz);
      this.npcs.push(npc);
    }
  }

  private placePitch(pitch: Pitch): { x: number; z: number; y: number } {
    const toward = (scale: number) => ({
      x: pitch.x + (pitch.standX - pitch.x) * scale,
      z: pitch.z + (pitch.standZ - pitch.z) * scale,
    });
    for (const scale of [1, 1.45, 0.55]) {
      const at = toward(scale);
      const spot = this.clearSpot(at.x, at.z);
      if (spot) return spot;
    }
    return { x: pitch.standX, z: pitch.standZ, y: 0 };
  }

  /** One idle civilian near a pitch stops to look, instead of every passer starting a queue. */
  private greetPitches(): void {
    for (const pitch of PITCHES) {
      const keeper = this.npcs.find((npc) => npc.id === `pitch-${pitch.id}` && npc.state === "WORKING");
      if (!keeper) continue;
      const busy = this.npcs.some(
        (npc) => npc.state === "SHOPPING" && Math.hypot(npc.x - keeper.x, npc.z - keeper.z) < 6,
      );
      if (busy) continue;
      const guest = this.npcs.find(
        (npc) =>
          npc.id !== keeper.id &&
          npc.state === "IDLE" &&
          npc.stateAge > 1.2 &&
          PROFILES[npc.role].capabilities.includes("social") &&
          Math.hypot(npc.x - keeper.x, npc.z - keeper.z) < 5.5,
      );
      if (!guest) continue;
      if (tryTransition(guest, "SHOPPING", "pitch")) guest.socialLeft = 2.5;
    }
  }

  private considerSnatch(): void {
    if (this.player.mode === "fly" || this.player.y > 6) return;
    for (const npc of this.npcs) {
      if (npc.role !== "chintai" || npc.scripted) continue;
      if (Math.hypot(npc.x - this.player.x, npc.z - this.player.z) < 7) {
        this.scriptSnatch(npc.id);
        return;
      }
    }
  }

  private pickRole(key: string, part: DayPart): RoleId | null {
    let sum = 0;
    const rows: { id: RoleId; acc: number }[] = [];
    for (const profile of PROFILE_LIST) {
      const weight = profile.density[part];
      if (weight <= 0) continue;
      if (profile.schedule[part] === "off") continue;
      sum += weight;
      rows.push({ id: profile.id, acc: sum });
    }
    if (!sum) return null;
    const roll = hashStr(`${key}:${part}:role`) % sum;
    for (const row of rows) if (roll < row.acc) return row.id;
    return rows[rows.length - 1]?.id ?? null;
  }

  private clearSpot(x: number, z: number): { x: number; z: number; y: number } | null {
    const support = this.world.support(x, z, 0, 0.6, true);
    if (support > 2.4) return null;
    const hit = moveSolid(this.world, {
      x0: x,
      y0: support,
      z0: z,
      x1: x,
      y1: support,
      z1: z,
      radius: 0.32,
      height: 1.65,
      stepUp: 0.45,
      climb: true,
      fly: false,
    });
    if (Math.hypot(hit.x - x, hit.z - z) > 1.1) return null;
    return { x: hit.x, z: hit.z, y: hit.y };
  }

  private stepBody(npc: Npc, dt: number, dist: number): void {
    const profile = PROFILES[npc.role];
    const moving = MOVING.has(npc.state);
    if (!moving) {
      if (dist < 70) npc.bob += dt * (npc.state === "WORKING" ? 1.4 : 0.6);
      return;
    }
    if (npc.navVersion !== this.nav.version) return;
    while (npc.pathI < npc.path.length && Math.hypot(npc.path[npc.pathI].x - npc.x, npc.path[npc.pathI].z - npc.z) < 0.85) {
      npc.pathI++;
    }
    const point = npc.path[npc.pathI];
    if (!point) return;
    if (point.kind === "crossing" && npc.state !== "FLEEING" && npc.state !== "RUNNING") {
      if (npc.crossFor !== npc.pathI) {
        npc.crossFor = npc.pathI;
        npc.crossArm = profile.crossDelay;
      }
      if (npc.crossArm > 0) {
        npc.crossArm -= dt;
        return;
      }
      if (this.trafficDanger(point.x, point.z)) return;
      if (npc.state === "WALKING" || npc.state === "INVESTIGATING" || npc.state === "RETURNING_TO_ROUTINE") {
        tryTransition(npc, "CROSSING_ROAD", "crossing");
      }
    } else if (npc.state === "CROSSING_ROAD" && point.kind !== "crossing") {
      tryTransition(npc, "WALKING", "crossed");
    }
    let dx = point.x - npc.x;
    let dz = point.z - npc.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    if (dist < 42) {
      for (const other of this.npcs) {
        if (other === npc) continue;
        const ox = npc.x - other.x;
        const oz = npc.z - other.z;
        const od = Math.hypot(ox, oz);
        if (od > 0.05 && od < 0.95) {
          dx += (ox / od) * 0.55;
          dz += (oz / od) * 0.55;
        }
      }
      const sl = Math.hypot(dx, dz) || 1;
      dx /= sl;
      dz /= sl;
    }
    const yawTarget = Math.atan2(-dx, -dz);
    npc.yaw = approachAngle(npc.yaw, yawTarget, profile.turn * dt);
    let speed = npc.state === "FLEEING" || npc.state === "RUNNING" ? profile.run : profile.speed;
    if (npc.state === "CROSSING_ROAD") speed *= 0.7;
    if (npc.state === "SHOPPING") speed = profile.speed;
    const faceX = -Math.sin(npc.yaw);
    const faceZ = -Math.cos(npc.yaw);
    const step = Math.min(len, speed * dt);
    const feet = npc.y;
    const hit = moveSolid(this.world, {
      x0: npc.x,
      y0: feet,
      z0: npc.z,
      x1: npc.x + faceX * step,
      y1: feet,
      z1: npc.z + faceZ * step,
      radius: profile.radius,
      height: 1.6,
      stepUp: 0.85,
      climb: true,
      fly: false,
    });
    const moved = Math.hypot(hit.x - npc.x, hit.z - npc.z);
    if (moved < step * 0.22 && step > 0.03) npc.stuck += dt;
    else npc.stuck = Math.max(0, npc.stuck - dt * 0.5);
    npc.x = hit.x;
    npc.y = hit.y;
    npc.z = hit.z;
    npc.bob += dt * speed;
  }

  private trafficDanger(x: number, z: number): boolean {
    if (this.player.mode !== "drive" || this.player.speed < 7 || this.player.y > 6) return false;
    return Math.hypot(this.player.x - x, this.player.z - z) < 14;
  }
}

export type NpcDebug = {
  count: number;
  byRole: Record<string, number>;
  byState: Record<string, number>;
  aiMs: number;
  navNodes: number;
  navLinks: number;
  events: number;
  failures: number;
  clock: string;
  debug: boolean;
  selected: null | {
    id: string;
    role: string;
    name: string;
    state: string;
    activity: string;
    dest: { x: number; z: number } | null;
    x: number;
    z: number;
    pathLeft: number;
    fail: string | null;
    last: string;
    event: number | null;
    interact: string | null;
  };
};
