import * as THREE from "three";
import type { ChunkCoord } from "../geo/chunks.ts";
import { normalizeChunk } from "../geo/compat.ts";
import type { ShopRec } from "../geo/shops.ts";
import { ChunkScheduler, releaseChunkResources, type ReleaseBag } from "../geo/streaming.ts";
import type { ChunkFile } from "../geo/types.ts";
import { validateChunk } from "../geo/validate.ts";
import type { BlockBatches } from "../viewer/block-batch.ts";
import { farPropsHidden } from "../viewer/detail.ts";
import { buildDressing } from "../viewer/dressing.ts";
import { selectBuildingLod, treesHidden, type RenderQuality } from "../viewer/lod.ts";
import type { CityMaterials } from "../viewer/materials.ts";
import { buildChunkObjects, buildFarMass } from "../viewer/meshes.ts";
import { createStageTimer } from "../viewer/perf.ts";
import { solidsFromChunk, type SolidWorld } from "../viewer/solids.ts";
import { FarRing } from "./far-ring.ts";
import { IntegrationQueue } from "./integrate.ts";

/** Streamed ring radius in chunks (5x5). The far ring starts outside it. */
export const LOAD_RADIUS = 2;
const UNLOAD_RADIUS = 4;
/** Per-frame time for joining streamed chunks into the scene, collision and graphs. */
const INTEGRATE_MS = 6;
/** Per-frame time for far-ring work, spent only once the streamed ring has nothing queued. */
const FAR_MS = 3;

/** Far-ring outer radius in chunks: 6 reaches 3.25 km from the centre of the camera's chunk. */
export function farOuter(q: RenderQuality): number {
  return q === "high" ? 6 : q === "medium" ? 4 : LOAD_RADIUS;
}

/**
 * Smallest footprint the far ring keeps, by distance. Most Dhaka footprints are
 * under 100 m²; keeping every one from 1.25 to 3.25 km out drew about 1.07M
 * triangles around Kawran, so small ones drop out first where fog is thickest.
 */
export function farMinArea(dist: number): number {
  return dist <= 3 ? 60 : dist === 4 ? 100 : dist === 5 ? 160 : 250;
}

export type ChunkBag = ReleaseBag & { group: THREE.Group; counts: Record<string, number> };

/** What a streamed chunk feeds besides its meshes. */
type ChunkListener = {
  onChunk: (key: string, chunk: ChunkFile) => void;
  onUnload: (key: string) => void;
};

export type ChunkPipelineDeps = {
  scene: THREE.Scene;
  lib: CityMaterials;
  solids: SolidWorld;
  life: ChunkListener;
  traffic: ChunkListener;
  blocks: BlockBatches;
  /** Keys of the chunk files the dataset has ("ix_iy"); other cells are never fetched. */
  chunkKeys: Iterable<string>;
  quality: () => RenderQuality;
  onError: (message: string) => void;
  /** A chunk's meshes went into the scene, or left it. */
  onChange: (key: string, change: "in" | "out") => void;
};

async function fetchChunk(
  ix: number,
  iy: number,
  stages: ReturnType<typeof createStageTimer>,
): Promise<ChunkFile | null> {
  const res = await fetch(`/world/chunks/c_${ix}_${iy}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Chunk ${ix}_${iy} failed (${res.status})`);
  let data: unknown;
  const text = await res.text();
  try {
    data = stages.time("parse", () => JSON.parse(text));
  } catch {
    throw new Error(`Chunk ${ix}_${iy} is corrupt JSON`);
  }
  const problems = stages.time("validate", () => validateChunk(data));
  if (problems.length) throw new Error(`Chunk ${ix}_${iy}: ${problems[0]}`);
  return normalizeChunk(data as ChunkFile);
}

/**
 * Chunk streaming from fetch to scene: the 5x5 streamed ring (meshes,
 * dressing, collision, pedestrian graph, traffic), the far ring of building
 * masses beyond it, and the frame-budgeted queues both feed. The view calls
 * `update` and `run` once a frame and reads `bags` for what is drawn.
 */
