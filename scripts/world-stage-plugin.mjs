import fs from "node:fs";
import path from "node:path";

/**
 * Dev server only: serves a staged world regeneration at /world-stage/ from
 * WORLD_STAGE_DIR, for `?world=stage` (src/geo/world-url.ts). Nothing is copied
 * into public/, and production builds never include it.
 */
export function worldStagePlugin() {
  return {
    name: "dhaka:world-stage",
    apply: "serve",
    configureServer(server) {
      const dir = process.env.WORLD_STAGE_DIR;
      if (!dir) return;
      const root = path.resolve(dir);
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?", 1)[0];
        if (!url.startsWith("/world-stage/")) return next();
        const file = path.resolve(root, decodeURIComponent(url.slice("/world-stage/".length)));
        if (!file.startsWith(root + path.sep) || !file.endsWith(".json") || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("content-type", "application/json");
        res.setHeader("cache-control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
      server.config.logger.info(`[world-stage] /world-stage/ → ${root}`);
    },
  };
}
