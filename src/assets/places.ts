import * as THREE from "three";
import { fitCollider, MAT, put, signMaterial, stamp } from "./kit.ts";

function stall(roof: number, sign: string, goods: number[]): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.wood, "box", [1.6, 0.1, 0.7], [0, 0.85, 0]);
  put(g, m.wood, "box", [0.08, 0.85, 0.08], [-0.7, 0.42, -0.28]);
  put(g, m.wood, "box", [0.08, 0.85, 0.08], [0.7, 0.42, -0.28]);
  put(g, m.wood, "box", [0.08, 0.85, 0.08], [-0.7, 0.42, 0.28]);
  put(g, m.wood, "box", [0.08, 0.85, 0.08], [0.7, 0.42, 0.28]);
  put(g, m.paint(roof), "box", [1.8, 0.06, 0.9], [0, 1.35, 0]);
  goods.forEach((hex, i) => {
    put(g, m.cloth(hex), "box", [0.18, 0.16, 0.16], [-0.4 + (i % 4) * 0.26, 0.98, i > 3 ? 0.15 : -0.1]);
  });
  put(g, signMaterial([sign], "#1a1024", "#f6efe6", "#ff4d8d"), "plane", [1.1, 0.32], [0, 1.15, 0.38]);
  fitCollider(g);
  return g;
}

export function buildTeaStall(): THREE.Group {
  const g = stall(0xf5c518, "চা", [0xf4f1ea, 0xc23b4a, 0x6b3a1f]);
  const m = MAT();
  put(g, m.paint(0xf5c518), "cyl", [0.7, 0.7, 0.08, 12], [0, 1.7, 0]);
  put(g, m.metal(0x222222), "cyl", [0.12, 0.16, 0.2, 8], [-0.2, 1.05, 0]);
  fitCollider(g);
  return g;
}

export function buildFlowerStall(): THREE.Group {
  return stall(0xf48fb1, "ফুল", [0xe23a3a, 0xf5d90a, 0xf48fb1, 0xf7f4ee, 0xff7aa2]);
}

export function buildBookStall(): THREE.Group {
  return stall(0x2a6fdb, "বই", [0xf4f1ea, 0x1d4e89, 0xc23b4a, 0xf2c14e]);
}

export function buildPhoneStall(): THREE.Group {
  return stall(0x163a78, "মোবাইল", [0x222833, 0x2ad8d2, 0xf7f4ee, 0xe23a3a]);
}

export function buildClothStall(): THREE.Group {
  const g = stall(0xe45b8a, "কাপড়", [0x1f8a4c, 0x2a6fdb, 0xf5d90a]);
  put(g, MAT().floral, "box", [0.7, 0.9, 0.05], [0.2, 1.15, -0.2]);
  fitCollider(g);
  return g;
}

export function buildDailyStall(): THREE.Group {
  return stall(0x1f8a4c, "দোকান", [0xf4f1ea, 0xf2c14e, 0xc23b4a, 0x2ad8d2]);
}

export function buildFoodStall(): THREE.Group {
  return stall(0xc4552a, "খাবার", [0xf2c14e, 0xe23a3a, 0xf4f1ea]);
}

export function buildKawran(): THREE.Group {
  const g = new THREE.Group();
  const a = buildFoodStall();
  a.position.set(-2.2, 0, 0);
  const b = buildDailyStall();
  b.position.set(0, 0, 0.4);
  const c = buildClothStall();
  c.position.set(2.2, 0, 0);
  g.add(a, b, c);
  put(g, MAT().paint(0xc23b4a), "box", [7.2, 0.08, 3.2], [0, 2.15, 0.2]);
  fitCollider(g);
  return g;
}

export function buildNewMarket(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xe7d3c0), "box", [8, 3.2, 3.2], [0, 1.6, 0]);
  put(g, m.glass, "box", [2, 1.6, 0.08], [-2.4, 1.5, 1.62]);
  put(g, m.glass, "box", [2, 1.6, 0.08], [0, 1.5, 1.62]);
  put(g, m.glass, "box", [2, 1.6, 0.08], [2.4, 1.5, 1.62]);
  put(g, signMaterial(["নিউ মার্কেট"], "#8d3b32", "#f7f4ee"), "plane", [3.2, 0.5], [0, 2.7, 1.65]);
  fitCollider(g);
  return g;
}

