import * as THREE from "three";

/**
 * Loaded-set batches. Roads, ground, rails, landmarks, and footbridges are a
 * small triangle count, so they share one mesh per material across the chunks
 * currently in memory. Repeated props share one InstancedMesh per geometry.
 * A chunk load or unload rebuilds only that material. Building meshes stay on
 * the chunk: they are most of the triangles, they swap with LOD, and merging
 * them would draw off-screen walls.
 */

export type BatchVisibility = {
  trees: boolean;
  dressing: boolean;
  rails: boolean;
};

type StaticPart = {
  chunk: string;
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  index: Uint32Array;
};

type InstancePart = {
  chunk: string;
  group: "trees" | "dressing" | "rails";
  matrices: THREE.Matrix4[];
  colors: THREE.Color[] | null;
  visible: boolean;
};

type StaticBlock = {
  mat: THREE.Material;
  parts: StaticPart[];
  mesh: THREE.Mesh | null;
};

type InstanceBlock = {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  parts: InstancePart[];
  mesh: THREE.InstancedMesh | null;
};

function copyStatic(geo: THREE.BufferGeometry, chunk: string): StaticPart | null {
  const position = geo.getAttribute("position");
  const index = geo.getIndex();
  if (!position || !index) return null;
  const uv = geo.getAttribute("uv");
  const color = geo.getAttribute("color");
  const positions = new Float32Array(position.count * 3);
  const uvs = new Float32Array(position.count * 2);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
    if (uv) {
      uvs[i * 2] = uv.getX(i);
      uvs[i * 2 + 1] = uv.getY(i);
    }
    if (color) {
      colors[i * 3] = color.getX(i);
      colors[i * 3 + 1] = color.getY(i);
      colors[i * 3 + 2] = color.getZ(i);
    } else {
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }
  }
  const copied = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i++) copied[i] = index.getX(i);
  return { chunk, positions, uvs, colors, index: copied };
}

