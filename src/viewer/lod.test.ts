import assert from "node:assert/strict";
import test from "node:test";
import { actorCaps, anisotropyCap, dressBudget, pixelRatioCap, selectBuildingLod, treesHidden } from "./lod.ts";

test("fresh lod bands keep a near shell, a mid shell, and a far shell", () => {
  assert.equal(selectBuildingLod(0, "low"), "near");
  assert.equal(selectBuildingLod(1, "low"), "mid");
  assert.equal(selectBuildingLod(2, "low"), "far");
  assert.equal(selectBuildingLod(0, "medium"), "near");
  assert.equal(selectBuildingLod(2, "medium"), "mid");
  assert.equal(selectBuildingLod(3, "medium"), "far");
  assert.equal(selectBuildingLod(1, "high"), "near");
  assert.equal(selectBuildingLod(2, "high"), "mid");
  assert.equal(selectBuildingLod(3, "high"), "far");
});

test("a chunk on the border steps one level and does not flicker", () => {
  assert.equal(selectBuildingLod(1, "low", "near"), "near");
  assert.equal(selectBuildingLod(2, "low", "near"), "mid");
  assert.equal(selectBuildingLod(3, "low", "mid"), "far");
  assert.equal(selectBuildingLod(2, "low", "mid"), "mid");
  assert.equal(selectBuildingLod(0, "low", "mid"), "near");
  assert.equal(selectBuildingLod(1, "low", "far"), "mid");
  assert.equal(selectBuildingLod(0, "low", "far"), "near");
  assert.equal(selectBuildingLod(2, "high", "near"), "near");
  assert.equal(selectBuildingLod(3, "high", "near"), "mid");
  assert.equal(selectBuildingLod(4, "high", "mid"), "far");
});

test("presets change trees, actors, dressing, and fill rate", () => {
  assert.equal(treesHidden(1, "low"), true);
  assert.equal(treesHidden(1, "medium"), false);
  assert.equal(treesHidden(1, "high"), false);
  assert.equal(treesHidden(2, "high"), true);
  assert.deepEqual(actorCaps("low"), { npcs: 10, traffic: 6 });
  assert.deepEqual(actorCaps("medium"), { npcs: 16, traffic: 10 });
  assert.deepEqual(actorCaps("high"), { npcs: 26, traffic: 14 });
  assert.equal(dressBudget("low").cables, false);
  assert.equal(dressBudget("medium").cables, false);
  assert.equal(dressBudget("high").cables, true);
  assert.ok(dressBudget("low").lamps < dressBudget("medium").lamps);
  assert.ok(dressBudget("medium").lamps < dressBudget("high").lamps);
  assert.equal(pixelRatioCap("low", 2), 1);
  assert.equal(pixelRatioCap("medium", 2), 1);
  assert.equal(pixelRatioCap("high", 2), 1.5);
  assert.ok(anisotropyCap("low") < anisotropyCap("medium"));
  assert.ok(anisotropyCap("medium") < anisotropyCap("high"));
});
