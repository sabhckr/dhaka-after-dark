import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockBatches } from "./block-batch.ts";

function quad(y: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([0, y, 0, 2, y, 0, 2, y, 2, 0, y, 2], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  return geo;
}

function show(): { trees: boolean; dressing: boolean; rails: boolean } {
  return { trees: true, dressing: true, rails: true };
}

test("loaded chunks that share a material are one mesh, and a drop rebuilds it", () => {
  const batches = new BlockBatches();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const a = new THREE.Group();
  const b = new THREE.Group();
  const meshA = new THREE.Mesh(quad(0), mat);
  const meshB = new THREE.Mesh(quad(1), mat);
  meshA.userData.blockBatch = "static";
  meshA.userData.batchKind = "roads";
  meshB.userData.blockBatch = "static";
  meshB.userData.batchKind = "roads";
  a.add(meshA);
  b.add(meshB);
  batches.absorb("0_0", 0, 0, a, show());
  batches.absorb("8_8", 8, 8, b, show());
  assert.equal(a.children.length, 0);
  assert.equal(batches.stats().staticMeshes, 1);
  const merged = batches.root.children[0] as THREE.Mesh;
  assert.equal(merged.geometry.getIndex()?.count, 12);
  batches.drop("0_0");
  assert.equal(batches.stats().staticMeshes, 1);
  assert.equal((batches.root.children[0] as THREE.Mesh).geometry.getIndex()?.count, 6);
  batches.drop("8_8");
  assert.equal(batches.stats().staticMeshes, 0);
  assert.equal(batches.root.children.length, 0);
  mat.dispose();
  batches.dispose();
});

test("instanced props combine inside a block and hide without deleting the chunk", () => {
  const batches = new BlockBatches();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial();
  const make = (x: number) => {
    const mesh = new THREE.InstancedMesh(geo, mat, 1);
    mesh.userData.blockBatch = "instance";
    mesh.userData.batchGroup = "trees";
    const dummy = new THREE.Object3D();
    dummy.position.set(x, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(0, dummy.matrix);
    mesh.count = 1;
    return mesh;
  };
  const groupA = new THREE.Group();
  const groupB = new THREE.Group();
  groupA.add(make(1));
  groupB.add(make(3));
  batches.absorb("0_0", 0, 0, groupA, show());
  batches.absorb("0_1", 0, 1, groupB, show());
  assert.equal(batches.stats().instanceMeshes, 1);
  assert.equal(batches.stats().instances, 2);
  batches.setChunkVisible("0_1", "trees", false);
  assert.equal(batches.stats().instances, 1);
  batches.drop("0_0");
  assert.equal(batches.stats().instances, 0);
  geo.dispose();
  mat.dispose();
  batches.dispose();
});
