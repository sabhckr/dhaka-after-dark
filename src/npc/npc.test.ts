import assert from "node:assert/strict";
import test from "node:test";
import { NPC_SPECS } from "../assets/human.ts";
import type { ChunkFile } from "../geo/types.ts";
import { pointInOuter } from "../viewer/place.ts";
import { SolidWorld, solidsFromChunk } from "../viewer/solids.ts";
import { resolveClip } from "./anim.ts";
import { dayPart } from "./clock.ts";
import { viewBlocked } from "./events.ts";
import { canTransition, finishInterrupt, interrupt, tryTransition } from "./machine.ts";
import { PedNav } from "./nav.ts";
import { Population } from "./population.ts";
import { Counter, PITCHES } from "./purchase.ts";
import { PROFILE_LIST, PROFILES, profileIssues } from "./profiles.ts";

function chunk(partial: Partial<ChunkFile> & Pick<ChunkFile, "graph">): ChunkFile {
  return {
    v: 1,
    ix: 0,
    iy: 0,
    origin: [0, 0],
    roads: [],
    buildings: [],
    water: [],
    canals: [],
    parks: [],
    rails: [],
    plazas: [],
    bridges: [],
    trees: [],
    landmarks: [],
    ...partial,
  };
}

function street(): ChunkFile {
  return chunk({
    roads: [{ id: 1, cls: "residential", w: 5, we: false, y: 0, bridge: false, pts: [2, 0, 80, 0] }],
    buildings: [{ id: 9, h: 14, hs: "estimated", outer: [30, 14, 50, 14, 50, 28, 30, 28] }],
    graph: {
      nodes: [
        { id: "a", x: 2, z: 0 },
        { id: "b", x: 80, z: 0 },
      ],
      edges: [{ id: "e", a: "a", b: "b", way: 1, cls: "residential", oneway: 0, pts: [2, 0, 40, 0, 80, 0] }],
    },
  });
}

function worldWith(data: ChunkFile): { world: SolidWorld; pop: Population } {
  const world = new SolidWorld();
  world.setChunk("c", solidsFromChunk(data).bucket);
  const pop = new Population(world, { max: 6, spawnRadius: 120, despawnRadius: 160 });
  pop.onChunk("c", data);
  pop.player = { x: 40, y: 2, z: 0, mode: "walk", speed: 0 };
  return { world, pop };
}

test("all 20 roles have valid profiles and honest mesh status", () => {
  assert.equal(PROFILE_LIST.length, 20);
  const meshes = new Set(NPC_SPECS.map((row) => row.id));
  const orders = new Set<number>();
  const crimes: string[] = [];
  for (const profile of PROFILE_LIST) {
    assert.deepEqual(profileIssues(profile), [], profile.id);
    assert.ok(meshes.has(profile.meshId), profile.id);
    assert.ok(!orders.has(profile.order), profile.id);
    orders.add(profile.order);
    if (profile.capabilities.includes("crime")) crimes.push(profile.id);
    assert.equal(profile.persistence, "chunk");
    assert.ok(profile.missing.some((line) => /skeleton|clip/i.test(line)), profile.id);
  }
  assert.deepEqual(crimes, ["chintai"]);
  assert.equal(PROFILES.cng.meshStatus, "placeholder-reuse");
  assert.equal(PROFILES.cng.meshId, "npc-rickshaw");
  assert.ok(!PROFILES.burqa.capabilities.includes("crime"));
  assert.ok(!PROFILES.hujur.capabilities.includes("crime"));
  assert.equal(PROFILES.hujur.meshId, "npc-huzur");
  assert.equal(PROFILES["rickshaw-2"].meshId, "npc-cycle-driver");
});

test("state machine allows the commute loop and rejects boarding from a stall", () => {
  assert.equal(canTransition("WALKING", "CROSSING_ROAD"), true);
  assert.equal(canTransition("SPAWNING", "BOARDING_VEHICLE"), false);
  assert.equal(canTransition("SPAWNING", "FLEEING"), true);
  assert.equal(canTransition("WORKING", "BOARDING_VEHICLE"), false);
  assert.equal(canTransition("WORKING", "DESPAWNING"), true);
  const { pop } = worldWith(street());
  const stall = pop.spawnAgent("stall", 12, -3.5);
  assert.ok(stall);
  stall.state = "WORKING";
  stall.stateAge = 2;
  assert.equal(tryTransition(stall, "BOARDING_VEHICLE", "nope"), false);
  assert.equal(stall.state, "WORKING");
  assert.match(stall.fail ?? "", /bad-transition/);
});

