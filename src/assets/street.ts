import * as THREE from "three";
import { CATALOG, PLACEMENTS, type Placement } from "./catalog.ts";
import { releaseModel, type Collider } from "./kit.ts";
import type { SegWall, SolidBucket } from "../viewer/solids.ts";

function wallsFor(place: Placement, boxes: Collider[]): SegWall[] {
  const cos = Math.cos(place.yaw);
  const sin = Math.sin(place.yaw);
  const walls: SegWall[] = [];
  for (const box of boxes) {
    const corners: [number, number][] = [
      [box.min[0], box.min[2]],
      [box.max[0], box.min[2]],
      [box.max[0], box.max[2]],
      [box.min[0], box.max[2]],
    ];
    const world = corners.map(([lx, lz]) => {
      const x = place.x + lx * cos + lz * sin;
      const z = place.z + -lx * sin + lz * cos;
      return [x, z] as [number, number];
    });
    const y0 = place.y + box.min[1];
    const y1 = place.y + box.max[1];
    if (y1 - y0 < 0.2) continue;
    for (let i = 0; i < 4; i++) {
      const a = world[i];
      const b = world[(i + 1) % 4];
      walls.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], y0, y1 });
    }
  }
  return walls;
}

export function mountIntegratedAssets(scene: THREE.Scene): { bucket: SolidBucket; root: THREE.Group; dispose: () => void } {
  const root = new THREE.Group();
  root.name = "asset-yard";
  const byId = new Map(CATALOG.map((asset) => [asset.id, asset]));
  const walls: SegWall[] = [];
  for (const place of PLACEMENTS) {
    const asset = byId.get(place.assetId);
    if (!asset) continue;
    const model = asset.build();
    model.position.set(place.x, place.y, place.z);
    model.rotation.y = place.yaw;
    root.add(model);
    const boxes = (model.userData.colliders as Collider[] | undefined) ?? [];
    walls.push(...wallsFor(place, boxes));
  }
  scene.add(root);
  return {
    root,
    bucket: { walls, decks: [], roofs: [], columns: [] },
    dispose: () => {
      for (const child of root.children) releaseModel(child);
      scene.remove(root);
    },
  };
}
