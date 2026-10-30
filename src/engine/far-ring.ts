import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { chebyshev, chunkKey, type ChunkCoord } from "../geo/chunks.ts";
import type { ChunkFile } from "../geo/types.ts";

export type FarPart = { material: THREE.Material; geometry: THREE.BufferGeometry };

export type FarRingOptions = {
  /** Cells this close are the streamed ring's; the far ring draws a cell there only until its chunk is in. */
  inner: number;
  outer: number;
  /** Cells per side of one merged block. */
  block?: number;
  maxConcurrent?: number;
  exists?: (ix: number, iy: number) => boolean;
  fetchChunk: (ix: number, iy: number) => Promise<ChunkFile | null>;
  /** Builds a cell's stand-in geometry; `dist` is its Chebyshev distance from the focus when built. */
  build: (chunk: ChunkFile, dist: number) => FarPart[];
  /** Runs work later, inside the frame budget. */
  enqueue: (task: () => void) => void;
  /** True once the streamed ring has drawn this chunk, so the stand-in must not be drawn too. */
  nearReady: (key: string) => boolean;
};

type Cell = {
  ix: number;
  iy: number;
  key: string;
  state: "queued" | "loading" | "built" | "empty" | "dropped";
  parts: FarPart[];
  hidden: boolean;
};

type Block = { meshes: THREE.Mesh[]; dirty: boolean; queued: boolean };

/**
 * Cheap city mass beyond the streamed ring, so the skyline continues to the
 * fog instead of ending 1.25 km out. It reads the same chunk files, keeps only
 * building masses and water, and merges them into one mesh per material per
 * block of cells to keep draw calls flat. A cell is hidden while the streamed
 * ring has its chunk and shown again when that chunk unloads, without a fetch.
 */
export class FarRing {
  readonly root = new THREE.Group();
  private readonly opts: FarRingOptions;
  private readonly cells = new Map<string, Cell>();
  private readonly blocks = new Map<string, Block>();
  private readonly pending: Cell[] = [];
  private focus: ChunkCoord = { ix: 0, iy: 0 };
  private active = 0;
  private disposed = false;

  constructor(opts: FarRingOptions) {
    this.opts = opts;
    this.root.name = "far-ring";
  }

  update(ix: number, iy: number): void {
    if (this.disposed) return;
    this.focus = { ix, iy };
    const { inner, outer } = this.opts;
    for (let y = iy - outer; y <= iy + outer; y++) {
      for (let x = ix - outer; x <= ix + outer; x++) {
        const key = chunkKey(x, y);
        if (this.cells.has(key)) continue;
        if (chebyshev(this.focus, { ix: x, iy: y }) <= inner) continue;
        if (this.opts.exists && !this.opts.exists(x, y)) continue;
        const cell: Cell = { ix: x, iy: y, key, state: "queued", parts: [], hidden: false };
        this.cells.set(key, cell);
        this.pending.push(cell);
      }
    }
    for (const cell of this.cells.values()) {
      const d = chebyshev(this.focus, cell);
      if (d > outer + 1) {
        this.drop(cell);
        continue;
      }
      if (cell.state !== "built") continue;
      const hidden = this.opts.nearReady(cell.key);
      if (hidden !== cell.hidden) {
        cell.hidden = hidden;
        this.touch(cell);
      }
    }
    this.pump();
  }

  /** Changes the outer radius; cells past it are dropped on the next update. */
  setOuter(outer: number): void {
    this.opts.outer = outer;
  }

  stats(): { cells: number; built: number; blocks: number; meshes: number; triangles: number } {
    let built = 0;
    for (const cell of this.cells.values()) if (cell.state === "built") built++;
    let meshes = 0;
    let triangles = 0;
    for (const block of this.blocks.values()) {
      meshes += block.meshes.length;
      for (const mesh of block.meshes) triangles += (mesh.geometry.index?.count ?? 0) / 3;
    }
    return { cells: this.cells.size, built, blocks: this.blocks.size, meshes, triangles };
  }

  dispose(): void {
    this.disposed = true;
    for (const cell of [...this.cells.values()]) this.drop(cell);
    for (const block of this.blocks.values())
      for (const mesh of block.meshes) mesh.geometry.dispose();
    this.blocks.clear();
    this.root.clear();
    this.pending.length = 0;
  }

  private pump(): void {
    const max = this.opts.maxConcurrent ?? 2;
    while (this.active < max && this.pending.length) {
      let best = 0;
      for (let i = 1; i < this.pending.length; i++) {
        if (chebyshev(this.focus, this.pending[i]) < chebyshev(this.focus, this.pending[best]))
          best = i;
      }
      const cell = this.pending.splice(best, 1)[0];
      if (cell.state !== "queued") continue;
      cell.state = "loading";
      this.active++;
      this.opts
        .fetchChunk(cell.ix, cell.iy)
        .then((chunk) => {
          if (this.disposed || cell.state !== "loading") return;
          if (!chunk) {
            cell.state = "empty";
            return;
          }
          this.opts.enqueue(() => {
            if (this.disposed || cell.state !== "loading") return;
            cell.parts = this.opts.build(chunk, chebyshev(this.focus, cell));
            cell.state = "built";
            cell.hidden = this.opts.nearReady(cell.key);
            this.touch(cell);
          });
        })
        .catch(() => {
          // A stand-in is optional: a failed fetch leaves the cell empty.
          if (cell.state === "loading") cell.state = "empty";
        })
        .finally(() => {
          this.active--;
          if (!this.disposed) this.pump();
        });
    }
  }

  private drop(cell: Cell): void {
    this.cells.delete(cell.key);
    const had = cell.state === "built";
    cell.state = "dropped";
    for (const part of cell.parts) part.geometry.dispose();
    cell.parts = [];
    if (had) this.touch(cell);
  }

  private blockKey(cell: { ix: number; iy: number }): string {
    const n = this.opts.block ?? 3;
    return `${Math.floor(cell.ix / n)}_${Math.floor(cell.iy / n)}`;
  }

  /** Marks the cell's block for re-merging and queues one merge for it. */
  private touch(cell: Cell): void {
    const key = this.blockKey(cell);
    let block = this.blocks.get(key);
    if (!block) {
      block = { meshes: [], dirty: false, queued: false };
      this.blocks.set(key, block);
    }
    block.dirty = true;
    if (block.queued) return;
    block.queued = true;
    const target = block;
    this.opts.enqueue(() => {
      target.queued = false;
      if (this.disposed || !target.dirty) return;
      target.dirty = false;
      this.merge(key, target);
    });
  }

  private merge(key: string, block: Block): void {
    for (const mesh of block.meshes) {
      this.root.remove(mesh);
      mesh.geometry.dispose();
    }
    block.meshes = [];
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const cell of this.cells.values()) {
      if (cell.state !== "built" || cell.hidden || this.blockKey(cell) !== key) continue;
      for (const part of cell.parts) {
        const list = byMaterial.get(part.material);
        if (list) list.push(part.geometry);
        else byMaterial.set(part.material, [part.geometry]);
      }
    }
    for (const [material, geos] of byMaterial) {
      const merged = geos.length === 1 ? geos[0].clone() : mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `far-${key}`;
      mesh.raycast = () => {};
      mesh.matrixAutoUpdate = false;
      block.meshes.push(mesh);
      this.root.add(mesh);
    }
    if (!block.meshes.length) this.blocks.delete(key);
  }
}