export function createChunkPipeline(deps: ChunkPipelineDeps) {
  const { scene, lib, solids, life, traffic, blocks } = deps;
  const stages = createStageTimer();
  const bags = new Map<string, ChunkBag>();
  const chunkFiles = new Set(deps.chunkKeys);
  const exists = (ix: number, iy: number) => chunkFiles.has(`${ix}_${iy}`);
  const load = (ix: number, iy: number) => fetchChunk(ix, iy, stages);
  const integration = new IntegrationQueue();
  const farQueue = new IntegrationQueue();
  let dead = false;

  let signKeys: Set<string> | null = null;
  const knownSigns = async () => {
    if (signKeys) return signKeys;
    signKeys = new Set();
    try {
      const res = await fetch("/world/signs/index.json");
      if (res.ok) {
        const data = (await res.json()) as { chunkKeys?: string[] };
        for (const key of data.chunkKeys || []) signKeys.add(key);
      }
    } catch {
      /* no sign index */
    }
    return signKeys;
  };

  // Bumped on every load and unload. A build that finishes for an older
  // generation is thrown away, so an unload + reload during the signs fetch
  // cannot leave two copies of one chunk in the scene.
  const chunkGen = new Map<string, number>();
  const bumpGen = (key: string) => {
    const next = (chunkGen.get(key) ?? 0) + 1;
    chunkGen.set(key, next);
    return next;
  };
  const live = (key: string, gen: number) =>
    !dead && scheduler.loaded.has(key) && chunkGen.get(key) === gen;
  const fail = (key: string, err: unknown, what: string) =>
    deps.onError(`${key}: ${err instanceof Error ? err.message : what}`);

  const farRing = new FarRing({
    inner: LOAD_RADIUS,
    outer: farOuter(deps.quality()),
    exists,
    fetchChunk: load,
    build: (chunk, dist) =>
      stages.time("far-build", () => buildFarMass(chunk, lib.surfaces, farMinArea(dist))),
    enqueue: (task) => farQueue.push(task),
    nearReady: (key) => bags.has(key),
  });
  scene.add(farRing.root);

  const scheduler = new ChunkScheduler({
    exists,
    loadRadius: LOAD_RADIUS,
    unloadRadius: UNLOAD_RADIUS,
    maxConcurrent: 3,
    fetchChunk: load,
    onLoad: (key, ix, iy, data) => {
      const gen = bumpGen(key);
      if (!data) return;
      const chunk = data as ChunkFile;
      integration.push(() => {
        if (!live(key, gen)) return;
        try {
          stages.time("collision", () => solids.setChunk(key, solidsFromChunk(chunk).bucket));
          stages.time("pedestrian-graph", () => life.onChunk(key, chunk));
          stages.time("traffic", () => traffic.onChunk(key, chunk));
        } catch (err) {
          fail(key, err, "collision");
        }
      });
      void (async () => {
        let shops: ShopRec[] = [];
        const keys = await knownSigns();
        if (keys.has(`${ix}_${iy}`)) {
          try {
            const res = await fetch(`/world/signs/c_${ix}_${iy}.json`);
            if (res.ok) {
              const json: unknown = await res.json();
              if (Array.isArray(json)) shops = json as ShopRec[];
            }
          } catch {
            /* optional sidecar */
          }
        }
        if (!live(key, gen)) return;
        integration.push(() => {
          if (!live(key, gen)) return;
          let built: ReturnType<typeof buildChunkObjects>;
          try {
            const quality = deps.quality();
            const dist = Math.max(
              Math.abs(ix - scheduler.focus.ix),
              Math.abs(iy - scheduler.focus.iy),
            );
            const lod = selectBuildingLod(dist, quality);
            built = stages.time("meshes", () => buildChunkObjects(chunk, lib.surfaces, lod));
            const dress = stages.time("dressing", () => buildDressing(chunk, shops, lib, quality));
            built.group.add(dress.group);
            built.geometries.push(...dress.geometries);
            built.instanced.push(...dress.instanced);
            const group = built.group;
            stages.time("batch-absorb", () =>
              blocks.absorb(key, ix, iy, group, {
                trees: !treesHidden(dist, quality),
                dressing: !farPropsHidden(dist),
                rails: true,
              }),
            );
            built.instanced = built.instanced.filter(
              (mesh) => (mesh as THREE.Object3D).parent != null,
            );
            built.group.userData.chunk = chunk;
            built.group.userData.shops = shops;
            built.group.userData.dress = dress;
            built.group.userData.dressQuality = quality;
          } catch (err) {
            fail(key, err, "mesh");
            return;
          }
          if (!live(key, gen)) {
            blocks.drop(key);
            releaseChunkResources(built);
            return;
          }
          scene.add(built.group);
          bags.set(key, {
            ...built,
            counts: {
              roads: chunk.roads.length,
              buildings: chunk.buildings.length,
              water: chunk.water.length + chunk.canals.length,
              parks: chunk.parks.length,
              trees: chunk.trees.length,
            },
          });
          deps.onChange(key, "in");
        });
      })();
    },
    onUnload: (key) =>
      stages.time("unload", () => {
        bumpGen(key);
        life.onUnload(key);
        traffic.onUnload(key);
        solids.deleteChunk(key);
        const bag = bags.get(key);
        if (!bag) return;
        blocks.drop(key);
        scene.remove(bag.group);
        releaseChunkResources(bag);
        bags.delete(key);
        deps.onChange(key, "out");
      }),
    onError: (key, err) => deps.onError(`${key}: ${err.message}`),
  });

  return {
    bags,
    scheduler,
    farRing,
    stages,
    /** Streams around the camera's chunk, prefetching around `lead` (where travel is heading). */
    update(here: ChunkCoord, lead: ChunkCoord | null) {
      scheduler.update(here.ix, here.iy, lead);
      farRing.update(here.ix, here.iy);
    },
    /** Spends this frame's integration budget; far-ring work only runs once the streamed ring is idle. */
    run() {
      integration.run(INTEGRATE_MS, (err) =>
        deps.onError(`integrate: ${err instanceof Error ? err.message : String(err)}`),
      );
      if (integration.size === 0)
        farQueue.run(FAR_MS, (err) =>
          deps.onError(`far ring: ${err instanceof Error ? err.message : String(err)}`),
        );
    },
    setQuality(q: RenderQuality) {
      farRing.setOuter(farOuter(q));
    },
    get queued() {
      return integration.size;
    },
    farStats() {
      return { ...farRing.stats(), queued: farQueue.size };
    },
    dispose() {
      dead = true;
      scheduler.dispose();
      integration.clear();
      farRing.dispose();
      farQueue.clear();
      for (const bag of bags.values()) releaseChunkResources(bag);
      bags.clear();
    },
  };
}

export type ChunkPipeline = ReturnType<typeof createChunkPipeline>;
