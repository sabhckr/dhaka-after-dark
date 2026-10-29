import * as THREE from "three";

type Batch = {
  mesh: THREE.InstancedMesh;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  used: number;
  touched: boolean;
  labels: string[];
};

/**
 * One InstancedMesh per geometry/material pair.
 * Simulation code submits world matrices; this only draws them.
 * `instanceMatrix.needsUpdate` is set once per batch after the whole pass.
 */
export class InstanceBatcher {
  readonly root = new THREE.Group();
  private readonly batches = new Map<string, Batch>();

  constructor(name: string) {
    this.root.name = name;
  }

  beginFrame(): void {
    for (const batch of this.batches.values()) {
      batch.used = 0;
      batch.touched = false;
    }
  }

  add(geo: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, label: string): void {
    const key = `${geo.uuid}|${material.uuid}`;
    let batch = this.batches.get(key);
    if (!batch) batch = this.alloc(key, geo, material, 16);
    if (batch.used >= batch.mesh.instanceMatrix.count) batch = this.grow(batch);
    batch.mesh.setMatrixAt(batch.used, matrix);
    batch.labels[batch.used] = label;
    batch.used++;
    batch.touched = true;
  }

  endFrame(): void {
    for (const batch of this.batches.values()) {
      const mesh = batch.mesh;
      if (!batch.touched || batch.used === 0) {
        mesh.count = 0;
        mesh.visible = false;
        continue;
      }
      mesh.count = batch.used;
      mesh.visible = true;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, batch.used * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.instanceLabels = batch.labels;
    }
  }

  stats(): { batches: number; instances: number } {
    let batches = 0;
    let instances = 0;
    for (const batch of this.batches.values()) {
      if (!batch.mesh.visible || batch.mesh.count <= 0) continue;
      batches++;
      instances += batch.mesh.count;
    }
    return { batches, instances };
  }

  dispose(): void {
    for (const batch of this.batches.values()) {
      this.root.remove(batch.mesh);
      batch.mesh.dispose();
    }
    this.batches.clear();
  }

  private alloc(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): Batch {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    mesh.matrixAutoUpdate = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(mesh);
    const batch: Batch = { mesh, geo, mat, used: 0, touched: false, labels: [] };
    this.batches.set(key, batch);
    return batch;
  }

  private grow(batch: Batch): Batch {
    const cap = batch.mesh.instanceMatrix.count * 2;
    const next = new THREE.InstancedMesh(batch.geo, batch.mat, cap);
    next.frustumCulled = false;
    next.castShadow = false;
    next.receiveShadow = false;
    next.count = 0;
    next.matrixAutoUpdate = false;
    next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    (next.instanceMatrix.array as Float32Array).set(batch.mesh.instanceMatrix.array as Float32Array);
    this.root.remove(batch.mesh);
    batch.mesh.dispose();
    batch.mesh = next;
    this.root.add(next);
    return batch;
  }
}
