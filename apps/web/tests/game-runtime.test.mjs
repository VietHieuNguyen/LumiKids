import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  applyGameAction,
  checkCompletion,
  createInitialState,
  gameContentSchema,
  gameInteractionSchema,
  getGameProgress,
} from "@lumikids/shared";
import { createGameController } from "../src/features/game-runtime/model/controller.ts";

const load = (name) =>
  gameContentSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(
          `../../../packages/shared/examples/game-content/${name}.v1.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
function environment() {
  let id = 0;
  return {
    createEventId: () =>
      `a410a25c-e815-4cc4-9347-${String(++id).padStart(12, "0")}`,
    now: () => "2026-11-10T07:00:00.000Z",
  };
}
function setup(name) {
  const content = load(name);
  const events = [];
  const completions = [];
  const controller = createGameController(
    content,
    {
      onInteraction: (event) => events.push(event),
      onComplete: (result) => completions.push(result),
    },
    environment(),
  );
  return { content, controller, events, completions };
}
const select = (sourceId) => ({ actionType: "SELECT_CHOICE", sourceId });
const match = (sourceId, targetId) => ({
  actionType: "MATCH_DROP",
  sourceId,
  targetId,
});
const classify = (sourceId, targetId) => ({
  actionType: "CLASSIFY_DROP",
  sourceId,
  targetId,
});

test("COUNTING: wrong choice emits INCORRECT; correct ID completes once", () => {
  const { controller, events, completions } = setup("counting");
  controller.dispatch(select("choice-3"));
  assert.equal(controller.getState().completed, false);
  assert.equal(events[0].result, "INCORRECT");
  controller.dispatch(select("choice-4"));
  assert.equal(controller.getState().completed, true);
  assert.equal(events[1].result, "CORRECT");
  controller.dispatch(select("choice-4"));
  controller.dispatch(select("choice-5"));
  assert.equal(events.length, 2);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].attemptCount, 2);
});
test("COUNTING: number/text instead of choice ID cannot submit an answer", () => {
  const { controller, events } = setup("counting");
  controller.dispatch(select("4"));
  assert.equal(events.length, 0);
  assert.equal(controller.getState().attemptCount, 0);
});
test("COUNTING: repeated wrong choices are separate meaningful attempts", () => {
  const { controller, events } = setup("counting");
  controller.dispatch(select("choice-3"));
  controller.dispatch(select("choice-3"));
  assert.deepEqual(
    events.map((event) => event.attemptIndex),
    [1, 2],
  );
  assert.notEqual(events[0].eventId, events[1].eventId);
});
test("MATCHING: wrong pair does not place an item; correction places the exact pair", () => {
  const { controller, content, events } = setup("matching");
  controller.dispatch(match("source-cat", "target-dog-shadow"));
  assert.deepEqual(controller.getState().matches, []);
  assert.equal(events[0].result, "INCORRECT");
  controller.dispatch(match("source-cat", "target-cat-shadow"));
  assert.deepEqual(controller.getState().matches, [
    { sourceId: "source-cat", targetId: "target-cat-shadow" },
  ]);
  assert.deepEqual(getGameProgress(content, controller.getState()), {
    correct: 1,
    total: 2,
  });
  assert.equal(controller.getState().completed, false);
});
test("MATCHING: locked sources/targets cannot be matched or counted twice", () => {
  const { controller, events, completions } = setup("matching");
  controller.dispatch(match("source-cat", "target-cat-shadow"));
  controller.dispatch(match("source-cat", "target-cat-shadow"));
  controller.dispatch(match("source-cat", "target-dog-shadow"));
  controller.dispatch(match("source-dog", "target-cat-shadow"));
  assert.equal(events.length, 1);
  controller.dispatch(match("source-dog", "target-dog-shadow"));
  assert.equal(events.length, 2);
  assert.equal(completions.length, 1);
  controller.dispatch(match("source-dog", "target-dog-shadow"));
  assert.equal(completions.length, 1);
});
test("MATCHING: answers use IDs and remain correct after reordering", () => {
  const content = load("matching");
  content.sourceItems.reverse();
  content.targetItems.reverse();
  const controller = createGameController(content, {}, environment());
  for (const pair of [...content.pairs].reverse())
    controller.dispatch(match(pair.sourceId, pair.targetId));
  assert.equal(controller.getState().completed, true);
});
test("CLASSIFICATION: wrong drop → corrected drop → six of six completed", () => {
  const { content, controller, events, completions } = setup("classification");
  controller.dispatch(classify("red-ball-1", "blue-basket"));
  assert.deepEqual(controller.getState().placements, []);
  assert.deepEqual(getGameProgress(content, controller.getState()), {
    correct: 0,
    total: 6,
  });
  controller.dispatch(classify("red-ball-1", "red-basket"));
  assert.deepEqual(getGameProgress(content, controller.getState()), {
    correct: 1,
    total: 6,
  });
  for (const item of content.items.slice(1))
    controller.dispatch(classify(item.id, item.correctGroupId));
  assert.equal(controller.getState().completed, true);
  assert.deepEqual(getGameProgress(content, controller.getState()), {
    correct: 6,
    total: 6,
  });
  assert.equal(events.length, 7);
  assert.equal(completions.length, 1);
  assert.equal(events[0].result, "INCORRECT");
  assert.equal(events[1].result, "CORRECT");
  assert.deepEqual(
    events.map((event) => event.attemptIndex),
    [1, 2, 3, 4, 5, 6, 7],
  );
});
test("CLASSIFICATION: each wrong drop emits its own event and preserves placements", () => {
  const { controller, events } = setup("classification");
  controller.dispatch(classify("blue-ball-1", "blue-basket"));
  const before = controller.getState().placements;
  for (let i = 0; i < 3; i++)
    controller.dispatch(classify("red-ball-1", "blue-basket"));
  assert.deepEqual(controller.getState().placements, before);
  assert.equal(
    events.filter((event) => event.result === "INCORRECT").length,
    3,
  );
  assert.equal(new Set(events.map((event) => event.eventId)).size, 4);
});
test("CLASSIFICATION: already placed item is ignored, without extra event/attempt", () => {
  const { controller, events, content } = setup("classification");
  controller.dispatch(classify("red-ball-1", "red-basket"));
  controller.dispatch(classify("red-ball-1", "red-basket"));
  controller.dispatch(classify("red-ball-1", "blue-basket"));
  assert.equal(events.length, 1);
  assert.equal(controller.getState().attemptCount, 1);
  assert.deepEqual(getGameProgress(content, controller.getState()), {
    correct: 1,
    total: 6,
  });
});
test("CLASSIFICATION: not fixed to six items/two groups", () => {
  const content = load("classification");
  content.items = content.items.slice(0, 5);
  content.groups.push({ id: "third-group", label: "Nhóm thứ ba" });
  content.items[4].correctGroupId = "third-group";
  const controller = createGameController(content, {}, environment());
  for (const item of content.items)
    controller.dispatch(classify(item.id, item.correctGroupId));
  assert.deepEqual(getGameProgress(content, controller.getState()), {
    correct: 5,
    total: 5,
  });
  assert.equal(controller.getState().completed, true);
});
test("invalid references and actions for another game type are ignored", () => {
  for (const name of ["counting", "matching", "classification"]) {
    const { controller, events } = setup(name);
    for (const action of [
      select("missing"),
      match("missing", "missing"),
      classify("missing", "missing"),
    ])
      controller.dispatch(action);
    assert.equal(events.length, 0);
    assert.equal(controller.getState().attemptCount, 0);
  }
});
test("progress/completion counts distinct valid answers, not duplicate entries or CORRECT events", () => {
  const content = load("classification");
  const state = {
    ...createInitialState(content),
    placements: Array.from({ length: 6 }, () => ({
      itemId: "red-ball-1",
      groupId: "red-basket",
    })),
  };
  assert.deepEqual(getGameProgress(content, state), { correct: 1, total: 6 });
  assert.equal(checkCompletion(content, state), false);
  const matchContent = load("matching");
  const matchState = {
    ...createInitialState(matchContent),
    matches: [matchContent.pairs[0], matchContent.pairs[0]],
  };
  assert.deepEqual(getGameProgress(matchContent, matchState), {
    correct: 1,
    total: 2,
  });
  assert.equal(checkCompletion(matchContent, matchState), false);
});
for (const name of ["counting", "matching", "classification"]) {
  test(`${name}: reset clears state/attempts/feedback and allows exactly one new completion`, () => {
    const { controller, content, events, completions } = setup(name);
    const solve = () => {
      if (content.gameType === "COUNTING")
        controller.dispatch(select(content.correctChoiceId));
      else if (content.gameType === "MATCHING")
        for (const pair of content.pairs)
          controller.dispatch(match(pair.sourceId, pair.targetId));
      else
        for (const item of content.items)
          controller.dispatch(classify(item.id, item.correctGroupId));
    };
    solve();
    assert.equal(completions.length, 1);
    const eventCount = events.length;
    assert.deepEqual(controller.reset(), createInitialState(content));
    assert.equal(completions.length, 1);
    assert.equal(events.length, eventCount);
    solve();
    assert.equal(completions.length, 2);
    assert.equal(events[eventCount].attemptIndex, 1);
    assert.notEqual(events[0].eventId, events[eventCount].eventId);
    for (const event of events)
      assert.equal(gameInteractionSchema.safeParse(event).success, true);
  });
}
test("engine is deterministic and does not mutate the previous state/content", () => {
  const content = load("classification");
  const state = createInitialState(content);
  const original = structuredClone({ content, state });
  const identity = {
    eventId: "a410a25c-e815-4cc4-9347-000000000001",
    timestamp: "2026-11-10T07:00:00Z",
  };
  const action = classify("red-ball-1", "red-basket");
  assert.deepEqual(
    applyGameAction(content, state, action, identity),
    applyGameAction(content, state, action, identity),
  );
  assert.deepEqual({ content, state }, original);
});
test("controller validates content and keeps a parsed snapshot independent of caller mutation", () => {
  assert.throws(() =>
    createGameController({ ...load("counting"), schemaVersion: 2 }),
  );
  assert.throws(() =>
    createGameController({
      ...load("counting"),
      completionRule: "ALL_PAIRS_CORRECT",
    }),
  );
  const content = load("counting");
  const controller = createGameController(content, {}, environment());
  content.correctChoiceId = "choice-3";
  controller.dispatch(select("choice-4"));
  assert.equal(controller.getState().completed, true);
});
test("synchronous/reentrant duplicate dispatch cannot emit onComplete twice", () => {
  let controller;
  let completed = 0;
  let interactions = 0;
  controller = createGameController(
    load("counting"),
    {
      onInteraction: () => {
        interactions++;
        controller.dispatch(select("choice-4"));
      },
      onComplete: () => completed++,
    },
    environment(),
  );
  controller.dispatch(select("choice-4"));
  assert.equal(interactions, 1);
  assert.equal(completed, 1);
});
test("callback failure does not roll back state or allow duplicate completion", () => {
  let completed = 0;
  const controller = createGameController(
    load("counting"),
    {
      onInteraction: () => {
        throw new Error("host callback failed");
      },
      onComplete: () => completed++,
    },
    environment(),
  );
  assert.throws(
    () => controller.dispatch(select("choice-4")),
    /host callback failed/,
  );
  assert.equal(controller.getState().completed, true);
  assert.equal(completed, 1);
  controller.dispatch(select("choice-4"));
  assert.equal(completed, 1);
});
test("reset initiated inside interaction callback cancels completion from the old run", () => {
  let controller;
  let completed = 0;
  controller = createGameController(
    load("counting"),
    { onInteraction: () => controller.reset(), onComplete: () => completed++ },
    environment(),
  );
  controller.dispatch(select("choice-4"));
  assert.equal(completed, 0);
  assert.equal(controller.getState().completed, false);
});
test("production controller generates contract-valid UUID events without browser-only state", () => {
  const events = [];
  const controller = createGameController(load("counting"), {
    onInteraction: (event) => events.push(event),
  });
  controller.dispatch(select("choice-3"));
  controller.dispatch(select("choice-4"));
  assert.notEqual(events[0].eventId, events[1].eventId);
  for (const event of events)
    assert.equal(gameInteractionSchema.safeParse(event).success, true);
});

test("updating host callbacks does not restart state or replay old completion", () => {
  let oldCalls = 0;
  let newCalls = 0;
  let completions = 0;
  const controller = createGameController(
    load("counting"),
    { onInteraction: () => oldCalls++ },
    environment(),
  );
  controller.dispatch(select("choice-3"));
  controller.setCallbacks({
    onInteraction: () => newCalls++,
    onComplete: () => completions++,
  });
  controller.dispatch(select("choice-4"));
  controller.setCallbacks({ onComplete: () => completions++ });
  controller.dispatch(select("choice-4"));
  assert.equal(oldCalls, 1);
  assert.equal(newCalls, 1);
  assert.equal(completions, 1);
  assert.equal(controller.getState().attemptCount, 2);
});

test("published snapshots/events cannot be mutated by a consuming component", () => {
  const { controller, events } = setup("matching");
  controller.dispatch(match("source-cat", "target-cat-shadow"));
  assert.throws(() => {
    controller.getState().completed = true;
  }, TypeError);
  assert.throws(() => {
    controller
      .getState()
      .matches.push({ sourceId: "source-dog", targetId: "target-dog-shadow" });
  }, TypeError);
  assert.throws(() => {
    controller.getState().matches[0].targetId = "target-dog-shadow";
  }, TypeError);
  assert.throws(() => {
    events[0].result = "INCORRECT";
  }, TypeError);
  assert.equal(controller.getState().completed, false);
});
