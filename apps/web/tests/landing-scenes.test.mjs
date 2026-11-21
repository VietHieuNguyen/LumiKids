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

const { ARCTIC_SHOTS, ARCTIC_GLOBE, arcticShotAt, arcticWarmth } = await import("../src/features/landing/arctic-path.ts");
const { STORY } = await import("../src/features/landing/camera-path.ts");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("arctic path: eight beats in story order, each with a portrait framing", () => {
  assert.deepEqual(ARCTIC_SHOTS.map((shot) => shot.name), ["vista", "bearGreet", "husky", "polarBears", "iceberg", "campfire", "dusk", "farewell"]);
  for (const shot of ARCTIC_SHOTS) assert.ok(shot.portrait, shot.name);
});

test("arctic path: the camera stands still during every story hold", () => {
  for (const [name, hold] of Object.entries(STORY)) {
    if (!Array.isArray(hold)) continue;
    for (const portrait of [false, true]) {
      const a = arcticShotAt(hold[0], portrait);
      const b = arcticShotAt(hold[1], portrait);
      assert.deepEqual(a.position, b.position, `${name} position`);
      assert.deepEqual(a.target, b.target, `${name} target`);
    }
  }
});

test("arctic path: never inside the globe and never jumps", () => {
  const { center, radius } = ARCTIC_GLOBE;
  for (const portrait of [false, true]) {
    let previous = arcticShotAt(0, portrait).position;
    for (let i = 0; i <= 1000; i += 1) {
      const { position } = arcticShotAt(i / 1000, portrait);
      assert.ok(dist(position, center) > radius * 1.08, `inside globe at p=${i / 1000}`);
      assert.ok(dist(position, previous) < radius * 0.12, `jump at p=${i / 1000}`);
      previous = position;
    }
  }
});

test("arctic warmth rises to full at the campfire and never falls before it", () => {
  assert.equal(arcticWarmth(0), 0);
  assert.equal(arcticWarmth(STORY.cabinHold[0]), 1);
  let last = 0;
  for (let p = 0; p <= STORY.cabinHold[0]; p += 0.005) {
    const w = arcticWarmth(p);
    assert.ok(w >= last - 1e-12, `warmth fell at ${p}`);
    last = w;
  }
});
