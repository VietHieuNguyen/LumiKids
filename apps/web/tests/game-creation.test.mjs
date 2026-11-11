import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getGameContentAssetIds, gameContentSchema } from "@lumikids/shared";
import {
  GameGenerationApi,
  GameGenerationApiError,
  parseGeneratedGame,
} from "../src/features/game-creation/api.ts";
import { createGameCreationController } from "../src/features/game-creation/controller.ts";
import {
  canCreateGames,
  MAX_GAME_PROMPT_LENGTH,
} from "../src/features/game-creation/types.ts";
import {
  GameCreator,
  gameCreationOptions,
} from "../src/features/game-creation/game-creator.tsx";
import { GamePreview } from "../src/features/game-preview/game-preview.tsx";
import { createPreviewAssetResolver } from "../src/features/game-preview/asset-resolver.ts";
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
function result(name = "counting") {
  const gameContent = load(name);
  return {
    gameType: gameContent.gameType,
    gameContent,
    generation: {
      requestId: "befb7424-2cc4-4f2c-8814-32476d0da920",
      model: "fixture-model",
      attempts: 1,
      reviewRequired: true,
      warnings: ["ADULT_REVIEW_REQUIRED"],
      validatedAt: new Date().toISOString(),
      preview: {
        token: "fixture-preview-proof",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    },
  };
}
const envelope = (data) => ({ success: true, code: "OK", data });
const input = { gameType: "COUNTING", prompt: "Đếm 4 quả bóng" };
const resource = () => ({
  url: "http://media.example.test/private/image.png?X-Amz-Signature=keep%2Foriginal",
  expiresIn: 900,
  expiresAt: new Date(Date.now() + 900000).toISOString(),
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("Expected state was not reached");
}

test("authorization follows generation permission, never role alone", () => {
  assert.equal(canCreateGames(null), false);
  assert.equal(
    canCreateGames({ roles: ["ROLE_ADMIN"], permissions: [] }),
    false,
  );
  assert.equal(
    canCreateGames({
      roles: ["ROLE_GUARDIAN"],
      permissions: ["READ_OWN_ACCOUNT"],
    }),
    false,
  );
  for (const role of ["ROLE_TEACHER", "ROLE_ADMIN"])
    assert.equal(
      canCreateGames({ roles: [role], permissions: ["GENERATE_GAME_CONTENT"] }),
      true,
    );
});
test("creator renders three choices, prompt limit, samples, disabled empty submission and draft notice", () => {
  const api = new GameGenerationApi(
    "fixture",
    "http://api.example.test",
    () => {
      assert.fail("SSR must not generate games");
    },
  );
  const html = renderToStaticMarkup(
    React.createElement(GameCreator, {
      api,
      fullName: "Giáo viên test",
      onUnauthorized: () => {},
    }),
  );
  assert.match(html, /AI Game Creator/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, new RegExp(`maxLength="${MAX_GAME_PROMPT_LENGTH}"`, "i"));
  assert.match(html, /Generate Game/);
  assert.match(html, /disabled=""/);
  assert.match(html, /có thể mất khi tải lại hoặc rời trang/);
  assert.equal(gameCreationOptions.length, 3);
});
test("invalid prompt and unsupported type are rejected before network", async () => {
  const api = new GameGenerationApi("fixture", "http://api.example.test", () =>
    assert.fail("Must not call API"),
  );
  for (const value of [
    { ...input, prompt: "   " },
    { ...input, prompt: "x".repeat(2001) },
    { ...input, gameType: "ALIEN" },
  ])
    await assert.rejects(api.generate(value), { code: "INVALID_INPUT" });
});
test("generation uses the actual endpoint/envelope and binds browser fetch receiver", async () => {
  const api = new GameGenerationApi(
    "access-token",
    "http://api.example.test/",
    async function (url, init) {
      assert.equal(this, globalThis);
      assert.equal(
        url,
        "http://api.example.test/api/v1/game-generation/generate",
      );
      assert.equal(init.method, "POST");
      assert.equal(init.cache, "no-store");
      assert.equal(init.headers.Authorization, "Bearer access-token");
      assert.deepEqual(JSON.parse(init.body), {
        ...input,
        prompt: input.prompt,
      });
      return Response.json(envelope(result()));
    },
  );
  assert.equal(
    (await api.generate({ ...input, prompt: `  ${input.prompt}  ` })).gameType,
    "COUNTING",
  );
});
for (const name of ["counting", "matching", "classification"]) {
  test(`${name}: validates generation, resolves signed assets and completes/resets the existing Runtime without saving sessions`, async (t) => {
    const generated = result(name);
    const calls = [];
    const api = new GameGenerationApi(
      "fixture",
      "http://api.example.test",
      async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body), method: init.method });
        if (url.endsWith("/generate"))
          return Response.json(envelope(generated));
        assert.match(
          url,
          /\/game-generation\/preview-assets\/[0-9a-f-]+\/read-url$/,
        );
        assert.deepEqual(JSON.parse(init.body), {
          previewToken: generated.generation.preview.token,
        });
        return Response.json(envelope(resource()));
      },
    );
    const creator = createGameCreationController(api);
    await creator.generate({
      gameType: generated.gameType,
      prompt: "Mô tả trò chơi thử",
    });
    const game = creator.getSnapshot().draft.game;
    const reader = api.createPreviewReader(game);
    const ids = getGameContentAssetIds(game.gameContent);
    const resolver = createPreviewAssetResolver(ids, reader);
    t.after(() => {
      resolver.stop();
      creator.cancel();
    });
    resolver.start();
    await until(() => resolver.getSnapshot().status === "ready");
    assert.equal(calls.length, 1 + ids.length);
    assert.ok(
      Object.values(resolver.getSnapshot().urls).every((url) =>
        url.endsWith("keep%2Foriginal"),
      ),
    );
    const html = renderToStaticMarkup(
      React.createElement(GamePreview, {
        content: game.gameContent,
        assetReader: reader,
      }),
    );
    assert.ok(html.includes(game.gameContent.instruction));
    assert.match(html, /Chơi lại/);
    let completed = 0;
    const runtime = createGameController(game.gameContent, {
      onComplete: () => completed++,
    });
    if (name === "counting") {
      runtime.dispatch({ actionType: "SELECT_CHOICE", sourceId: "choice-3" });
      assert.equal(runtime.getState().completed, false);
      runtime.dispatch({
        actionType: "SELECT_CHOICE",
        sourceId: game.gameContent.correctChoiceId,
      });
    } else if (name === "matching") {
      runtime.dispatch({
        actionType: "MATCH_DROP",
        sourceId: game.gameContent.pairs[0].sourceId,
        targetId: game.gameContent.pairs[1].targetId,
      });
      assert.equal(runtime.getState().completed, false);
      for (const pair of game.gameContent.pairs)
        runtime.dispatch({ actionType: "MATCH_DROP", ...pair });
    } else {
      const item = game.gameContent.items[0];
      const wrong = game.gameContent.groups.find(
        (group) => group.id !== item.correctGroupId,
      );
      runtime.dispatch({
        actionType: "CLASSIFY_DROP",
        sourceId: item.id,
        targetId: wrong.id,
      });
      assert.equal(runtime.getState().completed, false);
      for (const entry of game.gameContent.items)
        runtime.dispatch({
          actionType: "CLASSIFY_DROP",
          sourceId: entry.id,
          targetId: entry.correctGroupId,
        });
    }
    assert.equal(runtime.getState().completed, true);
    assert.equal(completed, 1);
    runtime.reset();
    assert.equal(runtime.getState().completed, false);
    assert.equal(runtime.getState().attemptCount, 0);
    // Every request above is generation or scoped URL resolution, including completion/reset.
    assert.ok(
      calls.every(
        (call) =>
          call.method === "POST" && /\/game-generation\//.test(call.url),
      ),
    );
    resolver.stop();
    creator.cancel();
  });
}
test("invalid success data, mismatched game type or missing preview proof cannot replace a draft", () => {
  for (const value of [
    null,
    {},
    { ...result(), gameType: "MATCHING" },
    { ...result(), gameContent: { schemaVersion: 99 } },
    { ...result(), generation: { ...result().generation, preview: undefined } },
  ])
    assert.throws(() => parseGeneratedGame(value, "COUNTING"), {
      code: "INVALID_RESPONSE",
    });
});
test("provider/network/authorization failures use safe messages and never retry automatically", async () => {
  for (const [status, code] of [
    [422, "ASSETS_INSUFFICIENT"],
    [503, "AI_NOT_CONFIGURED"],
    [429, "AI_QUOTA_EXCEEDED"],
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [504, "AI_TIMEOUT"],
  ]) {
    let calls = 0;
    const api = new GameGenerationApi(
      "fixture",
      "http://api.example.test",
      async () => {
        calls++;
        return Response.json(
          { success: false, code, message: "secret raw provider failure" },
          { status },
        );
      },
    );
    await assert.rejects(
      api.generate(input),
      (error) => error.status === status && !error.message.includes("secret"),
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    new GameGenerationApi("fixture", "http://api.example.test", async () => {
      throw new Error("private network data");
    }).generate(input),
    { code: "NETWORK_ERROR" },
  );
});
test("client has a deadline and external cancellation prevents stale completion", async () => {
  const fetcher = (_url, init) =>
    new Promise((_resolve, reject) =>
      init.signal.addEventListener("abort", () =>
        reject(new DOMException("cancelled", "AbortError")),
      ),
    );
  await assert.rejects(
    new GameGenerationApi(
      "fixture",
      "http://api.example.test",
      fetcher,
      10,
    ).generate(input),
    { code: "CLIENT_TIMEOUT" },
  );
  const signal = new AbortController();
  const promise = new GameGenerationApi(
    "fixture",
    "http://api.example.test",
    fetcher,
  ).generate(input, signal.signal);
  signal.abort();
  await assert.rejects(promise, { name: "AbortError" });
});
test("controller blocks duplicate clicks synchronously and publishes loading", async () => {
  const pending = deferred();
  let calls = 0;
  const controller = createGameCreationController({
    generate: () => {
      calls++;
      return pending.promise;
    },
  });
  const first = controller.generate(input);
  const second = controller.generate(input);
  assert.equal(controller.getSnapshot().status, "generating");
  assert.equal(await second, false);
  assert.equal(calls, 1);
  pending.resolve(result());
  assert.equal(await first, true);
  assert.equal(controller.getSnapshot().status, "ready");
});
test("failed regenerate preserves the exact old preview and successful identical content gets a new revision", async () => {
  let next = async () => result();
  const controller = createGameCreationController({ generate: () => next() });
  await controller.generate(input);
  const old = controller.getSnapshot().draft;
  next = async () => {
    throw new GameGenerationApiError(
      "Thử lại sau",
      503,
      "AI_SERVICE_UNAVAILABLE",
    );
  };
  await controller.generate(input);
  assert.equal(controller.getSnapshot().draft, old);
  assert.equal(controller.getSnapshot().status, "error");
  next = async () => result();
  await controller.generate(input);
  assert.equal(controller.getSnapshot().draft.revision, old.revision + 1);
  assert.equal(controller.getSnapshot().error, null);
});
test("late response after unmount/identity change is ignored and refreshed gateway preserves draft", async () => {
  const late = deferred();
  const controller = createGameCreationController({
    generate: () => late.promise,
  });
  const request = controller.generate(input);
  controller.cancel();
  late.resolve(result());
  assert.equal(await request, false);
  assert.equal(controller.getSnapshot().draft, null);
  let calls = 0;
  controller.setGateway({
    generate: async () => {
      calls++;
      return result();
    },
  });
  await controller.generate(input);
  const draft = controller.getSnapshot().draft;
  controller.setGateway({
    generate: async () => {
      calls++;
      return result("matching");
    },
  });
  assert.equal(controller.getSnapshot().draft, draft);
  await controller.generate({
    gameType: "MATCHING",
    prompt: "Ghép mèo và chó",
  });
  assert.equal(controller.getSnapshot().draft.game.gameType, "MATCHING");
  assert.equal(calls, 2);
});
test("empty/too-long request never leaves controller stuck in generating", async () => {
  const controller = createGameCreationController({
    generate: () => assert.fail("Invalid prompt must not call API"),
  });
  assert.equal(await controller.generate({ ...input, prompt: " " }), false);
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(
    await controller.generate({ ...input, prompt: "x".repeat(2001) }),
    false,
  );
});

test("a 401 from an old gateway does not invalidate a refreshed session", async () => {
  const pending = deferred();
  const controller = createGameCreationController({
    generate: () => pending.promise,
  });
  const request = controller.generate(input);
  controller.setGateway({ generate: async () => result() });
  pending.reject(
    new GameGenerationApiError("Expired old access token", 401, "UNAUTHORIZED"),
  );
  assert.equal(await request, false);
  assert.equal(controller.getSnapshot().error.code, "SESSION_UPDATED");
  assert.equal(controller.getSnapshot().error.status, 0);
  await controller.generate(input);
  assert.equal(controller.getSnapshot().status, "ready");
});
test("scoped asset reader deduplicates and refreshes expiring signed URLs without changing their hostname", async () => {
  let calls = 0;
  const api = new GameGenerationApi(
    "fixture",
    "http://api.example.test",
    async () => {
      calls++;
      return Response.json(envelope(resource()));
    },
  );
  const game = result();
  const reader = api.createPreviewReader(game);
  const id = getGameContentAssetIds(game.gameContent)[0];
  const values = await Promise.all([
    reader.getReadUrl(id),
    reader.getReadUrl(id),
  ]);
  assert.equal(calls, 1);
  assert.equal(values[0].url, resource().url);
  await reader.getReadUrl(id);
  assert.equal(calls, 1);
  await reader.getReadUrl(id, true);
  assert.equal(calls, 2);
  await assert.rejects(
    reader.getReadUrl("8e180e94-9105-4be1-9fea-f6cf43144099"),
    { status: 403 },
  );
  game.generation.preview.expiresAt = new Date(Date.now() - 1).toISOString();
  await assert.rejects(reader.getReadUrl(id, true), {
    code: "PREVIEW_ACCESS_EXPIRED",
  });
  assert.equal(calls, 2);
});
test("missing/inactive assets and expired preview proof appear as existing Preview errors", async () => {
  for (const [status, code, text] of [
    [404, "NOT_FOUND", "Ảnh không tồn tại"],
    [409, "ASSETS_CHANGED", "ngừng sử dụng"],
    [410, "PREVIEW_ACCESS_EXPIRED", "hết hạn"],
  ]) {
    const api = new GameGenerationApi(
      "fixture",
      "http://api.example.test",
      async () => Response.json({ success: false, code }, { status }),
    );
    const game = result();
    const resolver = createPreviewAssetResolver(
      getGameContentAssetIds(game.gameContent),
      api.createPreviewReader(game),
    );
    resolver.start();
    await until(() => resolver.getSnapshot().status === "error");
    assert.ok(
      resolver
        .getSnapshot()
        .issues.every((issue) => issue.message.includes(text)),
    );
    resolver.stop();
  }
});
