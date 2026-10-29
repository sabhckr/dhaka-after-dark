import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { InstanceBatcher } from "./batches.ts";

test("instances of one geometry and material are a single batch", () => {
  const batcher = new InstanceBatcher("test");
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  const matrix = new THREE.Matrix4();
  batcher.beginFrame();
  for (let i = 0; i < 20; i++) {
    matrix.makeTranslation(i, 2, -4);
    batcher.add(geo, mat, matrix, `n${i}`);
  }
  batcher.endFrame();
  const stats = batcher.stats();
  assert.equal(stats.batches, 1);
  assert.equal(stats.instances, 20);
  const mesh = batcher.root.children[0] as THREE.InstancedMesh;
  const version = mesh.instanceMatrix.version;
  assert.ok(version > 0);
  const out = new THREE.Matrix4();
  mesh.getMatrixAt(3, out);
  assert.ok(Math.abs(out.elements[12] - 3) < 1e-4);
  assert.equal((mesh.userData.instanceLabels as string[])[3], "n3");

  batcher.beginFrame();
  matrix.makeTranslation(0, 0, 0);
  batcher.add(geo, mat, matrix, "only");
  batcher.endFrame();
  assert.equal(batcher.stats().instances, 1);
  assert.equal(mesh.count, 1);

  batcher.beginFrame();
  batcher.endFrame();
  assert.equal(batcher.stats().instances, 0);
  assert.equal(mesh.visible, false);
  batcher.dispose();
  geo.dispose();
  mat.dispose();
});

test("different materials stay in different batches", () => {
  const batcher = new InstanceBatcher("test");
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const a = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const b = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const matrix = new THREE.Matrix4();
  batcher.beginFrame();
  batcher.add(geo, a, matrix, "a");
  batcher.add(geo, b, matrix, "b");
  batcher.endFrame();
  assert.equal(batcher.stats().batches, 2);
  batcher.dispose();
  geo.dispose();
  a.dispose();
  b.dispose();
});