test("a scare interrupts work and the keeper can return", () => {
  const { pop } = worldWith(street());
  const stall = pop.spawnAgent("stall", 12, -3.5)!;
  stall.state = "WORKING";
  stall.activity = "vend";
  stall.stateAge = 3;
  assert.equal(interrupt(stall, "FLEEING", "noise"), true);
  assert.equal(stall.state, "FLEEING");
  assert.equal(stall.resume, "WORKING");
  assert.equal(finishInterrupt(stall), true);
  assert.equal(stall.state, "RETURNING_TO_ROUTINE");
  assert.equal(stall.resume, "WORKING");
});

test("rapid flips collapse instead of oscillating forever", () => {
  const { pop } = worldWith(street());
  const npc = pop.spawnAgent("genz-m", 12, -3.5)!;
  npc.state = "IDLE";
  npc.stateAge = 0;
  tryTransition(npc, "WALKING");
  npc.stateAge = 0;
  tryTransition(npc, "IDLE");
  npc.stateAge = 0;
  tryTransition(npc, "WALKING");
  npc.stateAge = 0;
  tryTransition(npc, "IDLE");
  assert.equal(npc.state, "WAITING");
  assert.equal(npc.fail, "oscillation");
});

test("schedule parts and a shift change during a scare", () => {
  assert.equal(dayPart(8 * 60), "early");
  assert.equal(dayPart(10 * 60), "day");
  assert.equal(dayPart(18 * 60), "evening");
  assert.equal(dayPart(23 * 60), "late");
  assert.equal(PROFILES.stall.schedule.late, "off");
  assert.equal(PROFILES.police.schedule.late, "patrol");
  assert.equal(PROFILES.elder.schedule.early, "off");
  const { pop } = worldWith(street());
  const stall = pop.spawnAgent("stall", 16, -3.5)!;
  stall.state = "WORKING";
  stall.activity = "vend";
  stall.part = "day";
  stall.stateAge = 2;
  interrupt(stall, "FLEEING", "noise");
  pop.clock.setMinutes(23 * 60);
  pop.tick(0.2);
  assert.equal(stall.scheduleDirty, true);
  assert.equal(stall.part, "late");
  assert.equal(stall.state, "FLEEING");
  finishInterrupt(stall);
  for (let i = 0; i < 4; i++) pop.tick(0.1);
  assert.equal(stall.state, "DESPAWNING");
  assert.equal(stall.activity, "off");
});

test("sidewalk path moves a pedestrian and does not enter a building", () => {
  const data = street();
  const { pop } = worldWith(data);
  const npc = pop.spawnAgent("genz-m", 10, -3.6)!;
  const x0 = npc.x;
  pop.clock.setMinutes(10 * 60);
  for (let i = 0; i < 80; i++) pop.tick(0.1);
  assert.ok(Math.hypot(npc.x - x0, npc.z - (npc.anchorZ)) > 1.5, `did not travel ${npc.x}`);
  assert.equal(pointInOuter(npc.x, npc.z, data.buildings[0].outer), false);
  assert.notEqual(npc.state, "DESPAWNING");
});

