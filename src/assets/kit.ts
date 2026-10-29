import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GRADE } from "../viewer/grade.ts";

const geos = new Map<string, THREE.BufferGeometry>();
const mats = new Map<string, THREE.MeshStandardMaterial>();

function cacheGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = geos.get(key);
  if (!geo) {
    geo = make();
    geos.set(key, geo);
  }
  return geo;
}

export function geoBox(w: number, h: number, d: number): THREE.BufferGeometry {
  return cacheGeo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
}

export function geoCyl(rt: number, rb: number, h: number, seg = 10): THREE.BufferGeometry {
  return cacheGeo(`c${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
}

export function geoSph(r: number, seg = 12): THREE.BufferGeometry {
  return cacheGeo(`s${r}_${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg - 2)));
}

export function geoPlane(w: number, h: number): THREE.BufferGeometry {
  return cacheGeo(`p${w}_${h}`, () => new THREE.PlaneGeometry(w, h));
}

export function std(key: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  let mat = mats.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ roughness: 0.74, metalness: 0.04, ...params });
    mat.userData.shared = true;
    mats.set(key, mat);
  }
  return mat;
}

function paint(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([210, 180, 160, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const data = new Uint8Array([210, 180, 160, 255]);
    const tex = new THREE.DataTexture(data, 1, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

let textures: {
  floral: THREE.Texture;
  lungi: THREE.Texture;
  denim: THREE.Texture;
  plaid: THREE.Texture;
  brick: THREE.Texture;
  wood: THREE.Texture;
} | null = null;

export function TEX() {
  if (textures) return textures;
  textures = {
    floral: paint((ctx, w, h) => {
      ctx.fillStyle = "#148f93";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        const x = (i * 47) % w;
        const y = (i * 29) % h;
        ctx.fillStyle = i % 2 ? "#f4d35e" : "#ff7aa2";
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f7f3ea";
        ctx.fillRect(x - 1, y - 8, 2, 16);
      }
    }, 128, 128),
    lungi: paint((ctx, w, h) => {
      ctx.fillStyle = "#1f6b4a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#f2e3b0";
      ctx.lineWidth = 4;
      for (let x = 0; x < w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.strokeStyle = "#c23b4a";
      for (let y = 0; y < h; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }, 128, 128),
    denim: paint((ctx, w, h) => {
      ctx.fillStyle = "#2c4f86";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#3d69a8";
      ctx.lineWidth = 1;
      for (let i = -h; i < w; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.stroke();
      }
    }, 64, 64),
    plaid: paint((ctx, w, h) => {
      ctx.fillStyle = "#d7c4a4";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#2f6f8f";
      for (let x = 0; x < w; x += 18) ctx.fillRect(x, 0, 6, h);
      ctx.fillStyle = "#b33b3b";
      for (let y = 0; y < h; y += 18) ctx.fillRect(0, y, w, 4);
    }, 96, 96),
    brick: paint((ctx, w, h) => {
      ctx.fillStyle = "#8d3b32";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#c4a08a";
      for (let y = 0; y < h; y += 16) {
        ctx.fillRect(0, y, w, 2);
        const off = y % 32 === 0 ? 0 : 16;
        for (let x = -16 + off; x < w; x += 32) ctx.fillRect(x, y, 2, 16);
      }
    }, 128, 64),
    wood: paint((ctx, w, h) => {
      ctx.fillStyle = "#a87443";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#7a5230";
      ctx.lineWidth = 2;
      for (let y = 6; y < h; y += 10) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + 2);
        ctx.stroke();
      }
    }, 64, 64),
  };
  return textures;
}

export function MAT() {
  const tex = TEX();
  return {
    floral: std("floral", { color: 0xffffff, map: tex.floral, roughness: 0.82 }),
    lungi: std("lungi", { color: 0xffffff, map: tex.lungi, roughness: 0.86 }),
    denim: std("denim", { color: 0xffffff, map: tex.denim, roughness: 0.88 }),
    plaid: std("plaid", { color: 0xffffff, map: tex.plaid, roughness: 0.86 }),
    brick: std("brick", { color: 0xffffff, map: tex.brick, roughness: 0.9 }),
    wood: std("wood", { color: 0xffffff, map: tex.wood, roughness: 0.84 }),
    tire: std("tire", { color: 0x1a1a1a, roughness: 0.94 }),
    rubber: std("rubber", { color: 0x2a2a2a, roughness: 0.9 }),
    chrome: std("chrome", { color: 0xd5dbe2, metalness: 0.72, roughness: 0.28 }),
    glass: std("glass", { color: 0x8fd4d0, roughness: 0.16, metalness: 0.08 }),
    darkGlass: std("darkGlass", { color: 0x243048, roughness: 0.2, metalness: 0.2 }),
    skin: (hex: number) => std(`skin${hex.toString(16)}`, { color: hex, roughness: 0.58 }),
    hair: (hex: number) => std(`hair${hex.toString(16)}`, { color: hex, roughness: 0.72 }),
    cloth: (hex: number) => std(`cloth${hex.toString(16)}`, { color: hex, roughness: 0.78 }),
    paint: (hex: number) => std(`paint${hex.toString(16)}`, { color: hex, roughness: 0.46, metalness: 0.08 }),
    metal: (hex: number) => std(`metal${hex.toString(16)}`, { color: hex, roughness: 0.4, metalness: 0.55 }),
    emit: (hex: number) =>
      std(`emit${hex.toString(16)}`, {
        color: hex,
        emissive: hex,
        emissiveIntensity: Math.min(0.45, GRADE.emitCap),
        roughness: 0.35,
      }),
  };
}

export function blank(w: number, h: number, d: number): THREE.Group {
  const group = new THREE.Group();
  group.userData.size = [w, h, d];
  return group;
}

/** `y` is the vertical center. Geometry objects are shared — never mutate them. */
export function put(
  group: THREE.Group,
  material: THREE.Material,
  kind: "box" | "cyl" | "sph" | "plane",
  size: number[],
  pos: [number, number, number],
  rot?: [number, number, number],
): THREE.Mesh {
  let geo: THREE.BufferGeometry;
  if (kind === "box") geo = geoBox(size[0], size[1], size[2]);
  else if (kind === "cyl") geo = geoCyl(size[0], size[1], size[2], size[3] ?? 10);
  else if (kind === "sph") geo = geoSph(size[0], size[1] ?? 12);
  else geo = geoPlane(size[0], size[1]);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  return mesh;
}

export function wheel(group: THREE.Group, x: number, y: number, z: number, radius = 0.34, width = 0.18): void {
  const m = MAT();
  put(group, m.tire, "cyl", [radius, radius, width, 12], [x, y, z], [0, 0, Math.PI / 2]);
  put(group, m.chrome, "cyl", [radius * 0.42, radius * 0.42, width + 0.02, 8], [x, y, z], [0, 0, Math.PI / 2]);
}

export type Collider = { min: [number, number, number]; max: [number, number, number] };

export function stamp(group: THREE.Group, boxes: Collider[]): void {
  group.userData.colliders = boxes;
  group.userData.colliderLocked = true;
}

export function fitCollider(group: THREE.Group): void {
  if (group.userData.colliderLocked) return;
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  if (!Number.isFinite(box.min.x)) {
    group.userData.colliders = [{ min: [-0.4, 0, -0.4], max: [0.4, 1, 0.4] }];
    return;
  }
  group.userData.colliders = [
    {
      min: [box.min.x, box.min.y, box.min.z] as [number, number, number],
      max: [box.max.x, box.max.y, box.max.z] as [number, number, number],
    },
  ];
}

export function tag(group: THREE.Group, label: string): void {
  group.traverse((obj) => {
    obj.userData.label = label;
  });
}

/** Unique material so the showroom can dispose the canvas without freeing shared paints. */
export function signMaterial(lines: string[], bg: string, fg: string, accent?: string): THREE.MeshStandardMaterial {
  const tex = paint((ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (accent) {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, w, 18);
      ctx.fillRect(0, h - 14, w, 14);
    }
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = lines.length > 1 ? 42 : 54;
    ctx.font = `700 ${size}px "Noto Sans Bengali", "Figtree", sans-serif`;
    lines.forEach((line, i) => {
      const y = h / 2 + (i - (lines.length - 1) / 2) * (size + 8);
      ctx.fillText(line, w / 2, y);
    });
  }, 256, 128);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    roughness: 0.55,
    emissive: 0xfff1d2,
    emissiveIntensity: 0.18,
  });
  mat.userData.unique = true;
  return mat;
}

export function releaseModel(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.uniqueGeo) mesh.geometry?.dispose();
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const entry of list) {
      const mat = entry as THREE.MeshStandardMaterial;
      if (!mat?.userData?.unique) continue;
      mat.map?.dispose();
      mat.dispose();
    }
  });
}

/** One draw per material. Shared source geometries stay in the cache. */
export function weld(group: THREE.Group): THREE.Group {
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const remove: THREE.Mesh[] = [];
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    const list = buckets.get(mesh.material) ?? [];
    list.push(geo);
    buckets.set(mesh.material, list);
    remove.push(mesh);
  });
  for (const mesh of remove) mesh.removeFromParent();
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const geo of geos) geo.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.uniqueGeo = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
  return group;
}
