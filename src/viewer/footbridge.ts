import * as THREE from "three";
import type { FootPlan } from "./solids.ts";
import { miterOutline } from "./roads.ts";

function ribbonTop(
  s: { pos: number[]; uv: number[]; col: number[]; idx: number[] },
  pts: number[],
  ys: number[],
  half: number,
  lift: number,
  tint: [number, number, number],
) {
  const outline = miterOutline(pts, half);
  const n = outline.dist.length;
  if (n < 2 || ys.length === 0) return;
  const yAt = (sample: number) => {
    const src = outline.src[sample] ?? 0;
    const y = ys[Math.min(ys.length - 1, Math.max(0, src))] ?? ys[0];
    return y + lift;
  };
  const base = s.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const y = yAt(i);
    s.pos.push(outline.left[i * 2], y, outline.left[i * 2 + 1]);
    s.uv.push(0, outline.dist[i] / 2.4);
    s.col.push(...tint);
    s.pos.push(outline.right[i * 2], y, outline.right[i * 2 + 1]);
    s.uv.push(1, outline.dist[i] / 2.4);
    s.col.push(...tint);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = base + i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    s.idx.push(a, c, b, b, c, d);
  }
}

function pier(s: { pos: number[]; uv: number[]; col: number[]; idx: number[] }, x: number, z: number, y0: number, y1: number, r: number) {
  const sides = 6;
  const base = s.pos.length / 3;
  const tint: [number, number, number] = [0.78, 0.74, 0.68];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    s.pos.push(x + Math.cos(a) * r, y0, z + Math.sin(a) * r);
    s.uv.push(i / sides, 0);
    s.col.push(...tint);
    s.pos.push(x + Math.cos(a) * r, y1, z + Math.sin(a) * r);
    s.uv.push(i / sides, 1);
    s.col.push(tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.88);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const a = base + i * 2;
    const b = a + 1;
    const c = base + j * 2;
    const d = c + 1;
    s.idx.push(a, c, b, b, c, d);
  }
}

/** Original concrete-and-rail meshes. Shared materials only. */
export function buildFootBridgeMeshes(plans: FootPlan[], deck: THREE.Material, rail: THREE.Material): THREE.Mesh[] {
  if (!plans.length) return [];
  const concrete = { pos: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
  const metal = { pos: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
  const cream: [number, number, number] = [0.72, 0.68, 0.62];
  const steel: [number, number, number] = [0.38, 0.4, 0.42];
  for (const plan of plans) {
    ribbonTop(concrete, plan.deckPts, plan.deckYs, plan.half, 0.02, cream);
    ribbonTop(concrete, plan.deckPts, plan.deckYs.map((y) => y - 0.28), plan.half * 0.82, 0, [0.55, 0.52, 0.48]);
    for (const stair of plan.stairs) ribbonTop(concrete, stair.pts, stair.ys, stair.half, 0.02, cream);
    for (const p of plan.piers) pier(concrete, p.x, p.z, p.y0, p.y1, p.r);
    const railY = plan.deckYs.map((y) => y + 0.55);
    ribbonTop(metal, plan.deckPts, railY, plan.half, 0.08, steel);
    ribbonTop(metal, plan.deckPts, plan.deckYs.map((y) => y + 0.08), plan.half, 0.42, [0.62, 0.6, 0.56]);
    const n = plan.deckPts.length / 2;
    let walked = 0;
    let nextPost = 1.2;
    for (let i = 1; i < n; i++) {
      const ax = plan.deckPts[(i - 1) * 2];
      const az = plan.deckPts[(i - 1) * 2 + 1];
      const bx = plan.deckPts[i * 2];
      const bz = plan.deckPts[i * 2 + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;
      while (nextPost <= walked + len) {
        const t = (nextPost - walked) / len;
        const x = ax + dx * t;
        const z = az + dz * t;
        const y = plan.deckYs[Math.min(i, plan.deckYs.length - 1)];
        const ox = (-dz / len) * plan.half;
        const oz = (dx / len) * plan.half;
        pier(metal, x + ox, z + oz, y + 0.05, y + 0.95, 0.045);
        pier(metal, x - ox, z - oz, y + 0.05, y + 0.95, 0.045);
        nextPost += 2.4;
      }
      walked += len;
    }
    for (const stair of plan.stairs) {
      ribbonTop(metal, stair.pts, stair.ys.map((y) => y + 0.45), stair.half, 0.22, steel);
    }
  }
  const out: THREE.Mesh[] = [];
  const make = (buf: typeof concrete, material: THREE.Material, name: string) => {
    if (buf.idx.length < 3) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(buf.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(buf.col, 3));
    geo.setIndex(buf.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    out.push(mesh);
  };
  make(concrete, deck, "footbridge");
  make(metal, rail, "footbridge-rail");
  return out;
}
