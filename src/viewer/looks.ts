import { GRADE, PALETTE } from "./grade.ts";

export type LookId = "day" | "sunset" | "dusk" | "neon" | "wet" | "overcast";

/**
 * Lighting and weather only. Global tone lives in GRADE.
 * Rim and fill colors are not stored here — they are always PALETTE.rim and PALETTE.fill.
 */
export type CityLook = {
  id: LookId;
  label: string;
  clear: number;
  fog: number;
  /**
   * THREE.FogExp2 density in 1/metre. Three.js mixes with
   * `1 - exp(-(density * depth)^2)`, which never hits full opacity.
   * Not camera.far, not a chunk load radius, and not an unload distance.
   */
  fogDensity: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunI: number;
  sunPos: [number, number, number];
  rimI: number;
  rimPos: [number, number, number];
  fillI: number;
  fillPos: [number, number, number];
  skyTop: number;
  skyMid: number;
  skyBot: number;
  facadeEmit: number;
  shopEmit: number;
  bannerEmit: number;
  lamp: number;
  cloud: number;
  /** 0 dry roads, 1 wet reflections. Not a palette. */
  wet: number;
  /** 0–1 rain amount. */
  rain: number;
};

export const LOOK_ORDER: LookId[] = ["day", "sunset", "dusk", "neon", "wet", "overcast"];

const night: CityLook = {
  id: "neon",
  label: "Night",
  clear: PALETTE.fogNight,
  fog: PALETTE.fogNight,
  fogDensity: 0.00078,
  fogNear: 150,
  fogFar: 1750,
  hemiSky: PALETTE.hemiNight,
  hemiGround: PALETTE.shadow,
  hemi: 0.6,
  sun: PALETTE.moon,
  sunI: 0.34,
  sunPos: [520, 1320, -280],
  rimI: 0.18,
  rimPos: [880, 200, -560],
  fillI: 0.22,
  fillPos: [-680, 280, 520],
  skyTop: PALETTE.skyNightTop,
  skyMid: PALETTE.skyNightMid,
  skyBot: PALETTE.skyNightBot,
  facadeEmit: 0.38,
  shopEmit: 0.36,
  bannerEmit: 0.3,
  lamp: 1.55,
  cloud: 0.18,
  wet: 0,
  rain: 0,
};

export const LOOKS: Record<LookId, CityLook> = {
  day: {
    id: "day",
    label: "Day",
    clear: PALETTE.fogDay,
    fog: PALETTE.fogDay,
    fogDensity: 0.00062,
    fogNear: 420,
    fogFar: 3200,
    hemiSky: PALETTE.hemiDay,
    hemiGround: PALETTE.groundDay,
    hemi: 0.55,
    sun: PALETTE.sunDay,
    sunI: 1.22,
    sunPos: [720, 1680, 260],
    rimI: 0.14,
    rimPos: [-520, 640, -280],
    fillI: 0.16,
    fillPos: [-400, 520, 700],
    skyTop: PALETTE.skyDayTop,
    skyMid: PALETTE.skyDayMid,
    skyBot: PALETTE.skyDayBot,
    facadeEmit: 0.05,
    shopEmit: 0.1,
    bannerEmit: 0.05,
    lamp: 0,
    cloud: 0.12,
    wet: 0,
    rain: 0,
  },
  sunset: {
    id: "sunset",
    label: "Sunset",
    clear: PALETTE.fogSunset,
    fog: PALETTE.fogSunset,
    fogDensity: 0.00092,
    fogNear: 220,
    fogFar: 2100,
    hemiSky: PALETTE.hemiSunset,
    hemiGround: PALETTE.groundSunset,
    hemi: 0.58,
    sun: PALETTE.sunSunset,
    sunI: 1.22,
    sunPos: [-1500, 320, 780],
    rimI: 0.42,
    rimPos: [760, 180, -820],
    fillI: 0.14,
    fillPos: [-240, 480, -360],
    skyTop: PALETTE.skySunsetTop,
    skyMid: PALETTE.skySunsetMid,
    skyBot: PALETTE.skySunsetBot,
    facadeEmit: 0.22,
    shopEmit: 0.22,
    bannerEmit: 0.18,
    lamp: 0.45,
    cloud: 0.2,
    wet: 0,
    rain: 0,
  },
  dusk: {
    id: "dusk",
    label: "Dusk",
    clear: PALETTE.fogDusk,
    fog: PALETTE.fogDusk,
    fogDensity: 0.00105,
    fogNear: 180,
    fogFar: 1900,
    hemiSky: PALETTE.hemiDusk,
    hemiGround: PALETTE.shadow,
    hemi: 0.5,
    sun: PALETTE.sunDusk,
    sunI: 0.48,
    sunPos: [-980, 160, 420],
    rimI: 0.4,
    rimPos: [640, 140, -700],
    fillI: 0.28,
    fillPos: [-560, 360, 480],
    skyTop: PALETTE.skyDuskTop,
    skyMid: PALETTE.skyDuskMid,
    skyBot: PALETTE.skyDuskBot,
    facadeEmit: 0.36,
    shopEmit: 0.34,
    bannerEmit: 0.3,
    lamp: 1.1,
    cloud: 0.34,
    wet: 0,
    rain: 0,
  },
  neon: night,
  wet: {
    ...night,
    id: "wet",
    label: "Wet night",
    fogDensity: 0.00128,
    fogNear: 80,
    fogFar: 1280,
    cloud: 0.62,
    wet: 1,
    rain: 1,
  },
  overcast: {
    id: "overcast",
    label: "Overcast day",
    clear: PALETTE.fogOvercast,
    fog: PALETTE.fogOvercast,
    fogDensity: 0.00074,
    fogNear: 260,
    fogFar: 2400,
    hemiSky: PALETTE.hemiOvercast,
    hemiGround: PALETTE.groundOvercast,
    hemi: 0.82,
    sun: PALETTE.sunDay,
    sunI: 0.72,
    sunPos: [380, 1500, 180],
    rimI: 0.1,
    rimPos: [-360, 700, -200],
    fillI: 0.2,
    fillPos: [180, 480, 640],
    skyTop: PALETTE.skyOvercastTop,
    skyMid: PALETTE.skyOvercastMid,
    skyBot: PALETTE.skyOvercastBot,
    facadeEmit: 0.1,
    shopEmit: 0.14,
    bannerEmit: 0.1,
    lamp: 0.06,
    cloud: 0.78,
    wet: 0,
    rain: 0,
  },
};

