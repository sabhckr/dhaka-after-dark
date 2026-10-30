/**
 * Schema migration check: old (v1) world folder against a new (v2) one.
 *
 *   node --experimental-strip-types scripts/geo/diff-schema.ts <old world> <new world> <report.json>
 *
 * Passes only when every old chunk is still there and `toV1(new)` is byte-equal
 * to the old file, so geometry, ids, order and the road graph are untouched.
 * Reads both folders, writes only the report. Exit 1 on any failure.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { toV1 } from "../../src/geo/compat.ts";
import type { ChunkFile, Manifest } from "../../src/geo/types.ts";
import { validateChunk, validateManifest } from "../../src/geo/validate.ts";

const [OLD, NEW, OUT] = process.argv.slice(2);
if (!OLD || !NEW || !OUT) {
  console.error("usage: diff-schema.ts <old world> <new world> <report.json>");
  process.exit(2);
}

const V1_LAYERS = [
  "roads",
  "buildings",
  "water",
  "canals",
  "parks",
  "rails",
  "plazas",
  "bridges",
  "trees",
  "landmarks",
] as const;
const V2_LAYERS = ["points", "landuse", "barriers", "power"] as const;

function sizes(dir: string) {
  let raw = 0;
  let gzip = 0;
  let brotli = 0;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    raw += buf.length;
    gzip += zlib.gzipSync(buf, { level: 9 }).length;
    brotli += zlib.brotliCompressSync(buf, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
  }
  return { files: files.length, raw, gzip, brotli };
}

const failures: string[] = [];
const fail = (m: string) => {
  if (failures.length < 50) failures.push(m);
};

const oldChunks = new Set(fs.readdirSync(path.join(OLD, "chunks")));
const newChunks = new Set(fs.readdirSync(path.join(NEW, "chunks")));
const removed = [...oldChunks].filter((f) => !newChunks.has(f));
const added = [...newChunks].filter((f) => !oldChunks.has(f)).sort();
for (const f of removed) fail(`chunk removed: ${f}`);

let identical = 0;
let invalid = 0;
const v2Totals: Record<string, number> = {};
const addedContents: Record<string, Record<string, number>> = {};
for (const f of [...newChunks].sort()) {
  const text = fs.readFileSync(path.join(NEW, "chunks", f), "utf8");
  const chunk = JSON.parse(text) as ChunkFile;
  const problems = validateChunk(chunk);
  if (chunk.v !== 2) fail(`${f}: version ${chunk.v}`);
  if (problems.length) {
    invalid++;
    fail(`${f}: ${problems[0]}`);
  }
  for (const k of V2_LAYERS) v2Totals[k] = (v2Totals[k] ?? 0) + (chunk[k]?.length ?? 0);
  if (!oldChunks.has(f)) {
    const v1Records = V1_LAYERS.reduce((n, k) => n + chunk[k].length, 0) + chunk.graph.edges.length;
    if (v1Records) fail(`${f}: new chunk holds ${v1Records} v1 records`);
    addedContents[f] = Object.fromEntries(V2_LAYERS.map((k) => [k, chunk[k]?.length ?? 0]));
    continue;
  }
  const oldText = fs.readFileSync(path.join(OLD, "chunks", f), "utf8");
  if (JSON.stringify(toV1(chunk)) === oldText) identical++;
  else fail(`${f}: v1 view differs from the old file`);
}

const oldManifest = JSON.parse(
  fs.readFileSync(path.join(OLD, "manifest.json"), "utf8"),
) as Manifest;
const newManifest = JSON.parse(
  fs.readFileSync(path.join(NEW, "manifest.json"), "utf8"),
) as Manifest;
for (const p of validateManifest(newManifest)) fail(`manifest: ${p}`);
for (const key of [
  "name",
  "crs",
  "origin",
  "axis",
  "chunkSize",
  "boundary",
  "spawns",
  "sources",
] as const) {
  if (JSON.stringify(oldManifest[key]) !== JSON.stringify(newManifest[key]))
    fail(`manifest.${key} changed`);
}
const countChanges: Record<string, [number | undefined, number]> = {};
for (const [k, v] of Object.entries(newManifest.counts)) {
  if (oldManifest.counts[k] !== v) countChanges[k] = [oldManifest.counts[k], v];
}
for (const [k, v] of Object.entries(oldManifest.counts)) {
  if (!(k in newManifest.counts)) fail(`manifest.counts.${k} dropped (was ${v})`);
}
const sameFile = (name: string) => {
  const a = path.join(OLD, name);
  const b = path.join(NEW, name);
  return fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b));
};
const files = {
  "overview.json": sameFile("overview.json"),
  "landmarks.json": sameFile("landmarks.json"),
  "coverage.json": sameFile("coverage.json"),
  "places.json": fs.existsSync(path.join(NEW, "places.json")),
};
if (!files["overview.json"]) fail("overview.json changed (signs/ depends on its boundary)");
if (!files["landmarks.json"]) fail("landmarks.json changed");

const report = {
  old: path.resolve(OLD),
  new: path.resolve(NEW),
  pass: failures.length === 0,
  chunks: {
    old: oldChunks.size,
    new: newChunks.size,
    identicalV1View: identical,
    invalid,
    removed,
    added,
    addedContents,
  },
  v2Layers: v2Totals,
  fields: newManifest.fields ?? [],
  manifestCountChanges: countChanges,
  files,
  size: { oldChunks: sizes(path.join(OLD, "chunks")), newChunks: sizes(path.join(NEW, "chunks")) },
  failures,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
const pct = (a: number, b: number) => `${(((b - a) / a) * 100).toFixed(1)} %`;
console.log(
  `v1 view identical: ${identical} of ${oldChunks.size} old chunks; ${added.length} added, ${removed.length} removed`,
);
console.log(
  `raw ${pct(report.size.oldChunks.raw, report.size.newChunks.raw)}, gzip ${pct(report.size.oldChunks.gzip, report.size.newChunks.gzip)}, brotli ${pct(report.size.oldChunks.brotli, report.size.newChunks.brotli)}`,
);
console.log(report.pass ? "PASS" : `FAIL\n${failures.join("\n")}`);
process.exit(report.pass ? 0 : 1);
