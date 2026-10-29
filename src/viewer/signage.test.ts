import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { releaseChunkResources } from "../geo/streaming.ts";
import { displayShopName, isNamedShop, shopCategory } from "../geo/shops.ts";
import type { ChunkFile } from "../geo/types.ts";
import { POSTER_SPECS, USER_MEME, forbiddenPolitical } from "./copy.ts";
import { buildChunkObjects, type SurfaceLibrary } from "./meshes.ts";
import {
  buildingCrown,
  cableSegments,
  facadeSlot,
  placeShop,
  plasterTint,
  posterCluster,
  posterPose,
  rankShops,
  roadWantsMarks,
} from "./place.ts";

function lambertLib(): SurfaceLibrary {
  const m = () => new THREE.MeshLambertMaterial({ vertexColors: true });
  return {
    roadMarked: m(),
    roadPlain: m(),
    bridge: m(),
    sidewalk: m(),
    water: m(),
    canal: m(),
    park: m(),
    plaza: m(),
    deck: m(),
    rail: m(),
    roof: m(),
    facades: [m(), m(), m(), m(), m()],
    trunk: m(),
    canopy: m(),
    landmark: m(),
    trim: m(),
  };
}

function fixture(): ChunkFile {
  return {
    v: 1,
    ix: 1,
    iy: -2,
    origin: [0, 0],
    roads: [{ id: 9, cls: "primary", w: 11, we: true, y: 0.28, bridge: false, pts: [0, 0, 40, 0] }],
    buildings: [{ id: 5, h: 6, hs: "estimated", outer: [0, 0, 10, 0, 10, 8, 0, 8] }],
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
}

test("shop display prefers name:bn and never invents one", () => {
  assert.equal(displayShopName({ name: "Tea Stall", bn: "চা ঘর" })?.text, "চা ঘর");
  assert.equal(displayShopName({ name: "Tea Stall" })?.text, "Tea Stall");
  assert.equal(displayShopName({ name: "", en: "Only English" })?.text, "Only English");
  assert.equal(displayShopName({ name: "  ", bn: "  ", en: "" }), null);
  assert.equal(isNamedShop({ shop: "tea" }), false);
  assert.equal(isNamedShop({ shop: "tea", "name:bn": "মেঘড্রপ" }), true);
  assert.equal(isNamedShop({ amenity: "hospital", name: "পিজি হাসপাতাল" }), false);
  assert.equal(isNamedShop({ amenity: "cafe", name: "Adda" }), true);
  assert.equal(shopCategory({ shop: "tea" }), "tea");
});

test("fictional posters keep the requested meme and no real parties", () => {
  assert.ok(POSTER_SPECS.some((spec) => spec.title === USER_MEME));
  assert.equal(forbiddenPolitical(USER_MEME), null);
  assert.ok(forbiddenPolitical("আওয়ামী লীগের পোস্টার"));
  assert.ok(forbiddenPolitical("Vote BNP today"));
  for (const spec of POSTER_SPECS) {
    const blob = [spec.title, spec.sub, ...(spec.lines ?? [])].join("\n");
    assert.equal(forbiddenPolitical(blob), null, spec.id);
    assert.match(blob, /কাল্পনিক|পুরোপুরি কাল্পনিক/);
  }
});

test("poster clusters stay on the wall and do not reshuffle", () => {
  const building = { id: 42, h: 18, outer: [0, 0, 20, 0, 20, 12, 0, 12] };
  const a = posterCluster(building, POSTER_SPECS.length, 3);
  const b = posterCluster(building, POSTER_SPECS.length, 3);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 1 && a.length <= 3);
  for (const pose of a) {
    assert.ok(pose.y > 0 && pose.y < building.h);
    assert.ok(pose.specIndex >= 0 && pose.specIndex < POSTER_SPECS.length);
    assert.ok(pose.x > -1 && pose.x < 21);
    assert.ok(pose.z > -1 && pose.z < 13);
  }
});

test("facade, tint, and poster pose are stable for an id", () => {
  assert.equal(facadeSlot(42, 12), facadeSlot(42, 12));
  assert.deepEqual(plasterTint(42, "measured"), plasterTint(42, "measured"));
  const building = { id: 42, h: 18, outer: [0, 0, 20, 0, 20, 12, 0, 12] };
  const a = posterPose(building, POSTER_SPECS.length, 3);
  const b = posterPose(building, POSTER_SPECS.length, 3);
  assert.deepEqual(a, b);
  assert.ok(a);
  assert.ok(a && a.y > 0 && a.y < building.h);
});

test("real shop snaps to the same OSM way and stays marked approximate", () => {
  const buildings = [{ id: 5, h: 8, outer: [0, 0, 12, 0, 12, 6, 0, 6] }];
  const pose = placeShop({ id: 5, t: "way", name: "Corner Store", x: 6, z: 3 }, buildings);
  assert.ok(pose);
  assert.equal(pose?.mode, "footprint");
  assert.equal(pose?.approximate, true);
  assert.equal(pose?.buildingId, 5);
  const ranked = rankShops(
    [
      { id: 2, t: "node", name: "English", x: 0, z: 0 },
      { id: 1, t: "node", name: "Also", bn: "বাংলা", x: 1, z: 1 },
    ],
    1,
  );
  assert.equal(ranked[0].bn, "বাংলা");
  assert.equal(placeShop({ id: 8, t: "node", name: "", x: 0, z: 0 }, buildings), null);
});

