#!/usr/bin/env node
/**
 * The exact file list a world data swap would apply, for approval.
 *
 *   node scripts/geo/swap-plan.mjs <shipped world> <staged world> <out.tsv>
 *
 * Covers only generator-owned files: chunks/c_*.json and the top-level
 * manifest, overview, coverage, landmarks and places JSON. signs/ and assets/
 * are never part of a swap. Each row: action, path, old bytes, new bytes,
 * old sha256, new sha256. Reads both folders and writes only out.tsv.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [SHIPPED, STAGED, OUT] = process.argv.slice(2);
if (!SHIPPED || !STAGED || !OUT) {
  console.error("usage: swap-plan.mjs <shipped world> <staged world> <out.tsv>");
  process.exit(2);
}

const TOP = ["manifest.json", "overview.json", "coverage.json", "landmarks.json", "places.json"];
const owned = (dir) => [
  ...TOP.filter((f) => fs.existsSync(path.join(dir, f))),
  ...fs
    .readdirSync(path.join(dir, "chunks"))
    .filter((f) => /^c_-?\d+_-?\d+\.json$/.test(f))
    .map((f) => `chunks/${f}`),
];
const info = (dir, rel) => {
  const file = path.join(dir, rel);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  return { bytes: buf.length, sha: crypto.createHash("sha256").update(buf).digest("hex") };
};

const all = [...new Set([...owned(SHIPPED), ...owned(STAGED)])].sort();
const rows = [];
const totals = {};
for (const rel of all) {
  const a = info(SHIPPED, rel);
  const b = info(STAGED, rel);
  const action = !a ? "add" : !b ? "delete" : a.sha === b.sha ? "unchanged" : "replace";
  rows.push([action, rel, a?.bytes ?? "", b?.bytes ?? "", a?.sha ?? "", b?.sha ?? ""].join("\t"));
  const t = (totals[action] ??= { files: 0, oldBytes: 0, newBytes: 0 });
  t.files++;
  t.oldBytes += a?.bytes ?? 0;
  t.newBytes += b?.bytes ?? 0;
}
fs.writeFileSync(
  OUT,
  ["action\tpath\told_bytes\tnew_bytes\told_sha256\tnew_sha256", ...rows].join("\n") + "\n",
);
console.log(JSON.stringify(totals, null, 2));
