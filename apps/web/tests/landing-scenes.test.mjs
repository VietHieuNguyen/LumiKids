import { register } from "node:module";
register(new URL("./tsx-test-loader.mjs", import.meta.url));
const { test } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
const { landingSceneSchema } = await import("@lumikids/shared");
const { landingSceneConfig } = await import("../src/features/landing/scene-config.ts");
const { LANDING_COPY } = await import("../src/features/landing/landing-copy.ts");
const { LANDING_SCENES } = await import("../src/features/landing/landing-scenes.ts");

test("site settings accept ARCTIC and reject unknown scenes", () => {
  assert.equal(landingSceneSchema.parse("ARCTIC"), "ARCTIC");
  assert.throws(() => landingSceneSchema.parse("MOON"));
  assert.deepEqual(Object.keys(LANDING_SCENES).sort(), ["ARCTIC", "VALLEY"]);
  assert.equal(LANDING_SCENES.ARCTIC.label, "Bắc Cực");
});

test("valley config keeps today's quest, characters and copy", () => {
  const valley = landingSceneConfig("VALLEY");
  assert.deepEqual(valley.quest, ["duck", "frog", "deer", "elephant", "rabbit", "bear", "dog"]);
  assert.deepEqual(valley.characterIds, ["rabbit", "bear"]);
  assert.equal(valley.copy.guide, LANDING_COPY.guide);
  assert.equal(valley.copy.guideNote, LANDING_COPY.guideNote);
  assert.equal(valley.copy.encounterCaption, LANDING_COPY.encounter.caption);
  assert.equal(valley.copy.farewellTitle, LANDING_COPY.farewell.title);
  assert.deepEqual(valley.copy.friends, LANDING_COPY.friends);
  assert.equal(valley.mainAsset, "/models/landing/valley.glb");
});

test("arctic config: bear-led journey, no quest, no pins, its own greetings", () => {
  const arctic = landingSceneConfig("ARCTIC");
  assert.equal(arctic.quest, null);
  assert.deepEqual(arctic.characterIds, []);
  assert.equal(arctic.mainAsset, "/models/landing/arctic.glb");
  assert.equal(arctic.poster, "/models/landing/arctic-poster.webp");
  assert.equal(arctic.copy.guide, "Cùng gấu khám phá Bắc Cực");
  assert.equal(arctic.copy.farewellTitle, "Bắc Cực luôn chờ bé quay lại");
  assert.deepEqual(arctic.copy.friends, {
    bear: "Chào bé! Lạnh quá nhỉ!",
    polarBear: "Chào bạn nhỏ!",
    fox: "Chíp chíp!",
    seal: "Ồ ồ!",
    puffin: "Xin chào!",
    orca: "Phù!",
    husky: "Gâu gâu!",
  });
  assert.equal(typeof arctic.loadStage, "function");
});
