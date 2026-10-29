import proj4 from "proj4";

/** WGS84 / UTM zone 46N. Dhaka (≈90.4°E) falls in zone 46. */
export const CRS_ID = "EPSG:32646";

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs +type=crs";
const UTM46 = "+proj=utm +zone=46 +datum=WGS84 +units=m +no_defs +type=crs";

/**
 * Fixed survey origin in EPSG:32646 metres.
 * World coordinates are offsets from this point so values stay small.
 * Not a landmark — a round easting/northing west and south of the city.
 */
export const WORLD_ORIGIN = {
  easting: 230_000,
  northing: 2_615_000,
} as const;

/**
 * Axis convention, shared by every feature, chunk, graph node, and the viewer:
 *   X = east
 *   Y = up, local ground datum (not orthometric / DEM elevation)
 *   Z = −north   (geographic north is −Z, matching three.js looking down −Z)
 */

export function lonLatToUtm(lon: number, lat: number): { easting: number; northing: number } {
  const [easting, northing] = proj4(WGS84, UTM46, [lon, lat]) as [number, number];
  return { easting, northing };
}

export function utmToLonLat(easting: number, northing: number): { lon: number; lat: number } {
  const [lon, lat] = proj4(UTM46, WGS84, [easting, northing]) as [number, number];
  return { lon, lat };
}

export function lonLatToWorld(lon: number, lat: number, y = 0): { x: number; y: number; z: number } {
  const { easting, northing } = lonLatToUtm(lon, lat);
  return {
    x: easting - WORLD_ORIGIN.easting,
    y,
    z: -(northing - WORLD_ORIGIN.northing),
  };
}

export function worldToLonLat(x: number, z: number): { lon: number; lat: number } {
  return utmToLonLat(x + WORLD_ORIGIN.easting, -z + WORLD_ORIGIN.northing);
}

/** Centimetre quantisation used in runtime files. Deterministic. */
export function qCoord(n: number): number {
  return Math.round(n * 100) / 100;
}
