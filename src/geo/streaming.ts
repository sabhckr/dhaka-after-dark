import { chebyshev, chunkKey, type ChunkCoord } from "./chunks.ts";

export type ReleaseBag = {
  geometries: { dispose: () => void }[];
  instanced: { dispose: () => void }[];
};

/** Drop GPU resources owned by one chunk. Shared materials are not disposed here. */
export function releaseChunkResources(bag: ReleaseBag): void {
  for (const g of bag.geometries) g.dispose();
  for (const m of bag.instanced) m.dispose();
  bag.geometries.length = 0;
  bag.instanced.length = 0;
}

export type SchedulerOptions = {
  loadRadius: number;
  unloadRadius: number;
  maxConcurrent?: number;
  fetchChunk: (ix: number, iy: number) => Promise<unknown | null>;
  onLoad: (key: string, ix: number, iy: number, data: unknown | null) => void;
  onUnload: (key: string) => void;
  onError: (key: string, error: Error) => void;
  /** Cells the dataset has a file for. Cells outside it are never fetched (they would 404). */
  exists?: (ix: number, iy: number) => boolean;
};

/**
 * Chebyshev streaming with hysteresis.
 * Load when distance <= loadRadius. Unload only when distance >= unloadRadius.
 * The gap between those radii stops load/unload flicker on a chunk edge.
 * In-flight keys are not requested twice. A chunk that 404s is cached as empty.
 * A chunk that throws is retried once, then marked dead until `resetFailures`.
 * Queued work is taken nearest-first, and jobs the camera has already left
 * (outside the load radius) are dropped. A fetch that lands after the camera
 * moved past the unload radius is discarded instead of being built and then
 * unloaded on the next frame.
 * With a `lead` cell (where the camera will be shortly), cells around it are
 * requested too, after the ones around the focus, as long as they sit inside
 * the unload radius, so travel finds them loaded instead of fogged.
 */
export class ChunkScheduler {
  readonly loaded = new Set<string>();
  readonly loading = new Set<string>();
  readonly empty = new Set<string>();
  readonly errors: { key: string; message: string }[] = [];
  private readonly opts: SchedulerOptions;
  private readonly attempts = new Map<string, number>();
  private readonly dead = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly pending: ChunkCoord[] = [];
  private active = 0;
  private disposed = false;
  focus: ChunkCoord = { ix: 0, iy: 0 };
  lead: ChunkCoord | null = null;

  constructor(opts: SchedulerOptions) {
    this.opts = opts;
  }

  get loadingCount(): number {
    return this.loading.size + this.pending.length;
  }

  update(ix: number, iy: number, lead: ChunkCoord | null = null): void {
    if (this.disposed) return;
    this.focus = { ix, iy };
    this.lead = lead && (lead.ix !== ix || lead.iy !== iy) ? lead : null;
    const r = this.opts.loadRadius;
    for (let y = iy - r; y <= iy + r; y++) {
      for (let x = ix - r; x <= ix + r; x++) {
        if (chebyshev({ ix, iy }, { ix: x, iy: y }) <= r) this.request(x, y);
      }
    }
    const ahead = this.lead;
    if (ahead) {
      for (let y = ahead.iy - r; y <= ahead.iy + r; y++) {
        for (let x = ahead.ix - r; x <= ahead.ix + r; x++) {
          if (this.wanted({ ix: x, iy: y })) this.request(x, y);
        }
      }
    }
    this.pump();
    for (const key of [...this.loaded]) {
      const [x, y] = key.split("_").map(Number);
      if (chebyshev({ ix, iy }, { ix: x, iy: y }) >= this.opts.unloadRadius) this.unload(key);
    }
  }

  /** In the load radius of the focus, or of the lead while still inside the unload radius. */
  private wanted(cell: ChunkCoord): boolean {
    const r = this.opts.loadRadius;
    if (chebyshev(this.focus, cell) <= r) return true;
    return this.lead !== null && chebyshev(this.lead, cell) <= r && chebyshev(this.focus, cell) < this.opts.unloadRadius;
  }

  private request(ix: number, iy: number): void {
    if (this.opts.exists && !this.opts.exists(ix, iy)) return;
    const key = chunkKey(ix, iy);
    if (this.loaded.has(key) || this.loading.has(key) || this.queued.has(key) || this.dead.has(key)) return;
    this.queued.add(key);
    this.pending.push({ ix, iy });
  }

  private pump(): void {
    const max = this.opts.maxConcurrent ?? 3;
    while (this.active < max && this.pending.length) {
      let best = 0;
      for (let i = 1; i < this.pending.length; i++) {
        if (chebyshev(this.focus, this.pending[i]) < chebyshev(this.focus, this.pending[best])) best = i;
      }
      const job = this.pending.splice(best, 1)[0];
      const key = chunkKey(job.ix, job.iy);
      this.queued.delete(key);
      if (this.loaded.has(key) || this.dead.has(key) || this.disposed) continue;
      if (!this.wanted(job)) continue;
      this.loading.add(key);
      this.active++;
      this.opts
        .fetchChunk(job.ix, job.iy)
        .then((data) => {
          if (this.disposed) return;
          if (chebyshev(this.focus, job) >= this.opts.unloadRadius) return;
          this.loaded.add(key);
          if (data == null) this.empty.add(key);
          this.opts.onLoad(key, job.ix, job.iy, data);
        })
        .catch((e: unknown) => {
          const n = (this.attempts.get(key) || 0) + 1;
          this.attempts.set(key, n);
          const err = e instanceof Error ? e : new Error(String(e));
          this.errors.push({ key, message: err.message });
          if (this.errors.length > 32) this.errors.shift();
          this.opts.onError(key, err);
          if (n >= 2) this.dead.add(key);
        })
        .finally(() => {
          this.loading.delete(key);
          this.active--;
          if (!this.disposed) this.pump();
        });
    }
  }

  private unload(key: string): void {
    if (!this.loaded.has(key)) return;
    this.loaded.delete(key);
    this.empty.delete(key);
    this.opts.onUnload(key);
  }

  resetFailures(): void {
    this.dead.clear();
    this.attempts.clear();
  }

  dispose(): void {
    this.disposed = true;
    for (const key of [...this.loaded]) this.unload(key);
    this.pending.length = 0;
    this.queued.clear();
  }
}
