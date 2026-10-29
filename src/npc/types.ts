/** Shared NPC types. World axes match the map: x east, y up, z = −north. */

export const NPC_STATES = [
  "SPAWNING",
  "IDLE",
  "WALKING",
  "RUNNING",
  "WAITING",
  "CROSSING_ROAD",
  "SOCIALIZING",
  "WORKING",
  "SHOPPING",
  "BOARDING_VEHICLE",
  "EXITING_VEHICLE",
  "OBSERVING_EVENT",
  "INVESTIGATING",
  "FLEEING",
  "REPORTING_INCIDENT",
  "RETURNING_TO_ROUTINE",
  "DESPAWNING",
] as const;

export type NpcState = (typeof NPC_STATES)[number];

export const ROLE_IDS = [
  "police",
  "rickshaw",
  "cng",
  "genz-m",
  "genz-f",
  "burqa",
  "hujur",
  "stall",
  "hawker",
  "moto",
  "chintai",
  "govt",
  "conductor",
  "student-f",
  "student-m",
  "fruit",
  "construction",
  "cleaner",
  "rickshaw-2",
  "elder",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export type DayPart = "early" | "day" | "evening" | "late";

export type Activity = "commute" | "vend" | "patrol" | "wait-fare" | "social" | "work" | "home" | "off";

export type LinkKind = "foot" | "sidewalk" | "crossing" | "road";

export type MoveMode = "walk" | "road";

export type Capability =
  | "walk"
  | "run"
  | "fare"
  | "road"
  | "vend"
  | "patrol"
  | "report"
  | "police"
  | "social"
  | "work"
  | "crime"
  | "phone"
  | "group"
  | "cautious-crossing";

export type AnimIntent =
  | "idle"
  | "walk"
  | "run"
  | "turn"
  | "stop"
  | "sit"
  | "phone"
  | "talk"
  | "serve"
  | "flee"
  | "observe"
  | "report"
  | "work";

export type IncidentType =
  | "traffic-collision"
  | "dangerous-driving"
  | "pedestrian-threat"
  | "theft"
  | "disturbance"
  | "assault"
  | "police-intervention"
  | "emergency-arrival";

export type IncidentStatus = "open" | "reported" | "investigating" | "resolved";

export type Incident = {
  id: number;
  type: IncidentType;
  x: number;
  z: number;
  /** Simulation seconds when posted. */
  time: number;
  severity: number;
  source: string;
  participants: string[];
  status: IncidentStatus;
  witnesses: string[];
  /** Set when a witness files a report about another incident. */
  cause: number | null;
  ttl: number;
};

export type PathPoint = { x: number; z: number; kind: LinkKind };

export type Npc = {
  id: string;
  role: RoleId;
  chunk: string;
  anchorKey: string;
  seed: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: NpcState;
  resume: NpcState | null;
  activity: Activity;
  part: DayPart;
  scheduleDirty: boolean;
  anchorX: number;
  anchorZ: number;
  destX: number | null;
  destZ: number | null;
  path: PathPoint[];
  pathI: number;
  navVersion: number;
  mode: MoveMode;
  stuck: number;
  repaths: number;
  stateAge: number;
  think: number;
  reaction: number;
  pendingEvent: number | null;
  awareEvent: number | null;
  seen: number[];
  interact: string | null;
  interactAge: number;
  partner: string | null;
  socialLeft: number;
  fail: string | null;
  lastTransition: string;
  history: string[];
  /** Seconds to hold before the current crossing. */
  crossArm: number;
  /** Path index the crossing hold was armed for. -1 if none. */
  crossFor: number;
  fareX: number | null;
  fareZ: number | null;
  patrol: { x: number; z: number }[];
  patrolI: number;
  investigateT: number;
  scripted: boolean;
  alive: boolean;
  anim: AnimIntent;
  bob: number;
};

export type PlayerSample = {
  x: number;
  y: number;
  z: number;
  mode: string;
  speed: number;
};

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function approachAngle(from: number, to: number, maxStep: number): number {
  let d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  if (d > maxStep) d = maxStep;
  else if (d < -maxStep) d = -maxStep;
  return from + d;
}
