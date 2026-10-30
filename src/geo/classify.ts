import type { BuildingAttrs, PointKind, RoadAttrs, Sidewalk } from "./types.ts";

/** Widths are estimates unless the way carries a numeric width tag. Metres. */
export const HIGHWAY_WIDTH_M: Record<string, number> = {
  motorway: 16,
  trunk: 14,
  primary: 11,
  secondary: 9,
  tertiary: 7,
  unclassified: 5.5,
  residential: 5,
  living_street: 4.5,
  service: 3.5,
  pedestrian: 4,
  footway: 1.8,
  path: 1.5,
  cycleway: 2.2,
  track: 3,
  steps: 1.6,
  motorway_link: 8,
  trunk_link: 7,
  primary_link: 6.5,
  secondary_link: 6,
  tertiary_link: 5.5,
  construction: 6,
};

const SKIP_HIGHWAY = new Set([
  "proposed",
  "abandoned",
  "razed",
  "no",
  "platform",
  "raceway",
  "bus_guideway",
  "rest_area",
  "services",
  "elevator",
  "corridor",
  "via_ferrata",
]);

/** Level height used when only building:levels is known. Disclosed estimate. */
export const METRES_PER_LEVEL = 3.2;

const BUILDING_DEFAULT_M: Record<string, number> = {
  yes: 9,
  residential: 11,
  apartments: 18,
  house: 6,
  detached: 7,
  semidetached_house: 7,
  terrace: 8,
  bungalow: 5,
  commercial: 12,
  retail: 6,
  industrial: 8,
  warehouse: 8,
  mosque: 12,
  temple: 10,
  church: 12,
  shrine: 6,
  school: 10,
  university: 14,
  college: 12,
  hospital: 16,
  hotel: 22,
  office: 16,
  garage: 3,
  garages: 3,
  shed: 3,
  roof: 4,
  ruins: 4,
  construction: 9,
  kiosk: 3,
  hut: 3,
  cabin: 4,
  public: 12,
  government: 14,
  train_station: 12,
  transportation: 10,
  parking: 8,
};

export type HeightInfo = {
  metres: number;
  source: "measured" | "estimated";
  levels?: number;
};

export function parseMetres(raw: string | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).trim().replace(",", ".");
  const m = text.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let v = Number(m[0]);
  if (!Number.isFinite(v)) return null;
  if (/ft|feet|foot|′|'/i.test(text)) v *= 0.3048;
  return v;
}

export function classifyHeight(tags: Record<string, string>): HeightInfo {
  const measured = parseMetres(tags["building:height"] || tags.height);
  if (measured != null && measured > 0.4 && measured < 600) {
    return { metres: measured, source: "measured" };
  }
  const levels = parseMetres(tags["building:levels"]);
  if (levels != null && levels > 0 && levels < 150) {
    return { metres: levels * METRES_PER_LEVEL, source: "estimated", levels };
  }
  const key = tags.building || "yes";
  return { metres: BUILDING_DEFAULT_M[key] ?? 9, source: "estimated" };
}

export type RoadClass = {
  cls: string;
  width: number;
  widthEstimated: boolean;
  /** Deck metres above the local ground datum. 0.28 is the at-grade blockout offset. */
  y: number;
  bridge: boolean;
  oneway: -1 | 0 | 1;
  area: boolean;
};

/**
 * Vertical stack (blockout, not a survey):
 *   ground 0, parks 0.05, water 0.12, at-grade roads 0.28, rail 0.36,
 *   bridge decks 6m + (layer-1)*5m.
 * Negative layers are not excavated — there is no terrain mesh — so they stay at grade
 * and the layer is kept on the record via `bridge === false` and y 0.28.
 */
export function classifyRoad(tags: Record<string, string>): RoadClass | null {
  const cls = tags.highway;
  if (!cls || SKIP_HIGHWAY.has(cls)) return null;
  const widthTag = parseMetres(tags.width || tags.est_width);
  const widthEstimated = !(widthTag != null && widthTag > 0.4 && widthTag < 80);
  const width = widthEstimated ? (HIGHWAY_WIDTH_M[cls] ?? 5) : widthTag!;
  const layer = Number.parseInt(tags.layer || "0", 10);
  const bridgeTag = Boolean(tags.bridge && tags.bridge !== "no");
  const bridge = bridgeTag || (Number.isFinite(layer) && layer > 0);
  let y = 0.28;
  if (bridge) {
    const lvl = Number.isFinite(layer) && layer > 0 ? layer : 1;
    y = 6 + (lvl - 1) * 5;
  }
  let oneway: -1 | 0 | 1 = 0;
  if (tags.oneway === "yes" || tags.oneway === "1") oneway = 1;
  else if (tags.oneway === "-1" || tags.oneway === "reverse") oneway = -1;
  return {
    cls,
    width,
    widthEstimated,
    y,
    bridge,
    oneway,
    area: tags.area === "yes" && (cls === "pedestrian" || cls === "service" || cls === "footway"),
  };
}

