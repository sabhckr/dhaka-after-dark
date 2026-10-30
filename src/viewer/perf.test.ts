import assert from "node:assert/strict";
import test from "node:test";
import { createFrameProbe, createStageTimer, summarize } from "./perf.ts";
import { FAR_PROP_CHUNK, farPropsHidden } from "./detail.ts";

test("frame summary reports median and a high percentile, not the max", () => {
  const values = Array.from({ length: 40 }, () => 12);
  values[7] = 1250;
  const stats = summarize(values);
  assert.equal(stats.n, 40);
  assert.equal(stats.median, 12);
  assert.ok(stats.p95 < 100);
  assert.equal(stats.max, 1250);
});

test("capture samples are omitted from the gameplay summary", () => {
  const probe = createFrameProbe();
  const info = { render: { calls: 10, triangles: 20 }, memory: { geometries: 1, textures: 1 } };
  probe.begin(1000);
  probe.noteRender(4);
  probe.end(1008, info, 16);
  probe.beginCapture();
  probe.begin(1100);
  probe.noteRender(30);
  probe.end(1400, info, 1000);
  probe.endCapture();
  probe.begin(2500);
  probe.noteRender(4);
  probe.end(2508, info, 1100);
  probe.begin(2516);
  probe.noteRender(5);
  probe.end(2522, info, 16);
  const summary = probe.summary();
  assert.equal(summary.excluded, 2);
  assert.equal(summary.frames, 2);
  assert.ok(summary.gap.max < 50);
});

test("far props hide only outside the near ring and do not change the stream radii", () => {
  assert.equal(FAR_PROP_CHUNK, 2);
  assert.equal(farPropsHidden(0), false);
  assert.equal(farPropsHidden(1), false);
  assert.equal(farPropsHidden(2), true);
});

test("stage timer keeps count, total and worst call per stage", () => {
  let t = 0;
  const timer = createStageTimer(() => t);
  timer.time("build", () => {
    t += 5;
  });
  timer.time("build", () => {
    t += 12;
  });
  assert.throws(() =>
    timer.time("parse", () => {
      t += 3;
      throw new Error("bad");
    }),
  );
  assert.deepEqual(timer.report(), {
    build: { n: 2, totalMs: 17, maxMs: 12 },
    parse: { n: 1, totalMs: 3, maxMs: 3 },
  });
  timer.reset();
  assert.deepEqual(timer.report(), {});
});
