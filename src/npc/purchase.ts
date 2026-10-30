import { PLACEMENTS } from "../assets/catalog.ts";
import type { PlayerSample } from "./types.ts";

/**
 * The two placed Shahbagh counters. Prices are game prices, not a surveyed menu.
 * Other stall meshes stay props. There is no inventory and no cup in the hand.
 */
const OFFER = {
  "hawk-tea": { offer: "tea" as const, role: "stall" as const, price: 15, wait: 1.4, name: "চা" },
  "hawk-flower": { offer: "flower" as const, role: "hawker" as const, price: 40, wait: 1.6, name: "ফুল" },
};

export type OfferId = "tea" | "flower";
export type PitchRole = "stall" | "hawker";

export type Pitch = {
  id: string;
  offer: OfferId;
  role: PitchRole;
  x: number;
  z: number;
  yaw: number;
  /** Keeper stands to the side of the table, not inside it. */
  standX: number;
  standZ: number;
  price: number;
  wait: number;
  name: string;
};

export const REACH = 3.2;
export const CANCEL = 6.5;
const ORDER_S = 0.35;
const SERVE_HOLD = 2.2;

function beside(x: number, z: number, yaw: number): { standX: number; standZ: number } {
  const side = 1.55;
  return {
    standX: x + Math.cos(yaw) * side,
    standZ: z - Math.sin(yaw) * side,
  };
}

export const PITCHES: Pitch[] = PLACEMENTS.flatMap((place) => {
  const row = OFFER[place.assetId as keyof typeof OFFER];
  if (!row) return [];
  return [{ id: place.assetId, ...row, x: place.x, z: place.z, yaw: place.yaw, ...beside(place.x, place.z, place.yaw) }];
});

export type SalePhase = "order" | "wait" | "served";

export type Sale = {
  pitchId: string;
  offer: OfferId;
  phase: SalePhase;
  age: number;
  price: number;
};

export class Counter {
  sale: Sale | null = null;
  completed = 0;
  cancelled = 0;
  notice = "";
  private noticeAge = 0;

  nearest(x: number, z: number, reach = REACH): Pitch | null {
    let best: Pitch | null = null;
    let bestD = reach;
    for (const pitch of PITCHES) {
      const d = Math.hypot(pitch.x - x, pitch.z - z);
      if (d < bestD) {
        bestD = d;
        best = pitch;
      }
    }
    return best;
  }

  /**
   * Start a sale from the ground. A sale already in order or wait is left alone.
   * Flying past the umbrella does not buy anything.
   */
  begin(x: number, z: number, y: number, mode: PlayerSample["mode"]): string | null {
    if (this.sale && this.sale.phase !== "served") return this.line();
    if (mode === "fly" || y > 8) return null;
    const pitch = this.nearest(x, z);
    if (!pitch) return null;
    this.sale = { pitchId: pitch.id, offer: pitch.offer, phase: "order", age: 0, price: pitch.price };
    this.notice = "";
    this.noticeAge = 0;
    return this.line();
  }

  tick(dt: number, x: number, z: number, y: number, mode: PlayerSample["mode"]): void {
    if (this.noticeAge > 0) {
      this.noticeAge = Math.max(0, this.noticeAge - dt);
      if (this.noticeAge === 0) this.notice = "";
    }
    const sale = this.sale;
    if (!sale) return;
    const pitch = PITCHES.find((item) => item.id === sale.pitchId);
    if (!pitch) {
      this.sale = null;
      return;
    }
    const grounded = mode !== "fly" && y <= 8;
    const dist = Math.hypot(pitch.x - x, pitch.z - z);
    if (sale.phase !== "served" && (!grounded || dist > CANCEL)) {
      this.cancelled++;
      this.notice = "You left before it was served.";
      this.noticeAge = 2.6;
      this.sale = null;
      return;
    }
    sale.age += dt;
    if (sale.phase === "order" && sale.age >= ORDER_S) {
      sale.phase = "wait";
      sale.age = 0;
      return;
    }
    if (sale.phase === "wait" && sale.age >= pitch.wait) {
      sale.phase = "served";
      sale.age = 0;
      this.completed++;
      return;
    }
    if (sale.phase === "served" && sale.age >= SERVE_HOLD) {
      this.notice = sale.offer === "tea" ? "Tea finished. Nothing in the hand — there is no held cup." : "Flowers paid for. Nothing in the hand.";
      this.noticeAge = 3;
      this.sale = null;
    }
  }

  line(): string {
    const sale = this.sale;
    if (!sale) return this.notice;
    const pitch = PITCHES.find((item) => item.id === sale.pitchId);
    const name = pitch?.name ?? sale.offer;
    if (sale.phase === "order") return `${name} — ordering`;
    if (sale.phase === "wait") return `${name} — ${sale.price} taka, waiting`;
    return `${name} — served, ${sale.price} taka`;
  }
}
