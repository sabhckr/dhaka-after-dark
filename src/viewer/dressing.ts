import * as THREE from "three";
import type { ChunkFile } from "@/geo/types";
import type { ShopRec } from "@/geo/shops.ts";
import { displayShopName, shopCategory } from "@/geo/shops.ts";
import { POSTER_SPECS } from "@/viewer/copy.ts";
import type { CityMaterials } from "@/viewer/materials.ts";
import { paintShopAtlas } from "@/viewer/posters.ts";
import { canvasTexture } from "@/viewer/proc-tex.ts";
import {
  cableSegments,
  lampPoints,
  pickPosterHosts,
  placeShop,
  posterBudget,
  posterCluster,
  rankShops,
  roofProps,
  type ShopPose,
} from "@/viewer/place.ts";

type Range = { start: number; count: number; label: string };
type Buf = { pos: number[]; uv: number[]; idx: number[]; ranges: Range[] };

function blank(): Buf {
  return { pos: [], uv: [], idx: [], ranges: [] };
}

function pushQuad(s: Buf, x: number, y: number, z: number, yaw: number, roll: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number, label: string) {
  const start = s.idx.length / 3;
  const hw = w / 2;
  const hh = h / 2;
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const base = s.pos.length / 3;
  const corners: [number, number, number, number][] = [
    [-hw, -hh, u0, v0],
    [hw, -hh, u1, v0],
    [hw, hh, u1, v1],
    [-hw, hh, u0, v1],
  ];
  for (const [lx, ly, u, v] of corners) {
    const xr = lx * cr - ly * sr;
    const yr = lx * sr + ly * cr;
    s.pos.push(x + xr * cy, y + yr, z + xr * -sy);
    s.uv.push(u, v);
  }
  s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  s.ranges.push({ start, count: 2, label });
}

