/**
 * Headless traffic probe: runs the game's TrafficSim on one world folder at fixed points.
 *
 *   node --experimental-strip-types scripts/traffic-probe.ts <world folder> <label>
 *
 * Same chunk ring as the game (Chebyshev radius 2), High quality cap (14 cars),
 * seeded RNG, 600 simulated seconds at 60 Hz, player parked at the point.
 */
import fs from "node:fs";
import path from "node:path";
import { TrafficSim } from "../src/traffic/sim.ts";

const world = process.argv[2];
const label = process.argv[3] || world;
const POINTS: Record<string, [number, number]> = {
  "Kawran Bazar": [4320.2, -14094.3],
  Motijheel: [6687.8, -11384.1],
  Farmgate: [3904.5, -14789.1],
  Shahbagh: [4538.9, -12749.3],
  Jatrabari: [8368.3, -9477.0],
  "Gulshan 1": [6755.3, -17330.0],
};
const SECONDS = 600;
const DT = 1 / 60;

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const rows: Record<string, unknown> = {};
for (const [name, [x, z]] of Object.entries(POINTS)) {
  const sim = new TrafficSim({ max: 14, rand: lcg(1234) });
  const cx = Math.floor(x / 500);
  const cz = Math.floor(z / 500);
  for (let ix = cx - 2; ix <= cx + 2; ix++) {
    for (let iy = cz - 2; iy <= cz + 2; iy++) {
      const file = path.join(world, "chunks", `c_${ix}_${iy}.json`);
      if (!fs.existsSync(file)) continue;
      const chunk = JSON.parse(fs.readFileSync(file, "utf8"));
      sim.setChunk(`${ix}_${iy}`, chunk.graph.edges);
    }
  }
  const last = new Map<number, { held: string; edge: string; d: number }>();
  const gone: Record<string, number> = { "dead-end": 0, blocked: 0, "out of range": 0, other: 0 };
  let transitions = 0;
  let carSeconds = 0;
  let movingSeconds = 0;
  let metres = 0;
  let jump = 0;
  const pos = new Map<number, [number, number]>();
  const still = new Map<number, number>();
  let longestStill = 0;
  for (let t = 0; t < SECONDS; t += DT) {
    sim.tick(DT, { x, z });
    const live = new Set<number>();
    for (const car of sim.cars) {
      live.add(car.id);
      const prev = last.get(car.id);
      if (prev && prev.edge !== car.edge) transitions++;
      last.set(car.id, { held: car.held, edge: car.edge, d: Math.hypot(car.x - x, car.z - z) });
      carSeconds += DT;
      if (car.speed > 0.5) movingSeconds += DT;
      const was = pos.get(car.id);
      if (was) {
        const d = Math.hypot(car.x - was[0], car.z - was[1]);
        metres += d;
        jump = Math.max(jump, d);
      }
      pos.set(car.id, [car.x, car.z]);
      const held = car.speed < 0.5 ? (still.get(car.id) ?? 0) + DT : 0;
      still.set(car.id, held);
      longestStill = Math.max(longestStill, held);
    }
    for (const [id, prev] of last) {
      if (live.has(id)) continue;
      if (prev.d > 225) gone["out of range"]++;
      else if (prev.held === "dead-end") gone["dead-end"]++;
      else if (prev.held === "blocked") gone.blocked++;
      else gone.other++;
      last.delete(id);
      pos.delete(id);
      still.delete(id);
    }
  }
  const perMin = (n: number) => +(n / (SECONDS / 60)).toFixed(1);
  rows[name] = {
    driveableEdges: sim.edgeCount,
    spawns: sim.spawns,
    avgCars: +(carSeconds / SECONDS).toFixed(1),
    movingShare: +(movingSeconds / Math.max(1e-9, carSeconds)).toFixed(3),
    // Mean speed over all car time, and the largest one-frame move (a jump means a snap).
    metresPerCarSecond: +(metres / Math.max(1e-9, carSeconds)).toFixed(2),
    largestFrameMoveM: +jump.toFixed(2),
    longestStandstillS: +longestStill.toFixed(1),
    junctionTransitionsPerMin: perMin(transitions),
    vanishPerMin: { deadEnd: perMin(gone["dead-end"]), blocked: perMin(gone.blocked), other: perMin(gone.other) },
    outOfRangePerMin: perMin(gone["out of range"]),
  };
}
console.log(JSON.stringify({ label, seconds: SECONDS, rows }, null, 1));