export function buildSangsad(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xd9d0c6), "cyl", [10, 10, 4, 16], [0, 2, 0]);
  put(g, m.paint(0xc8bfb4), "cyl", [7, 7, 6, 12], [0, 5, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    put(g, m.paint(0xe7e0d6), "box", [4, 6, 4], [Math.cos(a) * 16, 3, Math.sin(a) * 16]);
  }
  put(g, m.paint(0x8fb8c9), "cyl", [22, 22, 0.15, 20], [0, 0.08, 0]);
  fitCollider(g);
  return g;
}

export function buildAhsan(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xf2a3b5), "box", [16, 9, 10], [0, 4.5, 0]);
  put(g, m.paint(0xf7f4ee), "box", [16.4, 0.5, 10.4], [0, 9.1, 0]);
  put(g, m.paint(0xf7d6e0), "box", [3, 11, 3], [-6, 5.5, 4]);
  put(g, m.paint(0xf7d6e0), "box", [3, 11, 3], [6, 5.5, 4]);
  for (let i = 0; i < 5; i++) {
    put(g, m.darkGlass, "box", [1.4, 2.2, 0.15], [-4 + i * 2, 4.2, 5.05]);
  }
  put(g, m.paint(0x8fb8c9), "box", [20, 0.15, 8], [0, 0.08, 8]);
  fitCollider(g);
  return g;
}

export function buildLalbagh(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.brick, "box", [22, 5, 1.2], [0, 2.5, -8]);
  put(g, m.brick, "box", [1.2, 5, 16], [-10.5, 2.5, 0]);
  put(g, m.brick, "box", [1.2, 5, 16], [10.5, 2.5, 0]);
  put(g, m.brick, "box", [4, 8, 4], [0, 4, -8]);
  put(g, m.paint(0xf2e2c8), "box", [6, 5, 6], [0, 2.5, 0]);
  put(g, m.paint(0x8d3b32), "cyl", [2.2, 2.2, 2, 10], [0, 6, 0]);
  fitCollider(g);
  return g;
}

export function buildMuseum(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xf7f4ee), "box", [24, 8, 12], [0, 4, 0]);
  put(g, m.glass, "box", [16, 3, 0.2], [0, 4.5, 6.05]);
  put(g, m.paint(0x1d4e89), "box", [8, 1.2, 2], [0, 8.4, 0]);
  put(g, signMaterial(["জাতীয় জাদুঘর"], "#1d4e89", "#f7f4ee"), "plane", [5, 0.7], [0, 6.6, 6.15]);
  fitCollider(g);
  return g;
}

export function buildCurzon(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.brick, "box", [20, 8, 10], [0, 4, 0]);
  put(g, m.paint(0xf2e2c8), "box", [6, 6, 6], [0, 5, 4]);
  put(g, m.paint(0xf4f1ea), "cyl", [2.4, 2.4, 3, 10], [0, 8.5, 4]);
  put(g, m.brick, "box", [3, 10, 3], [-8, 5, 4]);
  put(g, m.brick, "box", [3, 10, 3], [8, 5, 4]);
  put(g, signMaterial(["কার্জন হল"], "#f4e4c4", "#6b2a24"), "plane", [3.4, 0.6], [0, 6.4, 7.1]);
  fitCollider(g);
  return g;
}

export function buildFootbridge(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.metal(0xb7b0a8), "box", [3.2, 0.16, 14], [0, 5.2, 0]);
  put(g, m.paint(0xf2c14e), "box", [0.08, 1.1, 14], [-1.5, 5.8, 0]);
  put(g, m.paint(0xf2c14e), "box", [0.08, 1.1, 14], [1.5, 5.8, 0]);
  put(g, m.metal(0x8a9098), "box", [0.2, 5.2, 0.2], [-1.2, 2.6, -6]);
  put(g, m.metal(0x8a9098), "box", [0.2, 5.2, 0.2], [1.2, 2.6, -6]);
  put(g, m.metal(0x8a9098), "box", [0.2, 5.2, 0.2], [-1.2, 2.6, 6]);
  put(g, m.metal(0x8a9098), "box", [0.2, 5.2, 0.2], [1.2, 2.6, 6]);
  put(g, m.paint(0xc8c2b8), "box", [2.2, 0.12, 4], [-3.2, 2.6, -8]);
  put(g, m.paint(0xc8c2b8), "box", [2.2, 0.12, 4], [3.2, 2.6, 8]);
  stamp(g, [
    { min: [-1.6, 5.05, -7], max: [1.6, 6.5, 7] },
    { min: [-1.4, 0, -6.2], max: [-1, 5.2, -5.8] },
    { min: [1, 0, -6.2], max: [1.4, 5.2, -5.8] },
    { min: [-1.4, 0, 5.8], max: [-1, 5.2, 6.2] },
    { min: [1, 0, 5.8], max: [1.4, 5.2, 6.2] },
  ]);
  return g;
}

