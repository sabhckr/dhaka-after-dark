import * as THREE from "three";
import { fitCollider, MAT, put, signMaterial, stamp } from "./kit.ts";

/** Dhaka MRT Line 6 car: white body, magenta stripe. One car, not a full rake. */
export function buildMetroTrain(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xf4f6f8), "box", [2.9, 2.35, 18.5], [0, 2.15, 0]);
  put(g, m.paint(0xe31c79), "box", [2.96, 0.28, 18.5], [0, 2.55, 0]);
  put(g, m.darkGlass, "box", [2.7, 0.85, 16.2], [0, 2.35, 0]);
  put(g, m.paint(0xf4f6f8), "box", [2.7, 0.7, 1.3], [0, 1.7, 9.4]);
  put(g, m.glass, "box", [2.2, 0.7, 0.08], [0, 2.1, 9.28]);
  put(g, m.rubber, "box", [2.4, 0.35, 1.4], [-0.7, 0.55, 5]);
  put(g, m.rubber, "box", [2.4, 0.35, 1.4], [-0.7, 0.55, -5]);
  put(g, signMaterial(["মেট্রো"], "#e31c79", "#ffffff"), "plane", [1.4, 0.32], [0, 3.15, 9.28]);
  fitCollider(g);
  return g;
}

/** Short elevated viaduct. Deck collider starts above head height so you can walk between the piers. */
export function buildMetroTrack(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const deck = m.paint(0xd9d3cc);
  put(g, m.paint(0xb7b0a8), "box", [1.4, 5.1, 1.4], [0, 2.55, -8]);
  put(g, m.paint(0xb7b0a8), "box", [1.4, 5.1, 1.4], [0, 2.55, 8]);
  put(g, deck, "box", [4.2, 0.45, 28], [0, 5.25, 0]);
  put(g, m.metal(0x8a9098), "box", [0.12, 0.08, 26], [-0.7, 5.52, 0]);
  put(g, m.metal(0x8a9098), "box", [0.12, 0.08, 26], [0.7, 5.52, 0]);
  put(g, m.metal(0x666d76), "box", [0.08, 1.1, 0.08], [0, 6.1, 0]);
  put(g, m.rubber, "box", [0.03, 0.03, 24], [0, 6.55, 0]);
  stamp(g, [
    { min: [-0.7, 0, -8.7], max: [0.7, 5.1, -7.3] },
    { min: [-0.7, 0, 7.3], max: [0.7, 5.1, 8.7] },
    { min: [-2.1, 5.0, -14], max: [2.1, 6.7, 14] },
  ]);
  return g;
}

export function buildMetroStation(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xe7e2dc), "box", [36, 0.4, 14], [0, 5.2, 0]);
  put(g, m.paint(0xf7f4ee), "box", [8, 5.2, 1.2], [-14, 2.6, 5]);
  put(g, m.paint(0xf7f4ee), "box", [8, 5.2, 1.2], [14, 2.6, 5]);
  put(g, m.glass, "box", [30, 3.2, 0.2], [0, 7.4, -4]);
  put(g, m.paint(0xe31c79), "box", [22, 0.35, 8], [0, 9.3, 0]);
  put(g, m.metal(0xc8c2b8), "box", [0.3, 2.2, 0.3], [-10, 8.6, 3]);
  put(g, m.metal(0xc8c2b8), "box", [0.3, 2.2, 0.3], [10, 8.6, 3]);
  put(g, signMaterial(["উত্তরা"], "#e31c79", "#ffffff"), "plane", [4.2, 0.9], [0, 8.2, 6.2]);
  stamp(g, [
    { min: [-18, 5, -7], max: [18, 9.6, 7] },
    { min: [-18, 0, 4.4], max: [-10, 5.2, 5.6] },
    { min: [10, 0, 4.4], max: [18, 5.2, 5.6] },
  ]);
  return g;
}

