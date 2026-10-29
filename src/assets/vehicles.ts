import * as THREE from "three";
import { fitCollider, MAT, put, signMaterial, wheel } from "./kit.ts";

const LIVERY = "Approximate public colors only. Not an official brand kit or logo.";

export function buildEasyBike(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const paint = m.paint(0x1f8a4c);
  put(g, paint, "box", [1.25, 1.15, 1.7], [0, 1.05, -0.15]);
  put(g, m.glass, "box", [1.1, 0.42, 0.05], [0, 1.35, 0.72]);
  put(g, m.glass, "box", [0.04, 0.4, 0.7], [0.64, 1.3, -0.05]);
  put(g, m.glass, "box", [0.04, 0.4, 0.7], [-0.64, 1.3, -0.05]);
  put(g, m.cloth(0xf4f1ea), "box", [0.7, 0.12, 0.45], [0, 0.72, -0.2]);
  put(g, m.metal(0x222222), "box", [0.2, 0.15, 0.7], [0, 0.55, 1.05]);
  put(g, m.chrome, "cyl", [0.03, 0.03, 0.4, 6], [0.2, 0.85, 1.15], [Math.PI / 2, 0, 0]);
  wheel(g, 0, 0.28, 1.25, 0.28, 0.12);
  wheel(g, -0.55, 0.32, -0.7, 0.32, 0.14);
  wheel(g, 0.55, 0.32, -0.7, 0.32, 0.14);
  const sign = signMaterial(["ইজি বাইক"], "#1f8a4c", "#f7f4ee", "#f5d90a");
  put(g, sign, "plane", [0.7, 0.22], [0, 1.55, 0.86]);
  fitCollider(g);
  return g;
}

export function buildCng(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0x178a3a), "box", [1.28, 0.95, 1.85], [0, 1.15, -0.05]);
  put(g, m.paint(0x141414), "box", [1.32, 0.38, 1.95], [0, 0.55, -0.05]);
  put(g, m.glass, "box", [1.15, 0.48, 0.05], [0, 1.4, 0.9]);
  put(g, m.cloth(0xf2c14e), "box", [0.7, 0.16, 0.04], [0, 0.85, 0.99]);
  wheel(g, 0, 0.3, 1.2, 0.3, 0.12);
  wheel(g, -0.58, 0.32, -0.75, 0.32, 0.16);
  wheel(g, 0.58, 0.32, -0.75, 0.32, 0.16);
  put(g, signMaterial(["CNG"], "#f2c14e", "#14210f"), "plane", [0.55, 0.22], [0.67, 1.15, 0.1], [0, Math.PI / 2, 0]);
  fitCollider(g);
  return g;
}

export function buildCycleRickshaw(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.metal(0xc4552a), "box", [0.15, 0.7, 1.5], [0, 0.7, 0.3]);
  put(g, m.floral, "box", [1.15, 0.7, 1.15], [0, 1.15, -0.35]);
  put(g, m.cloth(0xf4e4c4), "box", [1.0, 0.12, 0.7], [0, 0.72, -0.35]);
  put(g, m.chrome, "cyl", [0.03, 0.03, 0.7, 6], [0, 0.95, 0.85], [Math.PI / 2, 0, 0]);
  wheel(g, 0, 0.34, 1.15, 0.34, 0.08);
  wheel(g, -0.48, 0.32, -0.7, 0.32, 0.08);
  wheel(g, 0.48, 0.32, -0.7, 0.32, 0.08);
  fitCollider(g);
  return g;
}

function sedan(paint: number, cabinZ: number, length: number): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const p = m.paint(paint);
  put(g, p, "box", [1.72, 0.48, length], [0, 0.52, 0]);
  put(g, p, "box", [1.6, 0.42, length * 0.48], [0, 0.92, cabinZ]);
  put(g, m.glass, "box", [1.45, 0.32, length * 0.4], [0, 0.96, cabinZ]);
  put(g, m.emit(0xfff1d2), "box", [0.28, 0.1, 0.06], [-0.55, 0.62, length * 0.5 - 0.02]);
  put(g, m.emit(0xfff1d2), "box", [0.28, 0.1, 0.06], [0.55, 0.62, length * 0.5 - 0.02]);
  put(g, m.emit(0xe23a3a), "box", [0.22, 0.08, 0.05], [-0.55, 0.58, -length * 0.5 + 0.02]);
  put(g, m.emit(0xe23a3a), "box", [0.22, 0.08, 0.05], [0.55, 0.58, -length * 0.5 + 0.02]);
  wheel(g, -0.78, 0.32, length * 0.32);
  wheel(g, 0.78, 0.32, length * 0.32);
  wheel(g, -0.78, 0.32, -length * 0.32);
  wheel(g, 0.78, 0.32, -length * 0.32);
  return g;
}

