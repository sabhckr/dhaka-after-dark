import assert from "node:assert/strict";
import test from "node:test";
import { approximateParkTrees, assembleWorld, chunkFeatureCounts, type WorldFeature } from "./assemble.ts";
import { chunkRect, worldToChunk } from "./chunks.ts";
import { classifyHeight, classifyRailStructure, classifyRoad, inPrefilter } from "./classify.ts";
import { lonLatToUtm, lonLatToWorld, qCoord, worldToLonLat, WORLD_ORIGIN } from "./crs.ts";
import { buildRoadGraph, graphNodeId, indexEdges, nearestRoad } from "./graph.ts";
import {
  clipPolygonToRect,
  clipPolylineToRect,
  douglasPeucker,
  douglasPeuckerPinned,
  nudgeVerifiedCurves,
  pointInRing,
  splitPolylineByChunks,
  vertexKey,
  type XZ,
} from "./geometry.ts";
import { ChunkScheduler, releaseChunkResources } from "./streaming.ts";
import { validateChunk, validateManifest } from "./validate.ts";
import type { Manifest } from "./types.ts";
import { createFly, stepFly } from "../viewer/fly.ts";

test("curve nudge keeps ends, straights, sharp corners, and pinned junctions", () => {
  const straight = nudgeVerifiedCurves([0, 0, 10, 0, 20, 0], [true, false, true]);
  assert.deepEqual(straight, [0, 0, 10, 0, 20, 0]);
  const bend = [0, 0, 10, 2, 20, 0];
  const pinned = nudgeVerifiedCurves(bend, [true, true, true]);
  assert.deepEqual(pinned, bend);
  const sharp = nudgeVerifiedCurves([0, 0, 5, 0, 5, 8], [true, false, true]);
  assert.deepEqual(sharp, [0, 0, 5, 0, 5, 8]);
  const smoothed = nudgeVerifiedCurves(bend, [true, false, true], 1.25);
  assert.equal(smoothed[0], 0);
  assert.equal(smoothed[1], 0);
  assert.equal(smoothed[4], 20);
  assert.equal(smoothed[5], 0);
  assert.ok(smoothed[3] < 2 && smoothed[3] > 0.75);
  assert.equal(smoothed.length, bend.length);
});

test("rail supports require an explicit elevated tag", () => {
  assert.equal(classifyRailStructure({ railway: "subway", bridge: "yes", layer: "2" }).supports, false);
  assert.equal(classifyRailStructure({ railway: "subway", bridge: "yes", layer: "2" }).grade, "unknown");
  assert.equal(classifyRailStructure({ railway: "rail", bridge: "yes" }).supports, false);
  assert.equal(classifyRailStructure({ railway: "rail", layer: "1" }).supports, false);
  assert.equal(classifyRailStructure({ railway: "subway", tunnel: "yes" }).grade, "underground");
  assert.equal(classifyRailStructure({ railway: "subway", tunnel: "yes" }).supports, false);
  assert.equal(classifyRailStructure({ railway: "rail", location: "underground" }).grade, "underground");
  assert.equal(classifyRailStructure({ railway: "rail", layer: "-1" }).grade, "unknown");
  assert.equal(classifyRailStructure({ railway: "rail" }).grade, "at-grade");
  const viaduct = classifyRailStructure({ railway: "rail", bridge: "viaduct", layer: "1" });
  assert.equal(viaduct.grade, "elevated");
  assert.equal(viaduct.supports, true);
  assert.equal(classifyRailStructure({ railway: "light_rail", location: "elevated" }).supports, true);
  assert.equal(classifyRailStructure({ railway: "rail", man_made: "viaduct" }).supports, true);
});

test("utm roundtrip and published Dhaka sample", () => {
  const utm = lonLatToUtm(90.4125, 23.8103);
  assert.ok(Math.abs(utm.easting - 236377.436) < 0.01);
  assert.ok(Math.abs(utm.northing - 2635628.617) < 0.01);
  const w = lonLatToWorld(90.4125, 23.8103);
  assert.ok(Math.abs(w.x - (utm.easting - WORLD_ORIGIN.easting)) < 1e-6);
  assert.ok(Math.abs(w.z - -(utm.northing - WORLD_ORIGIN.northing)) < 1e-6);
  const back = worldToLonLat(w.x, w.z);
  assert.ok(Math.abs(back.lon - 90.4125) < 1e-8);
  assert.ok(Math.abs(back.lat - 23.8103) < 1e-8);
  assert.equal(inPrefilter(23.7625, 90.3786), true);
  assert.equal(inPrefilter(23.5, 90.4), false);
});