test("motorways and rail are not walkable, and a blocked goal does not teleport", () => {
  const nav = new PedNav();
  nav.setChunk(
    "m",
    chunk({
      graph: {
        nodes: [],
        edges: [
          { id: "m", a: "a", b: "b", way: 1, cls: "motorway", oneway: 1, pts: [0, 0, 100, 0] },
          { id: "r", a: "c", b: "d", way: 2, cls: "rail", oneway: 0, pts: [0, 20, 80, 20] },
        ],
      },
    }),
  );
  assert.equal(nav.stats().walk, 0);
  assert.equal(nav.stats().road, 0);

  const blocked = chunk({
    buildings: [{ id: 1, h: 10, hs: "estimated", outer: [0, -8, 40, -8, 40, 8, 0, 8] }],
    graph: {
      nodes: [],
      edges: [{ id: "e", a: "a", b: "b", way: 3, cls: "residential", oneway: 0, pts: [2, 0, 30, 0] }],
    },
  });
  const { pop } = worldWith(blocked);
  const npc = pop.spawnAgent("elder", 10, 0);
  assert.equal(npc, null);
  assert.ok(pop.spawnRejected >= 1);

  const { pop: open } = worldWith(street());
  const walker = open.spawnAgent("govt", 8, -3.6)!;
  const start = walker.x;
  walker.state = "WALKING";
  walker.destX = 5000;
  walker.destZ = 5000;
  walker.path = [];
  walker.navVersion = open.nav.version;
  walker.part = open.clock.part;
  for (let i = 0; i < 8; i++) open.tick(0.1);
  assert.ok(Math.abs(walker.x - start) < 3, `teleported ${walker.x}`);
  assert.equal(walker.state, "WAITING");
  assert.equal(walker.fail, "no-path");
});

test("a solid wall stops a scripted walk into a footprint", () => {
  const outer = [0, -5, 14, -5, 14, 5, 0, 5];
  const data = chunk({
    buildings: [{ id: 3, h: 16, hs: "measured", outer }],
    graph: {
      nodes: [],
      edges: [{ id: "e", a: "a", b: "b", way: 1, cls: "footway", oneway: 0, pts: [-8, 0, -1, 0] }],
    },
  });
  const { pop } = worldWith(data);
  const npc = pop.spawnAgent("student-m", -6, 0)!;
  npc.state = "WALKING";
  npc.activity = "commute";
  npc.part = pop.clock.part;
  npc.navVersion = pop.nav.version;
  npc.path = [
    { x: npc.x, z: npc.z, kind: "foot" },
    { x: 8, z: 0, kind: "foot" },
  ];
  npc.pathI = 1;
  npc.crossFor = 1;
  for (let i = 0; i < 80; i++) pop.tick(0.1);
  assert.equal(pointInOuter(npc.x, npc.z, outer), false);
  assert.ok(npc.x < 0.4, `crossed the wall ${npc.x}`);
});

test("incidents respect eyesight, occlusion, and the police report path", () => {
  const outer = [20, -2, 24, -2, 24, 2, 20, 2];
  const data = chunk({
    buildings: [{ id: 4, h: 12, hs: "estimated", outer }],
    roads: [{ id: 1, cls: "residential", w: 5, we: false, y: 0, bridge: false, pts: [0, 0, 90, 0] }],
    graph: {
      nodes: [],
      edges: [{ id: "e", a: "a", b: "b", way: 1, cls: "residential", oneway: 0, pts: [0, 0, 90, 0] }],
    },
  });
  const world = new SolidWorld();
  world.setChunk("c", solidsFromChunk(data).bucket);
  assert.equal(viewBlocked(world, 10, 0, 30, 0), true);
  assert.equal(viewBlocked(world, 10, 6, 30, 6), false);

  const { pop } = worldWith(street());
  pop.max = 3;
  const witness = pop.spawnAgent("govt", 12, -3.5)!;
  const officer = pop.spawnAgent("police", 70, -3.5)!;
  const bystander = pop.spawnAgent("elder", 12, 30)!;
  witness.state = "WORKING";
  witness.activity = "work";
  witness.part = "day";
  officer.state = "IDLE";
  officer.activity = "patrol";
  officer.part = "day";
  bystander.state = "IDLE";
  bystander.part = "day";
  pop.clock.setMinutes(11 * 60);
  const theft = pop.post({ type: "theft", x: witness.x + 1, z: witness.z, severity: 0.8, source: "script", ttl: 30 });
  for (let i = 0; i < 40; i++) pop.tick(0.2);
  assert.ok(witness.seen.includes(theft.id) || witness.lastTransition.includes("REPORT"), witness.lastTransition);
  assert.ok(!bystander.seen.includes(theft.id), `far witness saw it ${bystander.seen.join(",")}`);
  const officerState: string = officer.state;
  assert.ok(
    officerState === "INVESTIGATING" || officer.seen.some((id) => pop.bus.byId(id)?.status === "reported"),
    `police ${officerState} ${officer.lastTransition} seen ${officer.seen.join(",")}`,
  );
  assert.ok(!officer.seen.includes(theft.id), "police treated the unseen theft as if they had watched it");
});

