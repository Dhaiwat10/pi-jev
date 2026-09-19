import assert from "node:assert/strict";
import test from "node:test";
import { plan } from "../src/planner.js";

const tasks = [
  { id: "deploy", dependencies: ["build", "audit"], priority: 9 },
  { id: "lint", dependencies: [], priority: 2 },
  { id: "test", dependencies: ["build"], priority: 8 },
  { id: "build", dependencies: ["lint"], priority: 5 },
  { id: "audit", dependencies: [], priority: 7 },
  { id: "docs", dependencies: [], priority: 2 },
];

test("plans deterministic dependency-safe batches", () => {
  assert.deepEqual(plan(tasks, 2), [
    ["audit", "docs"],
    ["lint"],
    ["build"],
    ["deploy", "test"],
  ]);
});

test("respects maxParallel one", () => {
  assert.deepEqual(plan(tasks, 1), [["audit"], ["docs"], ["lint"], ["build"], ["deploy"], ["test"]]);
});

test("does not mutate inputs", () => {
  const copy = structuredClone(tasks);
  plan(tasks, 3);
  assert.deepEqual(tasks, copy);
});

test("supports empty plans", () => assert.deepEqual(plan([], 2), []));

for (const value of [0, -1, 1.5, Number.NaN]) {
  test(`rejects maxParallel ${value}`, () => assert.throws(() => plan(tasks, value), /maxParallel/i));
}

test("rejects duplicate ids", () => assert.throws(() => plan([
  { id: "a", dependencies: [], priority: 1 },
  { id: "a", dependencies: [], priority: 2 },
], 1), /duplicate/i));

test("rejects empty ids", () => assert.throws(() => plan([
  { id: "", dependencies: [], priority: 1 },
], 1), /id/i));

test("rejects missing dependencies", () => assert.throws(() => plan([
  { id: "a", dependencies: ["missing"], priority: 1 },
], 1), /missing/i));

test("rejects self dependencies", () => assert.throws(() => plan([
  { id: "a", dependencies: ["a"], priority: 1 },
], 1), /self|cycle/i));

test("reports a cycle member", () => assert.throws(() => plan([
  { id: "alpha", dependencies: ["beta"], priority: 1 },
  { id: "beta", dependencies: ["gamma"], priority: 1 },
  { id: "gamma", dependencies: ["alpha"], priority: 1 },
], 2), /cycle.*(alpha|beta|gamma)|(alpha|beta|gamma).*cycle/i));

test("uses id as ready-task tie breaker", () => assert.deepEqual(plan([
  { id: "z", dependencies: [], priority: 1 },
  { id: "a", dependencies: [], priority: 1 },
  { id: "m", dependencies: [], priority: 2 },
], 3), [["m", "a", "z"]]));
