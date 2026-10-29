/**
 * Visual road meshes only. Input polylines are copied. Graph nodes, edge ids,
 * and source coordinates are not written back.
 *
 * Sharp corners on one way were a ribbon bug: the offset used the averaged
 * neighbour tangent, so a 90° bend sat at `half` instead of `half * √2` and
 * the carriageway bit a triangle out of the corner. Miters fix that. Miters
 * longer than `miterLimit` become a bevel so hairpins cannot spike.
 */

export type VisualRoad = {
  id: number;
  half: number;
  y: number;
  bridge: boolean;
  marked: boolean;
  pts: number[];
};

export type JunctionPad = {
  y: number;
  marked: boolean;
  ring: number[];
};

const SNAP = 1;

function snapKey(x: number, z: number): string {
  return `${Math.round(x / SNAP)}_${Math.round(z / SNAP)}`;
}

function onBorder(x: number, z: number, origin: [number, number], size: number): boolean {
  const u = x - origin[0];
  const v = z - origin[1];
  const e = 2.5;
  return u <= e || v <= e || u >= size - e || v >= size - e;
}

function dirAway(pts: number[], end: 0 | 1): { x: number; z: number; dx: number; dz: number } | null {
  const n = pts.length / 2;
  if (n < 2) return null;
  const i = end === 0 ? 0 : n - 1;
  const j = end === 0 ? 1 : n - 2;
  const x = pts[i * 2];
  const z = pts[i * 2 + 1];
  const dx = pts[j * 2] - x;
  const dz = pts[j * 2 + 1] - z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return null;
  return { x, z, dx: dx / len, dz: dz / len };
}

function reversePts(pts: number[]): number[] {
  const out: number[] = [];
  for (let i = pts.length / 2 - 1; i >= 0; i--) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

function moveToward(pts: number[], index: number, toward: number, dist: number): void {
  const dx = pts[toward * 2] - pts[index * 2];
  const dz = pts[toward * 2 + 1] - pts[index * 2 + 1];
  const len = Math.hypot(dx, dz);
  if (len < 0.2) return;
  const d = Math.min(Math.max(0, dist), len * 0.55);
  if (d < 0.08) return;
  pts[index * 2] += (dx / len) * d;
  pts[index * 2 + 1] += (dz / len) * d;
}

function sameLevel(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.8;
}

type MutableRoad = VisualRoad & { alive: boolean; uid: number };

function chainRoads(roads: MutableRoad[]): void {
  let guard = roads.length;
  while (guard-- > 0) {
    const ends = new Map<string, { road: MutableRoad; end: 0 | 1 }[]>();
    for (const road of roads) {
      if (!road.alive) continue;
      for (const end of [0, 1] as const) {
        const info = dirAway(road.pts, end);
        if (!info) continue;
        const key = snapKey(info.x, info.z);
        let list = ends.get(key);
        if (!list) ends.set(key, (list = []));
        list.push({ road, end });
      }
    }
    let merged = false;
    for (const list of ends.values()) {
      const uniq: { road: MutableRoad; end: 0 | 1 }[] = [];
      const seen = new Set<MutableRoad>();
      let clash = false;
      for (const item of list) {
        if (seen.has(item.road)) {
          clash = true;
          break;
        }
        seen.add(item.road);
        uniq.push(item);
      }
      if (clash || uniq.length !== 2) continue;
      const [a, b] = uniq;
      if (a.road.bridge !== b.road.bridge || !sameLevel(a.road.y, b.road.y)) continue;
      const maxH = Math.max(a.road.half, b.road.half);
      if (Math.abs(a.road.half - b.road.half) / maxH > 0.25) continue;
      const da = dirAway(a.road.pts, a.end);
      const db = dirAway(b.road.pts, b.end);
      if (!da || !db) continue;
      const away = da.dx * db.dx + da.dz * db.dz;
      if (away > 0.75) continue;
      const left = a.end === 1 ? a.road.pts.slice() : reversePts(a.road.pts);
      const right = b.end === 0 ? b.road.pts.slice() : reversePts(b.road.pts);
      a.road.pts = left.concat(right.slice(2));
      a.road.half = (a.road.half + b.road.half) / 2;
      a.road.y = (a.road.y + b.road.y) / 2;
      a.road.marked = a.road.marked || b.road.marked;
      b.road.alive = false;
      merged = true;
      break;
    }
    if (!merged) break;
  }
}

function closestOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  const x = ax + dx * t;
  const z = az + dz * t;
  return { d: Math.hypot(px - x, pz - z), t };
}

