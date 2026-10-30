import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { ChunkFile } from "../geo/types.ts";
import { SolidWorld } from "../viewer/solids.ts";
import { TrafficSim, type RawEdge } from "./sim.ts";
import { createCityTraffic } from "./view.ts";

function edge(id: string, a: string, b: string, pts: number[], cls = "residential", oneway: -1 | 0 | 1 = 0): RawEdge {
  return { id, a, b, cls, oneway, pts };
}

test("a car advances along a residential edge and ignores footways", () => {
  const sim = new TrafficSim({ rand: () => 0 });
  sim.setChunk("c", [
    edge("e", "a", "b", [0, 0, 80, 0]),
    edge("foot", "a", "b", [0, 4, 80, 4], "footway"),
    edge("fast", "a", "b", [0, 8, 80, 8], "motorway"),
  ]);
  assert.equal(sim.edgeCount, 1);
  const car = sim.addCar({ kind: "car", edge: "c|e", dir: 1, s: 10, speed: 10, cruise: 10 });
  assert.ok(car);
  const before = car.s;
  sim.tick(0.5, { x: 40, z: 0 });
  assert.ok(car.s > before + 3);
  assert.equal(car.edge, "c|e");
  assert.equal(car.dir, 1);
});

test("oneway traffic is not driven backward", () => {
  const sim = new TrafficSim();
  sim.setChunk("c", [edge("e", "a", "b", [0, 0, 60, 0], "primary", 1)]);
  const car = sim.addCar({ kind: "bike", edge: "c|e", dir: -1, s: 20, speed: 8, cruise: 8 });
  assert.equal(car?.dir, 1);
  const s0 = car!.s;
  sim.tick(0.4, { x: 30, z: 0 });
  assert.ok(car!.s > s0);
});

test("a follower brakes for the vehicle ahead", () => {
  const sim = new TrafficSim();
  sim.setChunk("c", [edge("e", "a", "b", [0, 0, 120, 0], "secondary")]);
  const lead = sim.addCar({ kind: "bus", edge: "c|e", dir: 1, s: 40, speed: 2, cruise: 2 })!;
  const tail = sim.addCar({ kind: "car", edge: "c|e", dir: 1, s: 22, speed: 12, cruise: 12 })!;
  for (let i = 0; i < 10; i++) sim.tick(0.1, { x: 50, z: 0 });
  assert.equal(tail.held, "gap");
  assert.ok(tail.speed < 6, `follower still fast (${tail.speed})`);
  assert.ok(tail.s < lead.s);
});

test("a car takes the forward edge instead of reversing", () => {
  const sim = new TrafficSim();
  sim.setChunk("c", [
    edge("ab", "a", "b", [0, 0, 30, 0]),
    edge("bc", "b", "c", [30, 0, 70, 0]),
  ]);
  const car = sim.addCar({ kind: "cng", edge: "c|ab", dir: 1, s: 27, speed: 20, cruise: 20 })!;
  sim.tick(0.3, { x: 30, z: 0 });
  assert.equal(car.edge, "c|bc");
  assert.equal(car.dir, 1);
  assert.ok(car.s < 12);
});

test("cross traffic holds at a red phase and the open axis does not", () => {
  const sim = new TrafficSim();
  sim.time = 0.1;
  sim.setChunk("c", [
    edge("west", "w", "m", [0, 0, 40, 0]),
    edge("east", "m", "e", [40, 0, 80, 0]),
    edge("south", "s", "m", [40, -40, 40, 0]),
    edge("north", "m", "n", [40, 0, 40, 40]),
  ]);
  const across = sim.addCar({ kind: "car", edge: "c|west", dir: 1, s: 30, speed: 8, cruise: 8 })!;
  const side = sim.addCar({ kind: "car", edge: "c|south", dir: 1, s: 34, speed: 8, cruise: 8 })!;
  sim.tick(0.4, { x: 40, z: 0 });
  assert.notEqual(across.held, "signal");
  assert.ok(across.s > 30.5);
  assert.equal(side.held, "signal");
  assert.ok(side.speed < 0.5);
  assert.ok(side.s <= 33.6);
  assert.equal(sim.green("m", 0), true);
  assert.equal(sim.green("m", 1), false);
});

