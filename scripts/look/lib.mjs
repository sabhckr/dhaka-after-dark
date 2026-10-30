/**
 * Shared Playwright helpers for the golden-view and A/B performance harness.
 *
 * Every run launches the installed Google Chrome, headless, on the platform GPU
 * (ANGLE Metal on macOS), not SwiftShader. Results describe the machine they ran
 * on; record the GPU string with every result.
 */
import { chromium } from "playwright";

export async function launch({ reducedMotion = "no-preference" } = {}) {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--enable-gpu", "--ignore-gpu-blocklist", "--enable-precise-memory-info"],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, reducedMotion });
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    // Failed loads are reported with their URL by the response listener below.
    if (msg.type() === "error" && !/^Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
  });
  return { browser, page, errors };
}

/** Opens the world at High quality and waits for the first ring to finish loading. */
export async function boot(page, url) {
  const t0 = Date.now();
  await page.goto(`${url.replace(/\/$/, "")}/?quality=high`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__perf && window.__teleport && window.__setLook && window.__controlsTest, null, { timeout: 120000 });
  await loaded(page, /loaded [1-9]/);
  return Date.now() - t0;
}

/** Waits until the HUD reports no chunk fetches in flight. */
export function loaded(page, also) {
  return page.waitForFunction(
    (src) => /loading 0/.test(document.body.innerText) && (!src || new RegExp(src).test(document.body.innerText)),
    also ? also.source : null,
    { timeout: 120000 },
  );
}

export function panel(page, show) {
  return page.evaluate((show) => {
    const btn = [...document.querySelectorAll("button")].find((b) => /^(Hide|Show) panel$/.test(b.textContent.trim()));
    if (btn && /Hide/.test(btn.textContent) !== show) btn.click();
  }, show);
}

export async function place(page, view) {
  await page.evaluate((v) => {
    window.__controlsTest.setKeys([]);
    window.__controlsTest.setMode("fly");
    window.__teleport(v.x, v.y, v.z, v.yaw, v.pitch);
  }, view);
}

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
