/**
 * Notable Dhaka places already present as OSM landmark nodes.
 * The mesh is an original marker, not a measured reconstruction.
 * The solid volume of the site, when OSM has a footprint, is the building collider.
 */
export type LandmarkKind = "civic" | "fort" | "mosque" | "memorial" | "museum" | "stadium" | "marker";

export type NotableLandmark = {
  id: number;
  name: string;
  kind: LandmarkKind;
  source: string;
  model: "approximate-marker";
};

export const NOTABLE: NotableLandmark[] = [
  {
    id: 12514064244,
    name: "South Plaza Bangladesh Parliament",
    kind: "civic",
    source: "OSM node 12514064244 government",
    model: "approximate-marker",
  },
  {
    id: 9365643172,
    name: "Ahsan Manzil",
    kind: "museum",
    source: "OSM node 9365643172 tourism=attraction",
    model: "approximate-marker",
  },
  {
    id: 13954132428,
    name: "Lalbagh Fort",
    kind: "fort",
    source: "OSM node 13954132428 historic=archaeological_site",
    model: "approximate-marker",
  },
  {
    id: 3332554007,
    name: "Tara Mosque",
    kind: "mosque",
    source: "OSM node 3332554007 amenity=place_of_worship",
    model: "approximate-marker",
  },
  {
    id: 12078090389,
    name: "Bangladesh Army Stadium",
    kind: "stadium",
    source: "OSM node 12078090389 leisure=stadium",
    model: "approximate-marker",
  },
  {
    id: 11953729488,
    name: "Old High Court Gate",
    kind: "civic",
    source: "OSM node 11953729488 tourism=museum",
    model: "approximate-marker",
  },
];

const BY_ID = new Map(NOTABLE.map((n) => [n.id, n]));

export function notableById(id: number): NotableLandmark | undefined {
  return BY_ID.get(id);
}

export function kindFromCat(cat: string, id: number): LandmarkKind {
  const known = BY_ID.get(id);
  if (known) return known.kind;
  if (cat === "place_of_worship") return "mosque";
  if (cat.startsWith("historic:memorial") || cat.startsWith("historic:monument")) return "memorial";
  if (cat === "stadium") return "stadium";
  if (cat.startsWith("historic:archaeological")) return "fort";
  if (cat === "tourism:museum" || cat === "tourism:attraction") return "museum";
  if (cat === "government" || cat === "university") return "civic";
  return "marker";
}
