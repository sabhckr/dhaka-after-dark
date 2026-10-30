import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { worldOutRefusal } from "../../scripts/geo/out-guard.ts";
import { planChunk } from "../npc/nav.ts";
import { solidsFromChunk } from "../viewer/solids.ts";
import { assembleWorld, type WorldFeature } from "./assemble.ts";
import { worldToChunk } from "./chunks.ts";
import {
  barrierType,
  buildingAttrs,
  landuseType,
  parseMaxspeed,
  parseSidewalk,
  placeKind,
  pointKind,
  powerLine,
  roadAttrs,
} from "./classify.ts";
import { normalizeChunk, toV1, upgradeV1 } from "./compat.ts";
import { lonLatToWorld } from "./crs.ts";
import { graphNodeId } from "./graph.ts";
import {
  buildingBase,
  buildingElevated,
  buildingLevels,
  districtAt,
  roadLanes,
  roadSidewalk,
} from "./infer.ts";
import type { BuildingRec, ChunkFile, PlaceRec, RoadRec } from "./types.ts";
import { validateChunk, validateManifest } from "./validate.ts";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SHIPPED = path.join(ROOT, "public/world");

const square = (x: number, z: number, s: number): [number, number][] => [
  [x, z],
  [x + s, z],
  [x + s, z + s],
  [x, z + s],
];

/** Two roads meeting at (100, 50), a building across the chunk border, a signal on the junction and one off it. */
function sampleFeatures(): WorldFeature[] {
  return [
    {
      kind: "road",
      id: 1,
      cls: "primary",
      width: 11,
      widthEstimated: true,
      y: 0.28,
      bridge: false,
      oneway: 0,
      pts: [
        [10, 50],
        [100, 50],
      ],
      attrs: { ln: 4, sw: "both", nm: "Kazi Nazrul Islam Avenue", lit: 1 },
    },
    {
      kind: "road",
      id: 2,
      cls: "residential",
      width: 5,
      widthEstimated: true,
      y: 0.28,
      bridge: false,
      oneway: 0,
      pts: [
        [100, 50],
        [100, 140],
      ],
    },
    {
      kind: "building",
      id: 9,
      h: 18,
      hs: "measured",
      outer: square(480, 10, 40),
      holes: [],
      attrs: { t: "commercial", lv: 5, mat: "brick" },
    },
    { kind: "point", id: 70, k: "signal", x: 100, z: 50 },
    { kind: "point", id: 71, k: "signal", x: 60.004, z: 50 },
    { kind: "point", id: 72, k: "crossing", x: 100, z: 90, ct: "zebra" },
    { kind: "point", id: 73, k: "lamp", x: 700, z: 20 },
    { kind: "landuse", id: 80, t: "residential", outer: square(450, 200, 100), holes: [] },
    {
      kind: "barrier",
      id: 81,
      t: "wall",
      pts: [
        [20, 300],
        [80, 300],
      ],
    },
    {
      kind: "power",
      id: 82,
      t: "line",
      kv: 132,
      pts: [
        [0, 400],
        [900, 400],
      ],
    },
  ];
}

const ser = (chunks: Map<string, ChunkFile>, map: (c: ChunkFile) => ChunkFile = (c) => c) =>
  [...chunks.keys()].sort().map((k) => JSON.stringify(map(chunks.get(k)!)));

