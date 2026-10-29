/** Runtime chunk size in metres (world X/Z). Configurable, default 500. */
export const CHUNK_SIZE = 500;

export type ChunkCoord = { ix: number; iy: number };

export type Rect = {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
};

export function chunkKey(ix: number, iy: number): string {
  return `${ix}_${iy}`;
}

export function parseChunkKey(key: string): ChunkCoord {
  const [a, b] = key.split("_");
  return { ix: Number(a), iy: Number(b) };
}

/** Half-open assignment: a point on the max edge belongs to the next chunk. */
export function worldToChunk(x: number, z: number, size = CHUNK_SIZE): ChunkCoord {
  return { ix: Math.floor(x / size), iy: Math.floor(z / size) };
}

export function chunkRect(ix: number, iy: number, size = CHUNK_SIZE): Rect {
  return {
    minX: ix * size,
    minZ: iy * size,
    maxX: (ix + 1) * size,
    maxZ: (iy + 1) * size,
  };
}

export function chebyshev(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.ix - b.ix), Math.abs(a.iy - b.iy));
}

export function chunksOverlappingRect(rect: Rect, size = CHUNK_SIZE): ChunkCoord[] {
  const ix0 = Math.floor(rect.minX / size);
  const iy0 = Math.floor(rect.minZ / size);
  const ix1 = Math.floor(Math.max(rect.minX, rect.maxX - 1e-7) / size);
  const iy1 = Math.floor(Math.max(rect.minZ, rect.maxZ - 1e-7) / size);
  const out: ChunkCoord[] = [];
  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++) out.push({ ix, iy });
  }
  return out;
}
