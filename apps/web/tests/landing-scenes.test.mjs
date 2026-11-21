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
    walrus: "Răng tớ dài không nè?",
  });
  // Every animal that can greet also has a voice.
  assert.deepEqual(Object.keys(arctic.voices).sort(), Object.keys(arctic.copy.friends).sort());
  assert.equal(typeof arctic.loadStage, "function");
});

const { ARCTIC_SHOTS, ARCTIC_GLOBE, ARCTIC_POINTS, ARCTIC_HOLDS, arcticShotAt, arcticViewAt, arcticWarmth } = await import("../src/features/landing/arctic-path.ts");
const { STORY } = await import("../src/features/landing/camera-path.ts");
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("arctic path: eight beats in story order, each with a portrait framing", () => {
  assert.deepEqual(ARCTIC_SHOTS.map((shot) => shot.name), ["vista", "bearGreet", "northEast", "iceberg", "campfire", "diveEntry", "underwater", "farewell"]);
  for (const shot of ARCTIC_SHOTS) assert.ok(shot.portrait, shot.name);
});

test("arctic path: the camera stands still during every hold, including the copy-carrying story holds", () => {
  for (const key of ["heroHold", "pondHold", "charactersHold", "cabinHold", "summitHold", "farewellHold"]) assert.deepEqual(ARCTIC_HOLDS[key], STORY[key], key);
  for (const [name, hold] of Object.entries(ARCTIC_HOLDS)) {
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
      assert.ok((2 * Math.acos(Math.min(1, same)) * 180) / Math.PI < 5, `globe spins too fast at p=${p}`);
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
  const vistaLook = unitOf(vista.target.map((t, i) => t - vista.position[i]));
  const squareUp = unitOf([0, 1, 0].map((y, i) => y - vistaLook[i] * vistaLook[1]));
  assert.ok(dot(vista.up, squareUp) > 0.99, "vista up");
  for (const hold of [STORY.pondHold, STORY.charactersHold, STORY.cabinHold]) {
    const shot = arcticShotAt(hold[0]);
    assert.ok(dot(shot.up, unitOf(shot.target)) > 0.95, `up follows the ground at ${hold[0]}`);
    // Seen at an angle, not from straight above: the view direction is well off the surface normal.
    const view = unitOf(shot.target.map((t, i) => t - shot.position[i]));
    assert.ok(Math.abs(dot(view, unitOf(shot.target))) < 0.35, `low, near-ground view at ${hold[0]}`);
  }
});

test("arctic view: the camera never turns; the globe turns (in full 3D) to bring each stop, upright, in front of it", () => {
  const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const rotate = ([x, y, z], [qx, qy, qz, qw]) => {
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  const hero = arcticViewAt(0);
  const heroLook = unitOf(hero.target.map((t, i) => t - hero.position[i]));
  for (let i = 0; i <= 200; i += 1) {
    const p = i / 200;
    const local = arcticShotAt(p);
    const view = arcticViewAt(p);
    assert.ok(dist(rotate(local.position, view.globe), view.position) < 1e-6, `camera = turned local camera at p=${p}`);
    assert.ok(dist(rotate(local.target, view.globe), view.target) < 1e-6, `target = turned local target at p=${p}`);
    const look = unitOf(view.target.map((t, k) => t - view.position[k]));
    assert.ok(dot(look, heroLook) > 0.9999, `camera keeps its heading at p=${p}`);
    assert.ok(dist(view.up, hero.up) < 1e-6, `camera keeps its up at p=${p}`);
  }
});

test("landing scene: the admin's saved scene wins; the remembered one only covers a slow or failed API; fixed once chosen", async () => {
  const { chooseLandingScene, SETTINGS_DEADLINE_MS } = await import("../src/features/landing/landing-scene-choice.ts");
  assert.ok(SETTINGS_DEADLINE_MS > 0 && SETTINGS_DEADLINE_MS <= 2000, "a slow API never holds the page for long");
  const base = { locked: null, remembered: null, fromApi: false, ready: false, fromSettings: "VALLEY" };
  assert.equal(chooseLandingScene({ ...base, remembered: "ARCTIC" }), null, "waits for the API even with a remembered scene");
  assert.equal(chooseLandingScene({ ...base, ready: true, fromApi: true, fromSettings: "VALLEY", remembered: "ARCTIC" }), "VALLEY", "a just-applied scene shows at once");
  assert.equal(chooseLandingScene({ ...base, ready: true, fromApi: false, remembered: "ARCTIC" }), "ARCTIC", "API too slow: last known scene");
  assert.equal(chooseLandingScene({ ...base, ready: true, fromApi: false, remembered: "MOON" }), "VALLEY", "junk in storage is ignored");
  assert.equal(chooseLandingScene({ ...base, locked: "VALLEY", ready: true, fromApi: true, fromSettings: "ARCTIC" }), "VALLEY", "never switches mid-visit");
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

test("arctic underwater view is level: the surface is at the top of the screen and the camera looks across the school", () => {
  const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const portrait of [false, true]) {
    const view = arcticViewAt(STORY.summitHold[0], portrait);
    const surfaceUp = unitOf(view.target);
    const look = unitOf(view.target.map((t, i) => t - view.position[i]));
    assert.ok(dot(view.up, surfaceUp) > 0.98, "screen up points to the surface");
    assert.ok(Math.abs(dot(look, surfaceUp)) < 0.3, "looking across, not up at the surface");
  }
});

test("arctic path: the wide stops show the walrus, the seal and their neighbours", () => {
  const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const inView = (shot, point, halfAngleDeg) => {
    const look = unitOf(shot.target.map((t, i) => t - shot.position[i]));
    const to = unitOf(point.map((x, i) => x - shot.position[i]));
    return dot(look, to) > Math.cos((halfAngleDeg * Math.PI) / 180);
  };
  const northEast = arcticShotAt(ARCTIC_HOLDS.northEastHold[0]);
  for (const name of ["walrus", "polarBears", "fox"]) assert.ok(inView(northEast, ARCTIC_POINTS[name], 20), `${name} in the north-east view`);
  const iceberg = arcticShotAt(STORY.charactersHold[0]);
  for (const name of ["puffins", "seal"]) assert.ok(inView(iceberg, ARCTIC_POINTS[name], 20), `${name} in the iceberg view`);
});

test("arctic view: the screen never rolls abruptly (no flips on the way in, out or under the water)", () => {
  const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // Roll = the screen's tilt about the view axis, measured from world up; panning does not change it.
  const roll = (view) => {
    const look = unitOf(view.target.map((t, k) => t - view.position[k]));
    const level = unitOf([0, 1, 0].map((y, k) => y - look[k] * look[1]));
    return Math.atan2(dot(cross(level, view.up), look), dot(level, view.up));
  };
  for (const portrait of [false, true]) {
    let previous = roll(arcticViewAt(0, portrait));
    for (let i = 1; i <= 1000; i += 1) {
      const current = roll(arcticViewAt(i / 1000, portrait));
      let step = Math.abs(current - previous);
      if (step > Math.PI) step = 2 * Math.PI - step;
      assert.ok((step * 180) / Math.PI < 4, `screen rolls ${((step * 180) / Math.PI).toFixed(1)}° at p=${i / 1000}`);
      previous = current;
    }
  }
});

test("arctic fish swim round their school: steady orbit, nose along the path, back to the surface, always under water", async () => {
  const { makeSchool, swimPose } = await import("../src/features/landing/arctic-fish.ts");
  const unitOf = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const school = makeSchool(ARCTIC_POINTS.fishSchool, 24, 7, { radius: [0.5, 1.3], depth: 0.5 });
  assert.equal(school.length, 24);
  for (const fish of school) {
    const a = swimPose(fish, 0);
    const b = swimPose(fish, 0.05);
    const ra = Math.hypot(...a.position);
    assert.ok(ra < ARCTIC_GLOBE.radius - 0.2, "under the surface");
    assert.ok(Math.abs(dot(a.forward, a.up)) < 1e-6, "nose square to back");
    const moved = unitOf(b.position.map((x, i) => x - a.position[i]));
    assert.ok(dot(moved, a.forward) > 0.9, "swims nose first");
    assert.ok(dot(a.up, unitOf(a.position)) > 0.95, "back towards the surface");
  }
  // Same seed, same school (no flicker between renders); different seed, different school.
  assert.deepEqual(makeSchool(ARCTIC_POINTS.fishSchool, 3, 7, { radius: [0.5, 1.3], depth: 0.5 }), school.slice(0, 3));
});