test("building tags copy into v2 attributes and nothing is invented", () => {
  assert.deepEqual(
    buildingAttrs({
      building: "Commercial",
      "building:levels": "6",
      min_height: "4.5 m",
      "building:material": "Brick",
      "roof:shape": "flat",
      layer: "1",
      name: "Bashundhara City",
    }),
    { t: "commercial", lv: 6, mh: 4.5, mat: "brick", roof: "flat", ly: 1, nm: "Bashundhara City" },
  );
  assert.deepEqual(buildingAttrs({ building: "yes" }), {});
  assert.deepEqual(
    buildingAttrs({ building: "yes", "building:levels": "lots", layer: "x", min_height: "-3" }),
    {},
  );
  assert.equal(buildingAttrs({ building: "yes", "building:levels": "2.5" }).lv, 2.5);
  // Found by the OSM check: an address note in the levels tag is not a level count.
  assert.equal(buildingAttrs({ building: "office", "building:levels": "5th Floor" }).lv, undefined);
  assert.equal(buildingAttrs({ building: "yes", "building:levels": "G+4" }).lv, undefined);
  // Also found by the OSM check: levels written in Bangla digits.
  assert.equal(buildingAttrs({ building: "yes", "building:levels": "৮" }).lv, 8);
  assert.equal(buildingAttrs({ building: "yes", "building:levels": "১২" }).lv, 12);
  assert.equal(roadAttrs({ highway: "primary", lanes: "৪" }).ln, 4);
  assert.equal(buildingAttrs({ building: "yes", "building:min_level": "3" }).mlv, 3);
  assert.equal(buildingAttrs({ building: "yes", layer: "0" }).ly, undefined);
});

test("road tags copy into v2 attributes", () => {
  assert.deepEqual(
    roadAttrs({
      highway: "primary",
      lanes: "4",
      sidewalk: "both",
      surface: "Asphalt",
      lit: "yes",
      maxspeed: "40",
      name: "মিরপুর রোড",
      "name:en": "Mirpur Road",
      layer: "1",
      tunnel: "yes",
    }),
    {
      ln: 4,
      sw: "both",
      sf: "asphalt",
      lit: 1,
      mx: 40,
      nm: "মিরপুর রোড",
      nme: "Mirpur Road",
      ly: 1,
      tn: 1,
    },
  );
  assert.deepEqual(roadAttrs({ highway: "residential" }), {});
  assert.deepEqual(
    roadAttrs({ highway: "residential", lanes: "0", maxspeed: "fast", lit: "maybe" }),
    {},
  );
  assert.equal(roadAttrs({ highway: "residential", name: "A", "name:en": "A" }).nme, undefined);
  assert.equal(roadAttrs({ highway: "residential", lit: "no" }).lit, 0);
});

test("sidewalk forms reduce to one value; untagged stays unknown", () => {
  assert.equal(parseSidewalk({ sidewalk: "none" }), "no");
  assert.equal(parseSidewalk({ sidewalk: "yes" }), "both");
  assert.equal(parseSidewalk({ "sidewalk:both": "separate" }), "separate");
  assert.equal(parseSidewalk({ "sidewalk:both": "yes" }), "both");
  assert.equal(parseSidewalk({ "sidewalk:left": "yes", "sidewalk:right": "no" }), "left");
  assert.equal(parseSidewalk({ "sidewalk:left": "yes", "sidewalk:right": "yes" }), "both");
  assert.equal(parseSidewalk({ "sidewalk:right": "yes" }), "right");
  assert.equal(parseSidewalk({ "sidewalk:left": "no", "sidewalk:right": "no" }), "no");
  assert.equal(parseSidewalk({ "sidewalk:left": "no" }), undefined);
  assert.equal(parseSidewalk({}), undefined);
  assert.equal(parseMaxspeed("30 mph"), 48);
  assert.equal(parseMaxspeed("BD:urban"), undefined);
  assert.equal(parseMaxspeed("0"), undefined);
});

