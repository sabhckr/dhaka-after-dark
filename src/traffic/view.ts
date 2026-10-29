import * as THREE from "three";
import { moveSolid, type SolidWorld } from "../viewer/solids.ts";
import { InstanceBatcher } from "../viewer/batches.ts";
import { TrafficSim, type TrafficCar, type VehKind } from "./sim.ts";
import type { ChunkFile } from "../geo/types.ts";

const PAINTS = [0xe6e2d8, 0x8e949c, 0x2a3038, 0x8d3a34, 0x2c4a62, 0xc4b48a];

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _m = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _veh = new THREE.Matrix4();
const _qx = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0);
const _y = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);
const _ident = new THREE.Quaternion();

/**
 * Shared-material traffic meshes. Catalog vehicles stay in the showroom;
 * these are the cars that actually drive the loaded graph.
 * Parts that share a geometry and material are one InstancedMesh.
 * The sim remains the source of truth for position, yaw, and signals.
 */
export function createCityTraffic(scene: THREE.Scene, solids: SolidWorld) {
  const sim = new TrafficSim({
    max: 12,
    blocked(x0, z0, x1, z1, radius) {
      const hit = moveSolid(solids, {
        x0,
        y0: 0.35,
        z0,
        x1,
        y1: 0.35,
        z1,
        radius,
        height: 1.35,
        stepUp: 0.25,
        climb: false,
        fly: false,
      });
      return hit.blocked;
    },
  });

  const batcher = new InstanceBatcher("traffic");
  scene.add(batcher.root);

  const paint = PAINTS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.08 }));
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c242c, roughness: 0.18, metalness: 0.12 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff1d4, emissive: 0xffe2b0, emissiveIntensity: 0.35, roughness: 0.4 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a2420, emissive: 0xc43830, emissiveIntensity: 0.45, roughness: 0.45 });
  const green = new THREE.MeshStandardMaterial({ color: 0x1d6b38, roughness: 0.58, metalness: 0.06 });
  const busBody = new THREE.MeshStandardMaterial({ color: 0xe4e0d4, roughness: 0.6, metalness: 0.04 });
  const busStripe = new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.55 });
  const geos = {
    carBody: new THREE.BoxGeometry(1.72, 0.48, 4.4),
    carCab: new THREE.BoxGeometry(1.55, 0.4, 2.1),
    carGlass: new THREE.BoxGeometry(1.42, 0.28, 1.9),
    wheel: new THREE.CylinderGeometry(0.32, 0.32, 0.18, 8),
    lamp: new THREE.BoxGeometry(0.28, 0.1, 0.06),
    cng: new THREE.BoxGeometry(1.25, 1.15, 2.5),
    bike: new THREE.BoxGeometry(0.45, 0.7, 1.9),
    bus: new THREE.BoxGeometry(2.45, 2.5, 10),
    busWin: new THREE.BoxGeometry(2.2, 0.7, 7.2),
    shadow: new THREE.CircleGeometry(1, 14),
  };
  geos.shadow.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x241428,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  let contactShadows = false;
  const spin = new Map<number, number>();

  const vehicle = (x: number, z: number, yaw: number) => {
    _p.set(x, 0.02, z);
    _yaw.setFromAxisAngle(_y, yaw);
    _s.set(1, 1, 1);
    _veh.compose(_p, _yaw, _s);
  };

  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, quat: THREE.Quaternion, sx = 1, sy = 1, sz = 1, label: string) => {
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    _local.compose(_p, quat, _s);
    _m.multiplyMatrices(_veh, _local);
    batcher.add(geo, mat, _m, label);
  };

  const wheelAt = (x: number, y: number, z: number, angle: number, label: string) => {
    _qx.setFromAxisAngle(_x, angle);
    _qz.setFromAxisAngle(_z, Math.PI / 2);
    _q.copy(_qz).multiply(_qx);
    part(geos.wheel, rubber, x, y, z, _q, 1, 1, 1, label);
  };

  const sync = (dt: number) => {
    const live = new Set<number>();
    batcher.beginFrame();
    for (const car of sim.cars) {
      live.add(car.id);
      const angle = (spin.get(car.id) ?? 0) + car.speed * dt * 1.6;
      spin.set(car.id, angle);
      const label = `traffic ${car.kind}${car.held === "signal" ? " holding" : car.held === "gap" ? " braking" : ""}`;
      vehicle(car.x, car.z, car.yaw + Math.PI);
      const bodyPaint = paint[car.id % PAINTS.length];
      if (car.kind === "cng") {
        part(geos.cng, green, 0, 1.05, 0, _ident, 1, 1, 1, label);
        part(geos.carGlass, glass, 0, 1.35, 0.15, _ident, 0.8, 1, 0.7, label);
        wheelAt(0, 0.32, 1.05, angle, label);
        wheelAt(-0.55, 0.32, -0.7, angle, label);
        wheelAt(0.55, 0.32, -0.7, angle, label);
      } else if (car.kind === "bus") {
        part(geos.bus, busBody, 0, 1.7, 0, _ident, 1, 1, 1, label);
        part(geos.busWin, busStripe, 0, 1.55, 0, _ident, 1, 1, 1, label);
        part(geos.busWin, glass, 0, 2.35, -0.1, _ident, 0.92, 0.7, 1, label);
        wheelAt(-1.05, 0.36, 3.1, angle, label);
        wheelAt(1.05, 0.36, 3.1, angle, label);
        wheelAt(-1.05, 0.36, -3.1, angle, label);
        wheelAt(1.05, 0.36, -3.1, angle, label);
      } else if (car.kind === "bike") {
        part(geos.bike, bodyPaint, 0, 0.7, 0, _ident, 1, 1, 1, label);
        wheelAt(0, 0.32, 0.7, angle, label);
        wheelAt(0, 0.32, -0.7, angle, label);
      } else {
        part(geos.carBody, bodyPaint, 0, 0.55, 0, _ident, 1, 1, 1, label);
        part(geos.carCab, bodyPaint, 0, 0.95, -0.15, _ident, 1, 1, 1, label);
        part(geos.carGlass, glass, 0, 0.98, -0.15, _ident, 1, 1, 1, label);
        wheelAt(-0.78, 0.32, 1.35, angle, label);
        wheelAt(0.78, 0.32, 1.35, angle, label);
        wheelAt(-0.78, 0.32, -1.35, angle, label);
        wheelAt(0.78, 0.32, -1.35, angle, label);
      }
      const nose = car.kind === "bus" ? 5.05 : car.kind === "cng" ? 1.28 : car.kind === "bike" ? 0.95 : 2.2;
      const beamX = car.kind === "bike" ? 0 : 0.45;
      const beamY = car.kind === "bus" ? 1.1 : 0.62;
      part(geos.lamp, lamp, beamX, beamY, nose, _ident, 1, 1, 1, label);
      part(geos.lamp, tail, car.kind === "bike" ? 0 : -0.45, car.kind === "bus" ? 1.1 : 0.58, -nose, _ident, 1, 1, 1, label);
      if (contactShadows) {
        const sx = car.kind === "bus" ? 1.7 : car.kind === "bike" ? 0.45 : car.kind === "cng" ? 0.85 : 1.05;
        const sz = car.kind === "bus" ? 4.6 : car.kind === "bike" ? 1.15 : car.kind === "cng" ? 1.45 : 2.15;
        part(geos.shadow, shadowMat, 0, 0.04, 0, _ident, sx, 1, sz, label);
      }
    }
    for (const id of spin.keys()) if (!live.has(id)) spin.delete(id);
    batcher.endFrame();
  };

  return {
    sim,
    onChunk(key: string, chunk: ChunkFile) {
      sim.setChunk(
        key,
        chunk.graph.edges.map((edge) => ({
          id: edge.id,
          a: edge.a,
          b: edge.b,
          cls: edge.cls,
          oneway: edge.oneway,
          pts: edge.pts,
        })),
      );
    },
    onUnload(key: string) {
      sim.deleteChunk(key);
      sync(0);
    },
    tick(dt: number, player: { x: number; z: number }) {
      sim.tick(dt, player);
      sync(dt);
    },
    setQuality(quality: "low" | "high") {
      sim.max = quality === "high" ? 14 : 7;
      if (sim.cars.length > sim.max) sim.cars.splice(sim.max);
    },
    setContactShadows(enabled: boolean) {
      contactShadows = enabled;
    },
    get contactShadows() {
      return contactShadows;
    },
    debugDraw() {
      return { ...batcher.stats(), cars: sim.cars.length };
    },
    hudLine() {
      const held = sim.cars.filter((car: TrafficCar) => car.held === "signal").length;
      return `traffic  ${sim.cars.length}    holding at a signal ${held}`;
    },
    dispose() {
      sim.cars.splice(0, sim.cars.length);
      scene.remove(batcher.root);
      batcher.dispose();
      for (const geo of Object.values(geos)) geo.dispose();
      for (const mat of [...paint, glass, rubber, lamp, tail, green, busBody, busStripe, shadowMat]) mat.dispose();
    },
  };
}

export type CityTraffic = ReturnType<typeof createCityTraffic>;
