import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventOutbox } from "../src/features/gameplay/event-outbox.ts";

function event(attemptIndex) {
  return {
    schemaVersion: 1,
    eventId: `a410a25c-e815-4cc4-9347-${String(attemptIndex).padStart(12, "0")}`,
    actionType: "SELECT_CHOICE",
    sourceId: "two",
    result: "INCORRECT",
    timestamp: "2026-11-13T07:00:00.000Z",
    attemptIndex,
  };
}
function manualClock() {
  const timers = [];
  return {
    timers,
    schedule: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      const index = timers.indexOf(timer);
      if (index >= 0) timers.splice(index, 1);
    },
    runNext: () => timers.shift()?.callback(),
  };
}
/** Fake server: stores events in order and reports nextAttemptIndex like the API. */
function server() {
  const stored = [];
  const view = (status = "IN_PROGRESS") => ({
    sessionId: "00000000-0000-4000-8000-000000000001",
    versionId: "00000000-0000-4000-8000-000000000002",
    status,
    nextAttemptIndex: stored.length + 1,
    startedAt: "2026-11-13T07:00:00.000Z",
    endedAt: null,
  });
  return {
    stored,
    view,
    accept(events) {
      for (const e of events)
        if (!stored.some((s) => s.eventId === e.eventId)) stored.push(e);
      return { ...view(), accepted: events.length, duplicates: 0 };
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("delivers events in order with one request in flight", async () => {
  const backend = server();
  const batches = [];
  let release;
  const outbox = createEventOutbox({
    submit: (events) => {
      batches.push(events.map((e) => e.attemptIndex));
      return new Promise((resolve) => {
        release = () => resolve(backend.accept(events));
      });
    },
    sync: async () => backend.view(),
  });
  outbox.push(event(1));
  outbox.push(event(2));
  outbox.push(event(3));
  await tick();
  assert.deepEqual(batches, [[1]]);
  release();
  await tick();
  assert.deepEqual(batches, [[1], [2, 3]]);
  release();
  await outbox.flush();
  assert.deepEqual(
    backend.stored.map((e) => e.attemptIndex),
    [1, 2, 3],
  );
  assert.equal(outbox.getSnapshot().state, "idle");
});

test("retries network failures with backoff and resends the same events", async () => {
  const backend = server();
  const clock = manualClock();
  let fail = true;
  const outbox = createEventOutbox(
    {
      submit: async (events) => {
        if (fail) throw { status: 0 };
        return backend.accept(events);
      },
      sync: async () => backend.view(),
    },
    () => {},
    clock,
  );
  outbox.push(event(1));
  await tick();
  assert.equal(outbox.getSnapshot().state, "retrying");
  assert.equal(clock.timers[0].delay, 1000);
  fail = false;
  clock.runNext();
  await outbox.flush();
  assert.equal(backend.stored.length, 1);
  assert.equal(outbox.getSnapshot().pending, 0);
});

test("resyncs after an ordering conflict and drops events the server already has", async () => {
  const backend = server();
  backend.accept([event(1)]);
  let first = true;
  const sent = [];
  const outbox = createEventOutbox({
    submit: async (events) => {
      sent.push(events.map((e) => e.attemptIndex));
      if (first) {
        first = false;
        throw { status: 409, code: "INTERACTION_OUT_OF_ORDER" };
      }
      return backend.accept(events);
    },
    sync: async () => backend.view(),
  });
  outbox.push(event(1));
  outbox.push(event(2));
  await outbox.flush();
  assert.deepEqual(sent, [[1], [2]]);
  assert.deepEqual(
    backend.stored.map((e) => e.attemptIndex),
    [1, 2],
  );
});

test("stops on a closed session and on rejected data", async () => {
  const closed = createEventOutbox({
    submit: async () => {
      throw { status: 409, code: "PLAY_SESSION_CLOSED" };
    },
    sync: async () => server().view("ABANDONED"),
  });
  closed.push(event(1));
  await closed.flush();
  assert.equal(closed.getSnapshot().state, "closed");
  closed.push(event(2));
  assert.equal(closed.getSnapshot().pending, 0);

  const rejected = createEventOutbox({
    submit: async () => {
      throw { status: 422, code: "INTERACTION_RESULT_MISMATCH" };
    },
    sync: async () => server().view(),
  });
  rejected.push(event(1));
  await rejected.flush();
  assert.equal(rejected.getSnapshot().state, "failed");
});

test("fails instead of looping when the server is missing earlier events", async () => {
  const outbox = createEventOutbox({
    submit: async () => {
      throw { status: 409, code: "INTERACTION_OUT_OF_ORDER" };
    },
    sync: async () => server().view(),
  });
  outbox.push(event(3));
  await outbox.flush();
  assert.equal(outbox.getSnapshot().state, "failed");
});