function trimStems(roads: MutableRoad[], origin: [number, number], size: number): void {
  const interiors = new Map<string, { half: number; y: number; uid: number }[]>();
  for (const road of roads) {
    if (!road.alive) continue;
    const n = road.pts.length / 2;
    for (let i = 1; i < n - 1; i++) {
      const key = snapKey(road.pts[i * 2], road.pts[i * 2 + 1]);
      let list = interiors.get(key);
      if (!list) interiors.set(key, (list = []));
      list.push({ half: road.half, y: road.y, uid: road.uid });
    }
  }
  for (const road of roads) {
    if (!road.alive) continue;
    const n = road.pts.length / 2;
    if (n < 2) continue;
    for (const end of [0, 1] as const) {
      const info = dirAway(road.pts, end);
      if (!info || onBorder(info.x, info.z, origin, size)) continue;
      const hits = (interiors.get(snapKey(info.x, info.z)) || []).filter(
        (hit) => hit.uid !== road.uid && sameLevel(hit.y, road.y),
      );
      let inset = hits.length ? Math.max(...hits.map((hit) => hit.half)) - 0.12 : 0;
      if (!hits.length) {
        for (const other of roads) {
          if (!other.alive || other.id === road.id || !sameLevel(other.y, road.y)) continue;
          const m = other.pts.length / 2;
          for (let s = 0; s < m - 1; s++) {
            const hit = closestOnSegment(
              info.x,
              info.z,
              other.pts[s * 2],
              other.pts[s * 2 + 1],
              other.pts[(s + 1) * 2],
              other.pts[(s + 1) * 2 + 1],
            );
            if (hit.t < 0.04 || hit.t > 0.96 || hit.d > 1.25) continue;
            inset = Math.max(inset, other.half - 0.12);
          }
        }
      }
      if (inset < 0.2) continue;
      const index = end === 0 ? 0 : n - 1;
      const toward = end === 0 ? 1 : n - 2;
      moveToward(road.pts, index, toward, inset);
    }
  }
}