test("point, landuse, barrier, power and place tags", () => {
  assert.equal(pointKind({ highway: "traffic_signals", crossing: "traffic_signals" }), "signal");
  assert.equal(pointKind({ highway: "crossing", crossing: "zebra" }), "crossing");
  assert.equal(pointKind({ footway: "crossing" }), "crossing");
  assert.equal(pointKind({ highway: "bus_stop", public_transport: "platform" }), "bus_stop");
  assert.equal(pointKind({ public_transport: "platform", bus: "yes" }), "platform");
  assert.equal(pointKind({ public_transport: "platform", train: "yes" }), null);
  assert.equal(pointKind({ highway: "street_lamp" }), "lamp");
  assert.equal(pointKind({ power: "tower" }), "tower");
  assert.equal(pointKind({ barrier: "gate" }), "gate");
  assert.equal(pointKind({ amenity: "cafe" }), null);
  assert.equal(landuseType({ landuse: "residential" }), "residential");
  assert.equal(landuseType({ leisure: "stadium" }), "leisure:stadium");
  // Already drawn by v1 as park, water or building: never a second time as landuse.
  assert.equal(landuseType({ leisure: "park" }), null);
  assert.equal(landuseType({ landuse: "forest" }), null);
  assert.equal(landuseType({ landuse: "reservoir" }), null);
  assert.equal(landuseType({ landuse: "grass", natural: "water" }), null);
  assert.equal(landuseType({ landuse: "commercial", building: "yes" }), null);
  assert.equal(barrierType({ barrier: "wall" }), "wall");
  assert.equal(barrierType({ barrier: "bollard" }), null);
  assert.deepEqual(powerLine({ power: "line", voltage: "132000;33000" }), { t: "line", kv: 132 });
  assert.deepEqual(powerLine({ power: "minor_line" }), { t: "minor_line" });
  assert.equal(powerLine({ power: "cable" }), null);
  assert.equal(placeKind({ place: "suburb", name: "Dhanmondi" }), "suburb");
  assert.equal(placeKind({ place: "suburb" }), null);
  assert.equal(placeKind({ place: "island", name: "X" }), null);
});

test("a v1 assembly ignores v2 attributes and layers entirely", () => {
  const withV2 = assembleWorld(sampleFeatures(), 500, 1);
  const plain = assembleWorld(
    sampleFeatures()
      .filter((f) => !["point", "landuse", "barrier", "power"].includes(f.kind))
      .map((f) => ({ ...f, attrs: undefined }) as WorldFeature),
    500,
    1,
  );
  assert.deepEqual(ser(withV2.chunks), ser(plain.chunks));
  for (const c of withV2.chunks.values()) {
    assert.equal(c.v, 1);
    assert.equal(c.points, undefined);
    assert.ok(c.roads.every((r) => Object.keys(r).join() === "id,cls,w,we,y,bridge,pts"));
  }
});

test("v2 keeps every v1 record and adds attributes after it (toV1 gives the v1 bytes back)", () => {
  const v1 = assembleWorld(sampleFeatures(), 500, 1);
  const v2 = assembleWorld(sampleFeatures(), 500, 2);
  const v1Keys = [...v1.chunks.keys()];
  // v2 may add chunks that hold only v2 features; every v1 chunk is still there.
  for (const k of v1Keys) assert.ok(v2.chunks.has(k), k);
  for (const k of v1Keys)
    assert.equal(JSON.stringify(toV1(v2.chunks.get(k)!)), JSON.stringify(v1.chunks.get(k)));
  const c0 = v2.chunks.get("0_0")!;
  assert.equal(c0.v, 2);
  const avenue = c0.roads.find((r) => r.id === 1)!;
  assert.deepEqual(Object.keys(avenue), [
    "id",
    "cls",
    "w",
    "we",
    "y",
    "bridge",
    "pts",
    "ln",
    "sw",
    "nm",
    "lit",
  ]);
  assert.equal(avenue.nm, "Kazi Nazrul Islam Avenue");
  for (const b of v2.chunks.get("0_0")!.buildings.concat(v2.chunks.get("1_0")!.buildings)) {
    assert.equal(b.t, "commercial");
    assert.equal(b.lv, 5);
  }
  for (const c of v2.chunks.values())
    for (const e of validateChunk(c)) assert.fail(`${c.ix}_${c.iy}: ${e}`);
  for (const c of v1.chunks.values())
    for (const e of validateChunk(c)) assert.fail(`${c.ix}_${c.iy}: ${e}`);
});

