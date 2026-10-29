/**
 * Prop visibility by Chebyshev chunk distance.
 * Separate from fog density, camera.far, frustum culling, and ChunkScheduler radii.
 * Hiding a group does not unload the chunk and does not dispose geometry.
 */
export const FAR_PROP_CHUNK = 2;

export function farPropsHidden(chebyshevChunks: number, limit = FAR_PROP_CHUNK): boolean {
  return chebyshevChunks >= limit;
}