test("chunk assignment is half-open on the max edge", () => {
  assert.deepEqual(worldToChunk(0, 0, 500), { ix: 0, iy: 0 });
  assert.deepEqual(worldToChunk(499.9, 10, 500), { ix: 0, iy: 0 });
  assert.deepEqual(worldToChunk(500, 0, 500), { ix: 1, iy: 0 });
  assert.deepEqual(worldToChunk(-1, -1, 500), { ix: -1, iy: -1 });
});

test("polyline crossing a chunk boundary meets without a gap", () => {
  const pts: [number, number][] = [
    [400, 100],
    [700, 100],
  ];
  const left = clipPolylineToRect(pts, chunkRect(0, 0, 500));
  const right = clipPolylineToRect(pts, chunkRect(1, 0, 500));
  assert.equal(left.length, 1);
  assert.equal(right.length, 1);
  const leftEnd = left[0][left[0].length - 1];
  const rightStart = right[0][0];
  assert.ok(Math.abs(leftEnd[0] - 500) < 1e-6);
  assert.ok(Math.abs(rightStart[0] - 500) < 1e-6);
  assert.ok(Math.abs(leftEnd[1] - rightStart[1]) < 1e-6);
  const parts = splitPolylineByChunks(pts, 500);
  assert.equal(parts.length, 2);
});

test("polygon clip keeps area inside the rectangle", () => {
  const ring: [number, number][] = [
    [450, 50],
    [650, 50],
    [650, 150],
    [450, 150],
  ];
  const clipped = clipPolygonToRect(ring, chunkRect(0, 0, 500));
  for (const [x, z] of clipped) {
    assert.ok(x >= 450 - 1e-6 && x <= 500 + 1e-6);
    assert.ok(z >= 50 - 1e-6 && z <= 150 + 1e-6);
  }
  assert.ok(pointInRing(480, 100, clipped));
  assert.equal(pointInRing(520, 100, clipped), false);
});

test("pinned simplification keeps a collinear T-junction vertex so the graph stays connected", () => {
  // Through road along z=100 with the T node at x=150 sitting exactly on the line.
  const through: XZ[] = [
    [100, 100],
    [150, 100],
    [200, 100],
  ];
  const stem: XZ[] = [
    [150, 100],
    [150, 160],
  ];
  // Plain DP drops the collinear vertex and the stem end no longer meets a vertex.
  assert.equal(douglasPeucker(through, 0.3).length, 2);
  const junctions = new Set([vertexKey(150, 100)]);
  const isJunction = (p: XZ) => junctions.has(vertexKey(p[0], p[1]));
  const kept = douglasPeuckerPinned(through, 0.3, isJunction);
  assert.deepEqual(kept, through);
  const graph = buildRoadGraph(
    [
      { wayId: 1, cls: "primary", oneway: 0, pts: kept },
      { wayId: 2, cls: "residential", oneway: 0, pts: douglasPeuckerPinned(stem, 0.3, isJunction) },
    ],
    500,
  );
  const tNode = graphNodeId(150, 100);
  assert.equal(graph.edges.filter((e) => e.a === tNode || e.b === tNode).length, 3);
  // Unpinned points between pins still simplify, and both ends always survive.
  const wiggle: XZ[] = [
    [0, 0],
    [10, 0.05],
    [20, 0],
    [30, 0.05],
    [40, 0],
  ];
  const pinMid = (p: XZ) => p[0] === 20;
  assert.deepEqual(douglasPeuckerPinned(wiggle, 0.3, pinMid), [
    [0, 0],
    [20, 0],
    [40, 0],
  ]);
  assert.deepEqual(douglasPeuckerPinned(wiggle, 0.3, () => false), [
    [0, 0],
    [40, 0],
  ]);
});

test("cross-chunk road graph shares a boundary node id", () => {
  const graph = buildRoadGraph(
    [{ wayId: 42, cls: "primary", oneway: 0, pts: [[400, 100], [700, 250]] }],
    500,
  );
  const boundaryId = graphNodeId(500, 100 + (150 * (500 - 400)) / 300);
  assert.ok(graph.nodes.some((n) => n.id === boundaryId));
  const touching = graph.edges.filter((e) => e.a === boundaryId || e.b === boundaryId);
  assert.ok(touching.length >= 2);
  const assembled = assembleWorld(
    [
      {
        kind: "road",
        id: 42,
        cls: "primary",
        width: 10,
        widthEstimated: true,
        y: 0.28,
        bridge: false,
        oneway: 0,
        pts: [
          [400, 100],
          [700, 250],
        ],
      },
    ],
    500,
  );
  const a = assembled.chunks.get("0_0");
  const b = assembled.chunks.get("1_0");
  assert.ok(a && b);
  const idsA = new Set(a!.graph.nodes.map((n) => n.id));
  const idsB = new Set(b!.graph.nodes.map((n) => n.id));
  const shared = [...idsA].filter((id) => idsB.has(id));
  assert.ok(shared.length >= 1, "boundary node must be stored in both chunks");
  const errs = validateChunk(a);
  assert.deepEqual(errs, []);
});

