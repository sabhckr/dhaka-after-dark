export type HeightSource = "measured" | "estimated";

/** Chunk schema versions the runtime reads. v2 only adds optional fields and layers; see docs/world-schema-v2.md. */
export type ChunkVersion = 1 | 2;

export type ChunkFile = {
  v: ChunkVersion;
  ix: number;
  iy: number;
  /** World-space min corner (metres). Coordinates below are absolute world metres. */
  origin: [number, number];
  roads: RoadRec[];
  buildings: BuildingRec[];
  water: PolyRec[];
  canals: CanalRec[];
  parks: PolyRec[];
  rails: RailRec[];
  plazas: PolyRec[];
  bridges: PolyRec[];
  trees: TreeRec[];
  landmarks: LandmarkRec[];
  graph: { nodes: NodeRec[]; edges: EdgeRec[] };
  /** v2: OSM point features (signals, crossings, stops, lamps, towers, gates). */
  points?: PointRec[];
  /** v2: landuse and non-park leisure polygons. */
  landuse?: LanduseRec[];
  /** v2: walls, fences and other linear barriers. */
  barriers?: LineRec[];
  /** v2: overhead power lines. */
  power?: PowerRec[];
};

export type RoadRec = {
  id: number;
  cls: string;
  w: number;
  we: boolean;
  y: number;
  bridge: boolean;
  pts: number[];
} & RoadAttrs;

/** v2 road attributes. Each is copied from one OSM tag (see ROAD_FIELDS) and absent when untagged. */
export type RoadAttrs = {
  /** lanes */
  ln?: number;
  /** sidewalk / sidewalk:both|left|right, normalised */
  sw?: Sidewalk;
  /** surface */
  sf?: string;
  /** lit: 1 yes, 0 no */
  lit?: 0 | 1;
  /** maxspeed in km/h */
  mx?: number;
  /** name (local), name:en when present */
  nm?: string;
  nme?: string;
  /** layer when not 0 */
  ly?: number;
  /** tunnel=yes|culvert|building_passage */
  tn?: 1;
};

export type Sidewalk = "both" | "left" | "right" | "no" | "separate";

export type BuildingRec = {
  id: number;
  h: number;
  hs: HeightSource;
  outer: number[];
  holes?: number[][];
} & BuildingAttrs;

/** v2 building attributes. Each is copied from one OSM tag (see BUILDING_FIELDS) and absent when untagged. */
export type BuildingAttrs = {
  /** building=* when it is not "yes" */
  t?: string;
  /** building:levels */
  lv?: number;
  /** building:min_level */
  mlv?: number;
  /** min_height in metres */
  mh?: number;
  /** building:material */
  mat?: string;
  /** roof:shape */
  roof?: string;
  /** layer when not 0 */
  ly?: number;
  /** name */
  nm?: string;
};

export type PolyRec = { id: number; outer: number[]; holes?: number[][] };
export type CanalRec = { id: number; w: number; pts: number[] };
export type RailRec = { id: number; y: number; pts: number[] };
export type TreeRec = { x: number; z: number; h: number; k: "mapped" | "approx" };
export type LandmarkRec = { id: number; name: string; cat: string; x: number; z: number };
export type NodeRec = {
  id: string;
  x: number;
  z: number;
  /** v2: an OSM highway=traffic_signals node sits on this exact graph node (1 cm). */
  sig?: 1;
  /** v2: an OSM crossing node sits on this exact graph node (1 cm). */
  cr?: 1;
};

export type PointKind = "signal" | "crossing" | "bus_stop" | "platform" | "lamp" | "tower" | "gate";

/** v2 point feature. `id` is the OSM node id. */
export type PointRec = {
  id: number;
  k: PointKind;
  x: number;
  z: number;
  /** crossing=* type for crossings */
  ct?: string;
  /** name, for stops and platforms */
  nm?: string;
};

/** v2 landuse polygon. `t` is the landuse value, or "leisure:<value>" for leisure areas that are not parks. */
export type LanduseRec = PolyRec & { t: string };
export type LineRec = { id: number; t: string; pts: number[] };
export type PowerRec = { id: number; t: string; pts: number[]; kv?: number };
export type EdgeRec = {
  id: string;
  a: string;
  b: string;
  way: number;
  cls: string;
  oneway: -1 | 0 | 1;
  pts: number[];
};

/** v2: a `place=*` node, for district character. */
export type PlaceRec = {
  id: number;
  kind: string;
  name: string;
  nameEn?: string;
  lon: number;
  lat: number;
  x: number;
  z: number;
};

/** Where one v2 field comes from. Data fields are OSM only; rules live in src/geo/infer.ts. */
export type FieldSource = { field: string; src: "osm"; tags: string[]; count: number };

export type Manifest = {
  v: ChunkVersion;
  name: string;
  generatedAt: string;
  crs: "EPSG:32646";
  origin: { easting: number; northing: number };
  axis: "x=east, y=up (local datum, not DEM), z=-north";
  chunkSize: number;
  boundary: {
    status: "osm-relation" | "provisional-bbox";
    kind: string;
    id: string;
    note: string;
    relationIds: number[];
    areaKm2: number;
    bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  };
  counts: Record<string, number>;
  chunks: {
    key: string;
    ix: number;
    iy: number;
    bytes: number;
    counts: Record<string, number>;
  }[];
  warnings: string[];
  spawns: Spawn[];
  sources: { name: string; url: string; license: string; retrieved: string; note: string }[];
  gaps: string[];
  /** v2: the source and coverage of every added field. */
  fields?: FieldSource[];
};

export type Spawn = {
  id: string;
  name: string;
  lon: number;
  lat: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
};