function convexHull(points: [number, number][]): [number, number][] {
  const uniq = new Map<string, [number, number]>();
  for (const p of points) uniq.set(`${p[0].toFixed(2)}_${p[1].toFixed(2)}`, p);
  const pts = [...uniq.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return [];
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function tangentAt(pts: number[], index: number): { x: number; z: number } | null {
  const n = pts.length / 2;
  const i0 = Math.max(0, index - 1);
  const i1 = Math.min(n - 1, index + 1);
  if (i0 === i1) return null;
  const dx = pts[i1 * 2] - pts[i0 * 2];
  const dz = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return null;
  return { x: dx / len, z: dz / len };
}

function makePad(
  center: { x: number; z: number },
  tangents: { x: number; z: number; half: number }[],
  y: number,
  marked: boolean,
): JunctionPad | null {
  if (tangents.length < 2) return null;
  let angled = false;
  for (let i = 0; i < tangents.length && !angled; i++) {
    for (let j = i + 1; j < tangents.length; j++) {
      const dot = Math.abs(tangents[i].x * tangents[j].x + tangents[i].z * tangents[j].z);
      if (dot < 0.82) angled = true;
    }
  }
  if (!angled) return null;
  const raw: [number, number][] = [];
  const maxH = Math.max(...tangents.map((t) => t.half));
  for (const tan of tangents) {
    raw.push([center.x - tan.z * tan.half, center.z + tan.x * tan.half]);
    raw.push([center.x + tan.z * tan.half, center.z - tan.x * tan.half]);
  }
  for (let i = 0; i < tangents.length; i++) {
    for (let j = i + 1; j < tangents.length; j++) {
      const a = tangents[i];
      const b = tangents[j];
      const det = a.x * b.z - a.z * b.x;
      if (Math.abs(det) < 0.2) continue;
      for (const s1 of [1, -1]) {
        for (const s2 of [1, -1]) {
          const p1x = center.x + -a.z * a.half * s1;
          const p1z = center.z + a.x * a.half * s1;
          const p2x = center.x + -b.z * b.half * s2;
          const p2z = center.z + b.x * b.half * s2;
          const t = ((p2x - p1x) * b.z - (p2z - p1z) * b.x) / det;
          if (Math.abs(t) > maxH * 2.4) continue;
          const x = p1x + a.x * t;
          const z = p1z + a.z * t;
          if (Math.hypot(x - center.x, z - center.z) > maxH * 2.6) continue;
          raw.push([x, z]);
        }
      }
    }
  }
  const ring = convexHull(raw);
  if (ring.length < 3) return null;
  if (ring.some((p) => Math.hypot(p[0] - center.x, p[1] - center.z) > maxH * 2.8)) return null;
  return { y, marked, ring: ring.flat() };
}

function padsFor(roads: MutableRoad[], origin: [number, number], size: number): JunctionPad[] {
  const groups = new Map<string, { x: number; z: number; hits: { road: MutableRoad; index: number }[] }>();
  for (const road of roads) {
    if (!road.alive) continue;
    const n = road.pts.length / 2;
    for (let i = 0; i < n; i++) {
      const x = road.pts[i * 2];
      const z = road.pts[i * 2 + 1];
      if (onBorder(x, z, origin, size)) continue;
      const key = snapKey(x, z);
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { x, z, hits: [] }));
      group.hits.push({ road, index: i });
    }
  }
  const pads: JunctionPad[] = [];
  for (const group of groups.values()) {
    const byRoad = new Map<MutableRoad, { road: MutableRoad; index: number }>();
    for (const hit of group.hits) if (!byRoad.has(hit.road)) byRoad.set(hit.road, hit);
    if (byRoad.size < 2) continue;
    const items = [...byRoad.values()];
    if (!items.every((item) => sameLevel(item.road.y, items[0].road.y))) continue;
    const tangents: { x: number; z: number; half: number }[] = [];
    for (const item of items) {
      const tan = tangentAt(item.road.pts, item.index);
      if (tan) tangents.push({ ...tan, half: item.road.half });
    }
    const pad = makePad(
      { x: group.x, z: group.z },
      tangents,
      Math.max(...items.map((item) => item.road.y)) + 0.012,
      items.some((item) => item.road.marked),
    );
    if (pad) pads.push(pad);
  }
  const live = roads.filter((road) => road.alive);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    const an = a.pts.length / 2;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      if (!sameLevel(a.y, b.y)) continue;
      const bn = b.pts.length / 2;
      for (let s = 0; s < an - 1; s++) {
        const a1x = a.pts[s * 2];
        const a1z = a.pts[s * 2 + 1];
        const a2x = a.pts[(s + 1) * 2];
        const a2z = a.pts[(s + 1) * 2 + 1];
        const dax = a2x - a1x;
        const daz = a2z - a1z;
        for (let k = 0; k < bn - 1; k++) {
          const b1x = b.pts[k * 2];
          const b1z = b.pts[k * 2 + 1];
          const b2x = b.pts[(k + 1) * 2];
          const b2z = b.pts[(k + 1) * 2 + 1];
          const dbx = b2x - b1x;
          const dbz = b2z - b1z;
          const det = dax * dbz - daz * dbx;
          if (Math.abs(det) < 1e-4) continue;
          const ux = b1x - a1x;
          const uz = b1z - a1z;
          const ta = (ux * dbz - uz * dbx) / det;
          const tb = (ux * daz - uz * dax) / det;
          if (ta < 0.08 || ta > 0.92 || tb < 0.08 || tb > 0.92) continue;
          const x = a1x + dax * ta;
          const z = a1z + daz * ta;
          if (onBorder(x, z, origin, size)) continue;
          if (pads.some((pad) => Math.hypot(pad.ring[0] - x, pad.ring[1] - z) < 3)) continue;
          const al = Math.hypot(dax, daz) || 1;
          const bl = Math.hypot(dbx, dbz) || 1;
          const pad = makePad(
            { x, z },
            [
              { x: dax / al, z: daz / al, half: a.half },
              { x: dbx / bl, z: dbz / bl, half: b.half },
            ],
            Math.max(a.y, b.y) + 0.012,
            a.marked || b.marked,
          );
          if (pad) pads.push(pad);
        }
      }
    }
  }
  return pads;
}

