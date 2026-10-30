#!/usr/bin/env node
/**
 * Streaming frame-time benchmark on a real GPU.
 *
 *   node scripts/bench-stream.mjs <url> <out.json> [seconds] [label]
 *
 * Launches the installed Google Chrome (Playwright channel "chrome"), headless,
 * with the platform GPU (ANGLE Metal on macOS, D3D11 on Windows), not SwiftShader.
 * The camera flies a fixed route from Motijheel north toward Gulshan at a fixed
 * ground speed, so chunks stream in and out the whole time. Frame gaps are
 * timed by an rAF probe in the page, independent of the HUD.
 *
 * This measures the machine it runs on. It is not the reference PC unless it
 * runs on the reference PC. Record the GPU string with every result.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8091/";
const out = process.argv[3] || "bench-stream.json";
const seconds = Number(process.argv[4] || 45);
const label = process.argv[5] || "";

const START = { x: 6688, z: -11384 };
const SPEED = 40; // m/s along -Z (north)
const ALT = 28;

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
await page.goto(`${url}?quality=high`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.__perf && window.__teleport && window.__setLook, null, { timeout: 90000 });
const gpu = await page.evaluate(() => window.__perf.renderer());
await page.evaluate(
  ({ s, a }) => {
    window.__setLook("day");
    window.__teleport(s.x, a, s.z, 0, -0.08);
  },
  { s: START, a: ALT },
);
// Let the first neighbourhood settle so the route measures streaming, not boot.
await page.waitForFunction(() => /loading 0/.test(document.body.innerText) && /loaded [1-9]/.test(document.body.innerText), null, {
  timeout: 120000,
});
await page.waitForTimeout(1500);

const result = await page.evaluate(
  ({ s, a, speed, secs }) =>
    new Promise((resolve) => {
      const gaps = [];
      let last = 0;
      let t0 = 0;
      const heap0 = performance.memory?.usedJSHeapSize ?? null;
      const step = (now) => {
        if (!t0) {
          t0 = now;
          last = now;
        } else {
          gaps.push(now - last);
          last = now;
        }
        const t = (now - t0) / 1000;
        window.__teleport(s.x, a, s.z - speed * t, 0, -0.08);
        if (t < secs) requestAnimationFrame(step);
        else {
          const hud = document.body.innerText.split("\n").filter((l) => /chunk |draws |fps /.test(l));
          resolve({ gaps, hud, heap0, heap1: performance.memory?.usedJSHeapSize ?? null, travelled: speed * t });
        }
      };
      requestAnimationFrame(step);
    }),
  { s: START, a: ALT, speed: SPEED, secs: seconds },
);

const sorted = [...result.gaps].sort((x, y) => x - y);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
const total = result.gaps.reduce((acc, g) => acc + g, 0);
const summary = {
  label,
  gpu,
  url,
  route: { start: START, speedMps: SPEED, altitude: ALT, seconds, metres: Math.round(result.travelled) },
  frames: sorted.length,
  avgFps: +(sorted.length / (total / 1000)).toFixed(1),
  medianMs: +q(0.5).toFixed(1),
  p95Ms: +q(0.95).toFixed(1),
  p99Ms: +q(0.99).toFixed(1),
  maxMs: +sorted[sorted.length - 1].toFixed(1),
  over50ms: sorted.filter((g) => g > 50).length,
  over100ms: sorted.filter((g) => g > 100).length,
  over250ms: sorted.filter((g) => g > 250).length,
  timeInStallsOver50msMs: Math.round(sorted.filter((g) => g > 50).reduce((acc, g) => acc + g, 0)),
  heapMB: result.heap0 ? [+(result.heap0 / 1e6).toFixed(0), +(result.heap1 / 1e6).toFixed(0)] : null,
  hud: result.hud,
  errors,
};
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