test("major roads keep lane marks; building corners stay on the footprint", () => {
  assert.equal(roadWantsMarks("primary", 4), true);
  assert.equal(roadWantsMarks("footway", 1.8), false);
  const chunk = fixture();
  const built = buildChunkObjects(chunk, lambertLib());
  const pts: number[] = [];
  built.group.traverse((obj) => {
    const geo = (obj as THREE.Mesh).geometry;
    const attr = geo?.getAttribute?.("position");
    if (!attr) return;
    for (let i = 0; i < attr.count; i++) pts.push(attr.getX(i), attr.getY(i), attr.getZ(i));
  });
  const has = (x: number, y: number, z: number) => {
    for (let i = 0; i < pts.length; i += 3) {
      if (Math.abs(pts[i] - x) < 1e-3 && Math.abs(pts[i + 1] - y) < 1e-3 && Math.abs(pts[i + 2] - z) < 1e-3) return true;
    }
    return false;
  };
  assert.equal(has(0, 0, 0), true);
  assert.equal(has(10, 6, 0), true);
  assert.equal(has(0, 6, 8), true);
  assert.equal(has(0, 3.2, 0), true);
  assert.equal(pts.some((_, i) => i % 3 === 1 && Math.abs(pts[i] - 0.28) < 1e-4), true);
  releaseChunkResources(built);
});

test("parapets are extra triangles on the roof mesh, not extra draw calls", () => {
  const built = buildChunkObjects(fixture(), lambertLib());
  const crown = buildingCrown(5, 6);
  let roofs = 0;
  let parapetTris = 0;
  let roofTris = 0;
  built.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.roofTris == null) return;
    roofs++;
    parapetTris = mesh.userData.parapetTris as number;
    roofTris = mesh.userData.roofTris as number;
    assert.equal(Array.isArray(mesh.material), false);
    assert.equal((mesh.userData.chajjaTris as number) > 0, crown.chajja);
    assert.equal((mesh.userData.serviceTris as number) > 0, crown.tank || crown.stair);
    assert.equal((mesh.userData.tinRidgeTris as number) > 0, crown.tinRidge);
  });
  assert.equal(roofs, 1);
  assert.equal(parapetTris > 0, crown.parapet);
  assert.ok(roofTris > parapetTris);
  releaseChunkResources(built);
});

test("roof extras stay on the footprint and do not change its plate", () => {
  const outer = [0, 0, 12, 0, 12, 9, 0, 9];
  const chunk = fixture();
  chunk.buildings = [
    { id: 5, h: 6, hs: "estimated", outer },
    { id: 80, h: 4.2, hs: "estimated", outer: [20, 0, 28, 0, 28, 7, 20, 7] },
    { id: 140, h: 18, hs: "measured", outer: [40, 0, 52, 0, 52, 14, 40, 14] },
  ];
  const built = buildChunkObjects(chunk, lambertLib());
  let pts: number[] = [];
  built.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.roofTris == null) return;
    const attr = mesh.geometry.getAttribute("position");
    pts = [];
    for (let i = 0; i < attr.count; i++) pts.push(attr.getX(i), attr.getY(i), attr.getZ(i));
  });
  const has = (x: number, y: number, z: number) =>
    pts.some((v, i) => i % 3 === 0 && Math.abs(pts[i] - x) < 1e-3 && Math.abs(pts[i + 1] - y) < 1e-3 && Math.abs(pts[i + 2] - z) < 1e-3);
  assert.equal(has(0, 6, 0), true);
  assert.equal(has(12, 6, 9), true);
  const crown = buildingCrown(5, 6);
  if (crown.chajja) {
    const outside = pts.some((v, i) => i % 3 === 0 && pts[i + 2] < -0.4 && pts[i + 2] > -0.8 && Math.abs(pts[i + 1] - 3.05) < 1e-3);
    assert.equal(outside, true);
  }
  if (crown.tank) {
    const tank = pts.some((v, i) => i % 3 === 0 && pts[i] > 0 && pts[i] < 12 && pts[i + 2] > 0 && pts[i + 2] < 9 && pts[i + 1] > 6.8);
    assert.equal(tank, true);
  }
  const tin = chunk.buildings[1];
  assert.equal(buildingCrown(tin.id, tin.h).tinRidge, facadeSlot(tin.id, tin.h) === 4);
  assert.deepEqual(buildingCrown(140, 18), buildingCrown(140, 18));
  releaseChunkResources(built);
});

test("unloading a chunk does not dispose shared materials", () => {
  let disposed = 0;
  const shared = new THREE.MeshLambertMaterial();
  shared.dispose = () => {
    disposed += 1;
  };
  const lib = lambertLib();
  lib.facades[facadeSlot(5, 6)] = shared;
  lib.roof = shared;
  const built = buildChunkObjects(fixture(), lib);
  releaseChunkResources(built);
  assert.equal(disposed, 0);
});

test("cables are deterministic and do not move footprints", () => {
  const buildings = [
    { id: 1, h: 12, outer: [0, 0, 8, 0, 8, 8, 0, 8] },
    { id: 2, h: 14, outer: [18, 0, 26, 0, 26, 8, 18, 8] },
  ];
  assert.deepEqual(cableSegments(buildings, 10), cableSegments(buildings, 10));
});