test("signals and crossings flag a graph node only when they sit on it", () => {
  const v2 = assembleWorld(sampleFeatures(), 500, 2);
  const nodes = v2.chunks.get("0_0")!.graph.nodes;
  const junction = nodes.find((n) => n.id === graphNodeId(100, 50))!;
  assert.equal(junction.sig, 1);
  assert.equal(
    nodes.filter((n) => n.sig).length,
    1,
    "the signal 40 m up the approach is a point only",
  );
  assert.equal(
    nodes.filter((n) => n.cr).length,
    0,
    "the crossing at (100, 90) is mid-edge, not a node",
  );
  assert.equal(v2.counts.graphSignals, 1);
  assert.equal(v2.counts["points.signal"], 2);
  assert.equal(v2.counts["points.crossing"], 1);
  assert.equal(v2.counts["roads.ln"], 1);
  assert.equal(v2.counts["buildings.t"], 1, "a footprint split over two chunks counts once");
  const pts = v2.chunks.get("0_0")!.points!;
  assert.deepEqual(
    pts.find((p) => p.id === 72),
    { id: 72, k: "crossing", x: 100, z: 90, ct: "zebra" },
  );
  assert.ok(
    v2.chunks.get("1_0")!.points!.some((p) => p.id === 73),
    "a lamp lands in the chunk it stands in",
  );
});

test("v2 lines and areas split at chunk borders like v1 layers", () => {
  const v2 = assembleWorld(sampleFeatures(), 500, 2);
  const power = [...v2.chunks.values()].flatMap((c) =>
    c.power!.map((p) => ({ key: `${c.ix}_${c.iy}`, p })),
  );
  assert.deepEqual(power.map((x) => x.key).sort(), ["0_0", "1_0"]);
  assert.ok(power.every((x) => x.p.kv === 132 && x.p.t === "line"));
  const landuse = [...v2.chunks.values()].flatMap((c) => c.landuse!);
  assert.equal(landuse.length, 2);
  assert.ok(landuse.every((l) => l.t === "residential"));
  assert.equal(v2.chunks.get("0_0")!.barriers![0].t, "wall");
  assert.equal(v2.counts.landuse, 1);
  assert.equal(v2.counts.power, 1);
});

test("a point keeps its projected position to the centimetre and its chunk", () => {
  // Sangsad spawn seed: an OSM node position goes through the same projection as every v1 feature.
  const w = lonLatToWorld(90.3786, 23.7625);
  const v2 = assembleWorld([{ kind: "point", id: 1, k: "lamp", x: w.x, z: w.z }], 500, 2);
  const c = worldToChunk(w.x, w.z, 500);
  const p = v2.chunks.get(`${c.ix}_${c.iy}`)!.points![0];
  assert.ok(Math.abs(p.x - w.x) <= 0.005 && Math.abs(p.z - w.z) <= 0.005);
});

test("validation accepts v1 and v2, rejects bad v2 values and unknown versions", () => {
  const v2 = assembleWorld(sampleFeatures(), 500, 2).chunks.get("0_0")!;
  assert.deepEqual(validateChunk(v2), []);
  const bad = structuredClone(v2);
  bad.roads[0].sw = "sometimes" as RoadRec["sw"];
  bad.points!.push({ id: 5, k: "fountain" as never, x: 1, z: 1 });
  bad.buildings.push({ id: 6, h: 9, hs: "estimated", outer: [0, 0, 5, 0, 5, 5], lv: -2 });
  const problems = validateChunk(bad);
  assert.ok(problems.includes(`road 1 sidewalk`));
  assert.ok(problems.includes("point 5"));
  assert.ok(problems.includes("building 6 attribute"));
  const missing = { ...v2 } as Partial<ChunkFile>;
  delete missing.landuse;
  assert.ok(validateChunk(missing).includes("landuse missing"));
  assert.deepEqual(validateChunk(toV1(v2)), []);
  assert.ok(validateChunk({ ...v2, v: 3 }).includes("unsupported chunk version"));
});

