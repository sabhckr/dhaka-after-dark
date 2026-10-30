import assert from "node:assert/strict";
import test from "node:test";
import { IntegrationQueue } from "./integrate.ts";

test("runs tasks in order until the budget is spent, at least one per call", () => {
  let t = 0;
  const q = new IntegrationQueue(() => t);
  const done: number[] = [];
  for (let i = 0; i < 5; i++)
    q.push(() => {
      done.push(i);
      t += 4;
    });
  assert.equal(q.run(6), 2);
  assert.deepEqual(done, [0, 1]);
  assert.equal(q.run(0), 1, "a spent budget still runs one task");
  assert.equal(q.run(100), 2);
  assert.deepEqual(done, [0, 1, 2, 3, 4]);
  assert.equal(q.size, 0);
  assert.equal(q.run(5), 0);
});

test("a failing task is reported and the rest still run", () => {
  const q = new IntegrationQueue(() => 0);
  const seen: string[] = [];
  q.push(() => {
    throw new Error("broken chunk");
  });
  q.push(() => seen.push("next"));
  const errs: unknown[] = [];
  q.run(10, (e) => errs.push(e));
  assert.equal(errs.length, 1);
  assert.deepEqual(seen, ["next"]);
});

test("tasks queued while running wait for the next call", () => {
  const q = new IntegrationQueue(() => 0);
  const seen: string[] = [];
  q.push(() => {
    seen.push("a");
    q.push(() => seen.push("b"));
  });
  q.run(0);
  assert.deepEqual(seen, ["a"]);
  q.run(0);
  assert.deepEqual(seen, ["a", "b"]);
});