export function buildPremio(): THREE.Group {
  const g = sedan(0xe7e4dc, -0.15, 4.45);
  fitCollider(g);
  return g;
}

export function buildAxio(): THREE.Group {
  const g = sedan(0xc5c9d1, -0.05, 4.15);
  fitCollider(g);
  return g;
}

export function buildMustang(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const p = m.paint(0xc1121f);
  put(g, p, "box", [1.75, 0.42, 4.55], [0, 0.48, 0]);
  put(g, p, "box", [1.55, 0.38, 1.5], [0, 0.82, -0.55]);
  put(g, p, "box", [1.5, 0.22, 0.9], [0, 0.78, -1.35]);
  put(g, m.glass, "box", [1.35, 0.26, 0.85], [0, 0.88, -0.5]);
  put(g, m.chrome, "box", [1.8, 0.1, 0.12], [0, 0.4, 2.2]);
  put(g, m.chrome, "box", [1.8, 0.1, 0.12], [0, 0.4, -2.2]);
  put(g, m.emit(0xfff1d2), "box", [0.32, 0.1, 0.08], [-0.5, 0.55, 2.22]);
  put(g, m.emit(0xfff1d2), "box", [0.32, 0.1, 0.08], [0.5, 0.55, 2.22]);
  wheel(g, -0.82, 0.34, 1.35, 0.34, 0.22);
  wheel(g, 0.82, 0.34, 1.35, 0.34, 0.22);
  wheel(g, -0.82, 0.34, -1.35, 0.34, 0.22);
  wheel(g, 0.82, 0.34, -1.35, 0.34, 0.22);
  fitCollider(g);
  return g;
}

export function buildMotorcycle(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0x1a1a1a), "box", [0.28, 0.28, 1.35], [0, 0.62, 0]);
  put(g, m.paint(0xc42323), "box", [0.42, 0.28, 0.55], [0, 0.78, -0.15]);
  put(g, m.chrome, "cyl", [0.04, 0.04, 0.45, 6], [0.18, 0.55, 0.15], [Math.PI / 2, 0, 0.4]);
  put(g, m.chrome, "box", [0.55, 0.04, 0.12], [0, 0.95, 0.45]);
  wheel(g, 0, 0.34, 0.72, 0.34, 0.12);
  wheel(g, 0, 0.34, -0.72, 0.34, 0.14);
  fitCollider(g);
  return g;
}

export function buildCoach(opts: {
  paint: number;
  stripe: number;
  roof: number;
  title: string;
  double?: boolean;
}): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const length = opts.double ? 10.6 : 11.4;
  const height = opts.double ? 2.55 : 2.15;
  const baseY = 1.45;
  put(g, m.paint(opts.paint), "box", [2.5, height, length], [0, baseY, 0]);
  if (opts.double) {
    put(g, m.paint(opts.roof), "box", [2.5, 1.35, length], [0, 3.35, 0]);
    put(g, m.glass, "box", [2.35, 0.7, length * 0.86], [0, 3.35, 0]);
  }
  put(g, m.paint(opts.stripe), "box", [2.54, 0.28, length], [0, opts.double ? 2.55 : 1.7, 0]);
  put(g, m.glass, "box", [2.4, 0.72, length * 0.78], [0, opts.double ? 1.85 : 1.85, 0.15]);
  put(g, m.paint(opts.roof), "box", [2.52, 0.12, length], [0, (opts.double ? 4.05 : 2.55), 0]);
  put(g, m.glass, "box", [1.3, 1.3, 0.06], [0.3, 1.3, length * 0.5]);
  const board = signMaterial([opts.title], "#102033", "#f7f4ee", "#ff4d8d");
  put(g, board, "plane", [1.6, 0.36], [0, opts.double ? 3.85 : 2.35, length * 0.5 + 0.02]);
  const wx = 1.15;
  const wz = length * 0.32;
  wheel(g, -wx, 0.42, wz, 0.42, 0.24);
  wheel(g, wx, 0.42, wz, 0.42, 0.24);
  wheel(g, -wx, 0.42, -wz, 0.42, 0.24);
  wheel(g, wx, 0.42, -wz, 0.42, 0.24);
  fitCollider(g);
  return g;
}

