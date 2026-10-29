import type { DayPart } from "./types.ts";

/**
 * Simulation clock for NPC schedules.
 * The city has look presets and weather, not a world clock. This is the
 * single schedule clock. It does not drive the sky.
 * Default: 08:00, 0.25 game-minutes per real second (one game hour ≈ 4 real minutes).
 */
export class SimClock {
  /** Minutes from midnight, wrapped to [0, 1440). */
  minutes = 8 * 60;
  /** Game minutes advanced per real second. */
  scale = 0.25;

  advance(dt: number): void {
    if (dt <= 0) return;
    this.minutes = (((this.minutes + dt * this.scale) % 1440) + 1440) % 1440;
  }

  setMinutes(minutes: number): void {
    this.minutes = ((minutes % 1440) + 1440) % 1440;
  }

  get part(): DayPart {
    return dayPart(this.minutes);
  }

  get label(): string {
    const h = Math.floor(this.minutes / 60);
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${this.part}`;
  }
}

export function dayPart(minutes: number): DayPart {
  const h = (((minutes % 1440) + 1440) % 1440) / 60;
  if (h >= 5 && h < 9) return "early";
  if (h >= 9 && h < 17) return "day";
  if (h >= 17 && h < 21) return "evening";
  return "late";
}
