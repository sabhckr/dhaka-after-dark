import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as THREE from "three";
import { Timer } from "three";
import { parseChunkKey, worldToChunk } from "@/geo/chunks";
import { lonLatToWorld, worldToLonLat } from "@/geo/crs";
import { indexEdges, nearestRoad, type RoadIndex } from "@/geo/graph";
import type { ShopRec } from "@/geo/shops";
import { ChunkScheduler, releaseChunkResources, type ReleaseBag } from "@/geo/streaming";
import type { ChunkFile, Manifest, Spawn } from "@/geo/types";
import { validateChunk } from "@/geo/validate";
import { applyLook } from "@/viewer/fly";
import { createActor, placeOnGround, stepActor, type RideMode } from "@/viewer/actor";
import { SolidWorld, solidsFromChunk } from "@/viewer/solids";
import { composeWeather, WEATHER_ORDER, weatherLabel, type WeatherId } from "@/viewer/weather";
import { GRADE, PALETTE } from "@/viewer/grade";
import { buildDressing, type Dressing } from "@/viewer/dressing";
import { LOOKS, LOOK_ORDER, easeLook, lerpLook, type LookId } from "@/viewer/looks";
import { createCityMaterials, loadBanglaFont } from "@/viewer/materials";
import { buildChunkObjects, labelFromHit, retileBuildings } from "@/viewer/meshes";
import { BlockBatches } from "@/viewer/block-batch";
import { pixelRatioCap, selectBuildingLod, treesHidden, type BuildingLod, type RenderQuality } from "@/viewer/lod";
import { installViceGrade } from "@/viewer/post";
import { banglaHasInk } from "@/viewer/posters";
import { mountIntegratedAssets } from "@/assets/street";
import { createCityLife, type CityLife } from "@/npc/runtime";
import { createCityTraffic } from "@/traffic/view";
import { censusScene, createFrameProbe } from "@/viewer/perf";
import { farPropsHidden } from "@/viewer/detail";

type Overview = {
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
  roads: { cls: string; pts: number[] }[];
  water: number[][];
  boundary: number[];
};

const SPAWN_FALLBACK: { id: string; name: string }[] = [
  { id: "sangsad", name: "Jatiya Sangsad" },
  { id: "shahbagh", name: "Shahbagh" },
  { id: "motijheel", name: "Motijheel" },
  { id: "gulshan", name: "Gulshan 1" },
  { id: "uttara", name: "Uttara" },
  { id: "sadarghat", name: "Sadarghat" },
  { id: "dhanmondi", name: "Dhanmondi" },
  { id: "kamalapur", name: "Kamalapur station" },
  { id: "airport", name: "Shahjalal airport" },
  { id: "overview", name: "City overview" },
];

const COUNTS_FALLBACK =
  "495,002 footprints · 630 with a measured height tag, the rest estimated · 28,889 roads · 302.4 km² · 1,298 chunks.";

const HUD_FALLBACK = [
  "world  2824.2  48.0  -15396.3",
  "wgs84  23.762500°N  90.378600°E",
  "chunk  5_-31    loaded 0    loading 0",
  "features in memory  0    empty chunks cached 0",
  "fps 0    frame 0.0 ms",
  "draws 0    tris 0",
  "light  Neon night    quality high",
  "nearest road  —",
  "errors  none",
].join("\n");

type EdgeLike = { id: string; a: string; b: string; way: number; cls: string; oneway: -1 | 0 | 1; pts: [number, number][] };

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getPosition: () => { x: number; y: number; z: number };
      setKeys: (codes: string[]) => void;
      setSteer?: (v: number) => void;
      setMode?: (mode: RideMode) => void;
      getMode?: () => RideMode;
    };
    __npc?: {
      toggleDebug: () => boolean;
      snapshot: () => ReturnType<CityLife["snapshot"]>;
      interact: () => string | null;
      snatch: () => string | null;
      setMinutes: (minutes: number) => void;
    };
    __perf?: {
      reset: () => void;
      summary: () => ReturnType<ReturnType<typeof createFrameProbe>["summary"]>;
      census: () => ReturnType<typeof censusScene>;
      batches: () => { staticMeshes: number; instanceMeshes: number; instances: number };
      beginCapture: () => void;
      endCapture: () => void;
      capture: () => Promise<{ ms: number; bytes: number; note: string }>;
      setContactShadows: (enabled: boolean) => void;
      setGroupVisible: (name: string, visible: boolean) => boolean;
      renderer: () => string;
      memory: () => { jsHeapUsed?: number; jsHeapTotal?: number } | null;
      pause: (value: boolean) => void;
      halt: () => void;
      resume: () => void;
    };
  }
}

function makeRenderer(mount: HTMLDivElement) {
  installViceGrade();
  const shot = new URLSearchParams(window.location.search).has("shot");
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: shot,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = GRADE.exposure;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setClearColor(PALETTE.fogNight, 1);
  renderer.shadowMap.enabled = false;
  mount.appendChild(renderer.domElement);
  return renderer;
}

