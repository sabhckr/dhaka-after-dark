/**
 * DHAKA: AFTER DARK — one city grade.
 * Primary read is early seventh-generation urban daylight: natural blue sky,
 * warm but limited sun, readable asphalt, restrained saturation.
 * Tropical warmth is an accent (sunset, shop lamps, a few signs), not a second palette.
 * Time of day and weather change light only. They do not carry their own exposure,
 * saturation, contrast, or bloom.
 */

export const GRADE = {
  outputColorSpace: "srgb",
  toneMapping: "aces",
  /** Shared. Looks do not carry an exposure of their own. */
  exposure: 1.05,
  /** Slightly under neutral so plaster and signs do not candy-coat the city. */
  saturation: 0.96,
  contrast: 1.08,
  /** Cool lift so shadows stay blue-grey, not black and not purple. */
  shadowLift: 0.045,
  /** Small warm kiss on the brightest highlights. */
  highlightMix: 0.055,
  bloom: { strength: 0.1, radius: 0.38, threshold: 2.05 },
  transitionSec: 1.15,
  /** Emissive signs and windows. Street lamps use lampCap, not this. */
  emitCap: 0.5,
  lampCap: 2.2,
  paperEmit: 0.03,
  /** Dry asphalt response. Wet weather lerps toward wetRoad. Albedo does not change. */
  road: { rough: 0.86, metal: 0.04 },
  wetRoad: { rough: 0.28, metal: 0.22 },
  waterRough: 0.34,
  wetWaterRough: 0.12,
  envDry: 0.28,
  envWet: 0.72,
  /** Far ground, one color in every condition. */
  ground: 0xb7aa98,
} as const;

/** Shared swatches. Looks may only point at these. */
export const PALETTE = {
  sunDay: 0xfff3e0,
  sunSunset: 0xff7a3c,
  sunDusk: 0xff9460,
  moon: 0xc5d4ea,
  hemiDay: 0xc5d0c8,
  hemiSunset: 0xf0b090,
  hemiDusk: 0x8a78a8,
  hemiNight: 0x3a4660,
  hemiOvercast: 0xc5d0d8,
  groundDay: 0x8a7560,
  groundSunset: 0x6a4038,
  shadow: 0x243044,
  groundOvercast: 0x8e8680,
  /** Warm shop/sunset rim. Not a global magenta wash. */
  rim: 0xffb080,
  /** Cool skylight fill. */
  fill: 0x9eb4c8,
  peach: 0xffd0b4,
  fogDay: 0xd5ddd8,
  fogSunset: 0xe8b098,
  fogDusk: 0x6a6080,
  fogNight: 0x141a28,
  fogOvercast: 0xc5cdd2,
  skyDayTop: 0x4e86c4,
  skyDayMid: 0x8eb6d4,
  skyDayBot: 0xe7d4b4,
  skySunsetTop: 0x355880,
  skySunsetMid: 0xe07a42,
  skySunsetBot: 0xf0b48c,
  skyDuskTop: 0x1c2848,
  skyDuskMid: 0x5a4870,
  skyDuskBot: 0xe89070,
  skyNightTop: 0x0c1220,
  skyNightMid: 0x1a2438,
  skyNightBot: 0x2a3348,
  skyOvercastTop: 0x7d96a8,
  skyOvercastMid: 0xa8bcc6,
  skyOvercastBot: 0xd8d0c4,
  /** Probe cards: amber, cool sky, warm lamp, tail-light red, muted teal. */
  envCards: [0xffb060, 0xc5d4de, 0xffc878, 0xc4483a, 0x6a8c96],
} as const;
