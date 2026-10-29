import type { Incident, IncidentStatus, IncidentType, Npc } from "./types.ts";
import type { SolidWorld } from "../viewer/solids.ts";

export type IncidentDraft = {
  type: IncidentType;
  x: number;
  z: number;
  severity?: number;
  source?: string;
  participants?: string[];
  status?: IncidentStatus;
  cause?: number | null;
  ttl?: number;
};

/**
 * Incident bus. NPCs do not each subscribe — they poll — so despawn cannot
 * leak a per-person listener. External subscribers are removed in dispose.
 */
export class EventBus {
  readonly events: Incident[] = [];
  now = 0;
  private seq = 1;
  private readonly listeners = new Set<(event: Incident) => void>();
  posts = 0;

  advance(dt: number): void {
    if (dt <= 0) return;
    this.now += dt;
    for (const event of this.events) event.ttl -= dt;
    if (this.events.length > 12) {
      this.events.splice(
        0,
        this.events.length - 12,
      );
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].ttl <= 0 || this.events[i].status === "resolved") this.events.splice(i, 1);
    }
  }

  post(draft: IncidentDraft): Incident {
    const event: Incident = {
      id: this.seq++,
      type: draft.type,
      x: draft.x,
      z: draft.z,
      time: this.now,
      severity: Math.max(0, Math.min(1, draft.severity ?? 0.5)),
      source: draft.source ?? "script",
      participants: draft.participants ? draft.participants.slice() : [],
      status: draft.status ?? "open",
      witnesses: [],
      cause: draft.cause ?? null,
      ttl: draft.ttl ?? 14,
    };
    this.events.push(event);
    this.posts++;
    for (const listener of this.listeners) listener(event);
    return event;
  }

  byId(id: number): Incident | undefined {
    return this.events.find((event) => event.id === id);
  }

  subscribe(listener: (event: Incident) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.events.length = 0;
  }
}

function segmentsCross(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-8) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
  const u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0.04 && t < 0.96 && u > 0.04 && u < 0.96;
}

/** Eye-height wall test. Walls below a knee or above the head do not hide an event. */
export function viewBlocked(world: SolidWorld, x0: number, z0: number, x1: number, z1: number): boolean {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  if (dist < 0.8) return false;
  const near = world.nearby((x0 + x1) / 2, (z0 + z1) / 2);
  for (const wall of near.walls) {
    if (wall.y1 < 1.15 || wall.y0 > 1.7) continue;
    if (segmentsCross(x0, z0, x1, z1, wall.ax, wall.az, wall.bx, wall.bz)) return true;
  }
  return false;
}

export function noteWitness(event: Incident, npc: Npc): void {
  if (!event.witnesses.includes(npc.id)) event.witnesses.push(npc.id);
}
