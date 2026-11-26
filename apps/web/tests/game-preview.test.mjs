import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { gameContentSchema, getGameContentAssetIds } from "@lumikids/shared";
import { createPreviewAssetResolver } from "../src/features/game-preview/asset-resolver.ts";
import { GamePreview } from "../src/features/game-preview/game-preview.tsx";
import { GameRuntime } from "../src/features/game-runtime/game-runtime.tsx";

test("quantity renderer uses one merge basket, image requests and the matching forest theme", () => {
  const fruit="00000000-0000-4000-8000-000000000001",basket="00000000-0000-4000-8000-000000000002";
  const content={schemaVersion:1,gameType:"QUANTITY",mode:"MERGE",instruction:"Bé hãy đưa hai quả táo vào giỏ nhé!",basketAssetId:basket,items:[{id:"a",assetId:fruit},{id:"b",assetId:fruit}],baskets:[{id:"basket",label:"Giỏ",requirements:[{assetId:fruit,count:2}]}],completionRule:"ALL_BASKETS_FILLED"};
  const markup=renderToStaticMarkup(React.createElement(GameRuntime,{content,mode:"PREVIEW",assetUrls:{[fruit]:"/apple.png",[basket]:"/basket.png"}}));
  assert.match(markup,/data-scene-theme="forest"/);
  assert.equal((markup.match(/data-game-target-id=/g)??[]).length,1);
  assert.match(markup,/src="\/basket.png"/);
  const split={...content,mode:"SPLIT",baskets:[{id:"left",label:"Giỏ trái",requirements:[{assetId:fruit,count:1}]},{id:"right",label:"Giỏ phải",requirements:[{assetId:fruit,count:1}]}]};
  const splitMarkup=renderToStaticMarkup(React.createElement(GameRuntime,{content:split,mode:"PREVIEW",assetUrls:{}}));
  assert.equal((splitMarkup.match(/data-game-target-id=/g)??[]).length,2);
});

test("voice UI: child play waits for Start; preview stays playable and has one shared replay control", () => {
  const content = JSON.parse(readFileSync(new URL("../../../packages/shared/examples/game-content/counting.v1.json", import.meta.url), "utf8"));
  for (const mode of ["PLAY", "PREVIEW"]) {
    const markup = renderToStaticMarkup(React.createElement(GameRuntime, { content, mode, assetUrls: {} }));
    assert.equal((markup.match(/game-voice-button/g) ?? []).length, 1);
    assert.match(markup, /aria-label="Đang tải giọng đọc"/);
    if (mode === "PLAY") {
      assert.match(markup, /Bắt đầu/);
      assert.match(markup, /<fieldset disabled=""/);
    } else {
      assert.doesNotMatch(markup, /<fieldset disabled=""/);
    }
    const legacy = { ...content };
    delete legacy.instruction;
    const fallback = renderToStaticMarkup(React.createElement(GameRuntime, { content: legacy, mode, assetUrls: {} }));
    assert.doesNotMatch(fallback, /role="alert"/);
  }
});
import {
  GameAssetsApi,
  GameAssetApiError,
} from "../src/features/game-assets/api.ts";
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

test("child play selects its own looping music; adult previews stay silent", () => {
  for (const name of ["classification", "matching", "counting"]) {
    const content = load(name);
    const play = renderToStaticMarkup(React.createElement(GameRuntime, { content, assetUrls: {}, mode: "PLAY" }));
    assert.match(play, new RegExp(`<audio[^>]*src="/audio/game/${name}\\.mp3"[^>]*loop=""`));
    assert.match(play, /data-game-music-toggle/);
    const preview = renderToStaticMarkup(React.createElement(GameRuntime, { content, assetUrls: {}, mode: "PREVIEW" }));
    assert.doesNotMatch(preview, /<audio|data-game-music-toggle/);
  }
});

function fakeClock() {
  let now = Date.now();
  let key = 0;
  const timers = new Map();
  return {
    now: () => now,
    schedule(callback, delay) {
      const id = ++key;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    cancel(id) {
      timers.delete(id);
    },
    advance(ms) {
      now += ms;
      for (const [id, item] of [...timers])
        if (item.at <= now) {
          timers.delete(id);
          item.callback();
        }
    },
    count: () => timers.size,
  };
}
const resource = (clock, suffix = "1", seconds = 900) => ({
  url: `http://media.example.test/private/image.png?X-Amz-Signature=${suffix}%2Fkeep`,
  expiresIn: seconds,
  expiresAt: new Date(clock.now() + seconds * 1000).toISOString(),
});
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("Resolver did not reach expected state.");
}
const ready = (resolver) =>
  until(
    () =>
      resolver.getSnapshot().status === "ready" &&
      !resolver.getSnapshot().refreshing,
  );
