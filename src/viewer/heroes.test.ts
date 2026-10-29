import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { ChunkFile } from "../geo/types.ts";
import { containedHoles, heroDrawHeight, heroSite } from "./heroes.ts";
import { buildChunkObjects, type SurfaceLibrary } from "./meshes.ts";
import { solidsFromChunk } from "./solids.ts";

function lib(): SurfaceLibrary {
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

function chunk(buildings: ChunkFile["buildings"]): ChunkFile {
  return {
    v: 1,
    ix: 5,
    iy: -31,
    origin: [2500, -15500],
    roads: [],
    buildings,
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

test("sangsad uses the published block heights, not the estimated 9 m", () => {
  const site = heroSite(18085267);
  assert.ok(site);
  assert.equal(heroDrawHeight(site, 170), 33.5);
  assert.equal(heroDrawHeight(site, 35), 47);
  assert.equal(heroSite(1), undefined);
});

test("a split way does not keep holes that sit outside its own ring", () => {
  const outer = [0, 0, 30, 0, 30, 30, 0, 30];
  const inside = [10, 10, 14, 10, 14, 14, 10, 14];
  const outside = [100, 100, 160, 100, 160, 160, 100, 160];
  const kept = containedHoles(outer, [inside, outside]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0], inside);
});

test("the parliament rings are concrete masses at the reference height and still collide", () => {
  const outer = [2800, -15400, 2834, -15400, 2834, -15366, 2800, -15366];
  const file = chunk([{ id: 18085267, h: 9, hs: "estimated", outer }]);
  const built = buildChunkObjects(file, lib(), "near");
  const buildings = built.group.getObjectByName("buildings");
  assert.ok(buildings);
  buildings.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(buildings);
  assert.ok(box.max.y > 47 && box.max.y < 52, `center block height ${box.max.y}`);
  let named = false;
  buildings.traverse((obj) => {
    const ranges = (obj as THREE.Mesh).userData.ranges as { label: string }[] | undefined;
    if (ranges?.some((range) => range.label.includes("Jatiya Sangsad"))) named = true;
  });
  assert.equal(named, true);
  const solid = solidsFromChunk(file);
  assert.ok(solid.bucket.walls.some((wall) => wall.y1 === 47));
  assert.ok(solid.bucket.roofs.some((roof) => roof.y === 47));
  for (const geo of built.geometries) geo.dispose();
});
