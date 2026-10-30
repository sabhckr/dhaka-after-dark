/**
 * Where the browser fetches generated world data (manifest, overview, chunks).
 * `signs/` and `assets/` are not generator output and always come from /world.
 *
 * In the dev server only, `?world=stage` reads a staged regeneration from
 * /world-stage instead, which the vite plugin in vite.config.ts serves from
 * WORLD_STAGE_DIR. That lets a staged dataset run in the game for A/B checks
 * without touching public/world. Production builds ignore the parameter.
 */
export function worldDataBase(search: string, dev: boolean): string {
  if (!dev) return "/world";
  return new URLSearchParams(search).get("world") === "stage" ? "/world-stage" : "/world";
}

let base: string | null = null;

export function worldDataUrl(file: string): string {
  if (base == null) {
    const dev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
    base = typeof window === "undefined" ? "/world" : worldDataBase(window.location.search, dev);
  }
  return `${base}/${file}`;
}