test("listener cleanup, chunk unload, and reload", () => {
  const { pop } = worldWith(street());
  let calls = 0;
  const stop = pop.bus.subscribe(() => {
    calls++;
  });
  pop.post({ type: "disturbance", x: 1, z: 1, severity: 0.4, source: "t" });
  assert.equal(calls, 1);
  stop();
  pop.post({ type: "disturbance", x: 1, z: 1, severity: 0.4, source: "t" });
  assert.equal(calls, 1);
  pop.dispose();
  pop.bus.post({ type: "assault", x: 0, z: 0, source: "after" });
  assert.equal(calls, 1);

  const again = worldWith(street());
  const npc = again.pop.spawnAgent("cleaner", 18, -3.5)!;
  const anchor = again.pop.nav.walkNodesNear(18, -3.5, 8)[0];
  assert.ok(anchor);
  npc.chunk = "stream";
  npc.anchorKey = anchor.key;
  again.pop.onUnload("c");
  assert.equal(again.pop.npcs.length, 0);
  assert.equal(again.pop.nav.stats().chunks, 0);
  again.pop.onChunk("c", street());
  again.pop.player = { x: 40, y: 2, z: 0, mode: "walk", speed: 0 };
  again.pop.tick(0.2);
  assert.ok(again.pop.npcs.length > 0, "reload did not respawn");
});

test("missing clips fall back and a fast player car posts a driving event", () => {
  const none = resolveClip(null, "walk");
  assert.equal(none.fallback, true);
  assert.equal(none.procedural, true);
  assert.equal(none.clip, "idle");
  assert.equal(none.motion, "walk");
  const have = resolveClip(new Set(["walk"]), "walk");
  assert.equal(have.fallback, false);
  assert.equal(resolveClip(new Set(["idle"]), "serve").motion, "serve");

  const { pop } = worldWith(street());
  const npc = pop.spawnAgent("burqa", 20, -3.5)!;
  pop.player = { x: npc.x + 2, y: 1.2, z: npc.z, mode: "drive", speed: 14 };
  pop.tick(0.2);
  assert.ok(pop.bus.events.some((event) => event.type === "dangerous-driving"));
  assert.equal(npc.alive, true);
});

test("a snatch flees on the graph and a representative crowd stays cheap", () => {
  const { pop } = worldWith(street());
  const thief = pop.spawnAgent("chintai", 22, -3.5)!;
  const id = pop.scriptSnatch(thief.id);
  assert.ok(id);
  assert.equal(thief.state, "FLEEING");
  assert.ok(thief.path.length > 1, "flee had no path");
  const x0 = thief.x;
  for (let i = 0; i < 25; i++) pop.tick(0.1);
  assert.ok(Math.hypot(thief.x - x0, thief.z - thief.anchorZ) > 0.4, "suspect did not move");

  const crowd = worldWith(street());
  crowd.pop.max = 40;
  for (let i = 0; i < 40; i++) {
    const spawned = crowd.pop.spawnAgent(i % 2 === 0 ? "genz-f" : "student-m", 6 + (i % 20) * 2, i % 2 === 0 ? -3.5 : 3.5);
    assert.ok(spawned);
  }
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) crowd.pop.tick(0.1);
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `40 npcs * 30 ticks took ${ms.toFixed(1)} ms`);
});

test("hailing a rickshaw boards, and a second hail does not stack", () => {
  const { pop } = worldWith(street());
  const driver = pop.spawnAgent("rickshaw", 24, -3.5)!;
  driver.state = "WAITING";
  driver.activity = "wait-fare";
  driver.stateAge = 1;
  pop.player = { x: driver.x, y: 1.6, z: driver.z + 0.4, mode: "walk", speed: 0 };
  const first = pop.interact();
  assert.equal(first, driver.id);
  assert.equal(driver.state, "BOARDING_VEHICLE");
  const other = pop.spawnAgent("genz-m", driver.x + 0.4, driver.z)!;
  other.state = "IDLE";
  const second = pop.interact();
  assert.equal(second, driver.id);
  assert.notEqual(other.state, "SOCIALIZING");
});

