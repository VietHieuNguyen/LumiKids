import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignmentState,
  canStart,
  createAssignmentSchema,
  decideReplaySchema,
  playableUntil,
} from "../dist/index.js";

const day = (d) => new Date(`2026-11-${String(d).padStart(2, "0")}T10:00:00.000Z`);
const base = { status: "ACTIVE", opensAt: day(10), dueAt: day(15) };

test("assignment state follows opening, deadline and cancellation", () => {
  assert.equal(assignmentState(base, day(9)), "UPCOMING");
  assert.equal(assignmentState(base, day(12)), "OPEN");
  assert.equal(assignmentState(base, day(15)), "OPEN");
  assert.equal(assignmentState(base, day(16)), "CLOSED");
  assert.equal(assignmentState({ ...base, dueAt: null }, day(28)), "OPEN");
  assert.equal(assignmentState({ ...base, status: "CANCELLED" }, day(12)), "CANCELLED");
});

test("an extension only ever lengthens the child's window", () => {
  assert.deepEqual(playableUntil(base, null), day(15));
  assert.deepEqual(playableUntil(base, day(20)), day(20));
  assert.deepEqual(playableUntil(base, day(12)), day(15));
  assert.equal(playableUntil({ ...base, dueAt: null }, day(20)), null);
  assert.equal(canStart(base, null, day(16)), false);
  assert.equal(canStart(base, day(20), day(16)), true);
  assert.equal(canStart(base, day(20), day(21)), false);
  assert.equal(canStart(base, day(20), day(9)), false, "not before it opens");
  assert.equal(canStart({ ...base, status: "CANCELLED" }, day(20), day(12)), false);
});

test("create input: 1–10 distinct games, a target, an optional deadline", () => {
  const versionId = "a410a25c-e815-4cc4-9347-000000000001";
  const ok = createAssignmentSchema.parse({ title: " Đếm ", versionIds: [versionId], target: { type: "CLASS" } });
  assert.equal(ok.title, "Đếm");
  assert.equal(ok.dueAt, null);
  assert.equal(ok.note, "");
  assert.equal(createAssignmentSchema.safeParse({ title: "x", versionIds: [], target: { type: "CLASS" } }).success, false);
  assert.equal(createAssignmentSchema.safeParse({ title: "x", versionIds: [versionId, versionId], target: { type: "CLASS" } }).success, false);
  assert.equal(createAssignmentSchema.safeParse({ title: "x", versionIds: [versionId], target: { type: "CHILDREN", childIds: [] } }).success, false);
});

test("approving a replay needs a new deadline; rejecting does not", () => {
  assert.equal(decideReplaySchema.safeParse({ approve: true }).success, false);
  assert.equal(decideReplaySchema.safeParse({ approve: true, until: "2026-11-20T10:00:00.000Z" }).success, true);
  assert.equal(decideReplaySchema.safeParse({ approve: false }).success, true);
});
