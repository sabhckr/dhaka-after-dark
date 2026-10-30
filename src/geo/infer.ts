import { METRES_PER_LEVEL } from "./classify.ts";
import type { BuildingRec, PlaceRec, RoadRec, Sidewalk } from "./types.ts";

/**
 * Values the game needs where OSM is often silent. The chunk data holds only
 * what OSM says; every rule and default lives here, and every answer says
 * which one it is:
 *
 * - `osm`: copied from a tag on this feature.
 * - `rule`: derived from other OSM facts on this feature by a rule below.
 * - `default`: nothing on the feature says; a class-wide default.
 */
export type Src = "osm" | "rule" | "default";
export type Inferred<T> = { value: T; src: Src };

/** Levels: building:levels; else measured height ÷ 3.2 m (rule); else the estimated height ÷ 3.2 m (default). */
export function buildingLevels(b: BuildingRec): Inferred<number> {
  if (b.lv) return { value: b.lv, src: "osm" };
  const value = Math.max(1, Math.round(b.h / METRES_PER_LEVEL));
  return { value, src: b.hs === "measured" ? "rule" : "default" };
}

/**
 * Raised off the ground (a station or deck over a road, the D4 case).
 * min_height or building:min_level above 0 says so (osm); layer above 0 alone
 * suggests it (rule); otherwise it stands on the ground (default).
 */
export function buildingElevated(b: BuildingRec): Inferred<boolean> {
  if ((b.mh ?? 0) > 0 || (b.mlv ?? 0) > 0) return { value: true, src: "osm" };
  if ((b.ly ?? 0) > 0) return { value: true, src: "rule" };
  return { value: false, src: "default" };
}

/** Height of the underside: min_height; else min_level × 3.2 m (rule); else 0. */
export function buildingBase(b: BuildingRec): Inferred<number> {
  if (b.mh) return { value: b.mh, src: "osm" };
  if (b.mlv) return { value: b.mlv * METRES_PER_LEVEL, src: "rule" };
  return { value: 0, src: "default" };
}

const SIDEWALK_BY_CLASS: Record<string, Sidewalk> = {
  trunk: "both",
  primary: "both",
  secondary: "both",
  tertiary: "both",
};

/**
 * sidewalk=*; else both sides on trunk, primary, secondary and tertiary roads
 * and none elsewhere (default). Most Dhaka lanes have no separate footway, and
 * links, service roads, paths and steps are not given one.
 */
export function roadSidewalk(r: RoadRec): Inferred<Sidewalk> {
  if (r.sw) return { value: r.sw, src: "osm" };
  return { value: SIDEWALK_BY_CLASS[r.cls] ?? "no", src: "default" };
}

/** Width of one lane in the lane rule. */
export const LANE_WIDTH_M = 3.25;

/** lanes=*; else measured width ÷ 3.25 m (rule); else 2 on primary and wider, 1 elsewhere (default). */
export function roadLanes(r: RoadRec): Inferred<number> {
  if (r.ln) return { value: r.ln, src: "osm" };
  if (!r.we) return { value: Math.max(1, Math.round(r.w / LANE_WIDTH_M)), src: "rule" };
  const wide = /^(motorway|trunk|primary)$/.test(r.cls);
  return { value: wide ? 2 : 1, src: "default" };
}

/** Rule radius for districtAt: a place node further away than this names nothing. */
export const DISTRICT_RADIUS_M = 1500;
const DISTRICT_KINDS = new Set(["suburb", "quarter", "neighbourhood"]);

/**
 * The nearest suburb, quarter or neighbourhood node within 1.5 km (rule).
 * Ward or thana polygons are not used, so the name is a nearest-node guess,
 * not a boundary test; null when nothing is near.
 */
export function districtAt(places: PlaceRec[], x: number, z: number): Inferred<PlaceRec> | null {
  let best: PlaceRec | null = null;
  let bestD = DISTRICT_RADIUS_M * DISTRICT_RADIUS_M;
  for (const p of places) {
    if (!DISTRICT_KINDS.has(p.kind)) continue;
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { value: best, src: "rule" } : null;
}
