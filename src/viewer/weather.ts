import type { CityLook } from "./looks.ts";

/** Weather rides on the current time-of-day look. It does not swap the palette. */
export type WeatherId = "clear" | "overcast" | "rain" | "storm" | "drying";

export const WEATHER_ORDER: WeatherId[] = ["clear", "overcast", "rain", "storm", "drying"];

const MOD: Record<WeatherId, { wet: number; rain: number; cloud: number; sun: number; fog: number; label: string }> = {
  clear: { wet: 0, rain: 0, cloud: 0, sun: 1, fog: 1, label: "Clear" },
  overcast: { wet: 0.08, rain: 0, cloud: 0.45, sun: 0.62, fog: 0.82, label: "Overcast" },
  rain: { wet: 0.92, rain: 0.75, cloud: 0.55, sun: 0.48, fog: 0.62, label: "Rain" },
  storm: { wet: 1, rain: 1, cloud: 0.72, sun: 0.34, fog: 0.48, label: "Storm" },
  drying: { wet: 0.38, rain: 0.04, cloud: 0.22, sun: 0.8, fog: 0.9, label: "Post-rain" },
};

export function weatherLabel(id: WeatherId): string {
  return MOD[id].label;
}

export function composeWeather(base: CityLook, weather: WeatherId, lightning: number): CityLook {
  const m = MOD[weather];
  const flash = Math.max(0, Math.min(1, lightning));
  return {
    ...base,
    wet: Math.max(base.wet, m.wet),
    rain: Math.max(base.rain, m.rain),
    cloud: Math.min(1, base.cloud * 0.45 + m.cloud),
    sunI: base.sunI * m.sun + flash * 0.85,
    hemi: base.hemi * (0.75 + 0.25 * m.sun) + flash * 0.25,
    fogDensity: base.fogDensity / Math.max(0.35, m.fog),
    fogNear: base.fogNear * m.fog,
    fogFar: Math.max(280, base.fogFar * m.fog),
    lamp: base.lamp,
  };
}
