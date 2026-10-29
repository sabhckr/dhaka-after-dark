import type { AnimIntent, NpcState } from "./types.ts";

/**
 * The catalog figures have no skeleton and no clips.
 * `resolveClip` records that honestly: a missing clip falls back to idle
 * while `motion` still says what the body is doing, so the transform can bob.
 * A future clip set can be passed in `have` without changing the brain.
 */
export type ClipResult = {
  clip: AnimIntent;
  motion: AnimIntent;
  fallback: boolean;
  /** True when the project has no skeletal library at all. */
  procedural: boolean;
};

export function resolveClip(have: ReadonlySet<AnimIntent> | null, want: AnimIntent): ClipResult {
  if (have && have.has(want)) return { clip: want, motion: want, fallback: false, procedural: false };
  return { clip: "idle", motion: want, fallback: true, procedural: have == null };
}

export function intentFor(state: NpcState, phone: boolean): AnimIntent {
  switch (state) {
    case "WALKING":
    case "CROSSING_ROAD":
    case "RETURNING_TO_ROUTINE":
    case "INVESTIGATING":
    case "BOARDING_VEHICLE":
      return "walk";
    case "RUNNING":
    case "FLEEING":
      return "flee";
    case "SOCIALIZING":
      return "talk";
    case "WORKING":
      return "work";
    case "SHOPPING":
      return "serve";
    case "OBSERVING_EVENT":
      return "observe";
    case "REPORTING_INCIDENT":
      return "report";
    case "WAITING":
    case "EXITING_VEHICLE":
      return "stop";
    case "IDLE":
      return phone ? "phone" : "idle";
    default:
      return "idle";
  }
}