export function buildFlyover(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xd5cec6), "box", [26, 0.7, 8], [0, 6.2, 0]);
  put(g, m.paint(0xb7b0a8), "box", [1.6, 6, 1.6], [-6, 3, -2.2]);
  put(g, m.paint(0xb7b0a8), "box", [1.6, 6, 1.6], [6, 3, 2.2]);
  put(g, m.paint(0xf2c14e), "box", [26, 0.5, 0.15], [0, 6.5, -3.8]);
  put(g, m.paint(0xf2c14e), "box", [26, 0.5, 0.15], [0, 6.5, 3.8]);
  stamp(g, [
    { min: [-13, 5.8, -4], max: [13, 6.9, 4] },
    { min: [-6.8, 0, -3], max: [-5.2, 6, -1.4] },
    { min: [5.2, 0, 1.4], max: [6.8, 6, 3] },
  ]);
  return g;
}

export function buildRoadDiorama(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0x3a4150), "box", [8, 0.12, 16], [0, 0.06, 0]);
  put(g, m.paint(0xe6d7c4), "box", [2, 0.16, 16], [-5, 0.08, 0]);
  put(g, m.paint(0xe6d7c4), "box", [2, 0.16, 16], [5, 0.08, 0]);
  put(g, m.emit(0xf7f4ee), "box", [0.12, 0.02, 1.2], [0, 0.14, -4]);
  put(g, m.emit(0xf7f4ee), "box", [0.12, 0.02, 1.2], [0, 0.14, 0]);
  put(g, m.emit(0xf7f4ee), "box", [0.12, 0.02, 1.2], [0, 0.14, 4]);
  put(g, m.paint(0xf2c14e), "cyl", [0.08, 0.08, 0.9, 8], [-3.6, 0.55, 4]);
  put(g, m.paint(0xf2c14e), "cyl", [0.08, 0.08, 0.9, 8], [3.6, 0.55, -4]);
  fitCollider(g);
  return g;
}

export function buildStreetLight(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.metal(0x5c656e), "cyl", [0.08, 0.1, 6.2, 8], [0, 3.1, 0]);
  put(g, m.metal(0x5c656e), "box", [1.4, 0.08, 0.08], [0.6, 6.2, 0]);
  put(g, m.emit(0xfff1d2), "box", [0.55, 0.12, 0.28], [1.15, 6.05, 0]);
  fitCollider(g);
  return g;
}

export function buildTrees(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.wood, "cyl", [0.18, 0.28, 3.2, 8], [-1.6, 1.6, 0]);
  put(g, m.cloth(0x2fa86a), "sph", [1.35, 12], [-1.6, 3.5, 0]);
  put(g, m.wood, "cyl", [0.16, 0.2, 4.2, 7], [1.7, 2.1, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    put(g, m.cloth(0x1f8a4c), "box", [0.18, 0.08, 1.5], [1.7 + Math.cos(a) * 0.7, 4.3, Math.sin(a) * 0.15], [0.4, a, 0.2]);
  }
  fitCollider(g);
  return g;
}

export function buildRiver(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xc4a882), "box", [16, 0.4, 8], [0, 0.2, 0]);
  put(g, m.paint(0x0e6e78), "box", [12, 0.25, 5], [0, 0.35, 0]);
  fitCollider(g);
  return g;
}