export function isBuilding(tags: Record<string, string>): boolean {
  return Boolean(tags.building) && tags.building !== "no" && tags.building !== "entrance";
}

export function isWaterArea(tags: Record<string, string>): boolean {
  if (tags.natural === "water") return true;
  if (tags.waterway === "riverbank") return true;
  if (tags.landuse === "reservoir" || tags.landuse === "basin") return true;
  if (tags.water && tags.water !== "no") return true;
  return false;
}

/** Linear water. Rivers are skipped when area water exists; canals and drains are kept. */
export function linearWaterWidth(tags: Record<string, string>): number | null {
  const w = tags.waterway;
  if (!w || w === "riverbank" || w === "river" || w === "fairway") return null;
  const table: Record<string, number> = { canal: 14, stream: 6, drain: 5, ditch: 3, tidal_channel: 12 };
  return table[w] ?? null;
}

export function isPark(tags: Record<string, string>): boolean {
  if (tags.leisure === "park" || tags.leisure === "garden" || tags.leisure === "playground") return true;
  if (tags.leisure === "pitch" || tags.leisure === "recreation_ground") return true;
  if (tags.landuse === "recreation_ground" || tags.landuse === "village_green") return true;
  if (tags.landuse === "forest" || tags.natural === "wood") return true;
  return false;
}

export function isRail(tags: Record<string, string>): boolean {
  const r = tags.railway;
  return r === "rail" || r === "subway" || r === "light_rail" || r === "tram" || r === "narrow_gauge";
}

export function railElevation(tags: Record<string, string>): number {
  const layer = Number.parseInt(tags.layer || "0", 10);
  const bridge = Boolean(tags.bridge && tags.bridge !== "no");
  if (bridge || (Number.isFinite(layer) && layer > 0)) {
    const lvl = Number.isFinite(layer) && layer > 0 ? layer : 1;
    return 6 + (lvl - 1) * 5;
  }
  return 0.36;
}

export type RailGrade = "underground" | "at-grade" | "elevated" | "unknown";

export type RailStructure = {
  grade: RailGrade;
  /** Beams and pillars only for an explicit elevated tag. */
  supports: boolean;
  reason: string;
};

/**
 * Grade from tags that actually say where the alignment is.
 * `railway=subway`, `bridge=yes`, and `layer` alone do not authorise a viaduct.
 * Shipped chunk rails do not store this result — see `RailRec`.
 */
export function classifyRailStructure(tags: Record<string, string>): RailStructure {
  const tunnel = Boolean(tags.tunnel && tags.tunnel !== "no");
  const loc = (tags.location || "").toLowerCase();
  const bridge = tags.bridge && tags.bridge !== "no" ? tags.bridge : "";
  const structure = (tags["bridge:structure"] || "").toLowerCase();
  const layer = Number.parseInt(tags.layer || "0", 10);
  if (tunnel || loc === "underground" || loc === "underwater") {
    return { grade: "underground", supports: false, reason: tunnel ? "tunnel" : "location-underground" };
  }
  if (Number.isFinite(layer) && layer < 0) {
    return { grade: "unknown", supports: false, reason: "negative-layer-not-a-tunnel" };
  }
  const elevatedLoc = loc === "overhead" || loc === "elevated";
  const viaduct =
    bridge === "viaduct" || tags.man_made === "viaduct" || structure === "viaduct" || structure === "beam";
  if (elevatedLoc || viaduct) {
    return { grade: "elevated", supports: true, reason: elevatedLoc ? "location-elevated" : "viaduct" };
  }
  if (bridge || (Number.isFinite(layer) && layer > 0) || tags.railway === "subway") {
    return { grade: "unknown", supports: false, reason: "bridge-layer-or-subway-not-sufficient" };
  }
  return { grade: "at-grade", supports: false, reason: "no-elevation-tag" };
}

export function isBridgeDeck(tags: Record<string, string>): boolean {
  return tags.man_made === "bridge" || tags.man_made === "viaduct";
}

export function isLandmarkNode(tags: Record<string, string>): string | null {
  if (!tags.name) return null;
  if (tags.tourism) return `tourism:${tags.tourism}`;
  if (tags.historic) return `historic:${tags.historic}`;
  if (tags.railway === "station" || tags.railway === "halt") return "station";
  if (tags.aeroway === "aerodrome" || tags.aeroway === "terminal") return "aerodrome";
  if (tags.amenity === "university" || tags.amenity === "hospital" || tags.amenity === "place_of_worship") {
    return tags.amenity;
  }
  if (tags.leisure === "stadium") return "stadium";
  if (tags.office === "government") return "government";
  return null;
}