test("manifest v2 needs a source for every field", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(SHIPPED, "manifest.json"), "utf8"));
  assert.deepEqual(validateManifest(manifest), [], "shipped manifest validates");
  const { fields: _fields, ...noFields } = manifest;
  assert.deepEqual(validateManifest({ ...noFields, v: 1 }), [], "a v1 manifest needs no fields");
  assert.ok(validateManifest({ ...noFields, v: 2 }).includes("fields"));
  assert.deepEqual(
    validateManifest({
      ...noFields,
      v: 2,
      fields: [{ field: "roads.ln", src: "osm", tags: ["lanes"], count: 3 }],
    }),
    [],
  );
  assert.ok(
    validateManifest({
      ...noFields,
      v: 2,
      fields: [{ field: "roads.ln", src: "guess", tags: [], count: 3 }],
    }).includes("field roads.ln"),
  );
});

test("normalize gives v1 chunks empty v2 layers without touching the original", () => {
  const v1 = assembleWorld(sampleFeatures(), 500, 1).chunks.get("0_0")!;
  const n = normalizeChunk(v1);
  assert.notEqual(n, v1);
  assert.equal(v1.points, undefined);
  assert.deepEqual([n.points, n.landuse, n.barriers, n.power], [[], [], [], []]);
  assert.equal(n.v, 1);
  const v2 = assembleWorld(sampleFeatures(), 500, 2).chunks.get("0_0")!;
  assert.equal(normalizeChunk(v2), v2);
  const up = upgradeV1(v1);
  assert.equal(up.v, 2);
  assert.deepEqual(validateChunk(up), []);
  assert.equal(JSON.stringify(toV1(up)), JSON.stringify(v1));
});

// Shipped chunks: read-only. Around Kawran Bazar, Old Dhaka, Gulshan and Uttara.
const REAL_CHUNKS = ["8_-29", "10_-20", "13_-35", "8_-55"];
// The same Kawran Bazar and Old Dhaka chunks as shipped in v1, before the v2 swap.
const V1_FIXTURES = ["8_-29", "10_-20"];
const fixture = (key: string) =>
  fs.readFileSync(path.join(ROOT, "src/geo/fixtures", `c_${key}.v1.json`), "utf8");

test("shipped chunks load and normalise", () => {
  let checked = 0;
  for (const key of REAL_CHUNKS) {
    const file = path.join(SHIPPED, "chunks", `c_${key}.json`);
    if (!fs.existsSync(file)) continue;
    const chunk = JSON.parse(fs.readFileSync(file, "utf8")) as ChunkFile;
    assert.deepEqual(validateChunk(chunk), [], key);
    assert.deepEqual(validateChunk(normalizeChunk(chunk)), [], key);
    checked++;
  }
  assert.ok(checked >= 3, `only ${checked} sample chunks exist`);
});

test("v1 chunks still load, and the shipped chunk's v1 view is the v1 file byte for byte", () => {
  for (const key of V1_FIXTURES) {
    const text = fixture(key);
    const v1 = JSON.parse(text) as ChunkFile;
    assert.equal(v1.v, 1);
    assert.deepEqual(validateChunk(v1), [], key);
    assert.deepEqual(validateChunk(normalizeChunk(v1)), [], key);
    assert.equal(JSON.stringify(toV1(normalizeChunk(v1))), text, `${key} v1 round trip`);
    const shipped = fs.readFileSync(path.join(SHIPPED, "chunks", `c_${key}.json`), "utf8");
    assert.equal(
      JSON.stringify(toV1(JSON.parse(shipped) as ChunkFile)),
      text,
      `${key} shipped v1 view`,
    );
  }
});

test("runtime consumers read the shipped chunk exactly as its v1 form", () => {
  for (const key of V1_FIXTURES) {
    const v1 = JSON.parse(fixture(key)) as ChunkFile;
    const v2 = normalizeChunk(
      JSON.parse(
        fs.readFileSync(path.join(SHIPPED, "chunks", `c_${key}.json`), "utf8"),
      ) as ChunkFile,
    );
    assert.deepEqual(planChunk(v2), planChunk(v1), `${key} pedestrian plan`);
    assert.deepEqual(solidsFromChunk(v2).plans, solidsFromChunk(v1).plans, `${key} foot plans`);
    const a = solidsFromChunk(v2).bucket;
    const b = solidsFromChunk(v1).bucket;
    assert.ok(b.walls.length > 0, `${key} has collision walls`);
    assert.deepEqual(a, b, `${key} collision`);
    assert.deepEqual(planChunk(upgradeV1(v1)), planChunk(v1), `${key} upgraded v1`);
  }
});