export function buildBillboard(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.metal(0x5c656e), "box", [0.2, 4.5, 0.2], [-1.6, 2.25, 0]);
  put(g, m.metal(0x5c656e), "box", [0.2, 4.5, 0.2], [1.6, 2.25, 0]);
  put(g, signMaterial(["ঢাকা", "AFTER DARK"], "#1a1024", "#ff7aa2", "#2ad8d2"), "plane", [3.6, 1.8], [0, 4.2, 0]);
  fitCollider(g);
  return g;
}

export function buildUtilityPole(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.wood, "cyl", [0.12, 0.16, 7, 7], [0, 3.5, 0]);
  put(g, m.wood, "box", [1.8, 0.1, 0.1], [0, 6.6, 0]);
  put(g, m.rubber, "box", [3.2, 0.03, 0.03], [1.2, 6.4, 0]);
  put(g, m.rubber, "box", [3.2, 0.03, 0.03], [1.2, 6.15, 0]);
  put(g, m.rubber, "box", [2.4, 0.03, 0.03], [0.8, 5.9, 0]);
  fitCollider(g);
  return g;
}

export function buildBoundaryWall(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.brick, "box", [8, 1.6, 0.25], [-2.2, 0.8, 0]);
  put(g, m.brick, "box", [8, 1.6, 0.25], [2.6, 0.8, 0]);
  put(g, m.paint(0xe7e0d6), "box", [0.4, 2.1, 0.4], [-6.2, 1.05, 0]);
  put(g, m.paint(0xe7e0d6), "box", [0.4, 2.1, 0.4], [0.2, 1.05, 0]);
  put(g, m.paint(0xe7e0d6), "box", [0.4, 2.1, 0.4], [6.6, 1.05, 0]);
  put(g, m.metal(0x6d645c), "box", [1.6, 1.5, 0.08], [1.3, 0.9, 0]);
  fitCollider(g);
  return g;
}

export function buildRooftop(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xd9d0c6), "box", [6, 0.25, 4], [0, 0.13, 0]);
  put(g, m.paint(0x2a6fdb), "cyl", [0.55, 0.55, 0.9, 10], [-1.6, 0.7, -0.6]);
  put(g, m.paint(0xc8c2b8), "box", [0.9, 1.1, 0.9], [1.6, 0.7, 0.8]);
  put(g, m.metal(0x8a9098), "cyl", [0.35, 0.45, 0.12, 8], [0.2, 0.4, -1.2], [Math.PI / 2.4, 0.2, 0]);
  put(g, m.cloth(0xf48fb1), "box", [0.7, 0.5, 0.05], [-0.2, 0.7, 1.2]);
  fitCollider(g);
  return g;
}

export function buildBusInterior(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xe7d7c4), "box", [10, 0.2, 8], [0, 0.1, 0]);
  put(g, m.paint(0xf7f4ee), "box", [10, 4, 0.2], [0, 2, -4]);
  put(g, m.wood, "box", [3, 0.45, 0.8], [-2, 0.5, -1]);
  put(g, m.wood, "box", [3, 0.45, 0.8], [2, 0.5, -1]);
  put(g, m.paint(0x1f8a4c), "box", [3.2, 2.2, 0.4], [0, 1.3, 2.5]);
  put(g, signMaterial(["বাস টার্মিনাল"], "#163a78", "#f7f4ee"), "plane", [3, 0.6], [0, 3, -3.85]);
  fitCollider(g);
  return g;
}

export function buildAirportInterior(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xe7e2dc), "box", [14, 0.2, 8], [0, 0.1, 0]);
  put(g, m.glass, "box", [12, 3.2, 0.15], [0, 2.2, -3.9]);
  put(g, m.paint(0x2a6fdb), "box", [2.2, 1.1, 0.6], [-3, 0.7, 1]);
  put(g, m.paint(0x1f8a4c), "box", [2.2, 1.1, 0.6], [0, 0.7, 1]);
  put(g, m.paint(0xc23b4a), "box", [2.2, 1.1, 0.6], [3, 0.7, 1]);
  put(g, m.rubber, "box", [8, 0.35, 0.8], [0, 0.4, -1.5]);
  put(g, signMaterial(["CHECK IN"], "#163a78", "#f7f4ee", "#2ad8d2"), "plane", [3.2, 0.55], [0, 3.1, -3.75]);
  fitCollider(g);
  return g;
}
