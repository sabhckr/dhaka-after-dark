import assert from "node:assert/strict";
import test from "node:test";
import { filletGentleBends, miterOutline, prepareVisualRoads, type VisualRoad } from "./roads.ts";

function road(partial: Partial<VisualRoad> & Pick<VisualRoad, "id" | "pts">): VisualRoad {
  return { half: 3, y: 0.28, bridge: false, marked: true, ...partial };
}

test("miter keeps a straight carriageway at the right width", () => {
  const outline = miterOutline([0, 0, 40, 0], 4);
  assert.equal(outline.dist.length, 2);
  assert.ok(Math.abs(outline.left[1] - 4) < 1e-6);
  assert.ok(Math.abs(outline.right[1] + 4) < 1e-6);
  assert.equal(outline.left[0], 0);
  assert.equal(outline.dist[1], 40);
});

test("a 90 degree bend miters instead of cutting the corner", () => {
  const half = 3;
  const outline = miterOutline([0, 0, 20, 0, 20, 20], half);
  let best = 0;
  const corner = { x: 20, y: 0 };
  for (const side of [outline.left, outline.right]) {
    for (let i = 0; i < side.length; i += 2) {
      const d = Math.hypot(side[i] - corner.x, side[i + 1] - corner.y);
      if (d > 8) continue;
      best = Math.max(best, d);
    }
  }
  assert.ok(Math.abs(best - half * Math.SQRT2) < 0.05, `outer ${best}`);
  assert.ok(best < half * 2.2 + 0.05);
  assert.equal(outline.src[0], 0);
  assert.equal(outline.src[outline.src.length - 1], 2);
  assert.equal(outline.src.length, outline.dist.length);
});

test("a hairpin bevel stays inside the miter limit", () => {
  const half = 4;
  const flat = [0, 0, 10, 0, 10.2, 0.2, 0, 0.4];
  const outline = miterOutline(flat, half, 2.2);
  const distToLine = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i < flat.length / 2 - 1; i++) {
      const ax = flat[i * 2];
      const az = flat[i * 2 + 1];
      const bx = flat[(i + 1) * 2];
      const bz = flat[(i + 1) * 2 + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  };
  for (const side of [outline.left, outline.right]) {
    for (let i = 0; i < side.length; i += 2) {
      const d = distToLine(side[i], side[i + 1]);
      assert.ok(d < half * 2.25, `spike ${d}`);
    }
  }
});

test("fillet rounds a gentle bend and leaves sharp corners and pins", () => {
  const gentle = filletGentleBends([0, 0, 12, 2, 24, 0], [true, false, true]);
  assert.ok(gentle.length > 6);
  assert.equal(gentle[0], 0);
  assert.equal(gentle[1], 0);
  assert.equal(gentle[gentle.length - 2], 24);
  assert.equal(gentle[gentle.length - 1], 0);
  const sharp = filletGentleBends([0, 0, 10, 0, 10, 12], [true, false, true]);
  assert.deepEqual(sharp, [0, 0, 10, 0, 10, 12]);
  const pinned = filletGentleBends([0, 0, 12, 2, 24, 0], [true, true, true]);
  assert.deepEqual(pinned, [0, 0, 12, 2, 24, 0]);
});

test("visual joins do not rewrite the source polyline", () => {
  const through = road({ id: 1, half: 5, pts: [0, 0, 20, 0, 40, 0] });
  const stem = road({ id: 2, half: 2, pts: [20, 0, 20, 24] });
  const srcThrough = through.pts.slice();
  const srcStem = stem.pts.slice();
  const visual = prepareVisualRoads([through, stem], [-80, -80]);
  assert.deepEqual(through.pts, srcThrough);
  assert.deepEqual(stem.pts, srcStem);
  const outStem = visual.roads.find((item) => item.id === 2);
  assert.ok(outStem);
  assert.ok(outStem.pts[1] > 4, `stem still enters the junction ${outStem.pts[1]}`);
  assert.ok(outStem.pts[1] < 6);
  const outThrough = visual.roads.find((item) => item.id === 1);
  assert.deepEqual(outThrough?.pts, srcThrough);
});

test("chunk-border ends and straight joins stay continuous", () => {
  const stem = road({ id: 2, half: 2, pts: [0, 0, 0, 20] });
  const through = road({ id: 1, half: 5, pts: [-10, 0, 20, 0] });
  const visual = prepareVisualRoads([through, stem], [0, 0]);
  assert.equal(visual.roads.find((item) => item.id === 2)?.pts[0], 0);
  const a = road({ id: 3, half: 4, pts: [-30, 5, -10, 5] });
  const b = road({ id: 4, half: 4.2, pts: [-10, 5, 16, 5] });
  const joined = prepareVisualRoads([a, b], [-100, -100]);
  assert.equal(joined.roads.length, 1);
  assert.equal(joined.roads[0].pts[0], -30);
  assert.equal(joined.roads[0].pts[joined.roads[0].pts.length - 2], 16);
});

test("two pieces of one OSM way still chain", () => {
  const a = road({ id: 7, half: 4, pts: [0, 0, 10, 0] });
  const b = road({ id: 7, half: 4, pts: [10, 0, 24, 0] });
  const srcA = a.pts.slice();
  const visual = prepareVisualRoads([a, b], [-40, -40]);
  assert.deepEqual(a.pts, srcA);
  assert.equal(visual.roads.length, 1);
  assert.equal(visual.roads[0].pts[0], 0);
  assert.equal(visual.roads[0].pts[visual.roads[0].pts.length - 2], 24);
});

test("a similar-width corner becomes one mitred way", () => {
  const a = road({ id: 8, half: 3, pts: [0, 0, 15, 0] });
  const b = road({ id: 9, half: 3.1, pts: [15, 0, 15, 18] });
  const visual = prepareVisualRoads([a, b], [-40, -40]);
  assert.equal(visual.roads.length, 1);
  const outline = miterOutline(visual.roads[0].pts, visual.roads[0].half);
  let best = 0;
  for (const side of [outline.left, outline.right]) {
    for (let i = 0; i < side.length; i += 2) {
      const d = Math.hypot(side[i] - 15, side[i + 1]);
      if (d > 8) continue;
      best = Math.max(best, d);
    }
  }
  assert.ok(Math.abs(best - visual.roads[0].half * Math.SQRT2) < 0.08, `corner ${best}`);
});

test("a crossing keeps both centre lines and adds a pad", () => {
  const a = road({ id: 1, half: 4, pts: [0, 10, 40, 10] });
  const b = road({ id: 2, half: 4, pts: [20, -10, 20, 30] });
  const visual = prepareVisualRoads([a, b], [-50, -50]);
  assert.equal(visual.roads.length, 2);
  assert.deepEqual(visual.roads[0].pts, a.pts);
  assert.ok(visual.pads.length >= 1);
  const ring = visual.pads[0].ring;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]);
    maxX = Math.max(maxX, ring[i]);
    minZ = Math.min(minZ, ring[i + 1]);
    maxZ = Math.max(maxZ, ring[i + 1]);
  }
  assert.ok(minX < 18 && maxX > 22 && minZ < 8 && maxZ > 12, `${minX},${maxX},${minZ},${maxZ}`);
});