test("a bending approach holds at red without jumping back and crosses on green", () => {
  const sim = new TrafficSim();
  sim.time = 0.1;
  sim.setChunk("c", [
    // Runs east, then turns north into the junction for its last six metres.
    edge("bend", "w", "m", [-20, -4, 37, -5, 40, 0]),
    edge("east", "m", "e", [40, 0, 80, 0]),
    edge("north", "m", "n", [40, 0, 40, 40]),
    edge("south", "s", "m", [40, -40, 40, -10, 40, 0]),
  ]);
  const car = sim.addCar({ kind: "car", edge: "c|bend", dir: 1, s: 46, speed: 8, cruise: 8 })!;
  let back = 0;
  let last = car.s;
  for (let t = 0; t < 6; t += 1 / 60) {
    sim.tick(1 / 60, { x: 40, z: 0 });
    if (car.edge === "c|bend" && car.s < last - 1e-6) back++;
    last = car.s;
  }
  assert.equal(car.edge, "c|bend");
  assert.equal(car.held, "signal");
  assert.equal(back, 0);
  for (let t = 0; t < 4; t += 1 / 60) sim.tick(1 / 60, { x: 40, z: 0 });
  assert.notEqual(car.edge, "c|bend");
});

test("unload drops cars whose edge left with the chunk", () => {
  const sim = new TrafficSim();
  sim.setChunk("c", [edge("e", "a", "b", [0, 0, 40, 0])]);
  sim.addCar({ kind: "car", edge: "c|e", dir: 1, s: 8 });
  assert.equal(sim.cars.length, 1);
  sim.deleteChunk("c");
  assert.equal(sim.cars.length, 0);
  assert.equal(sim.edgeCount, 0);
});

test("a blocked step does not tunnel and the car is removed", () => {
  const sim = new TrafficSim({
    blocked: () => true,
  });
  sim.setChunk("c", [edge("e", "a", "b", [0, 0, 80, 0])]);
  const car = sim.addCar({ kind: "car", edge: "c|e", dir: 1, s: 10, speed: 10, cruise: 10 })!;
  const x = car.x;
  sim.tick(0.2, { x: 20, z: 0 });
  assert.equal(sim.cars.length, 1);
  assert.equal(car.held, "blocked");
  assert.equal(car.x, x);
  sim.tick(1.7, { x: 20, z: 0 });
  assert.equal(sim.cars.length, 0);
});

test("traffic drawing instances follow the sim and clear on unload", () => {
  const scene = new THREE.Scene();
  const traffic = createCityTraffic(scene, new SolidWorld());
  const chunk = {
    graph: { edges: [edge("e", "a", "b", [0, 0, 80, 0], "residential")] },
  } as ChunkFile;
  traffic.onChunk("c", chunk);
  const car = traffic.sim.addCar({ kind: "car", edge: "c|e", dir: 1, s: 12, speed: 8, cruise: 8 });
  assert.ok(car);
  traffic.tick(0.3, { x: 20, z: 0 });
  const drawn = traffic.debugDraw();
  assert.equal(drawn.cars, 1);
  assert.ok(drawn.instances > 4, `expected body and wheels, got ${drawn.instances}`);
  assert.ok(drawn.batches < drawn.instances, `instancing did not batch (${drawn.batches} batches, ${drawn.instances} instances)`);
  const before = car.x;
  traffic.tick(0.4, { x: 20, z: 0 });
  assert.ok(car.x !== before);
  traffic.onUnload("c");
  assert.equal(traffic.debugDraw().instances, 0);
  assert.equal(traffic.debugDraw().cars, 0);
  traffic.dispose();
});
