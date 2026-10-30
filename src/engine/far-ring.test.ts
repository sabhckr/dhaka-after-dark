import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { ChunkFile } from "../geo/types.ts";
import { FarRing } from "./far-ring.ts";

const material = new THREE.MeshBasicMaterial();

function ring(near: Set<string>, exists?: (ix: number, iy: number) => boolean) {
  const tasks: Array<() => void> = [];
  const fetched: string[] = [];
  const far = new FarRing({
    inner: 1,
    outer: 2,
    block: 2,
    maxConcurrent: 64,
    exists,
    fetchChunk: async (ix, iy) => {
      fetched.push(`${ix}_${iy}`);
      return { ix, iy } as ChunkFile;
    },
    build: () => [{ material, geometry: new THREE.BoxGeometry(1, 1, 1) }],
    enqueue: (task) => tasks.push(task),
    nearReady: (key) => near.has(key),
  });
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      while (tasks.length) tasks.shift()!();
    }
  };
  return { far, fetched, settle };
}

test("fills the band between the streamed ring and the outer radius, merged per block", async () => {
  const { far, fetched, settle } = ring(new Set());
  far.update(0, 0);
  await settle();
  // 5x5 minus the 3x3 the streamed ring owns.
  assert.equal(fetched.length, 16);
  assert.ok(!fetched.includes("0_0") && !fetched.includes("1_1"));
  const s = far.stats();
  assert.equal(s.built, 16);
  assert.ok(s.meshes < 16, `not merged: ${s.meshes} meshes`);
  assert.equal(s.triangles, 16 * 12);
  far.dispose();
});

test("a cell the streamed ring has drawn is hidden, and shows again without a refetch", async () => {
  const near = new Set<string>();
  const { far, fetched, settle } = ring(near);
  far.update(0, 0);
  await settle();
  near.add("2_0");
  far.update(0, 0);
  await settle();
  assert.equal(far.stats().triangles, 15 * 12);
  near.delete("2_0");
  far.update(0, 0);
  await settle();
  assert.equal(far.stats().triangles, 16 * 12);
  assert.equal(fetched.length, 16);
  far.dispose();
});

test("cells past the outer radius are dropped and cells outside the dataset are skipped", async () => {
  const { far, fetched, settle } = ring(new Set(), (ix) => ix < 2);
  far.update(0, 0);
  await settle();
  assert.equal(fetched.length, 11);
  far.update(-10, 0);
  await settle();
  assert.equal(far.stats().cells, 16, "old cells were not dropped");
  far.dispose();
  assert.equal(far.root.children.length, 0);
});