async function fetchChunk(ix: number, iy: number): Promise<ChunkFile | null> {
  const res = await fetch(`/world/chunks/c_${ix}_${iy}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Chunk ${ix}_${iy} failed (${res.status})`);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Chunk ${ix}_${iy} is corrupt JSON`);
  }
  const problems = validateChunk(data);
  if (problems.length) throw new Error(`Chunk ${ix}_${iy}: ${problems[0]}`);
  return data as ChunkFile;
}

export function WorldView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Reading the city manifest");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [spawnId, setSpawnId] = useState("sangsad");
  const [panel, setPanel] = useState(true);
  const [lookId, setLookId] = useState<LookId>("neon");
  const [quality, setQuality] = useState<RenderQuality>("high");
  const [rideMode, setRideMode] = useState<RideMode>("fly");
  const [weatherId, setWeatherId] = useState<WeatherId>("clear");
  const [fontNote, setFontNote] = useState("");
  const spawnIdRef = useRef(spawnId);
  spawnIdRef.current = spawnId;
  const lookRef = useRef(lookId);
  const qualityRef = useRef(quality);
  const rideModeRef = useRef(rideMode);
  const weatherRef = useRef(weatherId);
  rideModeRef.current = rideMode;
  weatherRef.current = weatherId;
  const pendingSpawn = useRef<Spawn | null>(null);
  const apiRef = useRef<{ setLook: (id: LookId) => void; setQuality: (q: RenderQuality) => void } | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch("/world/manifest.json");
        if (!res.ok) throw new Error("Map manifest is missing");
        const data = (await res.json()) as Manifest;
        if (cancel) return;
        setManifest(data);
        const first = data.spawns.find((s) => s.id === "sangsad") || data.spawns[0];
        if (first) setSpawnId(first.id);
        setPhase("ready");
      } catch (err) {
        if (cancel) return;
        setPhase("error");
        setMessage(err instanceof Error ? err.message : "Could not load the map");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!manifest || !mountRef.current) return;
    const mount = mountRef.current;
    let dead = false;
    let stop = () => {};

    void (async () => {
      const qParam = new URLSearchParams(window.location.search).get("quality");
      if (qParam === "low" || qParam === "medium" || qParam === "high") {
        qualityRef.current = qParam;
        setQuality(qParam);
      }
      const fontLoaded = await loadBanglaFont();
      if (dead) return;
      const renderer = makeRenderer(mount);
      const lib = createCityMaterials(renderer, fontLoaded);
      if (dead) {
        lib.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        return;
      }
      const scene = new THREE.Scene();
      const probe = createFrameProbe();
      scene.fog = new THREE.FogExp2(LOOKS.neon.fog, LOOKS.neon.fogDensity);
      const hemi = new THREE.HemisphereLight(PALETTE.hemiNight, PALETTE.shadow, 0.52);
      const sun = new THREE.DirectionalLight(PALETTE.moon, 0.28);
      const rim = new THREE.DirectionalLight(PALETTE.rim, 0.36);
      const fill = new THREE.DirectionalLight(PALETTE.fill, 0.34);
      scene.add(hemi, sun, rim, fill);
      const lights = { hemi, sun, rim, fill };

      const b = manifest.boundary.bbox;
      const corners = [
        [b.minLon, b.minLat],
        [b.maxLon, b.minLat],
        [b.maxLon, b.maxLat],
        [b.minLon, b.maxLat],
      ].map(([lon, lat]) => lonLatToWorld(lon, lat));
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of corners) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(2000, maxX - minX + 800), Math.max(2000, maxZ - minZ + 800)),
        lib.ground,
      );
      ground.name = "ground";
      ground.rotation.x = -Math.PI / 2;
      ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
      ground.receiveShadow = false;
      scene.add(ground);

      const sky = new THREE.Mesh(new THREE.SphereGeometry(3400, 24, 16), lib.sky);
      sky.name = "sky";
      sky.frustumCulled = false;
      sky.raycast = () => {};
      scene.add(sky);

      const rainN = 700;
      const rainPos = new Float32Array(rainN * 3);
      for (let i = 0; i < rainN; i++) {
        rainPos[i * 3] = (Math.random() - 0.5) * 46;
        rainPos[i * 3 + 1] = Math.random() * 26;
        rainPos[i * 3 + 2] = (Math.random() - 0.5) * 46;
      }
      const rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
      const rain = new THREE.Points(
        rainGeo,
        new THREE.PointsMaterial({ color: 0xc5d0d8, size: 0.08, transparent: true, opacity: 0.45, depthWrite: false }),
      );
      rain.frustumCulled = false;
      rain.visible = false;
      scene.add(rain);
      const blocks = new BlockBatches();
      scene.add(blocks.root);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const spawnOf = (id: string): Spawn => manifest.spawns.find((s) => s.id === id) || manifest.spawns[0];
      const initial = spawnOf(spawnIdRef.current);
      const fly = createActor(initial.x, initial.y, initial.z, initial.yaw);
      const solids = new SolidWorld();
      const life = createCityLife(scene, solids);
      const traffic = createCityTraffic(scene, solids);
      let yard: { dispose: () => void } = { dispose: () => {} };
      try {
        const mounted = mountIntegratedAssets(scene);
        solids.setChunk("asset-yard", mounted.bucket);
        yard = mounted;
      } catch {
        /* the map still runs if a prop fails to build */
      }
      const car = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(1.85, 0.62, 4.3),
        new THREE.MeshStandardMaterial({ color: 0x8e949c, roughness: 0.55, metalness: 0.12 }),
      );
      shell.position.y = 0.55;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.5, 2.05),
        new THREE.MeshStandardMaterial({ color: 0x1c242c, roughness: 0.2, metalness: 0.16 }),
      );
      cabin.position.set(0, 1.05, -0.25);
      car.add(shell, cabin);
      car.visible = false;
      scene.add(car);
      // Near/far are view frustum only. Fog density and chunk radii are separate.
      const CAMERA_NEAR = 0.4;
      const CAMERA_FAR = 8000;
      const camera = new THREE.PerspectiveCamera(68, mount.clientWidth / Math.max(1, mount.clientHeight), CAMERA_NEAR, CAMERA_FAR);
      const timer = new Timer();
      timer.connect(document);

      const held = new Set<string>();
      const bags = new Map<string, ReleaseBag & { group: THREE.Group; counts: Record<string, number> }>();
      let detailCell = { ix: Number.NaN, iy: Number.NaN };
      const paintProps = (ix: number, iy: number) => {
        for (const [key, bag] of bags) {
          const cell = parseChunkKey(key);
          const dist = Math.max(Math.abs(cell.ix - ix), Math.abs(cell.iy - iy));
          const showTrees = !treesHidden(dist, qualityRef.current);
          const showDress = !farPropsHidden(dist);
          const trees = bag.group.getObjectByName("trees");
          const dress = bag.group.getObjectByName("dressing");
          if (trees) trees.visible = showTrees;
          if (dress) dress.visible = showDress;
          blocks.setChunkVisible(key, "trees", showTrees);
          blocks.setChunkVisible(key, "dressing", showDress);
        }
      };
      const errors: string[] = [];
      let edgeIndex: RoadIndex | null = null;
      let edgeDirty = true;
      let lastSpeed = 0;
      let lastBlocked = false;
      let lightning = 0;
      let nextBolt = 3.5;
      let frames = 0;
      let fpsAcc = 0;
      let fps = 0;
      let medianMs = 0;
      let pickLabel = "—";
      const overviewRef: { data: Overview | null; plate: HTMLCanvasElement | null } = { data: null, plate: null };

      let fromLook = LOOKS[lookRef.current];
      let toLook = fromLook;
      let blend = 1;

      const paintCity = (id: LookId) => {
        const next = LOOKS[id];
        if (next.id === toLook.id) return;
        fromLook = lerpLook(fromLook, toLook, reduceMotion ? 1 : easeLook(blend));
        toLook = next;
        blend = reduceMotion ? 1 : 0;
      };
      const paintQuality = (q: RenderQuality) => {
        qualityRef.current = q;
        lib.setQuality(q);
        life.setQuality(q);
        traffic.setQuality(q);
        renderer.setPixelRatio(pixelRatioCap(q, window.devicePixelRatio || 1));
        renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
        for (const [key, bag] of bags) {
          const cell = parseChunkKey(key);
          const dist = Number.isFinite(detailCell.ix)
            ? Math.max(Math.abs(cell.ix - detailCell.ix), Math.abs(cell.iy - detailCell.iy))
            : 0;
          const next = selectBuildingLod(dist, q);
          if (bag.group.userData.lod !== next) {
            const chunk = bag.group.userData.chunk as ChunkFile | undefined;
            if (chunk) retileBuildings(bag, chunk, lib.surfaces, next);
          }
          if (bag.group.userData.dressQuality !== q) {
            const chunk = bag.group.userData.chunk as ChunkFile | undefined;
            const old = bag.group.userData.dress as Dressing | undefined;
            if (chunk && old) {
              blocks.dropGroup(key, "dressing");
              old.group.removeFromParent();
              for (const geo of old.geometries) {
                const at = bag.geometries.indexOf(geo);
                if (at >= 0) bag.geometries.splice(at, 1);
                geo.dispose();
              }
              for (const mesh of old.instanced) {
                const at = bag.instanced.indexOf(mesh);
                if (at >= 0) bag.instanced.splice(at, 1);
                (mesh as THREE.Object3D).removeFromParent?.();
                mesh.dispose();
              }
              const shops = (bag.group.userData.shops as ShopRec[] | undefined) ?? [];
              const dress = buildDressing(chunk, shops, lib, q);
              bag.group.add(dress.group);
              bag.geometries.push(...dress.geometries);
              bag.instanced.push(...dress.instanced);
              blocks.absorb(key, cell.ix, cell.iy, dress.group, {
                trees: false,
                dressing: !farPropsHidden(dist),
                rails: false,
              });
              bag.instanced = bag.instanced.filter((mesh) => (mesh as THREE.Object3D).parent != null);
              bag.group.userData.dress = dress;
              bag.group.userData.dressQuality = q;
            }
          }
        }
        if (Number.isFinite(detailCell.ix)) paintProps(detailCell.ix, detailCell.iy);
        paintCity(lookRef.current);
      };

      const rebuildEdges = () => {
        const edges: EdgeLike[] = [];
        for (const bag of bags.values()) {
          const chunk = bag.group.userData.chunk as ChunkFile | undefined;
          if (!chunk) continue;
          for (const e of chunk.graph.edges) {
            const pts: [number, number][] = [];
            for (let i = 0; i < e.pts.length; i += 2) pts.push([e.pts[i], e.pts[i + 1]]);
            edges.push({ ...e, pts });
          }
        }
        edgeIndex = indexEdges(edges, 90);
        edgeDirty = false;
      };

      let signKeys: Set<string> | null = null;
      const knownSigns = async () => {
        if (signKeys) return signKeys;
        signKeys = new Set();
        try {
          const res = await fetch("/world/signs/index.json");
          if (res.ok) {
            const data = (await res.json()) as { chunkKeys?: string[] };
            for (const key of data.chunkKeys || []) signKeys.add(key);
          }
        } catch {
          /* no sign index */
        }
        return signKeys;
      };

      const scheduler = new ChunkScheduler({
        loadRadius: 2,
        unloadRadius: 4,
        maxConcurrent: 3,
        fetchChunk,
        onLoad: (key, ix, iy, data) => {
          if (!data) return;
          const chunk = data as ChunkFile;
          try {
            solids.setChunk(key, solidsFromChunk(chunk).bucket);
            life.onChunk(key, chunk);
            traffic.onChunk(key, chunk);
          } catch (err) {
            errors.push(`${key}: ${err instanceof Error ? err.message : "collision"}`);
          }
          void (async () => {
            let shops: ShopRec[] = [];
            const keys = await knownSigns();
            if (keys.has(`${ix}_${iy}`)) {
              try {
                const res = await fetch(`/world/signs/c_${ix}_${iy}.json`);
                if (res.ok) {
                  const json: unknown = await res.json();
                  if (Array.isArray(json)) shops = json as ShopRec[];
                }
              } catch {
                /* optional sidecar */
              }
            }
            if (dead || !scheduler.loaded.has(key)) return;
            let built: ReturnType<typeof buildChunkObjects>;
            try {
              const dist = Math.max(Math.abs(ix - scheduler.focus.ix), Math.abs(iy - scheduler.focus.iy));
              const lod = selectBuildingLod(dist, qualityRef.current);
              built = buildChunkObjects(chunk, lib.surfaces, lod);
              const dress = buildDressing(chunk, shops, lib, qualityRef.current);
              built.group.add(dress.group);
              built.geometries.push(...dress.geometries);
              built.instanced.push(...dress.instanced);
              blocks.absorb(key, ix, iy, built.group, {
                trees: !treesHidden(dist, qualityRef.current),
                dressing: !farPropsHidden(dist),
                rails: true,
              });
              built.instanced = built.instanced.filter((mesh) => (mesh as THREE.Object3D).parent != null);
              built.group.userData.chunk = chunk;
              built.group.userData.shops = shops;
              built.group.userData.dress = dress;
              built.group.userData.dressQuality = qualityRef.current;
            } catch (err) {
              errors.push(`${key}: ${err instanceof Error ? err.message : "mesh"}`);
              if (errors.length > 6) errors.shift();
              return;
            }
            if (dead || !scheduler.loaded.has(key)) {
              blocks.drop(key);
              releaseChunkResources(built);
              return;
            }
            scene.add(built.group);
            bags.set(key, {
              ...built,
              counts: {
                roads: chunk.roads.length,
                buildings: chunk.buildings.length,
                water: chunk.water.length + chunk.canals.length,
                parks: chunk.parks.length,
                trees: chunk.trees.length,
              },
            });
            paintProps(scheduler.focus.ix, scheduler.focus.iy);
            edgeDirty = true;
          })();
        },
        onUnload: (key) => {
          life.onUnload(key);
          traffic.onUnload(key);
          solids.deleteChunk(key);
          const bag = bags.get(key);
          if (!bag) return;
          blocks.drop(key);
          scene.remove(bag.group);
          releaseChunkResources(bag);
          bags.delete(key);
          edgeDirty = true;
        },
        onError: (key, err) => {
          errors.push(`${key}: ${err.message}`);
          if (errors.length > 6) errors.shift();
        },
      });

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2(0, 0);
      let pickAcc = 0;

      const onKey = (e: KeyboardEvent) => {
        if (e.type === "keydown") {
          held.add(e.code);
          if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
          if (e.code === "KeyR") applySpawn(spawnOf(spawnIdRef.current));
          if (e.code === "KeyH") setPanel((v) => !v);
          if (e.code === "KeyN") life.debug = !life.debug;
          if (e.code === "KeyG") life.interact();
          if (e.code === "KeyF") setRideMode("fly");
          if (e.code === "KeyC") setRideMode("walk");
          if (e.code === "KeyV") setRideMode("drive");
          const lookKey: Record<string, LookId> = {
            Digit1: "day",
            Digit2: "sunset",
            Digit3: "dusk",
            Digit4: "neon",
            Digit5: "wet",
            Digit6: "overcast",
          };
          if (lookKey[e.code]) setLookId(lookKey[e.code]);
        } else held.delete(e.code);
      };
      const onBlur = () => held.clear();
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onKey);
      window.addEventListener("blur", onBlur);

      const canvas = renderer.domElement;
      canvas.addEventListener("click", () => {
        canvas.requestPointerLock?.();
      });
      const onMouse = (e: MouseEvent) => {
        if (document.pointerLockElement !== canvas) return;
        if (fly.mode === "drive") return;
        applyLook(fly, e.movementX, e.movementY);
      };
      window.addEventListener("mousemove", onMouse);

      const resize = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(mount);

      const sticks = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
      (canvas as HTMLCanvasElement & { __sticks?: typeof sticks }).__sticks = sticks;

      const applySpawn = (s: Spawn) => {
        fly.x = s.x;
        fly.y = s.y;
        fly.z = s.z;
        fly.yaw = s.yaw;
        fly.pitch = fly.mode === "walk" ? 0 : -0.25;
        if (fly.mode !== "fly") placeOnGround(fly, solids, fly.mode);
      };

      (window as Window & { __teleport?: (x: number, y: number, z: number, yaw?: number, pitch?: number) => void }).__teleport = (
        x,
        y,
        z,
        yaw,
        pitch,
      ) => {
        fly.x = x;
        fly.y = y;
        fly.z = z;
        if (yaw != null) fly.yaw = yaw;
        if (pitch != null) fly.pitch = pitch;
      };
      (window as Window & { __setQuality?: (q: RenderQuality) => void }).__setQuality = (q) => {
        setQuality(q);
        paintQuality(q);
      };
      (window as Window & { __setLook?: (id: LookId) => void }).__setLook = (id) => {
        lookRef.current = id;
        paintCity(id);
        setLookId(id);
      };
      (window as Window & { __setWeather?: (id: WeatherId) => void }).__setWeather = (id) => {
        weatherRef.current = id;
        setWeatherId(id);
      };
      window.__controlsTest = {
        getYaw: () => fly.yaw,
        getSpeed: () => lastSpeed,
        getPosition: () => ({ x: fly.x, y: fly.y, z: fly.z }),
        setKeys: (codes) => {
          fly.keys = new Set(codes);
          held.clear();
          for (const c of codes) held.add(c);
        },
        setSteer: (v) => {
          held.delete("KeyA");
          held.delete("KeyD");
          if (v > 0.2) held.add("KeyA");
          if (v < -0.2) held.add("KeyD");
        },
        setMode: (mode) => {
          rideModeRef.current = mode;
          placeOnGround(fly, solids, mode);
          setRideMode(mode);
        },
        getMode: () => fly.mode,
      };
      window.__npc = {
        toggleDebug: () => {
          life.debug = !life.debug;
          return life.debug;
        },
        snapshot: () => life.snapshot(),
        interact: () => life.interact(),
        snatch: () => life.snatch(),
        setMinutes: (minutes) => life.setMinutes(minutes),
      };
      window.__perf = {
        reset: () => probe.reset(),
        summary: () => probe.summary(),
        census: () => censusScene(scene),
        batches: () => blocks.stats(),
        beginCapture: () => probe.beginCapture(),
        endCapture: () => probe.endCapture(),
        capture: async () => {
          probe.beginCapture();
          const t0 = performance.now();
          const canvas = renderer.domElement;
          const blob = await new Promise<Blob | null>((resolve) => {
            if (!canvas.toBlob) {
              resolve(null);
              return;
            }
            canvas.toBlob((value) => resolve(value), "image/jpeg", 0.72);
          });
          probe.endCapture();
          return {
            ms: performance.now() - t0,
            bytes: blob?.size ?? 0,
            note: "HTMLCanvasElement.toBlob is outside the frame loop. The readback can still stall the main thread; this does not claim to be non-blocking. preserveDrawingBuffer is off unless ?shot=1, so a late toBlob can be empty.",
          };
        },
        setContactShadows: (enabled: boolean) => traffic.setContactShadows(enabled),
        setGroupVisible: (name, visible) => {
          const obj = scene.getObjectByName(name);
          if (!obj) return false;
          obj.visible = visible;
          return true;
        },
        renderer: () => {
          const gl = renderer.getContext();
          const ext = gl.getExtension("WEBGL_debug_renderer_info");
          const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
          const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          return `${vendor} · ${gpu}`;
        },
        memory: () => {
          const heap = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
          if (!heap) return null;
          return { jsHeapUsed: heap.usedJSHeapSize, jsHeapTotal: heap.totalJSHeapSize };
        },
        pause: (value: boolean) => {
          paused = value;
        },
        halt: () => renderer.setAnimationLoop(null),
        resume: () => renderer.setAnimationLoop(loop),
      };

      fetch("/world/overview.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Overview | null) => {
          overviewRef.data = data;
          if (!data || !miniRef.current) return;
          const plate = document.createElement("canvas");
          plate.width = 280;
          plate.height = 280;
          drawOverview(plate, data);
          overviewRef.plate = plate;
        })
        .catch(() => {});

      let paused = false;
      const loop = (stamp: number) => {
        if (paused) return;
        const gap = probe.begin(performance.now());
        timer.update(stamp);
        const dt = timer.getDelta();
        if (pendingSpawn.current) {
          applySpawn(pendingSpawn.current);
          pendingSpawn.current = null;
        }
        const move = new Set(held);
        if (Math.abs(sticks.moveX) > 0.3 || Math.abs(sticks.moveY) > 0.3) {
          if (sticks.moveY < -0.35) move.add("KeyW");
          if (sticks.moveY > 0.35) move.add("KeyS");
          if (sticks.moveX < -0.35) move.add("KeyA");
          if (sticks.moveX > 0.35) move.add("KeyD");
        }
        if (sticks.lookX || sticks.lookY) {
          if (fly.mode !== "drive") applyLook(fly, sticks.lookX * 18, sticks.lookY * 18, 0.0022);
        }
        fly.keys = move;
        if (fly.mode !== rideModeRef.current) placeOnGround(fly, solids, rideModeRef.current);
        const stepped = stepActor(fly, dt, solids);
        lastSpeed = stepped.speed;
        lastBlocked = stepped.blocked;
        life.tick(dt, { x: fly.x, y: fly.y, z: fly.z, mode: fly.mode, speed: Math.abs(lastSpeed) });
        traffic.tick(Math.min(Math.max(dt, 0), 0.25), { x: fly.x, z: fly.z });
        const cp = Math.cos(fly.pitch);
        const sp = Math.sin(fly.pitch);
        const fx = -Math.sin(fly.yaw);
        const fz = -Math.cos(fly.yaw);
        if (fly.mode === "drive") {
          camera.position.set(fly.x - fx * 9, fly.y + 3.05, fly.z - fz * 9);
          camera.up.set(0, 1, 0);
          camera.lookAt(fly.x + fx * 8, fly.y + 0.35, fly.z + fz * 8);
          car.visible = true;
          car.position.set(fly.x, fly.y - 0.85, fly.z);
          car.rotation.y = fly.yaw + Math.PI;
        } else {
          car.visible = false;
          camera.position.set(fly.x, Math.max(1.4, fly.y), fly.z);
          camera.up.set(0, 1, 0);
          camera.lookAt(fly.x + fx * cp, fly.y + sp, fly.z + fz * cp);
        }
        sky.position.copy(camera.position);
        if (!reduceMotion && blend < 1) blend = Math.min(1, blend + dt / GRADE.transitionSec);
        const settled = reduceMotion || blend >= 1;
        const blended = lerpLook(fromLook, toLook, settled ? 1 : easeLook(blend));
        if (weatherRef.current === "storm" && !reduceMotion) {
          nextBolt -= dt;
          if (nextBolt <= 0) {
            lightning = 1;
            nextBolt = 4.5 + Math.random() * 6;
          }
        } else if (lightning < 0.02) lightning = 0;
        lightning = Math.max(0, lightning - dt * 5.5);
        const look = composeWeather(blended, weatherRef.current, lightning);
        lib.tick(dt, lightning);
        lib.applyLook(look, scene, renderer, lights, settled);
        const high = qualityRef.current === "high";
        const rainMat = rain.material as THREE.PointsMaterial;
        rainMat.opacity = 0.48 * look.rain;
        const underRoof = solids.covered(fly.x, fly.y, fly.z);
        rain.visible = look.rain > 0.04 && high && !reduceMotion && !underRoof;
        if (rain.visible) {
          const attr = rainGeo.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < rainN; i++) {
            const y = attr.getY(i) - dt * 22;
            if (y < -1) {
              attr.setXYZ(i, (Math.random() - 0.5) * 46, 12 + Math.random() * 14, (Math.random() - 0.5) * 46);
            } else attr.setY(i, y);
          }
          attr.needsUpdate = true;
          rain.position.set(fly.x, fly.y, fly.z);
        }
        const here = worldToChunk(fly.x, fly.z, manifest.chunkSize);
        scheduler.update(here.ix, here.iy);
        if (here.ix !== detailCell.ix || here.iy !== detailCell.iy) {
          detailCell = here;
          paintProps(here.ix, here.iy);
        }
        const lodBudget = performance.now() + 8;
        let retiled = false;
        for (const [key, bag] of bags) {
          if (retiled && performance.now() > lodBudget) break;
          const cell = parseChunkKey(key);
          const dist = Math.max(Math.abs(cell.ix - here.ix), Math.abs(cell.iy - here.iy));
          const prev = bag.group.userData.lod as BuildingLod | undefined;
          const next = selectBuildingLod(dist, qualityRef.current, prev);
          if (next === prev) continue;
          const chunk = bag.group.userData.chunk as ChunkFile | undefined;
          if (!chunk) continue;
          retileBuildings(bag, chunk, lib.surfaces, next);
          retiled = true;
        }
        const renderT0 = performance.now();
        renderer.render(scene, camera);
        probe.noteRender(performance.now() - renderT0);

        frames++;
        fpsAcc += dt;
        pickAcc += dt;
        if (pickAcc > 0.25) {
          pickAcc = 0;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(scene.children, true);
          const hit = hits.find((h) => h.object.name !== "ground" && h.object.name !== "sky");
          pickLabel = hit ? labelFromHit(hit) || "ground geometry" : "—";
          if (edgeDirty) rebuildEdges();
        }

        const geo = worldToLonLat(fly.x, fly.z);
        let loadedFeatures = 0;
        for (const bag of bags.values()) {
          loadedFeatures += bag.counts.roads + bag.counts.buildings + bag.counts.water + bag.counts.parks;
        }
        const near = edgeIndex ? nearestRoad(edgeIndex, fly.x, fly.z, 80) : null;
        if (pickRef.current) pickRef.current.textContent = pickLabel;
        paintMini(miniRef.current, overviewRef.plate, overviewRef.data, fly);
        probe.end(performance.now(), renderer.info, gap);
        if (fpsAcc >= 0.4) {
          const snap = probe.summary();
          medianMs = snap.frames > 0 ? snap.gap.median : dt * 1000;
          fps = medianMs > 0 ? 1000 / medianMs : frames / Math.max(fpsAcc, 0.001);
          frames = 0;
          fpsAcc = 0;
        }
        if (hudRef.current) {
          const info = renderer.info;
          hudRef.current.textContent = [
            `world  ${fly.x.toFixed(1)}  ${fly.y.toFixed(1)}  ${fly.z.toFixed(1)}`,
            `wgs84  ${geo.lat.toFixed(6)}°N  ${geo.lon.toFixed(6)}°E`,
            `chunk  ${here.ix}_${here.iy}    loaded ${scheduler.loaded.size}    loading ${scheduler.loadingCount}`,
            `features in memory  ${loadedFeatures}    empty chunks cached ${scheduler.empty.size}`,
            `fps ${fps.toFixed(0)}    frame ${medianMs.toFixed(1)} ms`,
            `draws ${info.render.calls}    tris ${info.render.triangles}`,
            `light  ${LOOKS[lookRef.current].label}    ${weatherLabel(weatherRef.current)}    quality ${qualityRef.current}`,
            `move  ${fly.mode}${lastBlocked ? "    blocked" : ""}`,
            life.hudLine(),
            traffic.hudLine(),
            near ? `nearest road  ${near.cls} way ${near.way}  ${near.dist.toFixed(1)} m` : "nearest road  —",
            errors.length ? `errors  ${errors[errors.length - 1]}` : "errors  none",
          ].join("\n");
        }
      };
      renderer.setAnimationLoop(loop);

      const onMini = (e: MouseEvent) => {
        const canvasEl = miniRef.current;
        const data = overviewRef.data;
        if (!canvasEl || !data) return;
        const rect = canvasEl.getBoundingClientRect();
        const u = (e.clientX - rect.left) / rect.width;
        const v = (e.clientY - rect.top) / rect.height;
        const { minX: x0, maxX: x1, minZ: z0, maxZ: z1 } = data.bounds;
        fly.x = x0 + u * (x1 - x0);
        fly.z = z0 + v * (z1 - z0);
        fly.y = Math.max(fly.y, 40);
      };
      miniRef.current?.addEventListener("click", onMini);

      const ink = fontLoaded && banglaHasInk();
      (window as Window & { __banglaOk?: boolean }).__banglaOk = ink;
      setFontNote(ink ? "" : "Bangla font did not paint. Signs are hidden so they are not gibberish.");
      paintQuality(qualityRef.current);
      apiRef.current = {
        setLook: (id) => {
          lookRef.current = id;
          paintCity(id);
        },
        setQuality: paintQuality,
      };

      stop = () => {
        renderer.setAnimationLoop(null);
        scheduler.dispose();
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("mousemove", onMouse);
        miniRef.current?.removeEventListener("click", onMini);
        observer.disconnect();
        for (const bag of bags.values()) releaseChunkResources(bag);
        bags.clear();
        blocks.dispose();
        yard.dispose();
        life.dispose();
        traffic.dispose();
        solids.deleteChunk("asset-yard");
        shell.geometry.dispose();
        cabin.geometry.dispose();
        (shell.material as THREE.Material).dispose();
        (cabin.material as THREE.Material).dispose();
        ground.geometry.dispose();
        sky.geometry.dispose();
        rainGeo.dispose();
        (rain.material as THREE.Material).dispose();
        lib.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        apiRef.current = null;
        delete window.__controlsTest;
        delete window.__npc;
        delete (window as Window & { __teleport?: unknown }).__teleport;
        delete (window as Window & { __setQuality?: unknown }).__setQuality;
        delete (window as Window & { __setLook?: unknown }).__setLook;
        delete (window as Window & { __setWeather?: unknown }).__setWeather;
        delete window.__perf;
      };
    })();

    return () => {
      dead = true;
      stop();
    };
  }, [manifest]);

  useEffect(() => {
    apiRef.current?.setLook(lookId);
  }, [lookId]);

  useEffect(() => {
    apiRef.current?.setQuality(quality);
  }, [quality]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 800px)").matches) setQuality("low");
  }, []);
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <div ref={mountRef} className="absolute inset-0 touch-none">
        <canvas className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      {phase === "error" && (
        <div className="absolute inset-0 z-20 flex items-center bg-bg p-6">
          <div className="max-w-md">
            <p className="font-display text-3xl text-fg">Map data unavailable</p>
            <p className="mt-2 text-muted">{message}</p>
          </div>
        </div>
      )}
      {phase !== "error" && (
        <>
          <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between gap-3 p-3 sm:p-4">
            <div className="pointer-events-auto max-w-[70%]">
              <p className="font-display text-2xl leading-none tracking-wide text-fg sm:text-3xl">DHAKA</p>
              <p className="font-display text-sm tracking-[0.22em] text-accent">AFTER DARK</p>
              <p className="mt-1 max-w-xs text-xs leading-snug text-muted">
                Real streets and footprints. Shop names are OpenStreetMap tags, not a field survey. Posters are fictional.
              </p>
            </div>
            <div className="pointer-events-auto flex gap-2">
              <Link to="/showroom" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm text-fg">
                Models
              </Link>
              <button
                type="button"
                className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm text-fg"
                onClick={() => setPanel((v) => !v)}
              >
                {panel ? "Hide panel" : "Show panel"}
              </button>
            </div>
          </header>
          {panel && (
            <aside className="absolute bottom-3 left-3 z-10 max-h-[58dvh] w-[min(100%-1.5rem,22rem)] overflow-auto rounded-2xl border border-line bg-surface/90 p-3 backdrop-blur-sm sm:bottom-4 sm:left-4">
              <p className="text-xs text-muted">Light</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {LOOK_ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    data-look={id}
                    className={`min-h-11 rounded-full border px-3 text-xs ${lookId === id ? "border-accent bg-accent text-bg" : "border-line bg-bg text-fg"}`}
                    onClick={() => setLookId(id)}
                  >
                    {LOOKS[id].label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">Move</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(
                  [
                    ["fly", "Fly"],
                    ["walk", "Walk"],
                    ["drive", "Drive"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`min-h-11 rounded-full border px-3 text-xs ${rideMode === id ? "border-accent bg-accent text-bg" : "border-line bg-bg text-fg"}`}
                    onClick={() => setRideMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">Weather</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {WEATHER_ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`min-h-11 rounded-full border px-3 text-xs ${weatherId === id ? "border-accent bg-accent text-bg" : "border-line bg-bg text-fg"}`}
                    onClick={() => setWeatherId(id)}
                  >
                    {weatherLabel(id)}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">Quality</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(["low", "medium", "high"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`min-h-11 rounded-full border px-3 text-xs ${quality === id ? "border-accent bg-accent text-bg" : "border-line bg-bg text-fg"}`}
                    onClick={() => setQuality(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-xs text-muted" htmlFor="spawn">
                Spawn
              </label>
              <select
                id="spawn"
                className="mt-1 min-h-11 w-full rounded-lg border border-line bg-bg px-2 text-sm text-fg"
                value={spawnId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSpawnId(id);
                  const s = manifest?.spawns.find((sp) => sp.id === id);
                  if (s) pendingSpawn.current = s;
                }}
                disabled={!manifest}
              >
                {(manifest?.spawns ?? SPAWN_FALLBACK).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div ref={hudRef} className="mt-3 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-fg tabular-nums">
                {phase === "loading" ? HUD_FALLBACK : ""}
              </div>
              <p className="mt-2 text-xs text-muted">
                Looking at <span ref={pickRef} className="text-fg">{phase === "loading" ? "—" : ""}</span>
              </p>
              {fontNote ? <p className="mt-2 text-xs text-accent">{fontNote}</p> : null}
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Fly is the default: WASD along the view, A and D strafe. Walk is on foot and cannot pass through buildings. Drive is a car — A turns left, D turns right, and walls stop it. F, C, and V switch modes. Q and E yaw. Space up and Ctrl down while flying. Shift is faster. R returns to spawn.
                People on the loaded sidewalks use the same walls as you. G talks, hails a rickshaw or CNG, or buys tea. N shows what the nearest person is doing. They are blockout figures, not skeletal actors. Cars, CNGs, buses, and bikes drive the loaded road graph, stop for a simple signal, and leave a gap. They are not the showroom models.
                Keys 1–6 switch day, sunset, dusk, night, wet, and overcast. The grade stays the same; only the light changes. Click the city for mouse look. Click the map to jump. Models opens the mesh index. A yard of figures and vehicles sits on the service road just north of the Sangsad pad — fly down.
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {manifest
                  ? `${manifest.counts.buildings.toLocaleString()} footprints · ${manifest.counts.buildingsMeasured.toLocaleString()} with a measured height tag, the rest estimated · ${manifest.counts.roads.toLocaleString()} roads · ${manifest.boundary.areaKm2.toFixed(1)} km² · ${manifest.chunks.length.toLocaleString()} chunks.`
                  : COUNTS_FALLBACK}
              </p>
              <p className="mt-2 text-[11px] text-muted">Map © OpenStreetMap contributors, ODbL. Shop names are tags, not verified on site.</p>
            </aside>
          )}
          <canvas
            ref={miniRef}
            width={280}
            height={280}
            className="absolute bottom-3 right-3 z-10 h-36 w-36 rounded-2xl border border-line bg-bg sm:bottom-4 sm:right-4 sm:h-52 sm:w-52"
          />
          <div className="absolute bottom-44 left-3 right-3 z-10 flex justify-between sm:hidden">
            <Stick
              label="Move"
              onChange={(x, y) => {
                const canvas = mountRef.current?.querySelectorAll("canvas");
                const sticks = (canvas?.[canvas.length - 1] as HTMLCanvasElement & { __sticks?: { moveX: number; moveY: number } })?.__sticks;
                if (sticks) {
                  sticks.moveX = x;
                  sticks.moveY = y;
                }
              }}
            />
            <Stick
              label="Look"
              onChange={(x, y) => {
                const canvas = mountRef.current?.querySelectorAll("canvas");
                const sticks = (canvas?.[canvas.length - 1] as HTMLCanvasElement & { __sticks?: { lookX: number; lookY: number } })?.__sticks;
                if (sticks) {
                  sticks.lookX = x;
                  sticks.lookY = y;
                }
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function drawOverview(plate: HTMLCanvasElement, data: Overview) {
  const ctx = plate.getContext("2d");
  if (!ctx) return;
  const w = plate.width;
  const h = plate.height;
  ctx.fillStyle = "#120814";
  ctx.fillRect(0, 0, w, h);
  const { minX, maxX, minZ, maxZ } = data.bounds;
  const sx = (x: number) => ((x - minX) / (maxX - minX || 1)) * w;
  const sy = (z: number) => ((z - minZ) / (maxZ - minZ || 1)) * h;
  ctx.strokeStyle = "#2c4c54";
  ctx.lineWidth = 2;
  for (const ring of data.water) stroke(ctx, ring, sx, sy);
  ctx.strokeStyle = "#c45a78";
  ctx.lineWidth = 1;
  for (const road of data.roads) stroke(ctx, road.pts, sx, sy);
  ctx.strokeStyle = "#ff4d8d";
  ctx.lineWidth = 1.5;
  stroke(ctx, data.boundary, sx, sy);
}

function stroke(
  ctx: CanvasRenderingContext2D,
  pts: number[],
  sx: (x: number) => number,
  sy: (z: number) => number,
) {
  if (pts.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(sx(pts[0]), sy(pts[1]));
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(sx(pts[i]), sy(pts[i + 1]));
  ctx.stroke();
}

function paintMini(
  canvas: HTMLCanvasElement | null,
  plate: HTMLCanvasElement | null,
  data: Overview | null,
  fly: { x: number; y: number; z: number; yaw: number },
) {
  if (!canvas || !plate || !data) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(plate, 0, 0, canvas.width, canvas.height);
  const { minX, maxX, minZ, maxZ } = data.bounds;
  const x = ((fly.x - minX) / (maxX - minX || 1)) * canvas.width;
  const y = ((fly.z - minZ) / (maxZ - minZ || 1)) * canvas.height;
  ctx.save();
  ctx.translate(x, y);
  const fx = -Math.sin(fly.yaw);
  const fz = -Math.cos(fly.yaw);
  ctx.rotate(Math.atan2(fx, -fz));
  ctx.fillStyle = "#ff4d8d";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function Stick({ label, onChange }: { label: string; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let id: number | null = null;
    let origin = { x: 0, y: 0 };
    const pos = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - origin.x) / (r.width / 2);
      const y = (e.clientY - origin.y) / (r.height / 2);
      onChange(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    };
    const down = (e: PointerEvent) => {
      id = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
    };
    const up = (e: PointerEvent) => {
      if (id !== e.pointerId) return;
      id = null;
      onChange(0, 0);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", pos);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", pos);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [onChange]);
  return (
    <div
      ref={ref}
      className="flex h-28 w-28 items-center justify-center rounded-full border border-line bg-surface/80 text-xs text-muted"
      role="application"
      aria-label={label}
    >
      {label}
    </div>
  );
}
