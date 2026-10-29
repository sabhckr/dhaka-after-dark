import { dayPart } from "./clock.ts";
import { EventBus, noteWitness, viewBlocked } from "./events.ts";
import { finishInterrupt, interrupt, isInterrupt, tryTransition } from "./machine.ts";
import { PedNav } from "./nav.ts";
import { PROFILES } from "./profiles.ts";
import type { Activity, Npc, NpcState, PlayerSample } from "./types.ts";
import { hashStr } from "./types.ts";
import type { SolidWorld } from "../viewer/solids.ts";

export type BrainWorld = {
  nav: PedNav;
  bus: EventBus;
  world: SolidWorld;
  minutes: number;
  player: PlayerSample;
  npcs: Npc[];
};

function activityState(activity: Activity): NpcState {
  if (activity === "vend" || activity === "work") return "WORKING";
  if (activity === "wait-fare") return "WAITING";
  if (activity === "patrol" || activity === "commute" || activity === "home" || activity === "social") return "IDLE";
  return "IDLE";
}

export function applyActivity(npc: Npc, activity: Activity): void {
  npc.activity = activity;
  npc.destX = null;
  npc.destZ = null;
  npc.path = [];
  npc.pathI = 0;
  npc.scheduleDirty = false;
  if (activity === "off") {
    tryTransition(npc, "DESPAWNING", "shift-end");
    return;
  }
  const next = activityState(activity);
  if (!tryTransition(npc, next, "schedule")) tryTransition(npc, "IDLE", "schedule");
}

function go(npc: Npc, world: BrainWorld, x: number, z: number, state: NpcState, mode: Npc["mode"]): boolean {
  const path = world.nav.findPath(npc.x, npc.z, x, z, mode);
  if (!path || path.length < 2) {
    npc.repaths++;
    if (npc.state !== "WAITING" && npc.state !== "FLEEING") tryTransition(npc, "WAITING", "no-path");
    npc.fail = "no-path";
    npc.crossArm = Math.max(npc.crossArm, 1.4);
    return false;
  }
  npc.mode = mode;
  npc.destX = x;
  npc.destZ = z;
  npc.path = path;
  npc.pathI = 0;
  npc.navVersion = world.nav.version;
  npc.repaths = 0;
  npc.stuck = 0;
  npc.fail = null;
  if (npc.state !== state) tryTransition(npc, state, "path");
  return true;
}

function fleePoint(npc: Npc, world: BrainWorld): { x: number; z: number } | null {
  const event = npc.awareEvent != null ? world.bus.byId(npc.awareEvent) : undefined;
  const sx = event ? npc.x - event.x : Math.cos(npc.seed);
  const sz = event ? npc.z - event.z : Math.sin(npc.seed);
  const len = Math.hypot(sx, sz) || 1;
  return world.nav.pickDest(npc.x + (sx / len) * 8, npc.z + (sz / len) * 8, "walk", npc.seed + 3, 20, 60);
}

function perceive(npc: Npc, world: BrainWorld): void {
  if (npc.pendingEvent != null || npc.state === "DESPAWNING") return;
  const profile = PROFILES[npc.role];
  for (let i = world.bus.events.length - 1; i >= 0; i--) {
    const event = world.bus.events[i];
    if (event.status === "resolved") continue;
    if (npc.seen.includes(event.id)) continue;
    if (event.participants.includes(npc.id)) continue;
    const radio = event.status === "reported" && profile.capabilities.includes("police");
    const eyes = event.status !== "reported";
    if (!radio && !eyes) continue;
    if (radio && event.source === `report:${npc.id}`) continue;
    const dist = Math.hypot(event.x - npc.x, event.z - npc.z);
    const range = radio ? profile.radio : profile.perception * (0.55 + event.severity * 0.45);
    if (dist > range) continue;
    if (!radio && viewBlocked(world.world, npc.x, npc.z, event.x, event.z)) continue;
    npc.pendingEvent = event.id;
    npc.reaction = profile.reaction;
    return;
  }
}