export function buildGreenLine(): THREE.Group {
  return buildCoach({ paint: 0xf4f7f2, stripe: 0x1f8a4c, roof: 0x1f8a4c, title: "GREEN LINE" });
}
export function buildShyamoli(): THREE.Group {
  return buildCoach({ paint: 0xf3e2c4, stripe: 0xc0392b, roof: 0xc0392b, title: "SHYAMOLI" });
}
export function buildHanif(): THREE.Group {
  return buildCoach({ paint: 0xf7f4ee, stripe: 0x1d4e89, roof: 0x1d4e89, title: "HANIF" });
}
export function buildSakura(): THREE.Group {
  return buildCoach({ paint: 0xfff5f8, stripe: 0xe45b8a, roof: 0xf7f4ee, title: "SAKURA" });
}
export function buildSaintmartin(): THREE.Group {
  return buildCoach({ paint: 0xf7fbff, stripe: 0x2a6fdb, roof: 0xe8eef5, title: "SAINTMARTIN" });
}
export function buildBrtc(): THREE.Group {
  return buildCoach({ paint: 0xc1121f, stripe: 0xf3e2c4, roof: 0xf3e2c4, title: "BRTC", double: true });
}

function lightBar(g: THREE.Group, y: number, z: number): void {
  const m = MAT();
  put(g, m.rubber, "box", [0.7, 0.08, 0.22], [0, y, z]);
  put(g, m.emit(0x2a6fdb), "box", [0.22, 0.08, 0.16], [-0.16, y + 0.06, z]);
  put(g, m.emit(0xe23a3a), "box", [0.22, 0.08, 0.16], [0.16, y + 0.06, z]);
}

export function buildPoliceHilux(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const p = m.paint(0x1d4e89);
  put(g, p, "box", [1.85, 0.55, 2.3], [0, 0.7, 0.55]);
  put(g, p, "box", [1.8, 0.7, 1.7], [0, 1.15, -0.85]);
  put(g, m.glass, "box", [1.6, 0.4, 1.15], [0, 1.25, -0.75]);
  put(g, m.paint(0xf7f4ee), "box", [1.7, 0.35, 1.5], [0, 0.85, 1.15]);
  lightBar(g, 1.62, -0.7);
  put(g, signMaterial(["পুলিশ"], "#f7f4ee", "#1d4e89"), "plane", [0.7, 0.24], [0, 0.95, 1.92]);
  wheel(g, -0.82, 0.38, 1.35, 0.38, 0.24);
  wheel(g, 0.82, 0.38, 1.35, 0.38, 0.24);
  wheel(g, -0.82, 0.38, -1.25, 0.38, 0.24);
  wheel(g, 0.82, 0.38, -1.25, 0.38, 0.24);
  fitCollider(g);
  return g;
}

export function buildPoliceCruiser(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const p = m.paint(0x1c1e22);
  put(g, p, "box", [1.9, 0.7, 4.5], [0, 0.85, 0]);
  put(g, p, "box", [1.8, 0.65, 2.1], [0, 1.4, -0.25]);
  put(g, m.darkGlass, "box", [1.65, 0.42, 1.5], [0, 1.5, -0.2]);
  lightBar(g, 1.85, -0.2);
  put(g, m.chrome, "cyl", [0.28, 0.28, 0.12, 10], [0, 1.15, -2.15], [Math.PI / 2, 0, 0]);
  wheel(g, -0.88, 0.4, 1.45, 0.4, 0.26);
  wheel(g, 0.88, 0.4, 1.45, 0.4, 0.26);
  wheel(g, -0.88, 0.4, -1.45, 0.4, 0.26);
  wheel(g, 0.88, 0.4, -1.45, 0.4, 0.26);
  fitCollider(g);
  return g;
}

export function buildPoliceSedan(): THREE.Group {
  const g = sedan(0x1a4f9c, -0.1, 4.3);
  lightBar(g, 1.2, -0.15);
  put(g, signMaterial(["পুলিশ"], "#f7f4ee", "#1a4f9c"), "plane", [0.7, 0.22], [0, 0.7, 2.16]);
  fitCollider(g);
  return g;
}

export const VEHICLE_NOTES = {
  easy: `Easy-bike / battery rickshaw. Common on the edge of the city and restricted on many DNCC/DSCC arterial roads. ${LIVERY}`,
  cng: `Bajaj-style CNG auto-rickshaw, the green-and-black three-wheeler Dhaka calls a CNG. ${LIVERY}`,
  cycle: "Cycle rickshaw with a hood. Hood pattern is original, not a traced painting.",
  premio: "Toyota Premio proportions, a common private car in Bangladesh. Not a licensed Toyota model.",
  axio: "Toyota Corolla Axio proportions, slightly shorter than the Premio. Not a licensed Toyota model.",
  mustang: "1967 fastback is a Vice City showcase prop. It is not a Dhaka fleet vehicle.",
  moto: "Generic commuter motorcycle. Not a branded bike.",
  coach: LIVERY,
  hilux: "Bangladesh Police beat pickup in blue, the color used on many marked trucks. Marking says পুলিশ. Not a copied crest.",
  cruiser: "Dark boxy SUV used as a senior/unit vehicle. Plain light bar, no unit badge.",
  sedan: "Marked blue sedan. Same পুলিশ board as the pickup.",
};
