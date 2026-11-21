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

const { ARCTIC_SHOTS, ARCTIC_GLOBE, ARCTIC_POINTS, ARCTIC_FRONT, arcticShotAt, arcticViewAt, arcticWarmth } = await import("../src/features/landing/arctic-path.ts");
const { STORY } = await import("../src/features/landing/camera-path.ts");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("arctic path: eight beats in story order, each with a portrait framing", () => {
  assert.deepEqual(ARCTIC_SHOTS.map((shot) => shot.name), ["vista", "bearGreet", "husky", "polarBears", "iceberg", "campfire", "underwater", "farewell"]);
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

test("arctic path: only the underwater beat dives below the surface, and the path never jumps", () => {
  const { center, radius } = ARCTIC_GLOBE;
  for (const portrait of [false, true]) {
    const under = arcticShotAt(STORY.summitHold[0], portrait);
    assert.ok(dist(under.position, center) < radius * 0.95, "underwater camera is in the water");
    assert.ok(dist(under.position, ARCTIC_POINTS.fishSchool) < 3.2, "underwater camera is close to the fish school");
    assert.ok(dist(under.target, ARCTIC_POINTS.fishSchool) < 0.6, "underwater camera looks at the fish school");
    // Measured on what is rendered: the camera stays in front and the globe turns, so both must move smoothly.
    let previous = arcticViewAt(0, portrait);
    for (let i = 0; i <= 1000; i += 1) {
      const p = i / 1000;
      const view = arcticViewAt(p, portrait);
      const diving = p > STORY.cabinHold[1] && p < STORY.farewellHold[0];
      if (!diving) assert.ok(dist(view.position, center) > radius * 1.08, `inside globe at p=${p}`);
      assert.ok(dist(view.position, previous.position) < radius * 0.12, `camera jump at p=${p}`);
      const same = Math.abs(view.globe.reduce((sum, x, k) => sum + x * previous.globe[k], 0));
      assert.ok((2 * Math.acos(Math.min(1, same)) * 180) / Math.PI < 2, `globe spins too fast at p=${p}`);
      previous = view;
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

test("arctic path: close shots keep the local ground level (camera up = surface normal), wide shots keep world up", () => {
  const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vista = arcticShotAt(0);
  assert.ok(dot(vista.up, [0, 1, 0]) > 0.99, "vista up");
  for (const hold of [STORY.pondHold, STORY.charactersHold, STORY.cabinHold]) {
    const shot = arcticShotAt(hold[0]);
    assert.ok(dot(shot.up, unitOf(shot.target)) > 0.95, `up follows the ground at ${hold[0]}`);
    // Seen at an angle, not from straight above: the view direction is well off the surface normal.
    const view = unitOf(shot.target.map((t, i) => t - shot.position[i]));
    assert.ok(Math.abs(dot(view, unitOf(shot.target))) < 0.35, `low, near-ground view at ${hold[0]}`);
  }
});

test("arctic view: the globe turns to bring each stop to the front, the camera stays in front of it", () => {
  const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const rotate = ([x, y, z], [qx, qy, qz, qw]) => {
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  for (let i = 0; i <= 200; i += 1) {
    const p = i / 200;
    const local = arcticShotAt(p);
    const view = arcticViewAt(p);
    const turned = rotate(local.position, view.globe);
    assert.ok(dist(turned, view.position) < 1e-6, `camera = turned local camera at p=${p}`);
    assert.ok(dot(unitOf(view.position), ARCTIC_FRONT) > Math.cos((5 * Math.PI) / 180), `camera stays in front at p=${p}`);
  }
  assert.ok(dot(arcticViewAt(0).up, [0, 1, 0]) > 0.99, "wide shots stay upright");
});

test("landing scene is fixed once: remembered scene at once, else the settings once ready, never switched after", async () => {
  const { chooseLandingScene, SETTINGS_DEADLINE_MS } = await import("../src/features/landing/landing-scene-choice.ts");
  assert.ok(SETTINGS_DEADLINE_MS > 0 && SETTINGS_DEADLINE_MS <= 2000, "a slow API never holds the page for long");
  assert.equal(chooseLandingScene({ locked: null, ready: false, fromSettings: "VALLEY", remembered: null }), null);
  assert.equal(chooseLandingScene({ locked: null, ready: false, fromSettings: "VALLEY", remembered: "ARCTIC" }), "ARCTIC");
  assert.equal(chooseLandingScene({ locked: null, ready: false, fromSettings: "VALLEY", remembered: "MOON" }), null);
  assert.equal(chooseLandingScene({ locked: null, ready: true, fromSettings: "ARCTIC", remembered: null }), "ARCTIC");
  assert.equal(chooseLandingScene({ locked: "VALLEY", ready: true, fromSettings: "ARCTIC", remembered: null }), "VALLEY");
});

test("arctic picking: generous spheres, nearest wins, the globe hides what is behind it", async () => {
  const THREE = await import("three");
  const { pickFriend } = await import("../src/features/landing/arctic-pick.ts");
  const ray = new THREE.Ray(new THREE.Vector3(0, 0, 20), new THREE.Vector3(0, 0, -1));
  const front = { center: new THREE.Vector3(0.3, 0, 5.4), radius: 0.5 };
  const behind = { center: new THREE.Vector3(0, 0, -5.4), radius: 0.5 };
  const under = { center: new THREE.Vector3(0, 0, 3.9), radius: 1 };
  assert.equal(pickFriend(ray, [behind, front], 5), 1, "a near miss on the front animal still counts");
  assert.equal(pickFriend(ray, [behind], 5), null, "far side of the globe is not tappable");
  assert.equal(pickFriend(ray, [under], 5), null, "inside the globe is not tappable");
  const side = new THREE.Ray(new THREE.Vector3(9, 0, 20), new THREE.Vector3(0, 0, -1));
  assert.equal(pickFriend(side, [{ center: new THREE.Vector3(9, 0, -3), radius: 0.5 }], 5), 0, "behind but beside the globe stays tappable");
});