function buildStaticGeometry(parts: StaticPart[]): THREE.BufferGeometry | null {
  let verts = 0;
  let indices = 0;
  for (const part of parts) {
    verts += part.positions.length / 3;
    indices += part.index.length;
  }
  if (verts < 3 || indices < 3) return null;
  const positions = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const colors = new Float32Array(verts * 3);
  const index = new Uint32Array(indices);
  let vBase = 0;
  let iBase = 0;
  for (const part of parts) {
    const count = part.positions.length / 3;
    positions.set(part.positions, vBase * 3);
    uvs.set(part.uvs, vBase * 2);
    colors.set(part.colors, vBase * 3);
    for (let i = 0; i < part.index.length; i++) index[iBase + i] = part.index[i] + vBase;
    vBase += count;
    iBase += part.index.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export class BlockBatches {
  readonly root = new THREE.Group();
  private readonly statics = new Map<string, StaticBlock>();
  private readonly instances = new Map<string, InstanceBlock>();

  constructor() {
    this.root.name = "block-batches";
  }

  absorb(chunkKey: string, _ix: number, _iy: number, group: THREE.Object3D, visibility: BatchVisibility): number {
    const taken: THREE.Object3D[] = [];
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.userData.blockBatch) return;
      taken.push(mesh);
    });
    let n = 0;
    for (const obj of taken) {
      const mesh = obj as THREE.Mesh;
      const kind = mesh.userData.blockBatch as string;
      if (kind === "static") {
        const part = copyStatic(mesh.geometry, chunkKey);
        mesh.removeFromParent();
        if (!part) continue;
        const key = `s|${(mesh.material as THREE.Material).uuid}|${mesh.userData.batchKind || "static"}`;
        let bucket = this.statics.get(key);
        if (!bucket) {
          bucket = { mat: mesh.material as THREE.Material, parts: [], mesh: null };
          this.statics.set(key, bucket);
        }
        bucket.parts.push(part);
        this.rebuildStatic(key, bucket);
        n++;
      } else if (kind === "instance" && (mesh as THREE.InstancedMesh).isInstancedMesh) {
        const inst = mesh as THREE.InstancedMesh;
        const groupName = mesh.userData.batchGroup as InstancePart["group"];
        const matrices: THREE.Matrix4[] = [];
        const colors: THREE.Color[] = [];
        const hasColor = Boolean(inst.instanceColor);
        for (let i = 0; i < inst.count; i++) {
          const matrix = new THREE.Matrix4();
          inst.getMatrixAt(i, matrix);
          matrices.push(matrix);
          if (hasColor) {
            const color = new THREE.Color();
            inst.getColorAt(i, color);
            colors.push(color);
          }
        }
        inst.removeFromParent();
        inst.dispose();
        if (!matrices.length) continue;
        const key = `i|${groupName}|${inst.geometry.uuid}|${(inst.material as THREE.Material).uuid}`;
        let bucket = this.instances.get(key);
        if (!bucket) {
          bucket = { geo: inst.geometry, mat: inst.material as THREE.Material, parts: [], mesh: null };
          this.instances.set(key, bucket);
        }
        const visible = groupName === "trees" ? visibility.trees : groupName === "dressing" ? visibility.dressing : visibility.rails;
        bucket.parts.push({ chunk: chunkKey, group: groupName, matrices, colors: hasColor ? colors : null, visible });
        this.rebuildInstances(bucket);
        n++;
      }
    }
    return n;
  }

  setChunkVisible(chunkKey: string, groupName: InstancePart["group"], visible: boolean): void {
    for (const bucket of this.instances.values()) {
      let changed = false;
      for (const part of bucket.parts) {
        if (part.chunk !== chunkKey || part.group !== groupName || part.visible === visible) continue;
        part.visible = visible;
        changed = true;
      }
      if (changed) this.rebuildInstances(bucket);
    }
  }

  dropGroup(chunkKey: string, groupName: InstancePart["group"]): void {
    for (const bucket of this.instances.values()) {
      const next = bucket.parts.filter((part) => !(part.chunk === chunkKey && part.group === groupName));
      if (next.length === bucket.parts.length) continue;
      bucket.parts = next;
      if (!next.length) this.disposeInstanceMesh(bucket);
      else this.rebuildInstances(bucket);
    }
    for (const [key, bucket] of [...this.instances]) {
      if (!bucket.parts.length) this.instances.delete(key);
    }
  }

  drop(chunkKey: string): void {
    for (const [key, bucket] of this.statics) {
      const next = bucket.parts.filter((part) => part.chunk !== chunkKey);
      if (next.length === bucket.parts.length) continue;
      bucket.parts = next;
      if (!next.length) {
        this.disposeStaticMesh(bucket);
        this.statics.delete(key);
      } else this.rebuildStatic(key, bucket);
    }
    for (const [key, bucket] of this.instances) {
      const next = bucket.parts.filter((part) => part.chunk !== chunkKey);
      if (next.length === bucket.parts.length) continue;
      bucket.parts = next;
      if (!next.length) {
        this.disposeInstanceMesh(bucket);
        this.instances.delete(key);
      } else this.rebuildInstances(bucket);
    }
  }

  stats(): { staticMeshes: number; instanceMeshes: number; instances: number } {
    let instances = 0;
    for (const bucket of this.instances.values()) {
      if (bucket.mesh?.visible) instances += bucket.mesh.count;
    }
    return {
      staticMeshes: [...this.statics.values()].filter((bucket) => bucket.mesh?.visible).length,
      instanceMeshes: [...this.instances.values()].filter((bucket) => bucket.mesh?.visible).length,
      instances,
    };
  }

  dispose(): void {
    for (const bucket of this.statics.values()) this.disposeStaticMesh(bucket);
    for (const bucket of this.instances.values()) this.disposeInstanceMesh(bucket);
    this.statics.clear();
    this.instances.clear();
  }

  private rebuildStatic(key: string, bucket: StaticBlock): void {
    const geo = buildStaticGeometry(bucket.parts);
    this.disposeStaticMesh(bucket);
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, bucket.mat);
    mesh.name = key.includes("|roads") ? "batch-roads" : key.includes("|ground") ? "batch-ground" : "batch-static";
    if (key.includes("|rails")) mesh.name = "batch-rails";
    if (key.includes("|posters")) mesh.name = "batch-posters";
    if (key.includes("|landmarks")) mesh.name = "batch-landmarks";
    if (key.includes("|footbridge")) mesh.name = "batch-footbridge";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    bucket.mesh = mesh;
    this.root.add(mesh);
  }

  private rebuildInstances(bucket: InstanceBlock): void {
    const visible = bucket.parts.filter((part) => part.visible);
    let count = 0;
    let colored = false;
    for (const part of visible) {
      count += part.matrices.length;
      if (part.colors) colored = true;
    }
    this.disposeInstanceMesh(bucket);
    if (!count) return;
    const mesh = new THREE.InstancedMesh(bucket.geo, bucket.mat, count);
    mesh.name = visible[0]?.group === "trees" ? "batch-trees" : visible[0]?.group === "dressing" ? "batch-dressing" : "batch-rails";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
    let cursor = 0;
    for (const part of visible) {
      for (let i = 0; i < part.matrices.length; i++) {
        mesh.setMatrixAt(cursor, part.matrices[i]);
        if (colored) mesh.setColorAt(cursor, part.colors?.[i] ?? new THREE.Color(1, 1, 1));
        cursor++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    bucket.mesh = mesh;
    this.root.add(mesh);
  }

  private disposeStaticMesh(bucket: StaticBlock): void {
    if (!bucket.mesh) return;
    this.root.remove(bucket.mesh);
    bucket.mesh.geometry.dispose();
    bucket.mesh = null;
  }

  private disposeInstanceMesh(bucket: InstanceBlock): void {
    if (!bucket.mesh) return;
    this.root.remove(bucket.mesh);
    bucket.mesh.dispose();
    bucket.mesh = null;
  }
}