export function isMappedTree(tags: Record<string, string>): boolean {
  return tags.natural === "tree";
}

/**
 * Performance prefilter. NOT the city-corporation boundary.
 * Holds DNCC+DSCC and a margin (Demra south, Uttara north, Aminbazar west, Badda/Demra east).
 * Excludes most of Gazipur, Narayanganj city, and rural Dhaka District (Savar, Dhamrai, Dohar).
 */
export const DHAKA_PREFILTER = {
  minLat: 23.65,
  maxLat: 23.92,
  minLon: 90.3,
  maxLon: 90.55,
} as const;

export function inPrefilter(lat: number, lon: number): boolean {
  return (
    lat >= DHAKA_PREFILTER.minLat &&
    lat <= DHAKA_PREFILTER.maxLat &&
    lon >= DHAKA_PREFILTER.minLon &&
    lon <= DHAKA_PREFILTER.maxLon
  );
}

// ---------- Schema v2 attributes: copied from OSM tags, never inferred ----------

type Tags = Record<string, string>;

/** Bangla digits (০–৯) as ASCII. Dhaka mappers write numbers both ways, e.g. building:levels=২. */
export function asciiDigits(raw: string | undefined): string | undefined {
  return raw?.replace(/[\u09E6-\u09EF]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

function intIn(rawTag: string | undefined, min: number, max: number): number | undefined {
  const raw = asciiDigits(rawTag);
  if (raw == null || !/^\s*-?\d+\s*$/.test(raw)) return undefined;
  const v = Number.parseInt(raw, 10);
  return v >= min && v <= max ? v : undefined;
}

function word(raw: string | undefined, max = 40): string | undefined {
  const v = raw?.trim().toLowerCase();
  return v && v.length <= max ? v : undefined;
}

function label(raw: string | undefined, max = 80): string | undefined {
  const v = raw?.trim();
  return v && v.length <= max ? v : undefined;
}

/** Fields a v2 building may carry, with the OSM tag each one copies. */
export const BUILDING_FIELDS: Record<string, string[]> = {
  t: ["building"],
  lv: ["building:levels"],
  mlv: ["building:min_level"],
  mh: ["min_height"],
  mat: ["building:material"],
  roof: ["roof:shape"],
  ly: ["layer"],
  nm: ["name"],
};

/** A plain count such as "5" or "2.5". "5th Floor" or "G+4" is not a level count and is skipped. */
function levelCount(rawTag: string | undefined): number | undefined {
  const raw = asciiDigits(rawTag);
  if (raw == null || !/^\s*\d+(?:[.,]\d+)?\s*$/.test(raw)) return undefined;
  const v = Number(raw.trim().replace(",", "."));
  return v > 0 && v < 150 ? Math.round(v * 2) / 2 : undefined;
}

export function buildingAttrs(tags: Tags): BuildingAttrs {
  const a: BuildingAttrs = {};
  const t = word(tags.building);
  if (t && t !== "yes") a.t = t;
  const lv = levelCount(tags["building:levels"]);
  if (lv) a.lv = lv;
  const mlv = levelCount(tags["building:min_level"]);
  if (mlv) a.mlv = mlv;
  const mh = parseMetres(asciiDigits(tags.min_height));
  if (mh != null && mh > 0 && mh < 600) a.mh = Math.round(mh * 100) / 100;
  const mat = word(tags["building:material"]);
  if (mat) a.mat = mat;
  const roof = word(tags["roof:shape"]);
  if (roof) a.roof = roof;
  const ly = intIn(tags.layer, -5, 10);
  if (ly) a.ly = ly;
  const nm = label(tags.name);
  if (nm) a.nm = nm;
  return a;
}

/** Fields a v2 road may carry, with the OSM tags each one copies. */
export const ROAD_FIELDS: Record<string, string[]> = {
  ln: ["lanes"],
  sw: ["sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right"],
  sf: ["surface"],
  lit: ["lit"],
  mx: ["maxspeed"],
  nm: ["name"],
  nme: ["name:en"],
  ly: ["layer"],
  tn: ["tunnel"],
};

const SIDE_YES = new Set(["yes", "both"]);

/** sidewalk=* and its :both/:left/:right forms, reduced to one value. Untagged stays undefined. */
export function parseSidewalk(tags: Tags): Sidewalk | undefined {
  const main = word(tags.sidewalk);
  if (main === "both" || main === "left" || main === "right" || main === "separate") return main;
  if (main === "no" || main === "none") return "no";
  if (main === "yes") return "both";
  const both = word(tags["sidewalk:both"]);
  if (both === "separate") return "separate";
  if (both && SIDE_YES.has(both)) return "both";
  if (both === "no") return "no";
  const l = word(tags["sidewalk:left"]);
  const r = word(tags["sidewalk:right"]);
  if (l === "separate" || r === "separate") return "separate";
  const ly = l != null && SIDE_YES.has(l);
  const ry = r != null && SIDE_YES.has(r);
  if (ly && ry) return "both";
  if (ly) return "left";
  if (ry) return "right";
  if (l === "no" && r === "no") return "no";
  return undefined;
}

export function parseMaxspeed(raw: string | undefined): number | undefined {
  const m = raw?.match(/^\s*(\d+(?:\.\d+)?)\s*(mph)?\s*$/i);
  if (!m) return undefined;
  const v = Number(m[1]) * (m[2] ? 1.609344 : 1);
  return v > 0 && v <= 150 ? Math.round(v) : undefined;
}

export function roadAttrs(tags: Tags): RoadAttrs {
  const a: RoadAttrs = {};
  const ln = intIn(tags.lanes, 1, 12);
  if (ln) a.ln = ln;
  const sw = parseSidewalk(tags);
  if (sw) a.sw = sw;
  const sf = word(tags.surface);
  if (sf) a.sf = sf;
  if (tags.lit === "yes") a.lit = 1;
  else if (tags.lit === "no") a.lit = 0;
  const mx = parseMaxspeed(asciiDigits(tags.maxspeed));
  if (mx) a.mx = mx;
  const nm = label(tags.name);
  if (nm) a.nm = nm;
  const nme = label(tags["name:en"]);
  if (nme && nme !== nm) a.nme = nme;
  const ly = intIn(tags.layer, -5, 10);
  if (ly) a.ly = ly;
  if (tags.tunnel === "yes" || tags.tunnel === "culvert" || tags.tunnel === "building_passage") a.tn = 1;
  return a;
}

/** One kind per node, checked in this order. The tag each kind reads is in POINT_TAGS. */
export function pointKind(tags: Tags): PointKind | null {
  if (tags.highway === "traffic_signals") return "signal";
  if (tags.highway === "crossing" || tags.footway === "crossing") return "crossing";
  if (tags.highway === "bus_stop") return "bus_stop";
  if (tags.public_transport === "platform" && (tags.bus === "yes" || tags.highway === "platform")) return "platform";
  if (tags.highway === "street_lamp") return "lamp";
  if (tags.power === "tower") return "tower";
  if (tags.barrier === "gate") return "gate";
  return null;
}

export const POINT_TAGS: Record<string, string[]> = {
  signal: ["highway=traffic_signals"],
  crossing: ["highway=crossing", "footway=crossing", "crossing"],
  bus_stop: ["highway=bus_stop", "name"],
  platform: ["public_transport=platform + bus=yes", "name"],
  lamp: ["highway=street_lamp"],
  tower: ["power=tower"],
  gate: ["barrier=gate"],
};

const LANDUSE_SKIP = new Set(["reservoir", "basin", "recreation_ground", "village_green", "forest"]);
const LEISURE_PARK = new Set(["park", "garden", "playground", "pitch", "recreation_ground"]);

/**
 * Landuse value of an area v1 does not already draw as water or park.
 * Non-park leisure areas come back as "leisure:<value>".
 */
export function landuseType(tags: Tags): string | null {
  if (isWaterArea(tags) || isPark(tags) || isBuilding(tags)) return null;
  const lu = word(tags.landuse);
  if (lu && !LANDUSE_SKIP.has(lu)) return lu;
  const le = word(tags.leisure);
  if (le && !LEISURE_PARK.has(le)) return `leisure:${le}`;
  return null;
}

const BARRIER_LINES = new Set(["wall", "fence", "retaining_wall", "city_wall", "hedge"]);

export function barrierType(tags: Tags): string | null {
  const b = word(tags.barrier);
  return b && BARRIER_LINES.has(b) ? b : null;
}

export function powerLine(tags: Tags): { t: string; kv?: number } | null {
  if (tags.power !== "line" && tags.power !== "minor_line") return null;
  const volts = Number.parseInt((tags.voltage || "").split(";")[0], 10);
  return Number.isFinite(volts) && volts > 0 ? { t: tags.power, kv: volts / 1000 } : { t: tags.power };
}

const PLACE_KINDS = new Set(["city", "borough", "suburb", "quarter", "neighbourhood", "town", "village", "hamlet", "locality"]);

export function placeKind(tags: Tags): string | null {
  return tags.name && tags.place && PLACE_KINDS.has(tags.place) ? tags.place : null;
}
