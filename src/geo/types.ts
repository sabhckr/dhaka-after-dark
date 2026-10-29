export type HeightSource = "measured" | "estimated";

export type ChunkFile = {
  v: 1;
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
};

export type RoadRec = {
  id: number;
  cls: string;
  w: number;
  we: boolean;
  y: number;
  bridge: boolean;
  pts: number[];
};

export type BuildingRec = {
  id: number;
  h: number;
  hs: HeightSource;
  outer: number[];
  holes?: number[][];
};

export type PolyRec = { id: number; outer: number[]; holes?: number[][] };
export type CanalRec = { id: number; w: number; pts: number[] };
export type RailRec = { id: number; y: number; pts: number[] };
export type TreeRec = { x: number; z: number; h: number; k: "mapped" | "approx" };
export type LandmarkRec = { id: number; name: string; cat: string; x: number; z: number };
export type NodeRec = { id: string; x: number; z: number };
export type EdgeRec = {
  id: string;
  a: string;
  b: string;
  way: number;
  cls: string;
  oneway: -1 | 0 | 1;
  pts: number[];
};

export type Manifest = {
  v: 1;
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