function meshOf(s: Buf, material: THREE.Material): THREE.Mesh | null {
  if (s.idx.length < 3) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(s.pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(s.uv, 2));
  geo.setIndex(s.idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.ranges = s.ranges;
  return mesh;
}

function shopLabel(pose: ShopPose): string {
  const name = displayShopName(pose.shop)?.text ?? "";
  const how =
    pose.mode === "footprint"
      ? "same OSM way, facade side guessed, not field-verified"
      : pose.mode === "nearby"
        ? "nearby footprint, approximate, not field-verified"
        : "no footprint, freestanding, approximate, not field-verified";
  return `OSM shop · ${name} · ${pose.shop.t} ${pose.shop.id} · ${how}`;
}

export type Dressing = {
  group: THREE.Group;
  geometries: { dispose: () => void }[];
  instanced: { dispose: () => void }[];
  posters: THREE.Group;
  cables: THREE.Object3D | null;
};

export function buildDressing(chunk: ChunkFile, shops: ShopRec[], lib: CityMaterials, quality: "low" | "high"): Dressing {
  const group = new THREE.Group();
  group.name = "dressing";
  const geometries: { dispose: () => void }[] = [];
  const instanced: { dispose: () => void }[] = [];
  const buildings = chunk.buildings;

  const poses = rankShops(shops, quality === "high" ? 28 : 8)
    .map((shop) => placeShop(shop, buildings))
    .filter((pose): pose is ShopPose => pose != null);
  if (poses.length && lib.fontOk) {
    const painted = paintShopAtlas(
      poses.map((pose) => ({
        text: displayShopName(pose.shop)?.text ?? "",
        category: shopCategory(pose.shop),
      })),
    );
    if (painted) {
      const tex = canvasTexture(painted.canvas, true, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(0xfff1dd),
        emissiveMap: tex,
        emissiveIntensity: lib.levels.shopEmit,
        roughness: 0.68,
        metalness: 0.04,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      lib.trackShop(mat);
      const buf = blank();
      poses.forEach((pose, i) => {
        const uv = painted.uvs[i];
        if (!uv) return;
        pushQuad(buf, pose.x, pose.y, pose.z, pose.yaw, 0, pose.w, pose.h, uv.u0, uv.v0, uv.u1, uv.v1, shopLabel(pose));
      });
      const mesh = meshOf(buf, mat);
      if (mesh) {
        group.add(mesh);
        geometries.push(mesh.geometry);
        geometries.push({
          dispose: () => {
            tex.dispose();
            lib.untrackShop(mat);
            mat.dispose();
          },
        });
      }
    }
  }

  const posters = new THREE.Group();
  posters.name = "posters";
  const claimed = new Set(poses.map((pose) => pose.buildingId).filter((id): id is number => id != null));
  if (lib.fontOk && lib.cells.length === POSTER_SPECS.length) {
    const hosts = pickPosterHosts(buildings, posterBudget(buildings.length, chunk.ix, chunk.iy, "high"), 0x51ed);
    const buckets = lib.sheets.map(() => blank());
    for (const host of hosts) {
      if (claimed.has(host.id)) continue;
      const cluster = posterCluster(host, POSTER_SPECS.length, chunk.ix * 131 + chunk.iy);
      for (const pose of cluster) {
        const spec = POSTER_SPECS[pose.specIndex];
        const cell = lib.cells[pose.specIndex];
        if (!spec || !cell) continue;
        pushQuad(
          buckets[cell.sheet],
          pose.x,
          pose.y,
          pose.z,
          pose.yaw,
          pose.roll,
          pose.w,
          pose.h,
          cell.u0,
          cell.v0,
          cell.u1,
          cell.v1,
          `fictional ${spec.kind} · ${spec.title}`,
        );
      }
    }
    buckets.forEach((buf, i) => {
      const mat = lib.sheets[i]?.mat;
      if (!mat) return;
      const mesh = meshOf(buf, mat);
      if (!mesh) return;
      posters.add(mesh);
      geometries.push(mesh.geometry);
    });
  }
  group.add(posters);

  const lamps = lampPoints(chunk.roads, quality === "high" ? 70 : 28);
  if (lamps.length) {
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 1, 5);
    const headGeo = new THREE.SphereGeometry(0.22, 6, 5);
    const poles = new THREE.InstancedMesh(poleGeo, lib.pole, lamps.length);
    const heads = new THREE.InstancedMesh(headGeo, lib.head, lamps.length);
    const dummy = new THREE.Object3D();
    lamps.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 4, p.z);
      dummy.scale.set(1, 8, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, p.y + 8.15, p.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    group.add(poles, heads);
    geometries.push(poleGeo, headGeo);
    instanced.push(poles, heads);
  }

  const props = roofProps(buildings, quality === "high" ? 120 : 40);
  if (props.tanks.length) {
    const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.7, 8);
    const mesh = new THREE.InstancedMesh(geo, lib.tank, props.tanks.length);
    const dummy = new THREE.Object3D();
    props.tanks.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 0.4, t.z);
      dummy.scale.set(t.s, 1, t.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    geometries.push(geo);
    instanced.push(mesh);
  }
  if (props.antennas.length) {
    const geo = new THREE.CylinderGeometry(0.03, 0.04, 1, 4);
    const mesh = new THREE.InstancedMesh(geo, lib.antenna, props.antennas.length);
    const dummy = new THREE.Object3D();
    props.antennas.forEach((a, i) => {
      dummy.position.set(a.x, a.y + a.h / 2, a.z);
      dummy.scale.set(1, a.h, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    geometries.push(geo);
    instanced.push(mesh);
  }

  let cables: THREE.LineSegments | null = null;
  const segs = cableSegments(buildings, 40);
  if (segs.length >= 6) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    cables = new THREE.LineSegments(geo, lib.cable);
    cables.visible = quality === "high";
    group.add(cables);
    geometries.push(geo);
  }

  return { group, geometries, instanced, posters, cables };
}
