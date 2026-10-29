import * as THREE from "three";
import { MAT, put, stamp } from "./kit.ts";

export type HumanSpec = {
  skin: number;
  hair: number;
  top: number;
  bottom: number;
  shoes: number;
  topStyle?: "solid" | "floral" | "plaid";
  bottomStyle?: "solid" | "denim" | "lungi" | "plaid";
  hat?: "cap" | "taqiyah" | "helmet" | "hardhat" | "niqab" | "police";
  beard?: boolean;
  sunglasses?: boolean;
  robe?: boolean;
  tunic?: boolean;
  scale?: number;
  extra?: "baton" | "handbag" | "briefcase" | "books" | "tray" | "broom" | "cart" | "stall" | "backpack" | "basket" | "vest" | "id";
};

function wear(hex: number, style: HumanSpec["topStyle"] | HumanSpec["bottomStyle"]): THREE.Material {
  const m = MAT();
  if (style === "floral") return m.floral;
  if (style === "denim") return m.denim;
  if (style === "lungi") return m.lungi;
  if (style === "plaid") return m.plaid;
  return m.cloth(hex);
}

/** Stylized standing figure. Feet on y=0, nose toward +Z. No skeleton. */
export function buildHuman(spec: HumanSpec): THREE.Group {
  const g = new THREE.Group();
  const m = MAT();
  const s = spec.scale ?? 1;
  const skin = m.skin(spec.skin);
  const hair = m.hair(spec.hair);
  const shoes = m.cloth(spec.shoes);
  const top = wear(spec.top, spec.topStyle ?? "solid");
  const bottom = wear(spec.bottom, spec.bottomStyle ?? "solid");
  const robe = spec.robe ? m.cloth(spec.top) : null;
  const y = (n: number) => n * s;
  const x = (n: number) => n * s;

  if (robe) {
    put(g, robe, "box", [0.62 * s, 1.15 * s, 0.38 * s], [0, y(0.72), 0]);
  } else if (spec.bottomStyle === "lungi") {
    put(g, bottom, "box", [0.46 * s, 0.78 * s, 0.28 * s], [0, y(0.46), 0]);
    put(g, shoes, "box", [0.16 * s, 0.08 * s, 0.28 * s], [x(-0.1), y(0.04), x(0.02)]);
    put(g, shoes, "box", [0.16 * s, 0.08 * s, 0.28 * s], [x(0.1), y(0.04), x(0.02)]);
  } else {
    put(g, bottom, "box", [0.16 * s, 0.74 * s, 0.18 * s], [x(-0.11), y(0.45), 0]);
    put(g, bottom, "box", [0.16 * s, 0.74 * s, 0.18 * s], [x(0.11), y(0.45), 0]);
    put(g, shoes, "box", [0.16 * s, 0.08 * s, 0.28 * s], [x(-0.11), y(0.04), 0.04 * s]);
    put(g, shoes, "box", [0.16 * s, 0.08 * s, 0.28 * s], [x(0.11), y(0.04), 0.04 * s]);
  }

  const torsoH = spec.tunic ? 0.7 * s : 0.52 * s;
  const torsoY = spec.tunic ? y(1.05) : y(1.12);
  put(g, top, "box", [0.44 * s, torsoH, 0.22 * s], [0, torsoY, 0]);
  put(g, top, "box", [0.12 * s, 0.48 * s, 0.12 * s], [x(-0.28), y(1.12), 0]);
  put(g, top, "box", [0.12 * s, 0.48 * s, 0.12 * s], [x(0.28), y(1.12), 0]);
  put(g, skin, "sph", [0.05 * s, 8], [x(-0.28), y(0.84), 0]);
  put(g, skin, "sph", [0.05 * s, 8], [x(0.28), y(0.84), 0]);

  if (spec.extra === "vest") {
    put(g, m.cloth(0xf97316), "box", [0.48 * s, 0.42 * s, 0.12 * s], [0, y(1.16), 0.1 * s]);
  }

  const headY = y(1.58);
  if (spec.hat === "niqab") {
    put(g, m.cloth(0x16161a), "box", [0.34 * s, 0.42 * s, 0.32 * s], [0, headY, 0]);
    put(g, skin, "box", [0.2 * s, 0.035 * s, 0.02 * s], [0, headY + 0.02 * s, 0.16 * s]);
  } else {
    put(g, skin, "sph", [0.145 * s, 14], [0, headY, 0]);
    put(g, hair, "sph", [0.15 * s, 12], [0, headY + 0.06 * s, -0.02 * s]);
    put(g, m.cloth(0xf4f1ea), "sph", [0.028 * s, 8], [x(-0.05), headY, 0.12 * s]);
    put(g, m.cloth(0xf4f1ea), "sph", [0.028 * s, 8], [x(0.05), headY, 0.12 * s]);
    put(g, m.cloth(0x1a1a1a), "sph", [0.014 * s, 6], [x(-0.05), headY, 0.14 * s]);
    put(g, m.cloth(0x1a1a1a), "sph", [0.014 * s, 6], [x(0.05), headY, 0.14 * s]);
    if (spec.beard) put(g, hair, "box", [0.16 * s, 0.1 * s, 0.08 * s], [0, headY - 0.08 * s, 0.08 * s]);
    if (spec.sunglasses) put(g, m.darkGlass, "box", [0.2 * s, 0.05 * s, 0.04 * s], [0, headY + 0.01 * s, 0.13 * s]);
  }

  if (spec.hat === "cap" || spec.hat === "police") {
    put(g, m.cloth(spec.hat === "police" ? 0x142850 : spec.top), "cyl", [0.12 * s, 0.13 * s, 0.08 * s, 10], [0, headY + 0.16 * s, 0]);
    put(g, m.cloth(spec.hat === "police" ? 0x142850 : spec.top), "box", [0.16 * s, 0.02 * s, 0.12 * s], [0, headY + 0.12 * s, 0.12 * s]);
  } else if (spec.hat === "taqiyah") {
    put(g, m.cloth(0xf7f4ee), "cyl", [0.11 * s, 0.12 * s, 0.08 * s, 10], [0, headY + 0.14 * s, 0]);
  } else if (spec.hat === "helmet") {
    put(g, m.cloth(0xc42323), "sph", [0.17 * s, 12], [0, headY + 0.05 * s, 0]);
    put(g, m.darkGlass, "box", [0.16 * s, 0.07 * s, 0.06 * s], [0, headY + 0.02 * s, 0.1 * s]);
  } else if (spec.hat === "hardhat") {
    put(g, m.cloth(0xf5d90a), "cyl", [0.16 * s, 0.18 * s, 0.1 * s, 10], [0, headY + 0.16 * s, 0]);
    put(g, m.cloth(0xf5d90a), "cyl", [0.2 * s, 0.2 * s, 0.03 * s, 10], [0, headY + 0.1 * s, 0]);
  }

  if (spec.extra === "baton") {
    put(g, m.rubber, "box", [0.04 * s, 0.42 * s, 0.04 * s], [x(0.34), y(0.95), 0.08 * s]);
  } else if (spec.extra === "handbag") {
    put(g, m.cloth(0x2a241c), "box", [0.16 * s, 0.2 * s, 0.08 * s], [x(0.32), y(0.85), 0.06 * s]);
  } else if (spec.extra === "briefcase") {
    put(g, m.cloth(0x1e2430), "box", [0.28 * s, 0.2 * s, 0.08 * s], [x(-0.32), y(0.55), 0.08 * s]);
  } else if (spec.extra === "books") {
    put(g, m.cloth(0xf4f1ea), "box", [0.22 * s, 0.06 * s, 0.16 * s], [x(0.22), y(1.0), 0.16 * s]);
    put(g, m.cloth(0x355f8a), "box", [0.2 * s, 0.04 * s, 0.14 * s], [x(0.22), y(1.05), 0.16 * s]);
  } else if (spec.extra === "tray") {
    put(g, m.wood, "box", [0.46 * s, 0.06 * s, 0.32 * s], [0, y(1.05), 0.28 * s]);
    put(g, m.cloth(0xe23a3a), "box", [0.1 * s, 0.1 * s, 0.08 * s], [-0.1 * s, y(1.12), 0.28 * s]);
    put(g, m.cloth(0xf5d90a), "box", [0.1 * s, 0.1 * s, 0.08 * s], [0.08 * s, y(1.12), 0.3 * s]);
    put(g, m.cloth(0x2f6b4f), "box", [0.08 * s, 0.12 * s, 0.08 * s], [0.12 * s, y(1.14), 0.22 * s]);
  } else if (spec.extra === "broom") {
    put(g, m.wood, "cyl", [0.02 * s, 0.02 * s, 1.15 * s, 6], [x(0.36), y(0.7), 0.1 * s]);
    put(g, m.cloth(0xc4a15a), "box", [0.28 * s, 0.16 * s, 0.06 * s], [x(0.36), y(0.12), 0.1 * s]);
  } else if (spec.extra === "backpack") {
    put(g, m.cloth(0x243044), "box", [0.28 * s, 0.34 * s, 0.12 * s], [0, y(1.15), -0.16 * s]);
  } else if (spec.extra === "basket") {
    put(g, m.wood, "box", [0.26 * s, 0.16 * s, 0.2 * s], [x(-0.28), y(0.55), 0.12 * s]);
    put(g, m.cloth(0xf5d90a), "sph", [0.05 * s, 8], [x(-0.28), y(0.66), 0.12 * s]);
  } else if (spec.extra === "id") {
    put(g, m.cloth(0x163a78), "box", [0.1 * s, 0.14 * s, 0.01 * s], [0.08 * s, y(1.2), 0.12 * s]);
  } else if (spec.extra === "cart") {
    put(g, m.wood, "box", [0.7, 0.2, 0.48], [0, 0.48, 0.7]);
    put(g, m.metal(0x8d8d8d), "box", [0.62, 0.04, 0.4], [0, 0.6, 0.7]);
    wheel(g, -0.28, 0.16, 0.55, 0.16, 0.06);
    wheel(g, 0.28, 0.16, 0.55, 0.16, 0.06);
    const fruit = [0xe23a3a, 0xf5d90a, 0xf39c12, 0x2f8f4e, 0xf4a3c2];
    fruit.forEach((hex, i) => {
      put(g, m.cloth(hex), "sph", [0.07, 8], [-0.2 + (i % 3) * 0.18, 0.7, 0.58 + Math.floor(i / 3) * 0.14]);
    });
  } else if (spec.extra === "stall") {
    put(g, m.metal(0xc23b4a), "box", [1.15, 0.08, 0.55], [0, 0.92, 0.85]);
    put(g, m.wood, "box", [0.08, 0.9, 0.08], [-0.5, 0.45, 0.62]);
    put(g, m.wood, "box", [0.08, 0.9, 0.08], [0.5, 0.45, 0.62]);
    put(g, m.wood, "box", [0.08, 0.9, 0.08], [-0.5, 0.45, 1.08]);
    put(g, m.wood, "box", [0.08, 0.9, 0.08], [0.5, 0.45, 1.08]);
    put(g, m.cloth(0xf5c518), "cyl", [0.55, 0.55, 0.08, 10], [0, 1.35, 0.85], [0, 0, 0]);
    put(g, m.cloth(0xf4f1ea), "cyl", [0.08, 0.1, 0.16, 8], [-0.15, 1.05, 0.85]);
    put(g, m.cloth(0xc23b4a), "box", [0.22, 0.28, 0.16], [0.18, 1.1, 0.85]);
  }

  const height = 1.78 * s;
  stamp(g, [{ min: [-0.55 * Math.max(1, s), 0, -0.35], max: [0.7, Math.max(height, spec.extra === "stall" ? 1.5 : height), spec.extra === "cart" || spec.extra === "stall" ? 1.35 : 0.4] }]);
  return g;
}

