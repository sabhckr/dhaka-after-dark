#!/usr/bin/env node
/**
 * Alternated A/B performance run.
 *
 *   node scripts/look/perf-ab.mjs <urlA> <urlB> <out.json> [rounds=3]
 *
 * Each round starts a fresh browser per build and runs the builds in
 * alternating order (A,B then B,A) so swap, thermals and background load hit
 * both sides alike. Per build and round it records:
 *   steady    5 s of frame gaps at three fixed views, actors moving, Day look
 *   ringLoad  two long teleports (Gulshan -> Old Dhaka 8 km, -> Uttara 18 km):
 *             time until no fetch is in flight, then frame gaps from the jump
 *             until 2 s after the ring completed (median, p95, p99, worst)
 * The result lists every run and the median over rounds, and checks B against
 * docs/budgets.json. Only runs on the same machine in one session compare.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { boot, launch, loaded, median, place } from "./lib.mjs";
import { VIEWS } from "./views.mjs";

const [urlA, urlB, out = "out/look/perf-ab.json", roundsArg = "3"] = process.argv.slice(2);
if (!urlA || !urlB) {
  console.error("usage: perf-ab.mjs <urlA> <urlB> <out.json> [rounds]");
  process.exit(2);
}
const rounds = Number(roundsArg);
const STEADY = ["kawran-street", "oldDhaka-medium", "gulshan-aerial"].map((id) => VIEWS.find((v) => v.id === id));
const JUMPS = [
  { id: "to-oldDhaka", x: 6200, y: 40, z: -9200 },
  { id: "to-uttara", x: 4354.6, y: 40, z: -27060.4 },
];

async function runOnce(url) {
  const { browser, page, errors } = await launch();
  const bootMs = await boot(page, url);
  const result = { bootMs, steady: {}, ringLoad: {} };
  await page.evaluate(() => { window.__setLook("day"); window.__setWeather("clear"); });
  for (const view of STEADY) {
    await place(page, view);
    await page.waitForTimeout(800);
    await loaded(page);
    await page.waitForTimeout(4000);
    await page.evaluate(() => window.__perf.reset());
    await page.waitForTimeout(5000);
    result.steady[view.id] = await page.evaluate(() => {
      const s = window.__perf.summary();
      const mem = window.__perf.memory();
      const text = document.body.innerText;
      return {
        frames: s.frames,
        median: s.gap.median,
        p99: s.gap.p99,
        max: s.gap.max,
        draws: s.calls.median,
        triangles: s.triangles.median,
        chunks: Number((text.match(/loaded (\d+)/) || [])[1] || NaN),
        heapMB: mem?.jsHeapUsed ? mem.jsHeapUsed / 1048576 : null,
      };
    });
  }
  for (const jump of JUMPS) {
    await page.evaluate(() => window.__perf.reset());
    const t0 = Date.now();
    await place(page, { ...jump, yaw: 0, pitch: -0.2 });
    await page.waitForTimeout(800);
    await loaded(page);
    const ringMs = Date.now() - t0;
    await page.waitForTimeout(2000);
    result.ringLoad[jump.id] = await page.evaluate((ringMs) => {
      const s = window.__perf.summary();
      return { ringMs, frames: s.frames, median: s.gap.median, p95: s.gap.p95, p99: s.gap.p99, max: s.gap.max, over100: s.stallsOver100 };
    }, ringMs);
  }
  result.gpu = await page.evaluate(() => window.__perf.renderer());
  result.errors = errors;
  await browser.close();
  return result;
}

const runs = { A: [], B: [] };
for (let r = 0; r < rounds; r++) {
  const order = r % 2 === 0 ? ["A", "B"] : ["B", "A"];
  for (const side of order) {
    const res = await runOnce(side === "A" ? urlA : urlB);
    runs[side].push(res);
    const ring = Object.values(res.ringLoad);
    console.log(`round ${r + 1} ${side}: steady median ${Object.values(res.steady).map((s) => s.median.toFixed(1)).join("/")} ms, ring worst ${ring.map((j) => j.max.toFixed(0)).join("/")} ms, ring p99 ${ring.map((j) => j.p99.toFixed(0)).join("/")} ms`);
  }
}

const agg = (side) => {
  const rs = runs[side];
  const pick = (f) => +median(rs.map(f)).toFixed(1);
  const steady = Object.fromEntries(STEADY.map((v) => [v.id, Object.fromEntries(["median", "p99", "max", "draws", "triangles", "chunks", "heapMB"].map((k) => [k, pick((x) => x.steady[v.id][k])]))]));
  const ringLoad = Object.fromEntries(JUMPS.map((j) => [j.id, Object.fromEntries(["ringMs", "median", "p95", "p99", "max", "over100"].map((k) => [k, pick((x) => x.ringLoad[j.id][k])]))]));
  return { bootMs: pick((x) => x.bootMs), steady, ringLoad };
};
const summary = { A: agg("A"), B: agg("B") };

let budgets = null;
try {
  budgets = JSON.parse(readFileSync(new URL("../../docs/budgets.json", import.meta.url), "utf8"));
} catch {
  console.warn("docs/budgets.json not readable; no budget checks");
}
const checks = [];
if (budgets) {
  const b = summary.B, a = summary.A;
  for (const [id, j] of Object.entries(b.ringLoad)) {
    checks.push({ check: `${id} worst frame <= ${budgets.ringLoad.maxMs} ms`, value: j.max, pass: j.max <= budgets.ringLoad.maxMs });
    checks.push({ check: `${id} p99 <= ${budgets.ringLoad.p99Ms} ms`, value: j.p99, pass: j.p99 <= budgets.ringLoad.p99Ms });
  }
  for (const [id, s] of Object.entries(b.steady)) {
    const limit = +(a.steady[id].median * (1 + budgets.steady.medianRegressionMax)).toFixed(1);
    checks.push({ check: `${id} steady median <= A x ${1 + budgets.steady.medianRegressionMax} (${limit} ms)`, value: s.median, pass: s.median <= limit });
    checks.push({ check: `${id} draws <= ${budgets.steady.drawsMax}`, value: s.draws, pass: s.draws <= budgets.steady.drawsMax });
    checks.push({ check: `${id} heap <= ${budgets.steady.heapMBMax} MB`, value: s.heapMB, pass: s.heapMB <= budgets.steady.heapMBMax });
  }
}
writeFileSync(out, JSON.stringify({ when: new Date().toISOString(), urlA, urlB, rounds, gpu: runs.A[0]?.gpu, summary, checks, runs }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const c of checks) console.log(c.pass ? "PASS" : "FAIL", c.check, "->", c.value);