function react(npc: Npc, world: BrainWorld): void {
  const id = npc.pendingEvent;
  npc.pendingEvent = null;
  npc.reaction = 0;
  if (id == null) return;
  const event = world.bus.byId(id);
  if (!event || event.status === "resolved") return;
  npc.seen.push(id);
  if (npc.seen.length > 8) npc.seen.shift();
  const profile = PROFILES[npc.role];
  if (profile.capabilities.includes("police") && event.status === "reported") {
    npc.awareEvent = id;
    noteWitness(event, npc);
    npc.investigateT = 0;
    if (go(npc, world, event.x, event.z, "INVESTIGATING", "walk")) return;
    tryTransition(npc, "INVESTIGATING", "report");
    return;
  }
  if (event.status === "reported") return;
  noteWitness(event, npc);
  npc.awareEvent = id;
  if (profile.capabilities.includes("crime") && event.type === "theft") return;
  if (profile.risk < 0.35) {
    const away = fleePoint(npc, world);
    if (away) go(npc, world, away.x, away.z, "FLEEING", "walk");
    else interrupt(npc, "FLEEING", "threat");
    return;
  }
  if (profile.risk < 0.62) {
    interrupt(npc, "OBSERVING_EVENT", "saw");
    return;
  }
  if (profile.capabilities.includes("report") && event.severity >= 0.35) {
    interrupt(npc, "REPORTING_INCIDENT", "report");
    return;
  }
  npc.awareEvent = null;
}

function ensurePatrol(npc: Npc, world: BrainWorld): void {
  if (npc.patrol.length >= 2) return;
  npc.patrol = [];
  for (let i = 0; i < 3; i++) {
    const dest = world.nav.pickDest(npc.anchorX, npc.anchorZ, "walk", npc.seed + i * 17, 12, 48);
    if (dest) npc.patrol.push(dest);
  }
}

