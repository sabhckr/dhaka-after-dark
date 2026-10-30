/**
 * Load cost of two world folders, measured the way the game loads a chunk:
 * JSON.parse, validateChunk, normalizeChunk.
 *
 *   node --expose-gc --experimental-strip-types scripts/geo/bench-format.ts <world A> <world B> <out.json> [rounds]
 *
 * Files are read into memory first, so disk time is not counted. A and B
 * alternate every round. Memory is the retained heap of all chunks parsed at once.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeChunk } from "../../src/geo/compat.ts";
import type { ChunkFile } from "../../src/geo/types.ts";
import { validateChunk } from "../../src/geo/validate.ts";

const [A, B, OUT, ROUNDS = "5"] = process.argv.slice(2);
if (!A || !B || !OUT) {
  console.error("usage: bench-format.ts <world A> <world B> <out.json> [rounds]");
  process.exit(2);
}
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("run with --expose-gc");

function load(dir: string): string[] {
  const chunks = path.join(dir, "chunks");
  return fs
    .readdirSync(chunks)
    .sort()
    .map((f) => fs.readFileSync(path.join(chunks, f), "utf8"));
}

const quantile = (xs: number[], q: number) =>
  xs[Math.min(xs.length - 1, Math.floor(q * (xs.length - 1)))];

function timeAll(texts: string[]) {
  const parse: number[] = [];
  const validate: number[] = [];
  const total: number[] = [];
  for (const text of texts) {
    const t0 = performance.now();
    const data = JSON.parse(text) as ChunkFile;
    const t1 = performance.now();
    const problems = validateChunk(data);
    const t2 = performance.now();
    normalizeChunk(data);
    const t3 = performance.now();
    if (problems.length) throw new Error(problems[0]);
    parse.push(t1 - t0);
    validate.push(t2 - t1);
    total.push(t3 - t0);
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const stats = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return {
      sumMs: sum(s),
      medianMs: quantile(s, 0.5),
      p95Ms: quantile(s, 0.95),
      maxMs: s[s.length - 1],
    };
  };
  return { parse: stats(parse), validate: stats(validate), total: stats(total) };
}

function retainedMB(texts: string[]): number {
  gc!();
  const before = process.memoryUsage().heapUsed;
  const kept = texts.map((t) => normalizeChunk(JSON.parse(t) as ChunkFile));
  gc!();
  const after = process.memoryUsage().heapUsed;
  if (kept.length !== texts.length) throw new Error("unreachable");
  return (after - before) / 1e6;
}

const sides = { A: load(A), B: load(B) };
const rounds: {
  side: "A" | "B";
  round: number;
  result: ReturnType<typeof timeAll>;
  heapMB: number;
}[] = [];
// One warm-up pass each so the JIT has seen both shapes.
timeAll(sides.A);
timeAll(sides.B);
for (let r = 0; r < Number(ROUNDS); r++) {
  for (const side of r % 2 === 0 ? (["A", "B"] as const) : (["B", "A"] as const)) {
    gc();
    rounds.push({ side, round: r, result: timeAll(sides[side]), heapMB: retainedMB(sides[side]) });
  }
}
const median = (xs: number[]) =>
  quantile(
    [...xs].sort((a, b) => a - b),
    0.5,
  );
const summary = Object.fromEntries(
  (["A", "B"] as const).map((side) => {
    const mine = rounds.filter((r) => r.side === side);
    return [
      side,
      {
        dir: path.resolve(side === "A" ? A : B),
        chunks: sides[side].length,
        bytes: sides[side].reduce((n, t) => n + Buffer.byteLength(t), 0),
        allChunksMs: median(mine.map((r) => r.result.total.sumMs)),
        parseAllMs: median(mine.map((r) => r.result.parse.sumMs)),
        validateAllMs: median(mine.map((r) => r.result.validate.sumMs)),
        perChunkMedianMs: median(mine.map((r) => r.result.total.medianMs)),
        perChunkP95Ms: median(mine.map((r) => r.result.total.p95Ms)),
        perChunkMaxMs: median(mine.map((r) => r.result.total.maxMs)),
        retainedHeapMB: median(mine.map((r) => r.heapMB)),
      },
    ];
  }),
);
fs.writeFileSync(
  OUT,
  JSON.stringify({ node: process.version, rounds: Number(ROUNDS), summary, raw: rounds }, null, 2),
);
console.log(JSON.stringify(summary, null, 2));