test("Shahbagh tea and flower sales wait, finish, and cancel if you leave", () => {
  assert.equal(PITCHES.length, 2);
  const tea = PITCHES.find((pitch) => pitch.offer === "tea");
  const flower = PITCHES.find((pitch) => pitch.offer === "flower");
  assert.ok(tea && flower);
  assert.equal(tea.price, 15);
  assert.equal(flower.price, 40);
  const counter = new Counter();
  assert.equal(counter.begin(tea.x, tea.z, 30, "fly"), null);
  assert.equal(counter.begin(tea.x + 40, tea.z, 1.6, "walk"), null);
  assert.match(counter.begin(tea.x + 1, tea.z, 1.6, "walk") ?? "", /চা/);
  counter.tick(0.2, tea.x, tea.z, 1.6, "walk");
  assert.equal(counter.sale?.phase, "order");
  counter.tick(0.2, tea.x, tea.z, 1.6, "walk");
  assert.equal(counter.sale?.phase, "wait");
  const age = counter.sale?.age ?? 0;
  assert.match(counter.begin(tea.x, tea.z, 1.6, "walk") ?? "", /waiting/);
  assert.equal(counter.sale?.age, age);
  counter.tick(0.05, tea.x + 20, tea.z, 1.6, "walk");
  assert.equal(counter.sale == null, true);
  assert.equal(counter.completed, 0);
  assert.equal(counter.cancelled, 1);

  assert.match(counter.begin(flower.x, flower.z + 0.4, 1.6, "walk") ?? "", /ফুল/);
  counter.tick(0.4, flower.x, flower.z, 1.6, "walk");
  assert.equal(counter.sale?.phase, "wait");
  counter.tick(flower.wait, flower.x, flower.z, 1.6, "walk");
  assert.equal(counter.sale?.phase, "served");
  assert.equal(counter.completed, 1);
  counter.tick(2.3, flower.x, flower.z, 1.6, "walk");
  assert.equal(counter.sale == null, true);
  assert.match(counter.line(), /Flowers/);
});

test("a grounded press at the Shahbagh tea stall sells, and the keeper stays put", () => {
  const { pop } = worldWith(street());
  const tea = PITCHES.find((pitch) => pitch.offer === "tea")!;
  pop.player = { x: tea.x + 1.1, y: 1.6, z: tea.z, mode: "walk", speed: 0 };
  pop.tick(0.1);
  const keeper = pop.npcs.find((npc) => npc.id === "pitch-hawk-tea");
  assert.ok(keeper);
  assert.equal(keeper.anchorKey, "pitch:hawk-tea");
  assert.equal(pop.interact(), "sale:hawk-tea");
  const x0 = keeper.x;
  const z0 = keeper.z;
  for (let i = 0; i < 30; i++) pop.tick(0.1);
  assert.ok(Math.hypot(keeper.x - x0, keeper.z - z0) < 1.2, "pitch keeper walked off");
  assert.equal(pop.counter.completed, 1);
  assert.equal(keeper.anim, "serve");
});

test("a rickshaw in reach is hailed instead of starting a sale", () => {
  const { pop } = worldWith(street());
  const tea = PITCHES.find((pitch) => pitch.offer === "tea")!;
  pop.player = { x: tea.x + 1.1, y: 1.6, z: tea.z, mode: "walk", speed: 0 };
  pop.tick(0.1);
  const driver = pop.spawnAgent("rickshaw", tea.x + 1.5, tea.z + 0.4)!;
  driver.state = "WAITING";
  driver.activity = "wait-fare";
  driver.stateAge = 1;
  assert.equal(pop.interact(), driver.id);
  assert.equal(driver.state, "BOARDING_VEHICLE");
  assert.equal(pop.counter.sale == null, true);
});

