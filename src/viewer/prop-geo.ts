import * as THREE from "three";

const cache = new Map<string, THREE.BufferGeometry>();

function once(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = cache.get(key);
  if (!geo) {
    geo = build();
    cache.set(key, geo);
  }
  return geo;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const part of parts) {
    const attr = part.getAttribute("position");
    const index = part.getIndex();
    for (let i = 0; i < attr.count; i++) {
      const wobble = 1 + (((i * 17) % 9) - 4) * 0.025;
      pos.push(attr.getX(i) * wobble, attr.getY(i), attr.getZ(i) * wobble);
    }
    if (index) for (let i = 0; i < index.count; i++) idx.push(index.getX(i) + base);
    base += attr.count;
    part.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Three offset cones. Shared by every broadleaf instance. */
function layeredCanopy(): THREE.BufferGeometry {
  const lower = new THREE.ConeGeometry(1.35, 0.5, 7);
  const mid = new THREE.ConeGeometry(1.02, 0.55, 6);
  const top = new THREE.ConeGeometry(0.58, 0.4, 5);
  lower.translate(0.06, -0.02, -0.04);
  mid.translate(-0.05, 0.3, 0.04);
  top.translate(0.02, 0.58, 0);
  return mergeParts([lower, mid, top]);
}

function palmFan(): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const b = pos.length / 3;
    pos.push(0, 0.05, 0, c * 0.26, 0.14, s * 0.26, c * 1.4, -0.46, s * 1.4);
    idx.push(b, b + 1, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function trunkGeometry(): THREE.BufferGeometry {
  return once("trunk", () => new THREE.CylinderGeometry(0.22, 0.34, 1, 5));
}

export function canopyGeometry(): THREE.BufferGeometry {
  return once("canopy", layeredCanopy);
}

export function palmGeometry(): THREE.BufferGeometry {
  return once("palm", palmFan);
}

export function poleGeometry(): THREE.BufferGeometry {
  return once("pole", () => new THREE.CylinderGeometry(0.07, 0.1, 1, 5));
}

export function lampHeadGeometry(): THREE.BufferGeometry {
  return once("lamp-head", () => new THREE.SphereGeometry(0.22, 6, 5));
}

export function tankGeometry(): THREE.BufferGeometry {
  return once("tank", () => new THREE.CylinderGeometry(0.55, 0.55, 0.7, 8));
}

export function antennaGeometry(): THREE.BufferGeometry {
  return once("antenna", () => new THREE.CylinderGeometry(0.03, 0.04, 1, 4));
}

export function sleeperGeometry(): THREE.BufferGeometry {
  return once("sleeper", () => new THREE.BoxGeometry(2.65, 0.14, 0.26));
}

/** Test hook. Shared props live for the page, not for one chunk. */
export function disposeSharedProps(): void {
  for (const geo of cache.values()) geo.dispose();
  cache.clear();
}