export function decideNpc(npc: Npc, world: BrainWorld): void {
  if (!npc.alive || npc.state === "DESPAWNING") return;
  const profile = PROFILES[npc.role];
  const part = dayPart(world.minutes);
  if (part !== npc.part) {
    npc.part = part;
    if (isInterrupt(npc.state)) npc.scheduleDirty = true;
    else applyActivity(npc, profile.schedule[part]);
  }
  if (npc.scheduleDirty && !isInterrupt(npc.state)) {
    applyActivity(npc, profile.schedule[npc.part]);
    return;
  }

  if (npc.pendingEvent != null) {
    npc.reaction -= Math.max(npc.think, 0.05);
    if (npc.reaction <= 0) react(npc, world);
  } else {
    perceive(npc, world);
  }

  if (npc.interactAge > 0) return;

  if (npc.navVersion !== world.nav.version && npc.path.length) {
    npc.path = [];
    npc.fail = "chunk-changed";
  }

  const activity = npc.activity;
  if (npc.state === "SPAWNING") {
    applyActivity(npc, activity);
    return;
  }

  if (npc.state === "OBSERVING_EVENT" && npc.stateAge > 3.2) {
    finishInterrupt(npc);
    return;
  }
  if (npc.state === "REPORTING_INCIDENT" && npc.stateAge > 1.5) {
    const cause = npc.awareEvent;
    const event = cause != null ? world.bus.byId(cause) : undefined;
    if (event && event.status === "open") {
      world.bus.post({
        type: "disturbance",
        x: npc.x,
        z: npc.z,
        severity: Math.min(1, event.severity + 0.1),
        source: `report:${npc.id}`,
        participants: [npc.id],
        status: "reported",
        cause: event.id,
        ttl: 20,
      });
    }
    finishInterrupt(npc);
    return;
  }
  if (npc.state === "WAITING" && npc.stateAge > Math.max(0.4, npc.crossArm)) {
    npc.crossArm = 0;
    const back = npc.resume;
    npc.resume = null;
    if (back && tryTransition(npc, back, "wait-done")) return;
    tryTransition(npc, "IDLE", "wait-done");
    return;
  }
  if (npc.state === "BOARDING_VEHICLE" && npc.stateAge > 0.9) {
    if (npc.fareX == null) {
      const fare = world.nav.pickDest(npc.x, npc.z, "road", npc.seed + 9, 30, 90);
      if (fare) {
        npc.fareX = fare.x;
        npc.fareZ = fare.z;
      }
    }
    if (npc.fareX != null && npc.fareZ != null) go(npc, world, npc.fareX, npc.fareZ, "WALKING", "road");
    else tryTransition(npc, "WAITING", "no-fare");
    return;
  }
  if (npc.state === "EXITING_VEHICLE" && npc.stateAge > 0.8) {
    npc.fareX = null;
    npc.fareZ = null;
    npc.mode = "walk";
    go(npc, world, npc.anchorX, npc.anchorZ, "RETURNING_TO_ROUTINE", "walk");
    return;
  }
  if (npc.state === "FLEEING" && npc.pathI >= npc.path.length && npc.stateAge > 0.4) {
    if (npc.stuck < 1) finishInterrupt(npc);
    return;
  }
  if (npc.state === "INVESTIGATING") {
    const event = npc.awareEvent != null ? world.bus.byId(npc.awareEvent) : undefined;
    if (!event || event.status === "resolved") {
      finishInterrupt(npc);
      return;
    }
    if (Math.hypot(event.x - npc.x, event.z - npc.z) < 5) {
      npc.investigateT += Math.max(0.12, npc.think);
      event.status = "investigating";
      if (npc.investigateT > 3) {
        event.status = "resolved";
        event.ttl = 0.2;
        finishInterrupt(npc);
      }
    }
    return;
  }

  if (npc.stuck > 3.2 && npc.state !== "WAITING" && npc.state !== "WORKING" && npc.state !== "IDLE") {
    npc.fail = npc.fail ?? "stuck";
    npc.repaths++;
    npc.stuck = 0;
    if (npc.repaths > 3) {
      npc.path = [];
      npc.destX = null;
      npc.destZ = null;
      tryTransition(npc, "WAITING", "give-up");
      npc.crossArm = 1.5;
      npc.resume = "IDLE";
      return;
    }
    if (npc.destX != null && npc.destZ != null) go(npc, world, npc.destX, npc.destZ, npc.state, npc.mode);
    return;
  }

  if (activity === "patrol" && (npc.state === "IDLE" || (npc.state === "WALKING" && npc.pathI >= npc.path.length))) {
    ensurePatrol(npc, world);
    const point = npc.patrol[npc.patrolI % Math.max(1, npc.patrol.length)];
    if (!point) return;
    npc.patrolI++;
    go(npc, world, point.x, point.z, "WALKING", "walk");
    return;
  }

  if ((activity === "vend" || activity === "work") && npc.state === "WORKING") {
    const roam = profile.capabilities.includes("vend") ? 5 : profile.id === "cleaner" || profile.id === "construction" ? 8 : 0;
    if (roam > 0 && npc.stateAge > 6) {
      const dest = world.nav.pickDest(npc.anchorX, npc.anchorZ, "walk", hashStr(npc.id + String(Math.floor(npc.stateAge))) , 2, roam);
      if (dest && Math.hypot(dest.x - npc.anchorX, dest.z - npc.anchorZ) < roam + 4) {
        go(npc, world, dest.x, dest.z, "WALKING", "walk");
      }
    }
    return;
  }

  if (activity === "wait-fare" && npc.state === "WAITING") {
    const period = 18 + (npc.seed % 17);
    if (npc.stateAge > period && npc.fareX == null) {
      const fare = world.nav.pickDest(npc.x, npc.z, "road", npc.seed + Math.floor(npc.stateAge), 25, 80);
      if (fare) {
        npc.fareX = fare.x;
        npc.fareZ = fare.z;
        tryTransition(npc, "BOARDING_VEHICLE", "fare");
      }
    }
    return;
  }

  if (npc.state === "IDLE") {
    if (activity === "home") {
      if (Math.hypot(npc.anchorX - npc.x, npc.anchorZ - npc.z) > 3) {
        go(npc, world, npc.anchorX, npc.anchorZ, "WALKING", "walk");
      }
      return;
    }
    if (activity === "social" || activity === "commute") {
      const mode = profile.capabilities.includes("road") && !profile.capabilities.includes("fare") ? "road" : "walk";
      const dest = world.nav.pickDest(npc.x, npc.z, mode, npc.seed + Math.floor(world.minutes) + npc.repaths, 18, 70);
      if (dest) go(npc, world, dest.x, dest.z, "WALKING", mode);
      return;
    }
    if (profile.capabilities.includes("social") && npc.socialLeft <= 0) {
      const friend = world.npcs.find(
        (other) =>
          other.id !== npc.id &&
          other.alive &&
          (other.state === "IDLE" || other.state === "SOCIALIZING") &&
          PROFILES[other.role].capabilities.includes("group") &&
          Math.hypot(other.x - npc.x, other.z - npc.z) < 6,
      );
      if (friend) {
        npc.partner = friend.id;
        npc.socialLeft = 4 + (npc.seed % 5);
        tryTransition(npc, "SOCIALIZING", "friend");
      }
    }
    return;
  }

  if (npc.state === "SOCIALIZING") {
    npc.socialLeft -= Math.max(0.12, npc.think);
    const friend = world.npcs.find((other) => other.id === npc.partner && other.alive);
    if (!friend || npc.socialLeft <= 0) {
      npc.partner = null;
      npc.socialLeft = 0;
      tryTransition(npc, "IDLE", "chat-end");
      return;
    }
    const dx = friend.x - npc.x;
    const dz = friend.z - npc.z;
    if (Math.hypot(dx, dz) > 0.2) npc.yaw = Math.atan2(-dx, -dz);
    return;
  }

  if (npc.state === "WALKING" && npc.pathI >= npc.path.length && npc.destX != null) {
    const arrived = Math.hypot((npc.destX ?? npc.x) - npc.x, (npc.destZ ?? npc.z) - npc.z) < 2.2;
    if (!arrived && npc.repaths < 3) {
      go(npc, world, npc.destX, npc.destZ ?? npc.z, "WALKING", npc.mode);
      return;
    }
    if (npc.mode === "road" && npc.fareX != null) {
      tryTransition(npc, "EXITING_VEHICLE", "dropoff");
      return;
    }
    if (activity === "vend" || activity === "work") {
      tryTransition(npc, "WORKING", "arrived");
      return;
    }
    if (activity === "patrol") return;
    const vendor = world.npcs.find(
      (other) =>
        other.id !== npc.id &&
        other.state === "WORKING" &&
        PROFILES[other.role].capabilities.includes("vend") &&
        Math.hypot(other.x - npc.x, other.z - npc.z) < 7,
    );
    if (vendor && profile.capabilities.includes("social") && tryTransition(npc, "SHOPPING", "stall")) {
      npc.socialLeft = 2.5;
      return;
    }
    tryTransition(npc, "IDLE", "arrived");
  }

  if (npc.state === "SHOPPING" && npc.stateAge > 2.8) tryTransition(npc, "IDLE", "bought");

  if (npc.state === "RETURNING_TO_ROUTINE") {
    const back = npc.resume;
    const home = Math.hypot(npc.anchorX - npc.x, npc.anchorZ - npc.z) < 1.8 || npc.pathI >= npc.path.length;
    if (npc.path.length === 0) go(npc, world, npc.anchorX, npc.anchorZ, "RETURNING_TO_ROUTINE", "walk");
    if (home) {
      npc.resume = null;
      const next = back === "WORKING" || back === "WAITING" || back === "SOCIALIZING" ? back : activityState(activity);
      if (npc.scheduleDirty) applyActivity(npc, profile.schedule[npc.part]);
      else if (!tryTransition(npc, next, "restored")) tryTransition(npc, "IDLE", "restored");
    }
  }
}

export function hail(npc: Npc, world: BrainWorld): boolean {
  const profile = PROFILES[npc.role];
  if (npc.state === "DESPAWNING" || isInterrupt(npc.state)) return false;
  npc.interact = "player";
  npc.interactAge = profile.capabilities.includes("fare") ? 1.2 : 4;
  if (profile.capabilities.includes("fare") && (npc.state === "WAITING" || npc.state === "IDLE" || npc.state === "WORKING")) {
    const fare = world.nav.pickDest(npc.x, npc.z, "road", npc.seed + 11, 20, 70);
    if (fare) {
      npc.fareX = fare.x;
      npc.fareZ = fare.z;
    }
    return tryTransition(npc, "BOARDING_VEHICLE", "hail");
  }
  if (profile.capabilities.includes("vend")) {
    npc.anim = "serve";
    return true;
  }
  if (tryTransition(npc, "SOCIALIZING", "talk")) {
    npc.socialLeft = 3;
    return true;
  }
  return false;
}