test("an idle civilian beside the tea pitch browses instead of every passer queuing", () => {
  const { pop } = worldWith(street());
  const tea = PITCHES.find((pitch) => pitch.offer === "tea")!;
  pop.player = { x: tea.x, y: 1.6, z: tea.z, mode: "walk", speed: 0 };
  pop.tick(0.1);
  const guest = pop.spawnAgent("genz-m", tea.x + 1.2, tea.z + 1.2)!;
  guest.state = "IDLE";
  guest.activity = "work";
  guest.stateAge = 0.5;
  for (let i = 0; i < 12; i++) pop.tick(0.1);
  assert.equal(guest.state, "SHOPPING");
});

function streetAt(dx: number, dz: number): ChunkFile {
  const pts = [2 + dx, dz, 40 + dx, dz, 80 + dx, dz];
  return chunk({
    roads: [{ id: 1, cls: "residential", w: 5, we: false, y: 0, bridge: false, pts: [2 + dx, dz, 80 + dx, dz] }],
    graph: { nodes: [], edges: [{ id: `e${dx}_${dz}`, a: "a", b: "b", way: 1, cls: "residential", oneway: 0, pts }] },
  });
}

function graphOf(nav: PedNav): string {
  const nodes: string[] = [];
  for (let i = 0; i < nav.nodeCount; i++) {
    const n = nav.node(i)!;
    nodes.push(`${n.key}:${n.walk ? "w" : ""}${n.road ? "r" : ""}`);
  }
  return `${nodes.join(",")}|${nav.linkCount}|${nav.stats().walk}|${nav.stats().road}`;
}

test("joining chunks one by one gives the graph a rebuild gives, also after unload and replace", () => {
  const a = streetAt(0, 0);
  const b = streetAt(78, 0); // shares the x=80 end with a, so the graphs stitch
  const c = streetAt(0, 40);
  const live = new PedNav();
  live.setChunk("a", a);
  live.setChunk("b", b);
  live.setChunk("c", c);
  live.deleteChunk("b");
  live.setChunk("b", b);
  live.setChunk("c", streetAt(0, 44));
  live.flush();
  const fresh = new PedNav();
  fresh.setChunk("a", a);
  fresh.setChunk("c", streetAt(0, 44));
  fresh.setChunk("b", b);
  assert.equal(graphOf(live), graphOf(fresh));
});

test("after an unload the old graph answers queries until the replacement is swapped in", () => {
  const nav = new PedNav();
  for (let i = 0; i < 6; i++) nav.setChunk(`k${i}`, streetAt(0, i * 30));
  const before = nav.stats().nodes;
  const v0 = nav.version;
  nav.deleteChunk("k5");
  assert.equal(nav.pending, true);
  assert.equal(nav.stats().nodes, before, "live graph changed before the swap");
  assert.equal(nav.version, v0);
  let calls = 0;
  let swapped = false;
  while (!swapped && calls < 1000) {
    swapped = nav.step(0);
    calls++;
  }
  assert.ok(swapped);
  assert.ok(calls > 1, "a zero budget should still need several steps");
  assert.equal(nav.pending, false);
  assert.ok(nav.stats().nodes < before);
  assert.equal(nav.version, v0 + 1);
  const fresh = new PedNav();
  for (let i = 0; i < 5; i++) fresh.setChunk(`k${i}`, streetAt(0, i * 30));
  assert.equal(graphOf(nav), graphOf(fresh));
});

test("streamed walkers anchored in an unloaded chunk leave once the new graph is in", () => {
  const { pop } = worldWith(street());
  pop.onChunk("d", streetAt(0, 60));
  const npc = pop.spawnAgent("cleaner", 18, 56.5)!;
  const anchor = pop.nav.walkNodesNear(18, 56.5, 8)[0];
  assert.ok(anchor);
  npc.chunk = "stream";
  npc.anchorKey = anchor.key;
  pop.onUnload("d");
  assert.ok(pop.npcs.includes(npc), "removed before the graph changed");
  for (let i = 0; i < 40 && pop.nav.pending; i++) pop.tick(0.05);
  assert.equal(pop.nav.pending, false);
  assert.ok(!pop.npcs.includes(npc), "walker anchored in the unloaded chunk is still alive");
});