const settled = (resolver) =>
  until(
    () =>
      !resolver.getSnapshot().refreshing &&
      resolver.getSnapshot().status !== "loading",
  );

for (const name of ["counting", "matching", "classification"]) {
  test(`${name}: renders the existing renderer in PREVIEW with supplied image URLs`, () => {
    const content = load(name);
    const urls = Object.fromEntries(
      getGameContentAssetIds(content).map((id) => [
        id,
        "http://media.example.test/image.png?signature=unchanged",
      ]),
    );
    const html = renderToStaticMarkup(
      React.createElement(GameRuntime, {
        content,
        assetUrls: urls,
        mode: "PREVIEW",
      }),
    );
    assert.ok(html.includes(content.instruction));
    assert.ok(html.includes("Chơi thử"));
    assert.ok(html.includes("signature=unchanged"));
    assert.ok(html.includes("Chơi lại"));
    const theme = { counting: "pond", matching: "forest", classification: "savanna" }[name];
    assert.ok(html.includes({ pond: "/game-scenes/pond/background_pond.png", forest: "/game-scenes/forest/background.png", savanna: "/game-scenes/savana/savanna_background.png" }[theme]));
    assert.ok(html.includes(`data-scene-theme="${theme}"`));
    assert.equal((html.match(/class="game-forest-canvas"/g) ?? []).length, 1);
    assert.match(html, /<canvas[^>]*aria-hidden="true"[^>]*pointer-events:none/);
    if (name === "counting") assert.ok(html.includes("Chọn đáp án 4"));
    if (name === "matching") assert.ok(html.includes("Ghép vào Bóng con mèo"));
    if (name === "classification")
      assert.ok(html.includes("Đặt hình vào Giỏ màu đỏ"));
  });
}
test("PLAY uses the same forest backdrop as teacher previews without changing game controls", () => {
  const html = renderToStaticMarkup(React.createElement(GameRuntime, {
    content: load("matching"), assetUrls: {}, mode: "PLAY",
  }));
  assert.ok(html.includes("/game-scenes/forest/background.png"));
  assert.equal((html.match(/class="game-forest-canvas"/g) ?? []).length, 1);
  assert.ok(html.includes("Ghép vào Bóng con mèo"));
  assert.ok(html.includes("Tiến độ hoàn thành"));
});
test("counting PLAY selects the pond and classification PLAY the savanna", () => {
  const scenes = { pond: "/game-scenes/pond/background_pond.png", forest: "/game-scenes/forest/background.png", savanna: "/game-scenes/savana/savanna_background.png" };
  for (const [name, theme] of [["counting", "pond"], ["classification", "savanna"]]) {
    const html = renderToStaticMarkup(React.createElement(GameRuntime, {
      content: load(name), assetUrls: {}, mode: "PLAY",
    }));
    for (const [other, url] of Object.entries(scenes)) assert.equal(html.includes(url), other === theme, `${name}: ${other}`);
    assert.ok(html.includes(`data-scene-theme="${theme}"`));
    assert.equal((html.match(/class="game-forest-canvas"/g) ?? []).length, 1);
    assert.ok(html.includes("Tiến độ hoàn thành"));
  }
});
test("invalid content renders an understandable error, without runtime or asset requests", () => {
  let calls = 0;
  const html = renderToStaticMarkup(
    React.createElement(GamePreview, {
      content: { ...load("counting"), correctChoiceId: "missing" },
      assetReader: {
        getReadUrl: async () => {
          calls++;
          throw new Error();
        },
      },
    }),
  );
  assert.ok(html.includes("Nội dung trò chơi chưa hợp lệ"));
  assert.ok(!html.includes("Tiến độ hoàn thành"));
  assert.equal(calls, 0);
});
test("initial Preview shows asset loading and pauses hidden runtime instead of showing substitute images", () => {
  const html = renderToStaticMarkup(
    React.createElement(GamePreview, {
      content: load("counting"),
      assetReader: {
        getReadUrl: async () => {
          throw new Error("must not run during SSR");
        },
      },
    }),
  );
  assert.ok(html.includes("Đang tải hình ảnh"));
  assert.ok(html.includes("hidden"));
  assert.ok(html.includes("disabled"));
  assert.ok(!html.includes("/game-demo/"));
});
test("paused runtime disables interaction controls while retaining the same renderer architecture", () => {
  const html = renderToStaticMarkup(
    React.createElement(GameRuntime, {
      content: load("classification"),
      assetUrls: {},
      paused: true,
      mode: "PREVIEW",
    }),
  );
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.ok(html.includes("Đang chờ ảnh sẵn sàng"));
});
test("production Preview hides technical debug even if requested by a parent", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const html = renderToStaticMarkup(
      React.createElement(GamePreview, {
        content: load("counting"),
        assetReader: {
          getReadUrl: async () => {
            throw new Error();
          },
        },
        showDebug: true,
      }),
    );
    assert.ok(!html.includes("Debug tương tác"));
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
test("resolution deduplicates asset IDs, preserves signed URLs and exposes loading", async () => {
  const clock = fakeClock();
  const calls = [];
  const resolver = createPreviewAssetResolver(
    ["a", "a", "b"],
    {
      getReadUrl: async (id) => {
        calls.push(id);
        return resource(clock, id);
      },
    },
    clock,
  );
  assert.equal(resolver.getSnapshot().status, "loading");
  assert.equal(resolver.getSnapshot().total, 2);
  resolver.start();
  await ready(resolver);
  assert.deepEqual(calls.sort(), ["a", "b"]);
  assert.equal(resolver.getSnapshot().urls.a, resource(clock, "a").url);
  assert.equal(resolver.getSnapshot().hasLoaded, true);
  resolver.stop();
  assert.equal(clock.count(), 0);
});
test("initial batches limit concurrent reads instead of firing the entire library at once", async () => {
  const clock = fakeClock();
  let active = 0;
  let max = 0;
  const resolver = createPreviewAssetResolver(
    Array.from({ length: 12 }, (_, i) => String(i)),
    {
      getReadUrl: async (id) => {
        active++;
        max = Math.max(active, max);
        await new Promise((resolve) => setImmediate(resolve));
        active--;
        return resource(clock, id);
      },
    },
    clock,
  );
  resolver.start();
  await ready(resolver);
  assert.equal(max, 4);
  resolver.stop();
});
for (const [status, code] of [
  [404, "NOT_FOUND"],
  [401, "UNAUTHORIZED"],
  [403, "FORBIDDEN"],
  [409, "INACTIVE"],
  [503, "UNAVAILABLE"],
]) {
  test(`HTTP ${status} produces a specific asset error and no incorrect/local fallback image`, async () => {
    const clock = fakeClock();
    const resolver = createPreviewAssetResolver(
      ["missing"],
      {
        getReadUrl: async () => {
          throw new GameAssetApiError("private driver message", status);
        },
      },
      clock,
    );
    resolver.start();
    await settled(resolver);
    assert.equal(resolver.getSnapshot().status, "error");
    assert.equal(resolver.getSnapshot().issues[0].code, code);
    assert.equal(resolver.getSnapshot().issues[0].assetId, "missing");
    assert.deepEqual(resolver.getSnapshot().urls, {});
    assert.equal(resolver.getSnapshot().hasLoaded, false);
    assert.ok(
      !JSON.stringify(resolver.getSnapshot()).includes("private driver"),
    );
    resolver.stop();
  });
}
test("an expiring presigned URL renews automatically with no hostname/query rewriting", async () => {
  const clock = fakeClock();
  const calls = [];
  const resolver = createPreviewAssetResolver(
    ["a"],
    {
      getReadUrl: async (_id, force) => {
        calls.push(force);
        return resource(clock, String(calls.length));
      },
    },
    clock,
  );
  resolver.start();
  await ready(resolver);
  const first = resolver.getSnapshot().urls.a;
  clock.advance(870000);
  await until(() => calls.length === 2);
  await ready(resolver);
  assert.deepEqual(calls, [false, true]);
  assert.notEqual(resolver.getSnapshot().urls.a, first);
  assert.equal(resolver.getSnapshot().urls.a, resource(clock, "2").url);
  assert.equal(resolver.getSnapshot().hasLoaded, true);
  resolver.stop();
});
test("expiry renewal failure pauses assets; explicit retry can recover without losing loaded state", async () => {
  const clock = fakeClock();
  let requests = 0;
  const resolver = createPreviewAssetResolver(
    ["a"],
    {
      getReadUrl: async () => {
        if (++requests === 2) throw new Error("offline");
        return resource(clock);
      },
    },
    clock,
  );
  resolver.start();
  await ready(resolver);
  clock.advance(870000);
  await settled(resolver);
  assert.equal(resolver.getSnapshot().status, "error");
  assert.equal(resolver.getSnapshot().hasLoaded, true);
  await resolver.retry();
  await ready(resolver);
  assert.equal(requests, 3);
  resolver.stop();
});
test("focus/visibility refresh checks a URL that expired while background timers were suspended", async () => {
  const clock = fakeClock();
  let requests = 0;
  const resolver = createPreviewAssetResolver(
    ["a"],
    {
      getReadUrl: async () => {
        requests++;
        return resource(clock);
      },
    },
    clock,
  );
  resolver.start();
  await ready(resolver);
  clock.advance(910000);
  resolver.refreshIfNeeded();
  resolver.refreshIfNeeded();
  await until(() => requests === 2);
  await ready(resolver);
  assert.equal(requests, 2);
  resolver.stop();
});
test("image failure triggers at most one automatic URL refresh; manual retry increments revision even for an unchanged URL", async () => {
  const clock = fakeClock();
  let requests = 0;
  const resolver = createPreviewAssetResolver(
    ["a"],
    {
      getReadUrl: async () => {
        requests++;
        return resource(clock);
      },
    },
    clock,
  );
  resolver.start();
  await ready(resolver);
  resolver.reportImageError("a", resolver.getSnapshot().urls.a, 1);
  await ready(resolver);
  assert.equal(requests, 2);
  assert.equal(resolver.getSnapshot().revisions.a, 2);
  resolver.reportImageError("a", resolver.getSnapshot().urls.a, 2);
  assert.equal(resolver.getSnapshot().issues[0].code, "IMAGE_FAILED");
  assert.equal(requests, 2);
  await resolver.retry();
  await ready(resolver);
  assert.equal(resolver.getSnapshot().revisions.a, 3);
  resolver.stop();
});
test("a late image error from an older URL/revision cannot invalidate a newly resolved URL", async () => {
  const clock = fakeClock();
  let requests = 0;
  const resolver = createPreviewAssetResolver(
    ["a"],
    { getReadUrl: async () => resource(clock, String(++requests)) },
    clock,
  );
  resolver.start();
  await ready(resolver);
  const oldUrl = resolver.getSnapshot().urls.a;
  await resolver.retry();
  await ready(resolver);
  resolver.reportImageError("a", oldUrl, 1);
  assert.equal(resolver.getSnapshot().status, "ready");
  assert.equal(requests, 2);
  resolver.stop();
});
test("StrictMode start/stop/start sends a single initial request; stopping ignores outstanding results", async () => {
  const clock = fakeClock();
  let requests = 0;
  let finish;
  const resolver = createPreviewAssetResolver(
    ["a"],
    {
      getReadUrl: () => {
        requests++;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
    clock,
  );
  resolver.start();
  resolver.stop();
  resolver.start();
  await until(() => requests === 1);
  resolver.stop();
  const before = resolver.getSnapshot();
  finish(resource(clock));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolver.getSnapshot(), before);
  assert.equal(clock.count(), 0);
});
test("request failures and already-expired/malformed URLs do not trigger a renewal loop", async () => {
  for (const bad of [
    "javascript:alert(1)",
    "http://user:secret@media.example.test/image",
    "http://invalid host/image",
  ]) {
    const clock = fakeClock();
    const resolver = createPreviewAssetResolver(
      ["a"],
      { getReadUrl: async () => ({ ...resource(clock), url: bad }) },
      clock,
    );
    resolver.start();
    await settled(resolver);
    assert.equal(resolver.getSnapshot().status, "error");
    assert.equal(clock.count(), 0);
    resolver.stop();
  }
  const clock = fakeClock();
  const resolver = createPreviewAssetResolver(
    ["a"],
    {
      getReadUrl: async () => ({
        ...resource(clock),
        expiresAt: new Date(clock.now() - 1).toISOString(),
      }),
    },
    clock,
  );
  resolver.start();
  await settled(resolver);
  assert.equal(resolver.getSnapshot().status, "error");
  assert.equal(clock.count(), 0);
  resolver.stop();
});
test("playing, completion and reset only use read-URL GETs: no PlaySession/event/performance/evaluation persistence", async () => {
  const content = load("classification");
  const clock = fakeClock();
  const requests = [];
  const api = new GameAssetsApi(
    "fixture-token",
    "http://api.example.test",
    async (url, options) => {
      requests.push({ url, method: options.method });
      assert.equal(options.method, "GET");
      assert.match(url, /\/api\/v1\/game-assets\/[^/]+\/url$/);
      return Response.json({ success: true, data: resource(clock) });
    },
  );
  const resolver = createPreviewAssetResolver(
    getGameContentAssetIds(content),
    api,
    clock,
  );
  resolver.start();
  await ready(resolver);
  const events = [];
  let completed = 0;
  const game = createGameController(content, {
    onInteraction: (event) => events.push(event),
    onComplete: () => completed++,
  });
  const readsBeforePlay = requests.length;
  game.dispatch({
    actionType: "CLASSIFY_DROP",
    sourceId: "red-ball-1",
    targetId: "blue-basket",
  });
  for (const item of content.items)
    game.dispatch({
      actionType: "CLASSIFY_DROP",
      sourceId: item.id,
      targetId: item.correctGroupId,
    });
  assert.equal(events.length, 7);
  assert.equal(completed, 1);
  assert.equal(requests.length, readsBeforePlay);
  game.reset();
  assert.equal(game.getState().attemptCount, 0);
  assert.equal(requests.length, readsBeforePlay);
  assert.ok(requests.every((request) => request.method === "GET"));
  resolver.stop();
});