const HEX_KEYS = [
  "clear",
  "fog",
  "hemiSky",
  "hemiGround",
  "sun",
  "skyTop",
  "skyMid",
  "skyBot",
] as const;

const NUM_KEYS = [
  "fogDensity",
  "fogNear",
  "fogFar",
  "hemi",
  "sunI",
  "rimI",
  "fillI",
  "facadeEmit",
  "shopEmit",
  "bannerEmit",
  "lamp",
  "cloud",
  "wet",
  "rain",
] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpHex(a: number, b: number, t: number): number {
  const ch = (n: number, s: number) => (n >> s) & 255;
  const mix = (x: number, y: number) => Math.round(lerp(x, y, t));
  const r = mix(ch(a, 16), ch(b, 16));
  const g = mix(ch(a, 8), ch(b, 8));
  const bl = mix(ch(a, 0), ch(b, 0));
  return (r << 16) | (g << 8) | bl;
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Smoothstep. Lighting eases; the grade does not. */
export function easeLook(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export function lerpLook(a: CityLook, b: CityLook, t: number): CityLook {
  const u = Math.min(1, Math.max(0, t));
  const out: CityLook = { ...a, id: u < 0.5 ? a.id : b.id, label: u < 0.5 ? a.label : b.label };
  for (const key of HEX_KEYS) out[key] = lerpHex(a[key], b[key], u);
  for (const key of NUM_KEYS) out[key] = lerp(a[key], b[key], u);
  out.sunPos = lerp3(a.sunPos, b.sunPos, u);
  out.rimPos = lerp3(a.rimPos, b.rimPos, u);
  out.fillPos = lerp3(a.fillPos, b.fillPos, u);
  out.facadeEmit = Math.min(GRADE.emitCap, out.facadeEmit);
  out.shopEmit = Math.min(GRADE.emitCap, out.shopEmit);
  out.bannerEmit = Math.min(GRADE.emitCap, out.bannerEmit);
  out.lamp = Math.min(GRADE.lampCap, out.lamp);
  return out;
}

/**
 * FogExp2 coverage at `depthMetres`. This is the mix toward fog color.
 * It is not a culling distance and it is never exactly 1.
 */
export function fogExp2Amount(density: number, depthMetres: number): number {
  const x = density * Math.max(0, depthMetres);
  return 1 - Math.exp(-x * x);
}
