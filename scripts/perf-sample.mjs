#!/usr/bin/env node
/**
 * Repeatable gameplay frame sample. Screenshots are timed outside the sample
 * windows. Does not change quality, traffic, or the map.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const out = process.argv[3] || "/tmp/perf-baseline.json";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ready(page) {
  await page.waitForFunction(() => window.__perf && window.__teleport && window.__controlsTest && window.__setLook, null, {
    timeout: 45000,
  });
  await page.evaluate(() => {
    window.__setLook("day");
    window.__teleport(2824, 8, -15370, 0.4, -0.12);
    window.__controlsTest.setMode("drive");
  });
  await page.waitForFunction(
    () => {
      const hud = document.body.innerText || "";
      return /loading 0/.test(hud) && /loaded [1-9]/.test(hud) && /traffic\s+[0-9]/.test(hud);
    },
    null,
    { timeout: 45000 },
  );
  await sleep(800);
}

async function sample(page, ms, keys) {
  await page.evaluate(() => window.__perf.reset());
  if (keys) await page.evaluate((codes) => window.__controlsTest.setKeys(codes), keys);
  await sleep(ms);
  if (keys) await page.evaluate(() => window.__controlsTest.setKeys([]));
  return page.evaluate(() => ({
    summary: window.__perf.summary(),
    census: window.__perf.census(),
    pos: window.__controlsTest.getPosition(),
    mode: window.__controlsTest.getMode(),
    hud: (document.body.innerText || "").split("\n").filter((line) => /fps |draws |traffic |people |chunk /.test(line)),
  }));
}

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
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await ready(page);
const renderer = await page.evaluate(() => window.__perf.renderer());
const memory = await page.evaluate(() => window.__perf.memory());

const runs = [];
function brief(run) {
  const s = run.summary;
  return {
    name: run.name,
    frames: s.frames,
    gap: s.gap,
    loop: s.loop,
    render: s.render,
    calls: { median: s.calls.median, p95: s.calls.p95 },
    triangles: { median: Math.round(s.triangles.median) },
    geometries: s.geometries,
    textures: s.textures,
    stalls: s.stallsOver100,
    census: run.census,
    hud: run.hud,
    pos: run.pos,
  };
}

for (let i = 0; i < 3; i++) {
  const run = { name: `drive-${i + 1}`, ...(await sample(page, 6000, ["KeyW", "KeyD"])) };
  runs.push(run);
  console.log("RUN", JSON.stringify(brief(run)));
}
{
  const run = { name: "stationary", ...(await sample(page, 4000, null)) };
  runs.push(run);
  console.log("RUN", JSON.stringify(brief(run)));
}

await page.evaluate(() => {
  window.__setLook("day");
  window.__controlsTest.setMode("fly");
  window.__teleport(2400, 40, -15370, 1.57, -0.2);
});
await sleep(500);
runs.push({ name: "fly-across-chunks", ...(await sample(page, 5000, ["KeyW", "ShiftLeft"])) });
console.log("RUN", JSON.stringify(brief(runs[runs.length - 1])));
await page.evaluate(() => window.__controlsTest.setMode("drive"));
await sleep(1200);

async function ablation(name, hidden) {
  await page.evaluate((names) => {
    window.__perf.setGroupVisible("traffic", !names.includes("traffic"));
    window.__perf.setGroupVisible("npcs", !names.includes("npcs"));
  }, hidden);
  await sleep(300);
  const row = await sample(page, 3000, ["KeyW"]);
  await page.evaluate(() => {
    window.__perf.setGroupVisible("traffic", true);
    window.__perf.setGroupVisible("npcs", true);
  });
  return { name, ...row };
}
for (const hidden of [["traffic"], ["npcs"], ["traffic", "npcs"]]) {
  const run = await ablation(`hide-${hidden.join("-and-")}`, hidden);
  runs.push(run);
  console.log("RUN", JSON.stringify(brief(run)));
}

const partial = () => ({
  url,
  renderer,
  memory,
  viewport: { width: 1280, height: 720, dpr: 1 },
  consoleErrors: consoleErrors.slice(0, 12),
  runs,
});
writeFileSync(out, JSON.stringify(partial(), null, 2));

let shotWall = null;
let shotError = null;
try {
  await page.evaluate(() => window.__perf.beginCapture());
  const shotT0 = performance.now();
  await page.screenshot({ path: "/tmp/perf-capture.png", type: "png", timeout: 15000, animations: "disabled" });
  shotWall = performance.now() - shotT0;
  await page.evaluate(() => window.__perf.endCapture());
} catch (err) {
  shotError = String(err).split("\n")[0];
}
const report = { ...partial(), screenshot: { wallMs: shotWall == null ? null : Math.round(shotWall), error: shotError } };
writeFileSync(out, JSON.stringify(report, null, 2));
console.log("SHOT", JSON.stringify(report.screenshot));
await browser.close();