test("nearest road and height sources", () => {
  const graph = buildRoadGraph(
    [{ wayId: 7, cls: "residential", oneway: 1, pts: [[0, 0], [0, 100]] }],
    500,
  );
  const hit = nearestRoad(indexEdges(graph.edges, 40), 10, 40, 30);
  assert.ok(hit);
  assert.equal(hit!.way, 7);
  assert.ok(hit!.dist > 9 && hit!.dist < 11);
  assert.equal(classifyHeight({ height: "12 m" }).source, "measured");
  assert.equal(classifyHeight({ "building:levels": "5" }).source, "estimated");
  assert.equal(classifyHeight({ building: "house" }).source, "estimated");
  const road = classifyRoad({ highway: "primary", bridge: "yes", layer: "1" });
  assert.ok(road);
  assert.equal(road!.bridge, true);
  assert.ok(road!.y >= 6);
  assert.equal(classifyRoad({ highway: "proposed" }), null);
});

test("assemble is reproducible and splits a footprint", () => {
  const features: WorldFeature[] = [
    {
      kind: "building",
      id: 9,
      h: 18,
      hs: "measured",
      outer: [
        [480, 10],
        [520, 10],
        [520, 40],
        [480, 40],
      ],
      holes: [],
    },
    {
      kind: "water",
      id: 3,
      outer: [
        [10, 10],
        [40, 10],
        [40, 40],
        [10, 40],
      ],
      holes: [],
    },
  ];
  const a = assembleWorld(features, 500);
  const b = assembleWorld(features, 500);
  const ser = (r: ReturnType<typeof assembleWorld>) =>
    JSON.stringify([...r.chunks.keys()].sort().map((k) => [k, r.chunks.get(k)]));
  assert.equal(ser(a), ser(b));
  assert.equal(a.counts.buildings, 1);
  assert.equal(a.counts.buildingsMeasured, 1);
  assert.ok(a.chunks.has("0_0") && a.chunks.has("1_0"));
  const trees = approximateParkTrees(5, [
    [0, 0],
    [200, 0],
    [200, 200],
    [0, 200],
  ]);
  assert.ok(trees.length > 5);
  assert.deepEqual(trees, approximateParkTrees(5, [
    [0, 0],
    [200, 0],
    [200, 200],
    [0, 200],
  ]));
  assert.ok(chunkFeatureCounts(a.chunks.get("0_0")!).water >= 1);
});

test("manifest integrity rejects a broken document", () => {
  const bad = validateManifest({ v: 1, crs: "EPSG:4326" });
  assert.ok(bad.length > 0);
  const ok: Manifest = {
    v: 1,
    name: "test",
    generatedAt: "2026-10-29",
    crs: "EPSG:32646",
    origin: { easting: 230000, northing: 2615000 },
    axis: "x=east, y=up (local datum, not DEM), z=-north",
    chunkSize: 500,
    boundary: {
      status: "provisional-bbox",
      kind: "provisional",
      id: "bbox",
      note: "test",
      relationIds: [],
      areaKm2: 1,
      bbox: { minLon: 90, minLat: 23, maxLon: 91, maxLat: 24 },
    },
    counts: {},
    chunks: [{ key: "1_2", ix: 1, iy: 2, bytes: 10, counts: {} }],
    warnings: [],
    spawns: [{ id: "a", name: "a", lon: 90, lat: 23, x: 0, z: 0, y: 10, yaw: 0 }],
    sources: [{ name: "OSM", url: "https://www.openstreetmap.org", license: "ODbL", retrieved: "2026-10-29", note: "" }],
    gaps: [],
  };
  assert.deepEqual(validateManifest(ok), []);
  ok.chunks.push({ key: "1_2", ix: 1, iy: 2, bytes: 1, counts: {} });
  assert.ok(validateManifest(ok).some((e) => e.includes("duplicate")));
});

