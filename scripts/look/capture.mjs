#!/usr/bin/env node
/**
 * Golden-view capture.
 *
 *   node scripts/look/capture.mjs <url> <outdir> [filter]
 *
 * Shoots every view in views.mjs under every condition (day, night, rain) with
 * moving actors hidden and animated surfaces stopped (window.__golden.freeze),
 * reduced motion on (looks switch instantly, no rain streaks), the panel hidden.
 * Writes <view>--<condition>.png and capture.json (camera, draws, triangles,
 * chunks, GPU string, console errors). Pixels are compared with compare.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boot, launch, loaded, panel, place } from "./lib.mjs";
import { CONDITIONS, VIEWS } from "./views.mjs";

const url = process.argv[2] || "http://127.0.0.1:8097/";
const out = process.argv[3] || "out/look/capture";
const filter = process.argv[4] || "";
mkdirSync(out, { recursive: true });

const { browser, page, errors } = await launch({ reducedMotion: "reduce" });
const bootMs = await boot(page, url);
const hasHook = await page.evaluate(() => Boolean(window.__golden));
const freeze = () =>
  page.evaluate(() => {
    if (window.__golden) window.__golden.freeze(true);
    else for (const n of ["traffic", "npcs"]) window.__perf.setGroupVisible(n, false);
  });

const rows = [];
for (const view of VIEWS) {
  if (filter && !view.id.includes(filter)) continue;
  await panel(page, true);
  await place(page, view);
  await page.waitForTimeout(800);
  await loaded(page);
  // Building LOD retiles over a few frames after the ring settles.
  await page.waitForTimeout(4000);
  for (const c of CONDITIONS) {
    await page.evaluate((c) => {
      window.__setLook(c.look);
      window.__setWeather(c.weather);
    }, c);
    await freeze();
    await panel(page, false);
    await page.waitForTimeout(1500);
    const name = `${view.id}--${c.id}`;
    await page.screenshot({ path: join(out, `${name}.png`) });
    await panel(page, true);
    await page.waitForTimeout(700);
    // Scene triangles count every visible mesh, in frustum or not; draws are the HUD's last-frame figure.
    const stats = await page.evaluate(() => {
      const census = window.__perf.census();
      const text = document.body.innerText;
      const num = (re) => Number((text.match(re) || [])[1] || NaN);
      return {
        draws: num(/draws (\d+)/),
        sceneTriangles: census.triangles,
        meshes: census.meshes,
        chunks: num(/loaded (\d+)/),
      };
    });
    rows.push({ name, view: view.id, condition: c.id, camera: view, ...stats });
    console.log(
      name,
      `draws ${stats.draws} scene tris ${stats.sceneTriangles} chunks ${stats.chunks}`,
    );
  }
}
const gpu = await page.evaluate(() => window.__perf.renderer());
writeFileSync(
  join(out, "capture.json"),
  JSON.stringify(
    { url, when: new Date().toISOString(), gpu, bootMs, freezeHook: hasHook, errors, rows },
    null,
    1,
  ),
);
console.log(`${rows.length} captures, ${errors.length} console errors, freeze hook ${hasHook}`);
await browser.close();
