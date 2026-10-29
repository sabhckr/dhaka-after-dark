import assert from "node:assert/strict";
import test from "node:test";
import type { ChunkFile } from "../geo/types.ts";
import { pointInOuter } from "./place.ts";
import { planFootBridge, moveSolid, SolidWorld, solidsFromChunk, type SolidBucket } from "./solids.ts";

function chunk(partial: Partial<ChunkFile>): ChunkFile {
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
    graph: { nodes: [], edges: [] },
    ...partial,
  };
}

function worldOf(bucket: SolidBucket): SolidWorld {
  const world = new SolidWorld();
  world.setChunk("0_0", bucket);
  return world;
}

test("a fast move cannot tunnel through a building", () => {
  const built = solidsFromChunk(
    chunk({
      buildings: [{ id: 1, h: 18, hs: "estimated", outer: [0, -4, 12, -4, 12, 4, 0, 4] }],
    }),
  );
  const world = worldOf(built.bucket);
  const hit = moveSolid(world, {
    x0: -6,
    y0: 0,
    z0: 0,
    x1: 40,
    y1: 0,
    z1: 0,
    radius: 0.45,
    height: 1.7,
    stepUp: 1,
    climb: true,
    fly: false,
  });
  assert.ok(hit.x < 0.05, `tunneled to ${hit.x}`);
  assert.equal(pointInOuter(hit.x, hit.z, [0, -4, 12, -4, 12, 4, 0, 4]), false);
  assert.equal(hit.blocked, true);
});

test("buildings block every side, including a rotated footprint", () => {
  const outer = [0, -4, 12, -4, 12, 4, 0, 4];
  const world = worldOf(solidsFromChunk(chunk({ buildings: [{ id: 2, h: 10, hs: "measured", outer }] })).bucket);
  const fromEast = moveSolid(world, {
    x0: 20,
    y0: 0,
    z0: 0,
    x1: -4,
    y1: 0,
    z1: 0,
    radius: 0.4,
    height: 1.6,
    stepUp: 0.4,
    climb: false,
    fly: false,
  });
  assert.ok(fromEast.x > 12, `east side failed ${fromEast.x}`);
  const fromSouth = moveSolid(world, {
    x0: 6,
    y0: 0,
    z0: 12,
    x1: 6,
    y1: 0,
    z1: -8,
    radius: 0.4,
    height: 1.6,
    stepUp: 0.4,
    climb: false,
    fly: false,
  });
  assert.ok(fromSouth.z > 4, `south side failed ${fromSouth.z}`);

  const a = 0.7;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts = [
    [-3, -5],
    [3, -5],
    [3, 5],
    [-3, 5],
  ].flatMap(([x, z]) => [c * x - s * z, s * x + c * z]);
  const turned = worldOf(solidsFromChunk(chunk({ buildings: [{ id: 3, h: 9, hs: "estimated", outer: pts }] })).bucket);
  const through = moveSolid(turned, {
    x0: -12,
    y0: 0,
    z0: 0,
    x1: 12,
    y1: 0,
    z1: 0,
    radius: 0.4,
    height: 1.6,
    stepUp: 0.4,
    climb: true,
    fly: false,
  });
  assert.equal(pointInOuter(through.x, through.z, pts), false);
});

test("the street beside a building stays open", () => {
  const world = worldOf(
    solidsFromChunk(
      chunk({
        buildings: [{ id: 4, h: 14, hs: "estimated", outer: [0, 0, 10, 0, 10, 8, 0, 8] }],
      }),
    ).bucket,
  );
  const hit = moveSolid(world, {
    x0: -4,
    y0: 0,
    z0: -3,
    x1: 22,
    y1: 0,
    z1: -3,
    radius: 0.4,
    height: 1.6,
    stepUp: 0.3,
    climb: false,
    fly: false,
  });
  assert.ok(hit.x > 20, `road blocked at ${hit.x}`);
  assert.equal(hit.blocked, false);
});

test("chunk reload does not duplicate colliders", () => {
  const built = solidsFromChunk(
    chunk({ buildings: [{ id: 5, h: 6, hs: "estimated", outer: [0, 0, 4, 0, 4, 4, 0, 4] }] }),
  );
  const world = new SolidWorld();
  world.setChunk("a", built.bucket);
  const once = world.stats().walls;
  world.setChunk("a", built.bucket);
  assert.equal(world.stats().walls, once);
  assert.ok(once >= 4);
  world.deleteChunk("a");
  assert.equal(world.stats().walls, 0);
  world.setChunk("a", built.bucket);
  const again = moveSolid(world, {
    x0: -3,
    y0: 0,
    z0: 2,
    x1: 8,
    y1: 0,
    z1: 2,
    radius: 0.35,
    height: 1.7,
    stepUp: 0.4,
    climb: true,
    fly: false,
  });
  assert.ok(again.x < 0.2);
});

test("OSM footbridge keeps the deck, stairs to the ground, and end piers only", () => {
  const road = { id: 77, cls: "footway", w: 2, we: true, y: 6, bridge: true, pts: [40, 80, 78, 80] };
  const plan = planFootBridge(road, [0, 0]);
  assert.ok(plan);
  assert.equal(plan?.source, "osm-elevated-way");
  assert.equal(plan?.stairs.length, 2);
  for (const stair of plan!.stairs) {
    assert.ok(Math.max(...stair.ys) > 5.5);
    assert.ok(Math.min(...stair.ys) < 0.25);
  }
  assert.equal(plan?.piers.length, 2);
  for (const pier of plan!.piers) {
    const along = (pier.x - 40) / 38;
    assert.ok(along < 0.2 || along > 0.8, `pier in the span ${along}`);
  }
  const clipped = planFootBridge(
    { id: 78, cls: "steps", w: 1.6, we: true, y: 6, bridge: true, pts: [1, 20, 24, 20] },
    [0, 0],
  );
  assert.equal(clipped?.stairs.length, 1);

  const built = solidsFromChunk(chunk({ origin: [0, 0], roads: [road] }));
  const world = worldOf(built.bucket);
  const deck = world.support(58, 80, 6, 0.4, true);
  assert.ok(Math.abs(deck - 6) < 0.05, `deck ${deck}`);
  const under = world.support(58, 80, 0.2, 0.4, false);
  assert.ok(under < 0.5, `driver snapped onto the footbridge ${under}`);
  const stair = plan!.stairs[0];
  const last = stair.ys.length - 1;
  const ground = world.support(stair.pts[last * 2], stair.pts[last * 2 + 1], 0.2, 0.5, true);
  assert.ok(ground < 0.4);
});
