#!/usr/bin/env node
/**
 * Pixel comparison of two golden-view captures.
 *
 *   node scripts/look/compare.mjs <dirA> <dirB> <outdir>
 *
 * For every PNG present in both folders it reports:
 *   changed  share of pixels whose largest channel difference exceeds 24/255
 *   mad      mean absolute RGB difference, 0-255
 *   ssim     mean SSIM of 8x8 luma blocks (1 = identical)
 *   bands    changed share in five horizontal bands, top (sky/horizon) to bottom
 * and writes <name>.png triptychs (A | B | difference heat) at half size,
 * compare.json and compare.md. Decoding runs in headless Chrome canvas, so the
 * harness needs no image libraries.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "./lib.mjs";

const [dirA, dirB, out] = process.argv.slice(2);
if (!dirA || !dirB || !out) {
  console.error("usage: compare.mjs <dirA> <dirB> <outdir>");
  process.exit(2);
}
mkdirSync(out, { recursive: true });
const names = readdirSync(dirA)
  .filter((f) => f.endsWith(".png") && readdirSync(dirB).includes(f))
  .sort();
const { browser, page } = await launch();
await page.setContent("<canvas></canvas>");

const rows = [];
for (const name of names) {
  const a = readFileSync(join(dirA, name)).toString("base64");
  const b = readFileSync(join(dirB, name)).toString("base64");
  const res = await page.evaluate(
    async ({ a, b }) => {
      const load = (src) =>
        new Promise((ok, bad) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = bad;
          i.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.width,
        h = ia.height;
      const pixels = (img) => {
        const c = new OffscreenCanvas(w, h);
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia),
        pb = pixels(ib);
      const heat = new ImageData(w, h);
      const bandN = 5,
        bandChanged = new Array(bandN).fill(0),
        bandTotal = new Array(bandN).fill(0);
      let changed = 0,
        abs = 0;
      const la = new Float32Array(w * h),
        lb = new Float32Array(w * h);
      for (let i = 0, p = 0; p < w * h; p++, i += 4) {
        const dr = Math.abs(pa[i] - pb[i]),
          dg = Math.abs(pa[i + 1] - pb[i + 1]),
          db = Math.abs(pa[i + 2] - pb[i + 2]);
        const d = Math.max(dr, dg, db);
        abs += (dr + dg + db) / 3;
        const band = Math.min(bandN - 1, Math.floor(((p / w) | 0) / (h / bandN)));
        bandTotal[band]++;
        if (d > 24) {
          changed++;
          bandChanged[band]++;
        }
        const v = Math.min(255, d * 3);
        heat.data[i] = v;
        heat.data[i + 1] = v > 72 ? v * 0.35 : 0;
        heat.data[i + 2] = 0;
        heat.data[i + 3] = 255;
        la[p] = 0.299 * pa[i] + 0.587 * pa[i + 1] + 0.114 * pa[i + 2];
        lb[p] = 0.299 * pb[i] + 0.587 * pb[i + 1] + 0.114 * pb[i + 2];
      }
      const C1 = (0.01 * 255) ** 2,
        C2 = (0.03 * 255) ** 2;
      let ssim = 0,
        blocks = 0;
      for (let by = 0; by + 8 <= h; by += 8)
        for (let bx = 0; bx + 8 <= w; bx += 8) {
          let ma = 0,
            mb = 0;
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
              const q = (by + y) * w + bx + x;
              ma += la[q];
              mb += lb[q];
            }
          ma /= 64;
          mb /= 64;
          let va = 0,
            vb = 0,
            cov = 0;
          for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
              const q = (by + y) * w + bx + x;
              const da = la[q] - ma,
                db = lb[q] - mb;
              va += da * da;
              vb += db * db;
              cov += da * db;
            }
          va /= 63;
          vb /= 63;
          cov /= 63;
          ssim +=
            ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
          blocks++;
        }
      const sw = w / 2,
        sh = h / 2;
      const trip = new OffscreenCanvas(sw * 3, sh);
      const g = trip.getContext("2d");
      g.drawImage(ia, 0, 0, sw, sh);
      g.drawImage(ib, sw, 0, sw, sh);
      g.drawImage(await createImageBitmap(heat), sw * 2, 0, sw, sh);
      const blob = await trip.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return {
        changed: changed / (w * h),
        mad: abs / (w * h),
        ssim: ssim / blocks,
        bands: bandChanged.map((c, i) => c / bandTotal[i]),
        trip: btoa(bin),
      };
    },
    { a, b },
  );
  writeFileSync(join(out, name), Buffer.from(res.trip, "base64"));
  const row = {
    name: name.replace(/\.png$/, ""),
    changed: +res.changed.toFixed(4),
    mad: +res.mad.toFixed(2),
    ssim: +res.ssim.toFixed(4),
    bands: res.bands.map((v) => +v.toFixed(4)),
    same: res.changed <= 0.01 && res.ssim >= 0.99,
  };
  rows.push(row);
  console.log(
    row.name,
    `changed ${(row.changed * 100).toFixed(2)}%`,
    `ssim ${row.ssim}`,
    row.same ? "same" : "DIFFERENT",
  );
}
await browser.close();
writeFileSync(join(out, "compare.json"), JSON.stringify({ a: dirA, b: dirB, rows }, null, 1));
const pct = (v) => `${(v * 100).toFixed(2)}%`;
const md = [
  `# Golden-view comparison`,
  ``,
  `A: \`${dirA}\`  B: \`${dirB}\``,
  ``,
  `"same" means at most 1% of pixels changed by more than 24/255 and SSIM at least 0.99. Bands run top (sky, horizon) to bottom (foreground).`,
  ``,
  `| View | Changed | MAD | SSIM | Bands top→bottom | Verdict |`,
  `|---|---|---|---|---|---|`,
  ...rows.map(
    (r) =>
      `| ${r.name} | ${pct(r.changed)} | ${r.mad} | ${r.ssim} | ${r.bands.map(pct).join(" · ")} | ${r.same ? "same" : "**different**"} |`,
  ),
  ``,
  `${rows.filter((r) => r.same).length} of ${rows.length} the same.`,
].join("\n");
writeFileSync(join(out, "compare.md"), md + "\n");
