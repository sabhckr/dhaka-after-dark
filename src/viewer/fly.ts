/** Free-fly camera. A/D strafe; they do not steer. Yaw 0 looks toward geographic north (−Z). */

export type FlyState = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  keys: Set<string>;
};

export const FLY_SPEED = 70;

export function createFly(x: number, y: number, z: number, yaw = 0): FlyState {
  return { x, y, z, yaw, pitch: -0.35, keys: new Set() };
}

export function applyLook(state: FlyState, dx: number, dy: number, sensitivity = 0.0022): void {
  state.yaw -= dx * sensitivity;
  state.pitch -= dy * sensitivity;
  if (state.pitch > 1.25) state.pitch = 1.25;
  if (state.pitch < -1.25) state.pitch = -1.25;
}

/**
 * Integrate one frame. `keys` is the held set (event.code).
 * A = strafe left (−right), D = strafe right, W = along look, S = opposite.
 * Q yaws left (+yaw, nose toward −X), E yaws right. Space up, Control down.
 */
export function stepFly(state: FlyState, dt: number, speed = FLY_SPEED): number {
  const dtS = Math.min(Math.max(dt, 0), 0.1);
  let speedMul = 1;
  if (state.keys.has("ShiftLeft") || state.keys.has("ShiftRight")) speedMul = 4;
  if (state.keys.has("AltLeft") || state.keys.has("AltRight")) speedMul = 0.3;

  const cp = Math.cos(state.pitch);
  const sp = Math.sin(state.pitch);
  const fx = -Math.sin(state.yaw) * cp;
  const fy = sp;
  const fz = -Math.cos(state.yaw) * cp;
  const rx = Math.cos(state.yaw);
  const rz = -Math.sin(state.yaw);

  let mx = 0;
  let my = 0;
  let mz = 0;
  const down = (code: string) => state.keys.has(code);
  if (down("KeyW") || down("ArrowUp")) {
    mx += fx;
    my += fy;
    mz += fz;
  }
  if (down("KeyS") || down("ArrowDown")) {
    mx -= fx;
    my -= fy;
    mz -= fz;
  }
  if (down("KeyD") || down("ArrowRight")) {
    mx += rx;
    mz += rz;
  }
  if (down("KeyA") || down("ArrowLeft")) {
    mx -= rx;
    mz -= rz;
  }
  if (down("Space")) my += 1;
  if (down("ControlLeft") || down("ControlRight")) my -= 1;

  const len = Math.hypot(mx, my, mz);
  const v = speed * speedMul * dtS;
  if (len > 0) {
    state.x += (mx / len) * v;
    state.y += (my / len) * v;
    state.z += (mz / len) * v;
  }

  let yawRate = 0;
  if (down("KeyQ")) yawRate += 1;
  if (down("KeyE")) yawRate -= 1;
  state.yaw += yawRate * 1.35 * dtS;

  return len > 0 ? speed * speedMul : 0;
}
