#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const out = process.argv[3] || "/tmp/perf-after.json";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function untilFrames(page, n, timeout) {
  await page.evaluate(() => window.__perf.reset());
  const t0 = Date.now();
  let summary = null;
  while (Date.now() - t0 < timeout) {
    summary = await page.evaluate(() => window.__perf.summary());
    if (summary.frames >= n) break;
    await sleep(400);
  }
  const extra = await page.evaluate(() => ({
    census: window.__perf.census(),
    hud: (document.body.innerText || "").split("\n").filter((line) => /fps |draws |traffic |people |chunk |move /.test(line)),
    pos: window.__controlsTest.getPosition(),
    shadows: null,
  }));
  return { waitedMs: Date.now() - t0, summary, ...extra };
}

const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-precise-memory-info"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForFunction(() => window.__perf && window.__teleport && window.__controlsTest && window.__setLook, null, { timeout: 45000 });
await page.evaluate(() => {
  window.__setLook("day");
  window.__teleport(2824, 12, -15370, 0.15, -0.18);
  window.__controlsTest.setMode("fly");
  window.__controlsTest.setKeys([]);
});
await page.waitForFunction(() => /loading 0/.test(document.body.innerText) && /people\s+[0-9]/.test(document.body.innerText), null, {
  timeout: 45000,
});
await sleep(500);
const renderer = await page.evaluate(() => window.__perf.renderer());
const memory = await page.evaluate(() => window.__perf.memory());
const still = await untilFrames(page, 4, 30000);
await page.evaluate(() => window.__perf.setContactShadows(true));
const shadows = await untilFrames(page, 3, 25000);
await page.evaluate(() => window.__perf.setContactShadows(false));

let capture = null;
try {
  capture = await Promise.race([
    page.evaluate(() => window.__perf.capture()),
    sleep(12000).then(() => ({ ms: null, bytes: null, note: "timed out after 12s" })),
  ]);
} catch (err) {
  capture = { error: String(err).split("\n")[0] };
}

const report = { renderer, memory, errors: errors.slice(0, 8), still, shadows, capture };
writeFileSync(out, JSON.stringify(report, null, 2));
const slim = (row) => ({
  waitedMs: row.waitedMs,
  frames: row.summary.frames,
  gap: row.summary.gap,
  loop: row.summary.loop,
  render: row.summary.render,
  calls: row.summary.calls,
  triangles: { median: Math.round(row.summary.triangles.median) },
  geometries: row.summary.geometries,
  textures: row.summary.textures,
  census: row.census,
  hud: row.hud,
});
console.log(JSON.stringify({ renderer, memory, errors: report.errors, still: slim(still), shadows: slim(shadows), capture }, null, 2));
await browser.close();