export function buildRailTrain(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0x1d4e89), "box", [3.05, 2.3, 6.2], [0, 2.0, 6.2]);
  put(g, m.paint(0xf2c14e), "box", [3.1, 0.35, 6.2], [0, 2.4, 6.2]);
  put(g, m.darkGlass, "box", [2.4, 0.7, 0.1], [0, 2.5, 9.25]);
  put(g, m.paint(0xc8c2b8), "box", [2.9, 2.5, 14], [0, 2.05, -4.2]);
  put(g, m.paint(0x1d4e89), "box", [2.96, 0.4, 14], [0, 3.15, -4.2]);
  put(g, m.glass, "box", [2.6, 0.7, 12], [0, 2.3, -4.2]);
  put(g, m.metal(0x4a4038), "box", [2.2, 0.3, 1.2], [0, 0.4, 7.5]);
  put(g, m.metal(0x4a4038), "box", [2.2, 0.3, 1.2], [0, 0.4, -8]);
  put(g, signMaterial(["BENAPOLE"], "#1d4e89", "#f2c14e"), "plane", [1.8, 0.36], [0, 3.35, 9.32]);
  fitCollider(g);
  return g;
}

export function buildRailTrack(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0x6d645c), "box", [3.4, 0.18, 24], [0, 0.09, 0]);
  put(g, m.wood, "box", [2.6, 0.12, 0.3], [0, 0.22, -8]);
  put(g, m.wood, "box", [2.6, 0.12, 0.3], [0, 0.22, 0]);
  put(g, m.wood, "box", [2.6, 0.12, 0.3], [0, 0.22, 8]);
  put(g, m.metal(0x8a9098), "box", [0.1, 0.08, 24], [-0.75, 0.32, 0]);
  put(g, m.metal(0x8a9098), "box", [0.1, 0.08, 24], [0.75, 0.32, 0]);
  fitCollider(g);
  return g;
}

/** Kamalapur's real roof is a concrete shell. This is a station-hall blockout, not that shell. */
export function buildRailStation(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xe7d7c4), "box", [28, 8, 16], [0, 4, 0]);
  put(g, m.glass, "box", [18, 3.2, 0.2], [0, 4.2, 8.05]);
  put(g, m.paint(0x8d3b32), "box", [30, 0.5, 18], [0, 8.2, 0]);
  put(g, m.brick, "box", [1.2, 6, 1.2], [-12, 3, 7]);
  put(g, m.brick, "box", [1.2, 6, 1.2], [12, 3, 7]);
  put(g, signMaterial(["কমলাপুর"], "#1d4e89", "#f7f4ee"), "plane", [6, 1.1], [0, 6.4, 8.2]);
  fitCollider(g);
  return g;
}

export function buildTerminal(): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xf4f1ea), "box", [42, 8, 18], [0, 4, 0]);
  put(g, m.glass, "box", [36, 4.5, 0.25], [0, 4.2, 9.1]);
  put(g, m.paint(0x2a6fdb), "box", [18, 0.4, 6], [0, 8.3, 0]);
  put(g, m.paint(0xd9d3cc), "box", [16, 0.3, 22], [24, 0.2, 8]);
  put(g, signMaterial(["শাহজালাল"], "#163a78", "#f7f4ee", "#2ad8d2"), "plane", [6.5, 1.2], [0, 7.2, 9.3]);
  fitCollider(g);
  return g;
}

