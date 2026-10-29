import assert from "node:assert/strict";
import test from "node:test";
import type { ChunkFile } from "../geo/types.ts";
import { createActor, stepActor } from "./actor.ts";
import { pointInOuter } from "./place.ts";
import { SolidWorld, solidsFromChunk } from "./solids.ts";

function blockWorld(): { world: SolidWorld; outer: number[] } {
  const outer = [0, -5, 14, -5, 14, 5, 0, 5];
  const chunk: ChunkFile = {
    v: 1,
    ix: 0,
    iy: 0,
    origin: [0, 0],
    roads: [],
    buildings: [{ id: 9, h: 16, hs: "estimated", outer }],
    water: [],
    canals: [],
    parks: [],
    rails: [],
    plazas: [],
    bridges: [],
    trees: [],
    landmarks: [],
    graph: { nodes: [], edges: [] },
  };
  const world = new SolidWorld();
  world.setChunk("0_0", solidsFromChunk(chunk).bucket);
  return { world, outer };
}

test("fly A still strafes and does not yaw", () => {
  const actor = createActor(0, 8, 0, 0);
  actor.keys.add("KeyA");
  const yaw = actor.yaw;
  stepActor(actor, 0.3, new SolidWorld());
  assert.ok(actor.x < -0.5, `strafe ${actor.x}`);
  assert.equal(actor.yaw, yaw);
});

test("walk A strafes left and cannot enter a building", () => {
  const { world, outer } = blockWorld();
  const walker = createActor(-4, 1.62, 0, 0);
  walker.mode = "walk";
  walker.keys.add("KeyA");
  stepActor(walker, 0.4, world);
  assert.ok(walker.x < -4.2, `walk strafe ${walker.x}`);
  assert.equal(walker.yaw, 0);

  const into = createActor(-3, 1.62, 0, -Math.PI / 2);
  into.mode = "walk";
  into.keys.add("KeyW");
  for (let i = 0; i < 90; i++) stepActor(into, 1 / 30, world);
  assert.equal(pointInOuter(into.x, into.z, outer), false);
  assert.ok(into.x < 0.2, `walked through ${into.x}`);
});

test("drive A yaws left and the car stops at the wall", () => {
  const open = new SolidWorld();
  const car = createActor(0, 1.28, 0, 0);
  car.mode = "drive";
  car.keys.add("KeyW");
  car.keys.add("KeyA");
  const yaw0 = car.yaw;
  for (let i = 0; i < 45; i++) stepActor(car, 1 / 30, open);
  const dy = Math.atan2(Math.sin(car.yaw - yaw0), Math.cos(car.yaw - yaw0));
  assert.ok(dy > 0.08, `A did not yaw left (${dy})`);
  assert.ok(car.drive > 0.2, `not moving ${car.drive}`);

  const { world, outer } = blockWorld();
  const ram = createActor(-8, 1.28, 0, -Math.PI / 2);
  ram.mode = "drive";
  ram.drive = 18;
  ram.keys.add("KeyW");
  for (let i = 0; i < 80; i++) stepActor(ram, 1 / 20, world);
  assert.equal(pointInOuter(ram.x, ram.z, outer), false);
  assert.ok(ram.x < 0.3, `car tunneled ${ram.x}`);
});
