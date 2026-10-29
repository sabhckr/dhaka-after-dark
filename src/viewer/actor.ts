import { stepFly, type FlyState } from "./fly.ts";
import { moveSolid, type SolidWorld } from "./solids.ts";

/** Fly keeps strafe. Walk is on-foot strafe. Drive is a chase-cam car: A yaws left. */
export type RideMode = "fly" | "walk" | "drive";

export type Actor = FlyState & {
  mode: RideMode;
  drive: number;
  vy: number;
};

export function createActor(x: number, y: number, z: number, yaw = 0): Actor {
  return { x, y, z, yaw, pitch: -0.25, keys: new Set(), mode: "fly", drive: 0, vy: 0 };
}

const WALK_EYE = 1.62;
const DRIVE_EYE = 1.28;

function down(keys: Set<string>, code: string): boolean {
  return keys.has(code);
}

export function placeOnGround(actor: Actor, world: SolidWorld, mode: RideMode): void {
  actor.mode = mode;
  if (mode === "fly") return;
  const feet = actor.y - (mode === "walk" ? WALK_EYE : DRIVE_EYE);
  const support = world.support(actor.x, actor.z, Math.max(0, feet), 0.45, mode === "walk");
  actor.y = support + (mode === "walk" ? WALK_EYE : DRIVE_EYE);
  actor.vy = 0;
  actor.drive = 0;
  if (mode === "walk") actor.pitch = 0;
}

/**
 * One tick. `dt` seconds, capped by the caller.
 * Drive: KeyA → steer +1 → yaw increases (nose left on a chase cam).
 */
export function stepActor(actor: Actor, dt: number, world: SolidWorld): { speed: number; blocked: boolean } {
  const dtS = Math.min(Math.max(dt, 0), 0.1);
  if (actor.mode === "fly") {
    const x0 = actor.x;
    const y0 = actor.y;
    const z0 = actor.z;
    const speed = stepFly(actor, dtS);
    const hit = moveSolid(world, {
      x0,
      y0: y0 - WALK_EYE,
      z0,
      x1: actor.x,
      y1: actor.y - WALK_EYE,
      z1: actor.z,
      radius: 0.42,
      height: 1.55,
      stepUp: 0,
      climb: false,
      fly: true,
    });
    actor.x = hit.x;
    actor.y = hit.y + WALK_EYE;
    actor.z = hit.z;
    return { speed, blocked: hit.blocked };
  }

  if (actor.mode === "drive") {
    let throttle = 0;
    if (down(actor.keys, "KeyW") || down(actor.keys, "ArrowUp")) throttle += 1;
    if (down(actor.keys, "KeyS") || down(actor.keys, "ArrowDown")) throttle -= 1;
    const boost = down(actor.keys, "ShiftLeft") || down(actor.keys, "ShiftRight") ? 1.45 : 1;
    const max = 16 * boost;
    actor.drive += throttle * 18 * boost * dtS;
    if (throttle === 0) actor.drive *= Math.exp(-dtS * 1.4);
    if (actor.drive > max) actor.drive = max;
    if (actor.drive < -6) actor.drive = -6;
    if (Math.abs(actor.drive) < 0.08 && throttle === 0) actor.drive = 0;

    let steer = 0;
    if (down(actor.keys, "KeyA") || down(actor.keys, "ArrowLeft")) steer += 1;
    if (down(actor.keys, "KeyD") || down(actor.keys, "ArrowRight")) steer -= 1;
    const reverse = actor.drive >= 0 ? 1 : -1;
    const speedFactor = Math.min(1, Math.max(0.35, Math.abs(actor.drive) / 7));
    actor.yaw += steer * 1.65 * speedFactor * reverse * dtS;

    const fx = -Math.sin(actor.yaw);
    const fz = -Math.cos(actor.yaw);
    const feet0 = actor.y - DRIVE_EYE;
    const x1 = actor.x + fx * actor.drive * dtS;
    const z1 = actor.z + fz * actor.drive * dtS;
    const hit = moveSolid(world, {
      x0: actor.x,
      y0: feet0,
      z0: actor.z,
      x1,
      y1: feet0,
      z1,
      radius: 1.55,
      height: 1.35,
      stepUp: 0.35,
      climb: false,
      fly: false,
    });
    actor.x = hit.x;
    actor.y = hit.y + DRIVE_EYE;
    actor.z = hit.z;
    if (hit.blocked) actor.drive *= 0.35;
    return { speed: actor.drive, blocked: hit.blocked };
  }

  const cp = 1;
  const fx = -Math.sin(actor.yaw) * cp;
  const fz = -Math.cos(actor.yaw) * cp;
  const rx = Math.cos(actor.yaw);
  const rz = -Math.sin(actor.yaw);
  let mx = 0;
  let mz = 0;
  if (down(actor.keys, "KeyW") || down(actor.keys, "ArrowUp")) {
    mx += fx;
    mz += fz;
  }
  if (down(actor.keys, "KeyS") || down(actor.keys, "ArrowDown")) {
    mx -= fx;
    mz -= fz;
  }
  if (down(actor.keys, "KeyD") || down(actor.keys, "ArrowRight")) {
    mx += rx;
    mz += rz;
  }
  if (down(actor.keys, "KeyA") || down(actor.keys, "ArrowLeft")) {
    mx -= rx;
    mz -= rz;
  }
  const len = Math.hypot(mx, mz);
  let speedMul = 4.4;
  if (down(actor.keys, "ShiftLeft") || down(actor.keys, "ShiftRight")) speedMul = 7.2;
  const feet0 = actor.y - WALK_EYE;
  actor.vy = Math.max(-28, actor.vy - 22 * dtS);
  let x1 = actor.x;
  let z1 = actor.z;
  if (len > 0) {
    x1 += (mx / len) * speedMul * dtS;
    z1 += (mz / len) * speedMul * dtS;
  }
  const y1 = feet0 + actor.vy * dtS;
  const hit = moveSolid(world, {
    x0: actor.x,
    y0: feet0,
    z0: actor.z,
    x1,
    y1,
    z1,
    radius: 0.34,
    height: 1.7,
    stepUp: 1.05,
    climb: true,
    fly: false,
  });
  actor.x = hit.x;
  actor.y = hit.y + WALK_EYE;
  actor.z = hit.z;
  if (hit.grounded) actor.vy = 0;
  if (down(actor.keys, "KeyQ")) actor.yaw += 1.4 * dtS;
  if (down(actor.keys, "KeyE")) actor.yaw -= 1.4 * dtS;
  return { speed: len > 0 ? speedMul : 0, blocked: hit.blocked };
}