test("scheduler dedupes, caches 404s, retries corrupt once, and disposes", async () => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const loaded: string[] = [];
  const s = new ChunkScheduler({
    loadRadius: 0,
    unloadRadius: 3,
    fetchChunk: async () => {
      calls++;
      await gate;
      return { v: 1 };
    },
    onLoad: (key) => loaded.push(key),
    onUnload: () => {},
    onError: () => {},
  });
  s.update(0, 0);
  s.update(0, 0);
  assert.equal(calls, 1);
  release();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(loaded, ["0_0"]);
  s.update(0, 0);
  assert.equal(calls, 1);

  let misses = 0;
  const missing = new ChunkScheduler({
    loadRadius: 0,
    unloadRadius: 2,
    fetchChunk: async () => {
      misses++;
      return null;
    },
    onLoad: () => {},
    onUnload: () => {},
    onError: () => {},
  });
  missing.update(2, 2);
  await new Promise((r) => setTimeout(r, 20));
  missing.update(2, 2);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(misses, 1);
  assert.ok(missing.empty.has("2_2"));

  let bad = 0;
  const errors: string[] = [];
  const broken = new ChunkScheduler({
    loadRadius: 0,
    unloadRadius: 2,
    fetchChunk: async () => {
      bad++;
      throw new Error("corrupt");
    },
    onLoad: () => {},
    onUnload: () => {},
    onError: (_k, e) => errors.push(e.message),
  });
  broken.update(3, 3);
  await new Promise((r) => setTimeout(r, 20));
  broken.update(3, 3);
  await new Promise((r) => setTimeout(r, 20));
  broken.update(3, 3);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(bad, 2);
  assert.ok(errors.length >= 2);

  const disposed: string[] = [];
  const bags: { dispose: () => void }[] = [];
  const live = new ChunkScheduler({
    loadRadius: 0,
    unloadRadius: 2,
    fetchChunk: async () => ({ ok: true }),
    onLoad: () => {},
    onUnload: (key) => {
      disposed.push(key);
      releaseChunkResources({ geometries: bags, instanced: [] });
    },
    onError: () => {},
  });
  const geom = { disposed: false, dispose() { this.disposed = true; } };
  bags.push(geom);
  live.update(4, 4);
  await new Promise((r) => setTimeout(r, 20));
  live.dispose();
  assert.deepEqual(disposed, ["4_4"]);
  assert.equal(geom.disposed, true);
  assert.equal(qCoord(1.236), 1.24);
});

test("free-fly A strafes left and D strafes right when facing north", () => {
  const left = createFly(0, 20, 0, 0);
  left.pitch = 0;
  left.keys.add("KeyA");
  stepFly(left, 0.3);
  assert.ok(left.x < -1, `A should move −X, got ${left.x}`);
  assert.equal(left.yaw, 0);

  const right = createFly(0, 20, 0, 0);
  right.pitch = 0;
  right.keys.add("KeyD");
  stepFly(right, 0.3);
  assert.ok(right.x > 1, `D should move +X, got ${right.x}`);

  const forward = createFly(0, 20, 0, 0);
  forward.pitch = 0;
  forward.keys.add("KeyW");
  const speed = stepFly(forward, 0.3);
  assert.ok(speed > 0.1);
  assert.ok(forward.z < -1, `W facing north should decrease Z, got ${forward.z}`);

  const yaw = createFly(0, 20, 0, 0);
  yaw.keys.add("KeyQ");
  stepFly(yaw, 0.3);
  assert.ok(yaw.yaw > 0.05);
});

test("hysteresis does not unload a chunk still inside the keep radius", async () => {
  const fetched: string[] = [];
  const unloaded: string[] = [];
  const s = new ChunkScheduler({
    loadRadius: 1,
    unloadRadius: 3,
    maxConcurrent: 8,
    fetchChunk: async (ix, iy) => {
      fetched.push(`${ix}_${iy}`);
      return { ix, iy };
    },
    onLoad: () => {},
    onUnload: (key) => unloaded.push(key),
    onError: () => {},
  });
  s.update(0, 0);
  await new Promise((r) => setTimeout(r, 30));
  const before = fetched.length;
  s.update(1, 0);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(unloaded.length, 0);
  assert.ok(s.loaded.has("-1_0"));
  assert.ok(fetched.length >= before);
});

test("scheduler fetches nearest chunks first and drops jobs the camera has left", async () => {
  const order: string[] = [];
  const loaded: string[] = [];
  const s = new ChunkScheduler({
    loadRadius: 1,
    unloadRadius: 3,
    maxConcurrent: 1,
    fetchChunk: async (ix, iy) => {
      order.push(`${ix}_${iy}`);
      await new Promise((r) => setTimeout(r, 2));
      return { ix, iy };
    },
    onLoad: (key) => loaded.push(key),
    onUnload: () => {},
    onError: () => {},
  });
  s.update(0, 0);
  assert.equal(order[0], "0_0");
  // Fly far away before the queue drains: the old neighbourhood is not fetched.
  s.update(50, 50);
  await new Promise((r) => setTimeout(r, 120));
  const stale = order.slice(1).filter((key) => {
    const [x, y] = key.split("_").map(Number);
    return Math.max(Math.abs(x - 50), Math.abs(y - 50)) > 1;
  });
  assert.deepEqual(stale, []);
  // The first fetch landed after the move, beyond the unload radius, so it is not kept.
  assert.equal(s.loaded.has("0_0"), false);
  assert.ok(loaded.includes("50_50"));
  s.dispose();
});