export function buildAircraft(opts: { body: number; stripe: number; tail: number; title: string; wide?: boolean }): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const len = opts.wide ? 46 : 34;
  const rad = opts.wide ? 2.4 : 1.8;
  put(g, m.paint(opts.body), "box", [rad * 2, rad * 1.7, len], [0, 2.4, 0]);
  put(g, m.paint(opts.body), "box", [rad * 1.4, rad * 1.2, 3.2], [0, 2.5, len * 0.5]);
  put(g, m.paint(opts.stripe), "box", [rad * 2.05, 0.35, len * 0.92], [0, 2.7, -0.4]);
  put(g, m.darkGlass, "box", [1.2, 0.7, 1.4], [0, 2.9, len * 0.48]);
  put(g, m.paint(opts.body), "box", [len * 0.85, 0.18, 4.2], [0, 2.15, -1]);
  put(g, m.paint(opts.tail), "box", [0.25, 4.2, 3.4], [0, 4.6, -len * 0.42]);
  put(g, m.paint(opts.tail), "box", [6.5, 0.16, 2.2], [0, 6.3, -len * 0.4]);
  const eng = opts.wide ? 4.2 : 3.2;
  put(g, m.metal(0xd5dbe2), "cyl", [0.55, 0.6, 2.4, 10], [-eng, 1.55, 1], [Math.PI / 2, 0, 0]);
  put(g, m.metal(0xd5dbe2), "cyl", [0.55, 0.6, 2.4, 10], [eng, 1.55, 1], [Math.PI / 2, 0, 0]);
  put(g, m.rubber, "box", [0.4, 1.3, 0.4], [0, 0.65, len * 0.28]);
  put(g, m.rubber, "box", [0.35, 1.2, 0.35], [-2.2, 0.6, -2]);
  put(g, m.rubber, "box", [0.35, 1.2, 0.35], [2.2, 0.6, -2]);
  put(g, signMaterial([opts.title], "#f7f4ee", "#16324f"), "plane", [2.2, 0.5], [0, 3.3, len * 0.5 + 1.5]);
  fitCollider(g);
  return g;
}

export function buildBusStand(title: string, roof: number): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  put(g, m.paint(0xc8c2b8), "box", [22, 0.25, 10], [0, 0.13, 0]);
  put(g, m.metal(0x8a9098), "box", [0.35, 4.2, 0.35], [-9, 2.2, -3]);
  put(g, m.metal(0x8a9098), "box", [0.35, 4.2, 0.35], [9, 2.2, -3]);
  put(g, m.metal(0x8a9098), "box", [0.35, 4.2, 0.35], [-9, 2.2, 3]);
  put(g, m.metal(0x8a9098), "box", [0.35, 4.2, 0.35], [9, 2.2, 3]);
  put(g, m.paint(roof), "box", [24, 0.2, 12], [0, 4.4, 0]);
  put(g, m.paint(0xf2c14e), "box", [6, 2.2, 2.4], [-6, 1.2, 2]);
  put(g, m.paint(0x2a6fdb), "box", [6, 2.2, 2.4], [2, 1.2, 2]);
  put(g, signMaterial([title], "#163a78", "#f7f4ee"), "plane", [5, 0.8], [0, 3.6, 5.1]);
  fitCollider(g);
  return g;
}

export const TRANSIT_NOTES = {
  metroTrain: "Dhaka MRT Line 6 cars are white with a magenta stripe. One car, not the full six-car rake, and not placed on the real viaduct alignment.",
  metroTrack: "Display segment of an elevated guideway: piers, deck, two rails, a catenary wire. Not a survey of Line 6.",
  metroStation: "Uttara-style elevated concourse. The real stations differ bay by bay. Sign reads উত্তরা.",
  railTrain: "Blue-and-yellow hood locomotive plus one coach, labeled for the Benapole Express service. Not a measured class 3000 drawing.",
  railTrack: "Ballast, three sleepers, two rails. A sample, not the Kamalapur yard survey.",
  railStation: "Station hall only. Kamalapur's real roof is a long concrete shell and is not reproduced here.",
  terminal: "One bay of Hazrat Shahjalal International, not Terminal 3 as built. Sign reads শাহজালাল.",
  air: "Stylized color blocks. No airline logos, tail art, or type-certificate geometry.",
  gabtoli: "Gabtoli is Dhaka's main intercity bus terminal on the west side. This is one shed bay.",
  mohakhali: "Mohakhali bus terminal shed, a separate mass from Gabtoli so the two are not the same mesh.",
};
