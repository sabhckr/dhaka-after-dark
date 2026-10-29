import assert from "node:assert/strict";
import test from "node:test";
import { GRADE, PALETTE } from "./grade.ts";
import { LOOKS, LOOK_ORDER, fogExp2Amount, lerpLook } from "./looks.ts";
import { composeWeather } from "./weather.ts";
import { plasterTint } from "./place.ts";

const paletteHex = new Set<number>();
for (const value of Object.values(PALETTE)) {
  if (typeof value === "number") paletteHex.add(value);
}

test("one master grade: exposure, saturation, contrast, bloom are not per look", () => {
  assert.equal(GRADE.outputColorSpace, "srgb");
  assert.equal(GRADE.toneMapping, "aces");
  assert.ok(GRADE.exposure > 0.95 && GRADE.exposure < 1.35);
  assert.ok(GRADE.saturation >= 0.9 && GRADE.saturation <= 1.05, "grade saturation left the grounded range");
  assert.ok(GRADE.contrast >= 1 && GRADE.contrast < 1.25);
  assert.ok(GRADE.bloom.threshold > 1);
  assert.equal(new Set(LOOK_ORDER).size, LOOK_ORDER.length);
  for (const id of LOOK_ORDER) {
    const look = LOOKS[id] as unknown as Record<string, unknown>;
    assert.equal("exposure" in look, false);
    assert.equal("roadRough" in look, false);
    assert.equal("ground" in look, false);
    assert.ok((look.facadeEmit as number) <= GRADE.emitCap);
    assert.ok((look.shopEmit as number) <= GRADE.emitCap);
    assert.ok((look.bannerEmit as number) <= GRADE.emitCap);
    assert.ok((look.lamp as number) <= GRADE.lampCap);
    for (const key of ["sun", "hemiSky", "hemiGround", "skyTop", "skyMid", "skyBot", "fog"] as const) {
      assert.equal(paletteHex.has(LOOKS[id][key]), true, `${id}.${key} left the master palette`);
    }
  }
});

test("wet night reuses night light and only adds weather", () => {
  assert.equal(LOOKS.wet.sun, LOOKS.neon.sun);
  assert.equal(LOOKS.wet.hemiSky, LOOKS.neon.hemiSky);
  assert.equal(LOOKS.wet.hemiGround, LOOKS.neon.hemiGround);
  assert.equal(LOOKS.wet.skyTop, LOOKS.neon.skyTop);
  assert.equal(LOOKS.wet.skyMid, LOOKS.neon.skyMid);
  assert.equal(LOOKS.wet.skyBot, LOOKS.neon.skyBot);
  assert.equal(LOOKS.wet.facadeEmit, LOOKS.neon.facadeEmit);
  assert.equal(LOOKS.wet.lamp, LOOKS.neon.lamp);
  assert.equal(LOOKS.neon.rain, 0);
  assert.equal(LOOKS.neon.wet, 0);
  assert.equal(LOOKS.wet.rain, 1);
  assert.equal(LOOKS.wet.wet, 1);
  assert.ok(LOOKS.wet.cloud > LOOKS.neon.cloud);
});

test("day is bright, overcast stays blue-grey, lamps rise after sunset", () => {
  assert.ok(LOOKS.day.sunI > LOOKS.overcast.sunI + 0.4);
  assert.ok(LOOKS.overcast.sunI > LOOKS.neon.sunI);
  assert.ok(LOOKS.overcast.hemi > LOOKS.day.hemi);
  assert.equal(LOOKS.day.lamp, 0);
  assert.ok(LOOKS.sunset.lamp > LOOKS.day.lamp);
  assert.ok(LOOKS.dusk.lamp > LOOKS.sunset.lamp);
  assert.ok(LOOKS.neon.lamp > LOOKS.dusk.lamp);
  const over = LOOKS.overcast.skyTop;
  const r = (over >> 16) & 255;
  const g = (over >> 8) & 255;
  const b = over & 255;
  assert.ok(b > r + 20 && g > r + 10, "overcast sky went flat grey");
  const day = LOOKS.day.skyTop;
  const dr = (day >> 16) & 255;
  const db = day & 255;
  assert.ok(db > dr + 40, "day sky is not a natural blue");
  assert.ok(dr < 120, "day sky is still neon cyan");
});

test("lighting lerp stays on the segment", () => {
  assert.equal(lerpLook(LOOKS.day, LOOKS.neon, 0).sunI, LOOKS.day.sunI);
  assert.equal(lerpLook(LOOKS.day, LOOKS.neon, 0).sun, LOOKS.day.sun);
  assert.equal(lerpLook(LOOKS.day, LOOKS.neon, 1).sun, LOOKS.neon.sun);
  assert.equal(lerpLook(LOOKS.day, LOOKS.neon, 1).lamp, LOOKS.neon.lamp);
  const mid = lerpLook(LOOKS.day, LOOKS.neon, 0.5);
  assert.ok(mid.sunI > LOOKS.neon.sunI && mid.sunI < LOOKS.day.sunI);
  assert.ok(mid.lamp > LOOKS.day.lamp && mid.lamp < LOOKS.neon.lamp);
  assert.equal(mid.wet, 0);
});

test("exponential fog stays a colour mix, not a clip plane", () => {
  for (const id of LOOK_ORDER) {
    const look = LOOKS[id];
    assert.ok(look.fogDensity > 0.0004 && look.fogDensity < 0.002, `${id} density`);
    assert.ok(fogExp2Amount(look.fogDensity, 30) < 0.02, `${id} near street`);
    const horizon = 2 / look.fogDensity;
    const cover = fogExp2Amount(look.fogDensity, horizon);
    assert.ok(cover > 0.98 && cover < 0.99, `${id} characteristic cover ${cover}`);
  }
  assert.ok(LOOKS.day.fogDensity < LOOKS.neon.fogDensity);
  assert.ok(LOOKS.neon.fogDensity < LOOKS.wet.fogDensity);
  assert.ok(fogExp2Amount(LOOKS.neon.fogDensity, 80) < 0.08);
  assert.ok(fogExp2Amount(LOOKS.day.fogDensity, 400) < fogExp2Amount(LOOKS.wet.fogDensity, 400));
  const storm = composeWeather(LOOKS.day, "storm", 0);
  assert.ok(storm.fogDensity > LOOKS.day.fogDensity);
  assert.equal(lerpLook(LOOKS.day, LOOKS.neon, 0).fogDensity, LOOKS.day.fogDensity);
  const midFog = lerpLook(LOOKS.day, LOOKS.wet, 0.5).fogDensity;
  assert.ok(midFog > LOOKS.day.fogDensity && midFog < LOOKS.wet.fogDensity);
});

test("facade tints stay architectural, not candy and not one grey", () => {
  let lo = 1;
  let hi = 0;
  for (let id = 0; id < 64; id++) {
    for (const hs of ["measured", "estimated"] as const) {
      const tint = plasterTint(id, hs);
      for (const channel of tint) {
        assert.ok(channel >= 0.42 && channel <= 0.96, `${id} ${hs} ${tint.join(",")}`);
        lo = Math.min(lo, channel);
        hi = Math.max(hi, channel);
      }
    }
  }
  assert.ok(hi - lo > 0.25, "plaster lost its colour spread");
});
