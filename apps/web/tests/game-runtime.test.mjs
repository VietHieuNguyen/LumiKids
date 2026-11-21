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
import { driftAcross, duckSwim, frogHop, birdFlight, FROG_HOP_DURATION } from "../src/features/game-runtime/environment/scenery-motion.ts";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { createDrinker, solveDrinkingPose, restoreDrinkingPose, drinkingTipPosition } from "../src/features/game-runtime/environment/animal-drinking.ts";

for (const kind of ["deer", "elephant"]) {
  test(`${kind}: actual GLB drinking pose reaches water without moving the feet`, async () => {
    const bytes = readFileSync(new URL(`../public/models/landing/${kind}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const mixer = new THREE.AnimationMixer(gltf.scene);
    let action = mixer.clipAction(gltf.animations.find((c) => c.name === "Idle") ?? gltf.animations[0]).play();
    mixer.update(0);
    const box = new THREE.Box3().setFromObject(gltf.scene), center = box.getCenter(new THREE.Vector3());
    const normalized = new THREE.Group(), body = new THREE.Group(), root = new THREE.Group();
    gltf.scene.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    normalized.add(gltf.scene); normalized.scale.setScalar(1 / (box.max.y - box.min.y));
    body.add(normalized); body.rotation.y = kind === "deer" ? 0.5 : -Math.PI / 2 - 0.25; root.add(body);
    if (kind === "deer") { action.stop(); action = mixer.clipAction(gltf.animations.find((c) => c.name === "Eating")).play(); action.time = 1.6; mixer.update(0); }
    root.updateMatrixWorld(true);
    const names = kind === "deer" ? ["FFL", "FFR", "FFBL", "FFBR"] : ["Bone001_Armature", "Bone003_Armature", "Bone005_Armature", "Bone007_Armature"];
    const feet = names.map((name) => gltf.scene.getObjectByName(name));
    const before = feet.map((foot) => foot.getWorldPosition(new THREE.Vector3()));
    const drinker = createDrinker(gltf.scene, root, kind);
    assert.ok(drinker, "the model must expose a supported muzzle/trunk chain");
    const resting = drinkingTipPosition(drinker, new THREE.Vector3()).clone();
    const target = root.localToWorld(drinker.target.clone());
    solveDrinkingPose(drinker, target, 1);
    const tip = drinkingTipPosition(drinker, new THREE.Vector3());
    assert.ok(tip.y >= -0.01 && tip.y < 0.015, `tip must touch the water plane: ${tip.y}`);
    assert.ok(tip.distanceTo(target) < 0.02);
    feet.forEach((foot, i) => assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(before[i]) < 1e-8));
    restoreDrinkingPose(drinker);
    assert.ok(drinkingTipPosition(drinker, new THREE.Vector3()).distanceTo(resting) < 1e-8, "drinking can release back to the animated pose");
    // ResizeObserver changes the stage scale before the next renderer traversal.
    // Solve against the skin that will actually be rendered, including its updated bind inverse.
    for (const scale of [170, 85, 200]) {
      restoreDrinkingPose(drinker);
      root.scale.setScalar(scale); root.position.set(scale * 0.4, 0, scale * 5);
      const scaledFeet = feet.map((foot) => foot.getWorldPosition(new THREE.Vector3()));
      const scaledTarget = root.localToWorld(drinker.target.clone());
      solveDrinkingPose(drinker, scaledTarget, 1);
      root.updateMatrixWorld(true);
      const renderedTip = drinkingTipPosition(drinker, new THREE.Vector3());
      assert.ok(renderedTip.y >= -0.01 * scale && renderedTip.y < 0.015 * scale, `resized tip must touch water: ${renderedTip.y / scale}`);
      assert.ok(renderedTip.distanceTo(scaledTarget) < 0.02 * scale);
      feet.forEach((foot, i) => assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(scaledFeet[i]) < 1e-8));
    }
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  });
}

test("decorative ducks swim in a bounded lane, reverse heading and turn continuously", () => {
  for (const phase of [0, 0.6]) {
    for (let t = 0; t < 120; t += 0.1) {
      const pose = duckSwim(t, phase);
      assert.ok(Math.abs(pose.offsetX) <= 0.075 + 1e-9);
      assert.ok(Math.abs(pose.offsetY) <= 0.005 + 1e-9);
      assert.ok(Math.abs(pose.heading - duckSwim(t + 0.001, phase).heading) < 0.002);
    }
  }
  assert.ok(duckSwim(0, 0).heading > 0);
  assert.ok(duckSwim(Math.PI / 0.19, 0).heading < 0);
  assert.ok(Math.abs(duckSwim(5, 0).offsetX - duckSwim(15, 0).offsetX) > 0.02);
});

test("frog rests between hops, travels a raised arc and lands continuously on alternating pads", () => {
  assert.equal(frogHop(8.99).active, false);
  assert.equal(frogHop(9).active, true);
  const apex = frogHop(9 + FROG_HOP_DURATION / 2);
  assert.ok(apex.arc > 0.99 && Math.abs(apex.travel - 0.5) < 1e-9);
  for (let cycle = 0; cycle < 8; cycle++) {
    const end = frogHop(cycle * 15 + 9 + FROG_HOP_DURATION);
    const next = frogHop((cycle + 1) * 15);
    assert.equal(end.active, false);
    assert.equal(end.travel, 1);
    assert.ok(Math.abs(end.arc) < 1e-9);
    assert.equal(end.to, next.from);
    assert.equal(next.travel, 0);
    assert.equal(frogHop((cycle + 1) * 15 + 8).active, false);
  }
});

test("clouds and floating leaves cross the screen slowly and wrap only outside the viewport", () => {
  for (const period of [95, 110, 140]) {
    assert.ok(Math.abs(driftAcross(0, 0.4, period) - 0.4) < 1e-9);
    for (let t = 0; t < 400; t += 0.5) {
      const a = driftAcross(t, 0.4, period), b = driftAcross(t + 0.5, 0.4, period);
      assert.ok(a >= -0.28 && a <= 1.28);
      if (b < a) assert.ok(a > 1.2 && b < -0.2);
      else assert.ok(b - a < 0.01);
    }
  }
});

test("bird flock flies left to right in the sky and leaves a quiet interval between passes", () => {
  assert.equal(birdFlight(3, 0).visible, false);
  assert.equal(birdFlight(5, 0).visible, true);
  assert.ok(birdFlight(10, 0).x > birdFlight(5, 0).x);
  assert.equal(birdFlight(22, 0).visible, false);
  assert.equal(birdFlight(39, 0).visible, true);
  for (let i = 0; i < 3; i++) for (let t = 0; t < 80; t++) {
    const pose = birdFlight(t, i);
    assert.ok(pose.y > 0.05 && pose.y < 0.15);
    if (pose.visible) assert.ok(pose.x >= -0.18 && pose.x <= 1.18);
  }
});

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

// ---- PATTERN layout ----
import { patternCellSize } from "../src/features/game-runtime/model/pattern-layout.ts";
test("patternCellSize fits 8 cells plus the blank on iPad portrait and landscape", () => {
  assert.equal(patternCellSize({ width: 768, height: 1024 }, 8), 81);
  assert.equal(patternCellSize({ width: 1024, height: 768 }, 8), 110);
  assert.equal(patternCellSize({ width: 320, height: 600 }, 8), 64);
  assert.equal(patternCellSize({ width: 1600, height: 1000 }, 4), 160);
});