const building = (b: Partial<BuildingRec>): BuildingRec => ({
  id: 1,
  h: 9,
  hs: "estimated",
  outer: [],
  ...b,
});
const road = (r: Partial<RoadRec>): RoadRec => ({
  id: 1,
  cls: "residential",
  w: 5,
  we: true,
  y: 0.28,
  bridge: false,
  pts: [],
  ...r,
});

test("runtime rules say where each value comes from", () => {
  assert.deepEqual(buildingLevels(building({ lv: 7 })), { value: 7, src: "osm" });
  assert.deepEqual(buildingLevels(building({ h: 32, hs: "measured" })), { value: 10, src: "rule" });
  assert.deepEqual(buildingLevels(building({ h: 9 })), { value: 3, src: "default" });
  assert.deepEqual(buildingElevated(building({ mh: 8 })), { value: true, src: "osm" });
  assert.deepEqual(buildingElevated(building({ ly: 1 })), { value: true, src: "rule" });
  assert.deepEqual(buildingElevated(building({})), { value: false, src: "default" });
  assert.deepEqual(buildingBase(building({ mlv: 2 })), { value: 6.4, src: "rule" });
  assert.deepEqual(roadSidewalk(road({ sw: "left" })), { value: "left", src: "osm" });
  assert.deepEqual(roadSidewalk(road({ cls: "primary" })), { value: "both", src: "default" });
  assert.deepEqual(roadSidewalk(road({})), { value: "no", src: "default" });
  assert.deepEqual(roadLanes(road({ ln: 3 })), { value: 3, src: "osm" });
  assert.deepEqual(roadLanes(road({ w: 13, we: false })), { value: 4, src: "rule" });
  assert.deepEqual(roadLanes(road({ cls: "trunk" })), { value: 2, src: "default" });
  const places: PlaceRec[] = [
    { id: 1, kind: "suburb", name: "Dhanmondi", lon: 0, lat: 0, x: 0, z: 0 },
    { id: 2, kind: "city", name: "Dhaka", lon: 0, lat: 0, x: 10, z: 10 },
  ];
  assert.equal(districtAt(places, 100, 100)?.value.name, "Dhanmondi");
  assert.equal(districtAt(places, 100, 100)?.src, "rule");
  assert.equal(districtAt(places, 5000, 0), null);
});

test("the generator refuses to write into shipped world data without the flag", () => {
  const root = "/repo";
  assert.match(worldOutRefusal("/repo/public/world", root, {}) ?? "", /Refusing/);
  assert.match(worldOutRefusal("/repo/public/world/chunks", root, {}) ?? "", /Refusing/);
  assert.match(worldOutRefusal("/repo/public/./world", root, {}) ?? "", /Refusing/);
  assert.equal(worldOutRefusal("/repo/public/world-stage", root, {}), null);
  assert.equal(worldOutRefusal("/tmp/stage", root, {}), null);
  assert.equal(worldOutRefusal("/repo/public/world", root, { WORLD_WRITE_PUBLIC: "1" }), null);
});

test("only the dev server can switch to staged world data", async () => {
  const { worldDataBase } = await import("./world-url.ts");
  assert.equal(worldDataBase("?world=stage", true), "/world-stage");
  assert.equal(worldDataBase("?quality=high&world=stage", true), "/world-stage");
  assert.equal(worldDataBase("?world=stage", false), "/world");
  assert.equal(worldDataBase("?world=../etc", true), "/world");
  assert.equal(worldDataBase("", true), "/world");
});
