import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AiClient,
  AiClientError,
  aiRequestSchema,
  gameResponseSchema,
  generateGameSchema,
} from "../dist/index.js";

const id = "61aa17ec-2380-4f39-9229-045322b692d7";
const input = {
  gameType: "COUNTING",
  prompt: "Đếm 3 quả bóng",
  requestId: id,
  candidates: [
    {
      id,
      name: "Bóng đỏ",
      objectType: "BALL",
      tags: ["red"],
      attributes: { color: "RED" },
    },
  ],
  responseSchema: gameResponseSchema("COUNTING", [id]),
  attempt: 1,
  validationErrors: [],
};
const output = {
  requestId: id,
  gameContent: { gameType: "COUNTING" },
  model: "fixture-model",
};
const client = (fetcher) =>
  new AiClient({
    baseUrl: "http://ai.example.test",
    token: "fixture-token",
    timeoutMs: 20,
    fetcher,
  });
test("request validates type, whitespace, length, strict fields and disallows client asset list", () => {
  for (const value of [
    { gameType: "NOPE", prompt: "x" },
    { gameType: "COUNTING", prompt: " " },
    { gameType: "COUNTING", prompt: "x".repeat(2001) },
    { gameType: "COUNTING", prompt: "x", assetIds: [id] },
  ])
    assert.equal(generateGameSchema.safeParse(value).success, false);
  assert.equal(
    generateGameSchema.parse({ gameType: "COUNTING", prompt: " x " }).prompt,
    "x",
  );
});
for (const gameType of ["COUNTING", "MATCHING", "CLASSIFICATION"]) {
  test(`${gameType} schema derives literal constraints and whitelists every asset reference`, () => {
    const schema = gameResponseSchema(gameType, [id]);
    assert.deepEqual(schema.properties.gameType.enum, [gameType]);
    assert.deepEqual(schema.properties.schemaVersion.enum, [1]);
    const arrays =
      gameType === "MATCHING"
        ? ["sourceItems", "targetItems"]
        : gameType === "CLASSIFICATION"
          ? ["items", "groups"]
          : ["items"];
    for (const key of arrays)
      assert.deepEqual(schema.properties[key].items.properties.assetId.enum, [
        id,
      ]);
    assert.equal(JSON.stringify(schema).includes('"const"'), false);
    assert.equal(schema.additionalProperties, false);
  });
}
test("typed internal contract rejects excess candidates and unknown fields", () => {
  assert.equal(aiRequestSchema.safeParse(input).success, true);
  assert.equal(
    aiRequestSchema.safeParse({
      ...input,
      candidates: Array(41).fill(input.candidates[0]),
    }).success,
    false,
  );
});
test("client sends internal bearer and preserves fetch receiver", async () => {
  const response = await client(async function (url, init) {
    assert.equal(this, globalThis);
    assert.equal(url.pathname, "/v1/game-generation");
    assert.equal(init.headers.Authorization, "Bearer fixture-token");
    return Response.json(output);
  }).generate(input);
  assert.deepEqual(response, output);
});
test("unavailable service is sanitized and retryable", async () => {
  await assert.rejects(
    client(async () => {
      throw new Error("secret url token");
    }).generate(input),
    (error) =>
      error instanceof AiClientError &&
      error.code === "AI_SERVICE_UNAVAILABLE" &&
      !error.message.includes("secret"),
  );
});
test("request timeout aborts the transport", async () => {
  await assert.rejects(
    client(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    ).generate(input),
    { code: "AI_TIMEOUT" },
  );
});
test("invalid JSON, shape and correlation IDs cannot cross the client boundary", async () => {
  for (const value of [
    "not-json",
    JSON.stringify({ secret: "no" }),
    JSON.stringify({
      ...output,
      requestId: "a6daed96-a0f3-401c-a14d-1b349726063d",
    }),
  ])
    await assert.rejects(
      client(async () => new Response(value)).generate(input),
      { code: "AI_CONTRACT_INVALID" },
    );
});
test("oversized response is bounded even without Content-Length", async () => {
  await assert.rejects(
    client(async () => new Response("x".repeat(262145))).generate(input),
    { code: "AI_CONTRACT_INVALID" },
  );
});
test("quota/auth errors are not made retryable", async () => {
  await assert.rejects(
    client(async () =>
      Response.json(
        { error: { code: "AI_QUOTA_EXCEEDED", retryable: false } },
        { status: 429 },
      ),
    ).generate(input),
    { code: "AI_QUOTA_EXCEEDED", retryable: false },
  );
  await assert.rejects(
    client(async () => new Response("{}", { status: 401 })).generate(input),
    { code: "AI_PROVIDER_CONFIG_ERROR", retryable: false },
  );
});

test("provider diagnosis crosses the internal boundary using only fixed categories", async () => {
  const diagnostic = {
    providerStatus: 404,
    category: "MODEL_OR_ENDPOINT_UNAVAILABLE",
  };
  await assert.rejects(
    client(async () =>
      Response.json(
        {
          error: {
            code: "AI_PROVIDER_CONFIG_ERROR",
            retryable: false,
            diagnostic,
          },
        },
        { status: 503 },
      ),
    ).generate(input),
    (error) =>
      error.code === "AI_PROVIDER_CONFIG_ERROR" &&
      error.diagnostic.category === diagnostic.category &&
      error.diagnostic.providerStatus === 404,
  );
  await assert.rejects(
    client(async () =>
      Response.json(
        {
          error: {
            code: "AI_PROVIDER_CONFIG_ERROR",
            retryable: false,
            diagnostic: { providerStatus: 400, category: "secret raw message" },
          },
        },
        { status: 503 },
      ),
    ).generate(input),
    (error) =>
      error.diagnostic === undefined && !error.message.includes("secret"),
  );
});
