export type RenderQuality = "low" | "medium" | "high";
export type BuildingLod = "near" | "mid" | "far";

/**
 * Enter radii in Chebyshev chunks. A fresh chunk uses these.
 * A chunk keeps its level until the camera is one chunk past that band,
 * then steps down one level. Inward moves upgrade immediately.
 * Visual LOD does not change collision, the road graph, or chunk coordinates.
 */
const ENTER: Record<RenderQuality, { near: number; mid: number }> = {
  low: { near: 0, mid: 1 },
  medium: { near: 0, mid: 2 },
  high: { near: 1, mid: 2 },
};

const HOLD = 1;

export function selectBuildingLod(dist: number, quality: RenderQuality, previous?: BuildingLod): BuildingLod {
  const band = ENTER[quality];
  const fresh = (): BuildingLod => (dist <= band.near ? "near" : dist <= band.mid ? "mid" : "far");
  if (!previous) return fresh();
  if (previous === "near") {
    if (dist <= band.near + HOLD) return "near";
    if (dist <= band.mid + HOLD) return "mid";
    return "far";
  }
  if (previous === "mid") {
    if (dist <= band.near) return "near";
    if (dist <= band.mid + HOLD) return "mid";
    return "far";
  }
  if (dist <= band.near) return "near";
  if (dist <= band.mid) return "mid";
  return "far";
}

/** Trees drop one chunk sooner on low. Dressing keeps the existing prop radius. */
export function treesHidden(dist: number, quality: RenderQuality): boolean {
  return dist >= (quality === "low" ? 1 : 2);
}

export type DressBudget = {
  shops: number;
  lamps: number;
  props: number;
  posters: "low" | "medium" | "high";
  cables: boolean;
};

export function dressBudget(quality: RenderQuality): DressBudget {
  if (quality === "low") return { shops: 6, lamps: 16, props: 20, posters: "low", cables: false };
  if (quality === "medium") return { shops: 14, lamps: 40, props: 64, posters: "medium", cables: false };
  return { shops: 28, lamps: 70, props: 120, posters: "high", cables: true };
}

export function actorCaps(quality: RenderQuality): { npcs: number; traffic: number } {
  if (quality === "low") return { npcs: 10, traffic: 6 };
  if (quality === "medium") return { npcs: 16, traffic: 10 };
  return { npcs: 26, traffic: 14 };
}

/** Low and medium stay at 1x. High follows the screen, capped, because fill rate dominated the software GPU. */
export function pixelRatioCap(quality: RenderQuality, device: number): number {
  if (quality !== "high") return 1;
  return Math.min(device || 1, 1.5);
}

export function normalAmp(quality: RenderQuality): number {
  if (quality === "high") return 1;
  if (quality === "medium") return 0.55;
  return 0.2;
}

export function anisotropyCap(quality: RenderQuality): number {
  if (quality === "high") return 8;
  if (quality === "medium") return 2;
  return 1;
}