/** Copy roads, join compatible way-ends, and pull T-stems back to the through carriageway. */
export function prepareVisualRoads(
  roads: VisualRoad[],
  origin: [number, number],
  chunkSize = 500,
): { roads: VisualRoad[]; pads: JunctionPad[] } {
  const copy: MutableRoad[] = roads
    .filter((road) => road.pts.length >= 4 && road.half > 0.2)
    .map((road, uid) => ({ ...road, pts: road.pts.slice(), alive: true, uid }));
  chainRoads(copy);
  trimStems(copy, origin, chunkSize);
  const live = copy.filter((road) => road.alive && road.pts.length >= 4);
  const pads = padsFor(live, origin, chunkSize);
  return {
    roads: live.map(({ alive: _alive, ...road }) => road),
    pads,
  };
}

export type MiterOutline = {
  left: number[];
  right: number[];
  dist: number[];
  /** Index into the input polyline for each outline sample. Bevels repeat the corner. */
  src: number[];
};

/**
 * Offset a polyline into a carriageway. 90° corners meet at `half * √2`.
 * Longer miters are bevelled. The centreline is not moved.
 */
export function miterOutline(flat: number[], half: number, miterLimit = 2.2): MiterOutline {
  const src: number[] = [];
  const srcIndex: number[] = [];
  const nIn = flat.length / 2;
  for (let i = 0; i < nIn; i++) {
    const x = flat[i * 2];
    const z = flat[i * 2 + 1];
    if (src.length >= 2) {
      const px = src[src.length - 2];
      const pz = src[src.length - 1];
      if (Math.hypot(x - px, z - pz) < 0.05 && i !== nIn - 1) continue;
    }
    src.push(x, z);
    srcIndex.push(i);
  }
  const n = src.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  const dist: number[] = [];
  const from: number[] = [];
  if (n < 2 || half <= 0) return { left, right, dist, src: from };
  const at = (i: number) => ({ x: src[i * 2], z: src[i * 2 + 1] });
  const seg = (i: number, j: number) => {
    const a = at(i);
    const b = at(j);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return null;
    return { x: dx / len, z: dz / len, len };
  };
  let travelled = 0;
  const push = (lx: number, lz: number, rx: number, rz: number, d: number, fromIndex: number) => {
    left.push(lx, lz);
    right.push(rx, rz);
    dist.push(d);
    from.push(fromIndex);
  };
  for (let i = 0; i < n; i++) {
    const p = at(i);
    if (i > 0) {
      const step = seg(i - 1, i);
      travelled += step?.len ?? 0;
    }
    const din = i > 0 ? seg(i - 1, i) : null;
    const dout = i + 1 < n ? seg(i, i + 1) : null;
    const one = din || dout;
    if (!one || !din || !dout) {
      if (!one) continue;
      const nx = -one.z * half;
      const nz = one.x * half;
      push(p.x + nx, p.z + nz, p.x - nx, p.z - nz, travelled, srcIndex[i]);
      continue;
    }
    const normalIn = { x: -din.z, z: din.x };
    const nOut = { x: -dout.z, z: dout.x };
    const mx = normalIn.x + nOut.x;
    const mz = normalIn.z + nOut.z;
    const ml = Math.hypot(mx, mz);
    const bevel = () => {
      push(p.x + normalIn.x * half, p.z + normalIn.z * half, p.x - normalIn.x * half, p.z - normalIn.z * half, travelled, srcIndex[i]);
      push(p.x + nOut.x * half, p.z + nOut.z * half, p.x - nOut.x * half, p.z - nOut.z * half, travelled, srcIndex[i]);
    };
    if (ml < 0.2) {
      bevel();
      continue;
    }
    const m = { x: mx / ml, z: mz / ml };
    const denom = m.x * normalIn.x + m.z * normalIn.z;
    if (denom < 0.2) {
      bevel();
      continue;
    }
    const scale = half / denom;
    if (scale > half * miterLimit) bevel();
    else push(p.x + m.x * scale, p.z + m.z * scale, p.x - m.x * scale, p.z - m.z * scale, travelled, srcIndex[i]);
  }
  return { left, right, dist, src: from };
}