function wheel(group: THREE.Group, x: number, y: number, z: number, radius: number, width: number) {
  const m = MAT();
  put(group, m.tire, "cyl", [radius, radius, width, 8], [x, y, z], [0, 0, Math.PI / 2]);
}

export const NPC_SPECS: { id: string; name: string; evidence: string; spec: HumanSpec }[] = [
  {
    id: "npc-police",
    name: "Police officer",
    evidence: "Bangladesh Police service dress is navy, not the mint uniform on the poster. Cap badge is a plain disc, not an official insignia.",
    spec: { skin: 0xa86b45, hair: 0x1a1a1a, top: 0x163a78, bottom: 0x14213d, shoes: 0x1a1a1a, hat: "police", sunglasses: true, extra: "baton" },
  },
  {
    id: "npc-rickshaw",
    name: "Rickshaw driver",
    evidence: "Cycle-rickshaw pullers in Dhaka commonly wear a lungi and a light shirt. The rickshaw itself is a separate vehicle.",
    spec: { skin: 0x8d5524, hair: 0x1c140f, top: 0xf0e2cf, bottom: 0x1f6b4a, shoes: 0x3a2a1c, bottomStyle: "lungi", beard: true },
  },
  {
    id: "npc-genz-m",
    name: "Male Gen Z",
    evidence: "Street-fashion silhouette from the character sheet: floral shirt, white undershirt, jeans, sunglasses. Original pattern, not a brand print.",
    spec: { skin: 0xc68642, hair: 0x24180f, top: 0x148f93, bottom: 0x2c4f86, shoes: 0xf4f1ea, topStyle: "floral", bottomStyle: "denim", sunglasses: true },
  },
  {
    id: "npc-genz-f",
    name: "Female Gen Z",
    evidence: "Casual Dhaka youth silhouette: pink top, jeans, shoulder bag. No portrait of a real person.",
    spec: { skin: 0xe0ac69, hair: 0x1a120e, top: 0xf48fb1, bottom: 0x355f8a, shoes: 0xf4f1ea, bottomStyle: "denim", extra: "handbag" },
  },
  {
    id: "npc-burqa",
    name: "Burqa aunty",
    evidence: "Full black covering with an eye opening is common street dress. Modeled as clothing, not a caricature.",
    spec: { skin: 0xc68642, hair: 0x111111, top: 0x16161a, bottom: 0x16161a, shoes: 0x111111, hat: "niqab", robe: true, extra: "handbag" },
  },
  {
    id: "npc-huzur",
    name: "Huzur uncle",
    evidence: "White panjabi, pajama, and taqiyah. Ordinary dress. No religious emblem.",
    spec: { skin: 0xa86b45, hair: 0x6b5344, top: 0xf7f4ee, bottom: 0xf4f1ea, shoes: 0x6b4a32, hat: "taqiyah", beard: true, tunic: true },
  },
  {
    id: "npc-stall",
    name: "Footpath stall keeper",
    evidence: "Tea-and-cigarette footpath stall. Sign text is drawn on the separate tea-stall prop. Umbrella is a plain canopy.",
    spec: { skin: 0x8d5524, hair: 0x1c140f, top: 0xd96c6c, bottom: 0x2c4f86, shoes: 0x3a2a1c, bottomStyle: "denim", hat: "cap", extra: "stall" },
  },
  {
    id: "npc-hawker",
    name: "Hawker",
    evidence: "Shoulder-tray seller. Goods are colored blocks, not real product brands.",
    spec: { skin: 0xa86b45, hair: 0x24180f, top: 0xf0e2cf, bottom: 0x2c4f86, shoes: 0x3a2a1c, hat: "cap", extra: "tray", bottomStyle: "denim" },
  },
  {
    id: "npc-moto",
    name: "Motorcycle driver",
    evidence: "Helmet and red shirt. The bike is its own vehicle so the rider can stand in the lineup.",
    spec: { skin: 0x8d5524, hair: 0x1a1a1a, top: 0xb4232a, bottom: 0x2c4f86, shoes: 0x1a1a1a, hat: "helmet", bottomStyle: "denim" },
  },
  {
    id: "npc-chintai",
    name: "Chintaikari",
    evidence: "Sheet name kept. White vest and lungi, shoulder bag — a standing local silhouette, not a portrait.",
    spec: { skin: 0xc68642, hair: 0x24180f, top: 0xf7f4ee, bottom: 0x1f6b4a, shoes: 0x3a2a1c, bottomStyle: "lungi", extra: "handbag" },
  },
  {
    id: "npc-govt",
    name: "Government employee",
    evidence: "White shirt, dark trousers, briefcase, plain ID card. Not a named official.",
    spec: { skin: 0xe0ac69, hair: 0x24180f, top: 0xf7f4ee, bottom: 0x2a3142, shoes: 0x1a1a1a, extra: "briefcase" },
  },
  {
    id: "npc-conductor",
    name: "Bus conductor",
    evidence: "Blue shirt and cap used by many private-coach crews. Not a specific company's uniform kit.",
    spec: { skin: 0xa86b45, hair: 0x1c140f, top: 0x2a6fdb, bottom: 0x1c2838, shoes: 0x1a1a1a, hat: "cap", extra: "handbag" },
  },
  {
    id: "npc-student-f",
    name: "College student (girl)",
    evidence: "Salwar-kameez proportions in blue, books in hand. Dhaka campus dress, not a school brand.",
    spec: { skin: 0xe0ac69, hair: 0x1a120e, top: 0x6d8fd6, bottom: 0xf4f1ea, shoes: 0xf48fb1, tunic: true, extra: "books" },
  },
  {
    id: "npc-student-m",
    name: "College student (boy)",
    evidence: "White shirt, jeans, backpack. Generic campus dress.",
    spec: { skin: 0xc68642, hair: 0x24180f, top: 0xf7f4ee, bottom: 0x2c4f86, shoes: 0xf4f1ea, bottomStyle: "denim", extra: "backpack" },
  },
  {
    id: "npc-fruit",
    name: "Street vendor (fruit)",
    evidence: "Pushcart with loose fruit. No market-stall photograph is used as a texture.",
    spec: { skin: 0x8d5524, hair: 0x1c140f, top: 0xd98b5f, bottom: 0x1f6b4a, shoes: 0x3a2a1c, hat: "cap", bottomStyle: "lungi", extra: "cart" },
  },
  {
    id: "npc-construction",
    name: "Construction worker",
    evidence: "Orange vest and yellow hard hat. Common site wear. No contractor logo.",
    spec: { skin: 0xa86b45, hair: 0x1a1a1a, top: 0x2456a6, bottom: 0x2a3142, shoes: 0x6b3a1f, hat: "hardhat", extra: "vest" },
  },
  {
    id: "npc-cleaner",
    name: "Cleaner",
    evidence: "Green work shirt and a broom. City-corporation crews vary; this is a generic sweeper.",
    spec: { skin: 0x8d5524, hair: 0x1c140f, top: 0x1f7a4d, bottom: 0x1a3a2a, shoes: 0x3a2a1c, hat: "cap", extra: "broom" },
  },
  {
    id: "npc-cycle-driver",
    name: "Cycle rickshaw driver",
    evidence: "Same job as the rickshaw puller, sheet pose 18, with a checked lungi. Vehicle is separate.",
    spec: { skin: 0xa86b45, hair: 0x24180f, top: 0xf0d8c2, bottom: 0xd7c4a4, shoes: 0x3a2a1c, bottomStyle: "plaid" },
  },
  {
    id: "npc-boy",
    name: "Young helper",
    evidence: "Shorter scale, plain blue shirt, lungi, basket. Not a likeness of a child.",
    spec: { skin: 0xc68642, hair: 0x1a120e, top: 0x2a6fdb, bottom: 0x1f6b4a, shoes: 0x3a2a1c, bottomStyle: "lungi", scale: 0.78, extra: "basket" },
  },
  {
    id: "npc-elder",
    name: "Elderly man",
    evidence: "Beard, grey hair, light shirt, lungi. Generic elder, not a portrait.",
    spec: { skin: 0xc68642, hair: 0xc8c2b8, top: 0xf0e2cf, bottom: 0x2f6f8f, shoes: 0x6b4a32, bottomStyle: "plaid", beard: true, scale: 0.96 },
  },
];
