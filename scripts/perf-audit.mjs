#!/usr/bin/env node
/**
 * Steady-state samples after streaming settles. Same camera for the quality compare.
 * Software GL frame times are not the target iGPU. Draws and triangles are.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/?quality=high";
const out = process.argv[3] || "/tmp/perf-audit.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-precise-memory-info"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__perf && window.__teleport && window.__setLook && window.__setQuality, null, { timeout: 60000 });

async function settle(chunk) {
  await page.waitForFunction(
    (label) => {
      const text = document.body.innerText || "";
      return text.includes(`chunk  ${label}`) && /loading 0/.test(text) && /loaded\s+[1-9]/.test(text);
    },
    chunk,
    { timeout: 90000 },
  );
  await sleep(1500);
}

async function sample(name, ms, shot) {
  await page.evaluate(() => window.__perf.reset());
  await sleep(ms);
  const row = await page.evaluate(() => ({
    summary: window.__perf.summary(),
    census: window.__perf.census(),
    batches: window.__perf.batches(),
    memory: window.__perf.memory(),
    hud: (document.body.innerText || "").split("\n").filter((line) => /draws |chunk |quality |traffic |people |fps |frame /.test(line)),
  }));
  let shotError = null;
  if (shot) {
    try {
      await page.screenshot({ path: shot, type: "png", timeout: 25000, animations: "disabled" });
    } catch (err) {
      shotError = String(err).split("\n")[0];
    }
  }
  const s = row.summary;
  const brief = {
    name,
    frames: s.frames,
    gap: { median: Math.round(s.gap.median), p95: Math.round(s.gap.p95) },
    render: { median: Math.round(s.render.median), p95: Math.round(s.render.p95) },
    calls: { median: Math.round(s.calls.median), p95: Math.round(s.calls.p95) },
    triangles: { median: Math.round(s.triangles.median), p95: Math.round(s.triangles.p95) },
    batches: row.batches,
    memory: row.memory,
    census: row.census.rows,
    hud: row.hud,
    shotError,
  };
  console.log("POSE", JSON.stringify({ name, frames: brief.frames, gap: brief.gap, render: brief.render, calls: brief.calls, triangles: brief.triangles, batches: brief.batches, hud: brief.hud, mem: brief.memory }));
  return brief;
}

const renderer = await page.evaluate(() => window.__perf.renderer());
await page.evaluate(() => {
  window.__setQuality("high");
  window.__setLook("day");
  window.__setWeather("clear");
  window.__controlsTest.setMode("fly");
  window.__teleport(2824, 40, -15370, 0.4, -0.35);
});
await settle("5_-31");
await page.evaluate(() => window.__teleport(2342, 80, -13588, 0.4, -0.55));
await settle("4_-28");

const poses = [];
poses.push(await sample("dhanmondi-32-high-elev", 10000, "/workspace/screenshots/perf-dhanmondi-elev-high.png"));
await page.evaluate(() => window.__setQuality("medium"));
await sleep(2500);
poses.push(await sample("dhanmondi-32-medium-elev", 8000, "/workspace/screenshots/perf-dhanmondi-elev-medium.png"));
await page.evaluate(() => window.__setQuality("low"));
await sleep(2500);
poses.push(await sample("dhanmondi-32-low-elev", 8000, "/workspace/screenshots/perf-dhanmondi-elev-low.png"));
await page.evaluate(() => {
  window.__setQuality("high");
  window.__controlsTest.setMode("walk");
  window.__teleport(2342, 2.2, -13588, 0.15, 0);
});
await settle("4_-28");
poses.push(await sample("dhanmondi-street-high", 8000, "/workspace/screenshots/perf-dhanmondi-street-high.png"));

await page.evaluate(() => {
  window.__setQuality("high");
  window.__controlsTest.setMode("walk");
  window.__teleport(6688, 2.4, -11384, 0.5, 0);
});
await settle("13_-23");
poses.push(await sample("motijheel-street-high", 8000, "/workspace/screenshots/perf-motijheel-street-high.png"));

const report = { url, renderer, viewport: { width: 1280, height: 720, dpr: 1 }, consoleErrors: consoleErrors.slice(0, 20), poses };
writeFileSync(out, JSON.stringify(report, null, 2));
console.log("WROTE", out, "errors", consoleErrors.length);
await browser.close();
