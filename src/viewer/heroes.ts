import { pointInOuter } from "./place.ts";

/**
 * Five Dhaka landmarks whose OSM footprints are already in the map.
 * The mesh keeps that footprint. The height is a published or reference
 * figure, because the extract almost never has building:height.
 * Collision uses this same height. It is not a survey.
 */
export type HeroKind = "sangsad" | "ahsan" | "museum" | "curzon";

export type HeroSite = {
  buildingId: number;
  kind: HeroKind;
  name: string;
  visualH: number;
  /** A smaller ring of the same way is an inner mass (the Sangsad assembly block). */
  innerBelow?: number;
  innerH?: number;
  tint: [number, number, number];
  roof: [number, number, number];
  source: string;
};

export const HERO_SITES: HeroSite[] = [
  {
    buildingId: 18085267,
    kind: "sangsad",
    name: "Jatiya Sangsad Bhaban",
    visualH: 33.5,
    innerBelow: 80,
    innerH: 47,
    tint: [0.78, 0.76, 0.72],
    roof: [0.68, 0.66, 0.62],
    source:
      "OSM way 18085267 at Sher-e-Bangla Nagar. Peripheral blocks use 33.5 m and the inner ring 47 m, from published descriptions of Kahn's assembly (about 110 ft and 155 ft). Horizontal joints, circles, and triangles are painted on the walls. They are not cut through the concrete. OSM had estimated 9 m.",
  },
  {
    buildingId: 624025793,
    kind: "ahsan",
    name: "Ahsan Manzil",
    visualH: 18,
    tint: [0.92, 0.52, 0.6],
    roof: [0.95, 0.9, 0.86],
    source:
      "OSM way 624025793, the footprint on OSM node 9365643172 (Ahsan Manzil). Pink walls and towers are a reference approximation of the palace, not a surveyed reconstruction.",
  },
  {
    buildingId: 7392256,
    kind: "museum",
    name: "Bangladesh National Museum",
    visualH: 16,
    tint: [0.9, 0.88, 0.83],
    roof: [0.32, 0.4, 0.52],
    source:
      "OSM way 7392256, the large Shahbagh footprint near 23.7375 N, 90.3945 E. Gallery interiors are not modelled.",
  },
  {
    buildingId: 1132918478,
    kind: "curzon",
    name: "Curzon Hall",
    visualH: 14,
    tint: [0.58, 0.28, 0.22],
    roof: [0.93, 0.86, 0.74],
    source:
      "OSM way 1132918478, the nearest large footprint to Curzon Hall at Dhaka University (about 23.727 N, 90.398 E). Brick, towers, and a dome are the type, not a measured hall.",
  },
];

const BY_ID = new Map(HERO_SITES.map((site) => [site.buildingId, site]));

export function heroSite(id: number): HeroSite | undefined {
  return BY_ID.get(id);
}

export function heroDrawHeight(site: HeroSite, span: number): number {
  if (site.innerBelow != null && site.innerH != null && span < site.innerBelow) return site.innerH;
  return site.visualH;
}

/** Drop holes that belong to a different ring of a split way. Those would cut the roof or raise walls in the wrong place. */
export function containedHoles(outer: number[], holes: number[][] | undefined): number[][] {
  if (!holes?.length || outer.length < 6) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < outer.length; i += 2) {
    minX = Math.min(minX, outer[i]);
    maxX = Math.max(maxX, outer[i]);
    minZ = Math.min(minZ, outer[i + 1]);
    maxZ = Math.max(maxZ, outer[i + 1]);
  }
  const sx = maxX - minX;
  const sz = maxZ - minZ;
  const kept: number[][] = [];
  for (const hole of holes) {
    if (hole.length < 6) continue;
    let hx0 = Infinity;
    let hx1 = -Infinity;
    let hz0 = Infinity;
    let hz1 = -Infinity;
    let cx = 0;
    let cz = 0;
    const n = hole.length / 2;
    for (let i = 0; i < n; i++) {
      const x = hole[i * 2];
      const z = hole[i * 2 + 1];
      cx += x;
      cz += z;
      hx0 = Math.min(hx0, x);
      hx1 = Math.max(hx1, x);
      hz0 = Math.min(hz0, z);
      hz1 = Math.max(hz1, z);
    }
    cx /= n;
    cz /= n;
    if (hx1 - hx0 >= sx - 0.5 || hz1 - hz0 >= sz - 0.5) continue;
    if (!pointInOuter(cx, cz, outer)) continue;
    kept.push(hole);
  }
  return kept;
}
