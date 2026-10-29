import { NPC_STATES, type Npc, type NpcState } from "./types.ts";

const HARD = new Set<NpcState>(["FLEEING", "OBSERVING_EVENT", "INVESTIGATING", "REPORTING_INCIDENT", "RUNNING"]);

const NEXT: Record<NpcState, NpcState[]> = {
  SPAWNING: ["IDLE", "WORKING", "WAITING", "WALKING", "FLEEING"],
  IDLE: [
    "WALKING",
    "WORKING",
    "SOCIALIZING",
    "WAITING",
    "OBSERVING_EVENT",
    "FLEEING",
    "REPORTING_INCIDENT",
    "INVESTIGATING",
    "BOARDING_VEHICLE",
    "SHOPPING",
    "RUNNING",
    "RETURNING_TO_ROUTINE",
  ],
  WALKING: [
    "IDLE",
    "WAITING",
    "CROSSING_ROAD",
    "RUNNING",
    "FLEEING",
    "OBSERVING_EVENT",
    "SOCIALIZING",
    "WORKING",
    "SHOPPING",
    "INVESTIGATING",
    "REPORTING_INCIDENT",
    "BOARDING_VEHICLE",
    "RETURNING_TO_ROUTINE",
    "EXITING_VEHICLE",
  ],
  RUNNING: ["FLEEING", "WALKING", "IDLE", "WAITING", "OBSERVING_EVENT", "CROSSING_ROAD"],
  WAITING: ["IDLE", "WALKING", "CROSSING_ROAD", "WORKING", "BOARDING_VEHICLE", "FLEEING", "OBSERVING_EVENT", "RETURNING_TO_ROUTINE"],
  CROSSING_ROAD: ["WALKING", "WAITING", "FLEEING", "RUNNING", "INVESTIGATING", "RETURNING_TO_ROUTINE"],
  SOCIALIZING: ["IDLE", "WALKING", "FLEEING", "OBSERVING_EVENT", "REPORTING_INCIDENT", "SHOPPING"],
  WORKING: ["IDLE", "OBSERVING_EVENT", "FLEEING", "REPORTING_INCIDENT", "WAITING", "WALKING", "SOCIALIZING", "RETURNING_TO_ROUTINE"],
  SHOPPING: ["IDLE", "WALKING", "FLEEING", "OBSERVING_EVENT", "SOCIALIZING"],
  BOARDING_VEHICLE: ["WALKING", "WAITING", "FLEEING", "EXITING_VEHICLE"],
  EXITING_VEHICLE: ["IDLE", "RETURNING_TO_ROUTINE", "WAITING", "WALKING", "WORKING"],
  OBSERVING_EVENT: ["RETURNING_TO_ROUTINE", "FLEEING", "REPORTING_INCIDENT", "IDLE", "INVESTIGATING", "WALKING"],
  INVESTIGATING: ["RETURNING_TO_ROUTINE", "FLEEING", "OBSERVING_EVENT", "WALKING", "IDLE", "CROSSING_ROAD", "WAITING"],
  FLEEING: ["RETURNING_TO_ROUTINE", "WALKING", "IDLE", "WAITING", "RUNNING", "CROSSING_ROAD"],
  REPORTING_INCIDENT: ["RETURNING_TO_ROUTINE", "FLEEING", "IDLE", "OBSERVING_EVENT", "WALKING"],
  RETURNING_TO_ROUTINE: ["IDLE", "WALKING", "WORKING", "WAITING", "SOCIALIZING"],
  DESPAWNING: [],
};

export function canTransition(from: NpcState, to: NpcState): boolean {
  if (from === to) return true;
  if (!NPC_STATES.includes(from) || !NPC_STATES.includes(to)) return false;
  if (to === "DESPAWNING") return true;
  return NEXT[from].includes(to);
}

function oscillating(history: string[]): boolean {
  if (history.length < 4) return false;
  const tail = history.slice(-4);
  const [a, b, c, d] = tail;
  return a === c && b === d && a !== b;
}

/** Apply a transition. Rapid A↔B flips collapse into a short wait instead of spinning. */
export function tryTransition(npc: Npc, to: NpcState, why = ""): boolean {
  if (npc.state === "DESPAWNING") return to === "DESPAWNING";
  if (npc.state === to) return true;
  if (!canTransition(npc.state, to)) {
    npc.fail = `bad-transition ${npc.state}->${to}`;
    return false;
  }
  const token = `${npc.state}>${to}`;
  if (npc.stateAge < 0.45) {
    npc.history.push(token);
    if (npc.history.length > 8) npc.history.shift();
    if (oscillating(npc.history)) {
      npc.lastTransition = "oscillation-break";
      npc.state = "WAITING";
      npc.stateAge = 0;
      npc.crossArm = 1.6;
      npc.resume = npc.resume ?? "IDLE";
      npc.fail = "oscillation";
      return true;
    }
  } else if (npc.history.length) {
    npc.history = [];
  }
  npc.lastTransition = why ? `${token} ${why}` : token;
  if (HARD.has(to) && !HARD.has(npc.state) && npc.state !== "SPAWNING") {
    if (!npc.resume) npc.resume = npc.state === "CROSSING_ROAD" ? "WALKING" : npc.state;
  }
  npc.state = to;
  npc.stateAge = 0;
  npc.fail = null;
  return true;
}

export function interrupt(npc: Npc, to: NpcState, why: string): boolean {
  if (!HARD.has(to) && to !== "WAITING") return false;
  if (npc.state === to) return true;
  return tryTransition(npc, to, why);
}

export function finishInterrupt(npc: Npc): boolean {
  npc.pendingEvent = null;
  npc.awareEvent = null;
  npc.investigateT = 0;
  const dirty = npc.scheduleDirty;
  const back = npc.resume;
  npc.resume = null;
  if (dirty) {
    tryTransition(npc, "IDLE", "shift");
    return true;
  }
  if (back === "WORKING" || back === "WAITING" || back === "SOCIALIZING") {
    if (tryTransition(npc, "RETURNING_TO_ROUTINE", "resume")) {
      npc.resume = back;
      return true;
    }
  }
  return tryTransition(npc, "RETURNING_TO_ROUTINE", "resume") || tryTransition(npc, "IDLE", "resume");
}

export function isInterrupt(state: NpcState): boolean {
  return HARD.has(state);
}
