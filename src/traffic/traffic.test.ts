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
  // No spawns: a random car on the same edge would hold this one by gap instead.
  const sim = new TrafficSim({ max: 1 });
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

test("a three-metre link between two junctions is driven, not a dead end", () => {
  const sim = new TrafficSim();
  sim.setChunk("c", [
    edge("west", "w", "m1", [0, 0, 40, 0]),
    edge("link", "m1", "m2", [40, 0, 43, 0]),
    edge("east", "m2", "e", [43, 0, 83, 0]),
  ]);
  assert.equal(sim.edgeCount, 3);
  const car = sim.addCar({ kind: "car", edge: "c|west", dir: 1, s: 30, speed: 10, cruise: 10 })!;
  sim.tick(2, { x: 40, z: 0 });
  assert.equal(car.edge, "c|east");
  assert.equal(car.dir, 1);
  assert.notEqual(car.held, "dead-end");
});

test("one step runs through several links shorter than the step", () => {
  const sim = new TrafficSim();
  sim.setChunk("c", [
    edge("in", "w", "p", [0, 0, 40, 0]),
    edge("t1", "p", "q", [40, 0, 40.1, 0]),
    edge("t2", "q", "r", [40.1, 0, 40.2, 0]),
    edge("t3", "r", "t", [40.2, 0, 40.3, 0]),
    edge("out", "t", "e", [40.3, 0, 80, 0]),
  ]);
  const car = sim.addCar({ kind: "car", edge: "c|in", dir: 1, s: 39.5, speed: 12, cruise: 12 })!;
  // Two 0.05 s steps of 0.6 m: the second runs 0.7 m past the end of "in", over all three links.
  sim.tick(0.1, { x: 40, z: 0 });
  assert.equal(car.edge, "c|out");
  assert.ok(car.x > 40.3 && car.x < 41, `car at ${car.x}`);
});

test("a link too short for a stop line is crossed at red, not held in the junction", () => {
  const sim = new TrafficSim();
  sim.time = 8.1;
  sim.setChunk("c", [
    edge("west", "w", "m1", [0, 0, 40, 0]),
    edge("link", "m1", "m2", [40, 0, 47, 0]),
    edge("east", "m2", "e", [47, 0, 87, 0]),
    edge("north", "m2", "n", [47, 0, 47, 40]),
    edge("south", "s", "m2", [47, -40, 47, 0]),
  ]);
  assert.equal(sim.green("m2", 0), false);
  const car = sim.addCar({ kind: "car", edge: "c|west", dir: 1, s: 38, speed: 8, cruise: 8 })!;
  sim.tick(2, { x: 45, z: 0 });
  assert.equal(car.edge, "c|east");
});

test("a car leaves a closed loop by the side exit instead of lapping it", () => {
  const sim = new TrafficSim({ max: 1 });
  sim.setChunk("c", [
    edge("am", "A", "M", [0, 0, 20, 0]),
    edge("mb", "M", "B", [20, 0, 40, 0]),
    edge("bc", "B", "C", [40, 0, 40, 40]),
    edge("cd", "C", "D", [40, 40, 0, 40]),
    edge("da", "D", "A", [0, 40, 0, 0]),
    edge("exit", "M", "X", [20, 0, 20, -40]),
  ]);
  const car = sim.addCar({ kind: "car", edge: "c|am", dir: 1, s: 5, speed: 10, cruise: 10 })!;
  const seen: string[] = [];
  for (let t = 0; t < 40 && sim.cars.length; t += 0.1) {
    sim.tick(0.1, { x: 20, z: 20 });
    if (seen[seen.length - 1] !== car.edge) seen.push(car.edge);
  }
  // Straight on at M the first time, then the exit once the loop is behind it.
  assert.deepEqual(seen.slice(0, 7), ["c|am", "c|mb", "c|bc", "c|cd", "c|da", "c|am", "c|exit"]);
});

test("cars spawn only on edges long enough for a stop line", () => {
  const sim = new TrafficSim({ rand: () => 0.5 });
  sim.setChunk("c", [edge("stub", "a", "b", [40, 0, 45, 0])]);
  assert.equal(sim.edgeCount, 1);
  sim.tick(2, { x: 0, z: 0 });
  assert.equal(sim.cars.length, 0);
  sim.setChunk("d", [edge("long", "c", "d", [40, 10, 80, 10])]);
  sim.tick(2, { x: 0, z: 0 });
  assert.equal(sim.cars.length, 1);
  assert.equal(sim.cars[0].edge, "d|long");
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
