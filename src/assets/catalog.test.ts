import assert from "node:assert/strict";
import test from "node:test";
import { ASSET_STATUSES, CATALOG, PLACEMENTS } from "./catalog.ts";

const ALLOWED = new Set<string>(ASSET_STATUSES);

test("catalog covers every index category and all 20 characters", () => {
  const cats = new Set(CATALOG.map((asset) => asset.category));
  for (const name of ["NPC", "Vehicles", "Buses", "Police", "Metro", "Railway", "Airport", "Hawkers", "Landmarks", "Infrastructure"]) {
    assert.ok(cats.has(name), name);
  }
  assert.equal(CATALOG.filter((asset) => asset.category === "NPC").length, 20);
  const ids = CATALOG.map((asset) => asset.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every model builds with a solid collider and an honest status", () => {
  for (const asset of CATALOG) {
    assert.ok(ALLOWED.has(asset.status), asset.id);
    assert.notEqual(asset.status, "NOT STARTED", asset.id);
    assert.notEqual(asset.status, "VERIFIED", asset.id);
    const group = asset.build();
    assert.ok(group.children.length > 0, asset.id);
    const boxes = group.userData.colliders as { min: number[]; max: number[] }[];
    assert.ok(boxes?.length >= 1, asset.id);
    for (const box of boxes) {
      assert.ok(box.max[0] > box.min[0] && box.max[1] > box.min[1] && box.max[2] > box.min[2], asset.id);
      assert.ok(box.min[1] > -0.25, `${asset.id} floats under the floor`);
      assert.ok(box.max[1] - box.min[1] > 0.3, asset.id);
      assert.ok(box.max[0] - box.min[0] < 80, asset.id);
      assert.ok(box.max[2] - box.min[2] < 80, asset.id);
    }
  }
});

test("integrated means the mesh is actually placed in the city", () => {
  const placed = new Set(PLACEMENTS.map((place) => place.assetId));
  for (const asset of CATALOG) {
    if (asset.status === "INTEGRATED") assert.ok(placed.has(asset.id), asset.id);
  }
  for (const place of PLACEMENTS) {
    const asset = CATALOG.find((item) => item.id === place.assetId);
    assert.ok(asset, place.assetId);
    assert.equal(asset?.status, "INTEGRATED");
    assert.ok(Number.isFinite(place.x) && Number.isFinite(place.z) && Number.isFinite(place.y));
  }
  assert.ok(PLACEMENTS.length >= 15);
});