/**
 * Insert a short quadratic fillet on gentle bends. Pinned vertices (ends,
 * graph nodes, junctions) stay on the source polyline. New points stay within
 * `maxMove` of the corner. Sharp turns are left for the miter.
 */
export function filletGentleBends(flat: number[], pinned: readonly boolean[], maxMove = 1.15): number[] {
  const n = flat.length / 2;
  if (n < 3) return flat.slice();
  const out: number[] = [flat[0], flat[1]];
  for (let i = 1; i < n - 1; i++) {
    const ax = flat[(i - 1) * 2];
    const az = flat[(i - 1) * 2 + 1];
    const bx = flat[i * 2];
    const bz = flat[i * 2 + 1];
    const cx = flat[(i + 1) * 2];
    const cz = flat[(i + 1) * 2 + 1];
    if (pinned[i]) {
      out.push(bx, bz);
      continue;
    }
    const abx = bx - ax;
    const abz = bz - az;
    const bcx = cx - bx;
    const bcz = cz - bz;
    const lab = Math.hypot(abx, abz) || 1;
    const lbc = Math.hypot(bcx, bcz) || 1;
    const dot = (abx * bcx + abz * bcz) / (lab * lbc);
    if (dot >= 0.992 || dot <= 0.72) {
      out.push(bx, bz);
      continue;
    }
    const sinHalf = Math.sqrt(Math.max(0, (1 - dot) / 2));
    const maxT = sinHalf > 1e-4 ? maxMove / (0.5 * sinHalf) : 0;
    const t = Math.min(lab * 0.45, lbc * 0.45, maxT);
    if (t < 0.45) {
      out.push(bx, bz);
      continue;
    }
    const t1x = bx - (abx / lab) * t;
    const t1z = bz - (abz / lab) * t;
    const t2x = bx + (bcx / lbc) * t;
    const t2z = bz + (bcz / lbc) * t;
    const bez = (u: number) => {
      const o = 1 - u;
      return {
        x: o * o * t1x + 2 * o * u * bx + u * u * t2x,
        z: o * o * t1z + 2 * o * u * bz + u * u * t2z,
      };
    };
    out.push(t1x, t1z);
    for (const u of [0.35, 0.65]) {
      const p = bez(u);
      out.push(p.x, p.z);
    }
    out.push(t2x, t2z);
  }
  out.push(flat[(n - 1) * 2], flat[(n - 1) * 2 + 1]);
  return out;
}
