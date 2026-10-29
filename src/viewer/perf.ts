import * as THREE from "three";

/** One completed animation-frame sample. Times are milliseconds. */
export type FrameSample = {
  /** Time since the previous loop start, including idle until the next frame. */
  gap: number;
  /** Work inside the loop callback, excluding idle. */
  loop: number;
  /** `renderer.render` only. */
  render: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** True while an external capture or a hidden tab is in progress. */
  excluded: boolean;
};

export type PerfStats = {
  n: number;
  median: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
};

const CAP = 720;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

export function summarize(values: number[]): PerfStats {
  if (!values.length) return { n: 0, median: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  let sum = 0;
  for (const v of sorted) sum += v;
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
  };
}

/**
 * Ring buffer of frame timings. Screenshot and hidden-tab samples are stored
 * but omitted from `summary()`, so one capture hitch is not the gameplay number.
 */
export function createFrameProbe() {
  const samples: FrameSample[] = [];
  let cursor = 0;
  let filled = 0;
  let lastStart = 0;
  let captureDepth = 0;
  let excludeNext = false;
  let loopStart = 0;
  let renderMs = 0;

  const push = (sample: FrameSample) => {
    if (filled < CAP) {
      samples.push(sample);
      filled++;
    } else {
      samples[cursor] = sample;
    }
    cursor = (cursor + 1) % CAP;
  };

  return {
    /** Call at the top of the animation callback. */
    begin(now: number) {
      loopStart = now;
      renderMs = 0;
      const gap = lastStart ? now - lastStart : 0;
      lastStart = now;
      return gap;
    },
    noteRender(ms: number) {
      renderMs = ms;
    },
    /** Call at the bottom of the animation callback. */
    end(now: number, info: { render: { calls: number; triangles: number }; memory: { geometries: number; textures: number } }, gap: number) {
      const hidden = typeof document !== "undefined" && document.hidden;
      const excluded = captureDepth > 0 || hidden || gap <= 0 || excludeNext;
      excludeNext = false;
      push({
        gap,
        loop: now - loopStart,
        render: renderMs,
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        excluded,
      });
    },
    beginCapture() {
      captureDepth++;
    },
    endCapture() {
      captureDepth = Math.max(0, captureDepth - 1);
      // The stall shows up on the next callback, after the capture promise resolves.
      excludeNext = true;
    },
    reset() {
      samples.length = 0;
      cursor = 0;
      filled = 0;
      lastStart = 0;
    },
    get capturing() {
      return captureDepth > 0;
    },
    summary() {
      const live = samples.filter((s) => !s.excluded && s.gap > 0);
      const stalls = samples.filter((s) => !s.excluded && s.gap >= 100);
      return {
        frames: live.length,
        stored: samples.length,
        excluded: samples.filter((s) => s.excluded).length,
        stallsOver100: stalls.length,
        gap: summarize(live.map((s) => s.gap)),
        loop: summarize(live.map((s) => s.loop)),
        render: summarize(live.map((s) => s.render)),
        calls: summarize(live.map((s) => s.calls)),
        triangles: summarize(live.map((s) => s.triangles)),
        geometries: live.length ? live[live.length - 1].geometries : 0,
        textures: live.length ? live[live.length - 1].textures : 0,
      };
    },
  };
}

export type FrameProbe = ReturnType<typeof createFrameProbe>;

export type CensusRow = {
  name: string;
  meshes: number;
  instanced: number;
  triangles: number;
  geometries: number;
  materials: number;
};

function triCount(mesh: THREE.Mesh): number {
  const geo = mesh.geometry;
  if (!geo) return 0;
  const index = geo.index;
  const tris = index ? index.count / 3 : (geo.getAttribute("position")?.count ?? 0) / 3;
  const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
  return tris * inst;
}

/** Scene-graph census. This is not the draw-call count; frustum culling still applies at render. */
export function censusScene(scene: THREE.Object3D): { rows: CensusRow[]; meshes: number; instanced: number; triangles: number } {
  const buckets = new Map<string, { meshes: number; instanced: number; triangles: number; geos: Set<string>; mats: Set<string> }>();
  const bucketOf = (name: string) => {
    let row = buckets.get(name);
    if (!row) {
      row = { meshes: 0, instanced: 0, triangles: 0, geos: new Set(), mats: new Set() };
      buckets.set(name, row);
    }
    return row;
  };
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    let cursor: THREE.Object3D | null = mesh;
    let name = "other";
    while (cursor) {
      if (cursor.name === "traffic" || cursor.name === "npcs" || cursor.name === "asset-yard" || cursor.name.startsWith("chunk-")) {
        name = cursor.name.startsWith("chunk-") ? "chunks" : cursor.name;
        break;
      }
      cursor = cursor.parent;
    }
    const row = bucketOf(name);
    row.meshes++;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) row.instanced++;
    row.triangles += triCount(mesh);
    if (mesh.geometry) row.geos.add(mesh.geometry.uuid);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) if (mat) row.mats.add(mat.uuid);
  });
  const rows: CensusRow[] = [...buckets.entries()]
    .map(([name, row]) => ({
      name,
      meshes: row.meshes,
      instanced: row.instanced,
      triangles: Math.round(row.triangles),
      geometries: row.geos.size,
      materials: row.mats.size,
    }))
    .sort((a, b) => b.meshes - a.meshes);
  return {
    rows,
    meshes: rows.reduce((s, r) => s + r.meshes, 0),
    instanced: rows.reduce((s, r) => s + r.instanced, 0),
    triangles: rows.reduce((s, r) => s + r.triangles, 0),
  };
}
