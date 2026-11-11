import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetSearchParams,
  attributeInputFrom,
  changeAssetPage,
  createUploadBody,
  DEFAULT_FILTERS,
  MAX_FILE_BYTES,
  parseAttributes,
  parseTags,
  prepareFilters,
  prepareMetadata,
  validateFile,
} from "../src/features/game-assets/metadata.ts";
import {
  GameAssetApiError,
  GameAssetsApi,
} from "../src/features/game-assets/api.ts";

test("fetch uses the global receiver required by browser Web APIs", async () => {
  let calls = 0;
  const api = new GameAssetsApi(
    "fixture-token",
    "http://api.example.test",
    function () {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      calls++;
      return Promise.resolve(
        Response.json({
          success: true,
          data: {
            items: [],
            pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          },
        }),
      );
    },
  );
  await api.list(new URLSearchParams({ page: "1", pageSize: "20" }));
  assert.equal(calls, 1);
});

const asset = {
  id: "61aa17ec-2380-4f39-9229-045322b692d7",
  name: "Quả bóng đỏ",
  objectKey: "game-assets/fixture.png",
  originalFileName: "ball.png",
  mimeType: "image/png",
  sizeBytes: 123,
  objectType: "BALL",
  tags: ["red"],
  attributes: { color: "RED" },
  status: "ACTIVE",
  createdBy: null,
  createdAt: "2026-11-10T00:00:00Z",
  updatedAt: "2026-11-10T00:00:00Z",
};
const metadata = {
  name: asset.name,
  objectType: "BALL",
  tags: ["red"],
  attributes: { color: "RED" },
};
const response = (data) =>
  Response.json({
    success: true,
    code: "OK",
    message: "Request successful.",
    data,
  });
function fixtureApi(fetcher) {
  return new GameAssetsApi(
    "fixture-token",
    "http://api.example.test:4000",
    fetcher,
  );
}

test("file validation accepts PNG/JPEG/WebP and exact size limit", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"])
    assert.equal(validateFile({ type, size: MAX_FILE_BYTES }), null);
});
test("file validation rejects missing/empty/oversize/unsupported files", () => {
  for (const file of [
    null,
    { type: "image/png", size: 0 },
    { type: "image/png", size: MAX_FILE_BYTES + 1 },
    { type: "image/svg+xml", size: 100 },
    { type: "", size: 100 },
  ])
    assert.equal(typeof validateFile(file), "string");
});
test("metadata trims names and normalizes types/tags", () => {
  assert.deepEqual(
    prepareMetadata("  Ball  ", "ball", " RED, red, toy, ", {
      mode: "pairs",
      rows: [{ id: "1", key: " color ", value: "RED" }],
    }),
    {
      name: "Ball",
      objectType: "BALL",
      tags: ["red", "toy"],
      attributes: { color: "RED" },
    },
  );
});
test("rejects blank names, invalid types and tags over backend limits", () => {
  assert.throws(() =>
    prepareMetadata(" ", "BALL", "", { mode: "pairs", rows: [] }),
  );
  assert.throws(() =>
    prepareMetadata("Ball", "../BALL", "", { mode: "pairs", rows: [] }),
  );
  assert.throws(() => parseTags("a".repeat(51)));
  assert.throws(() =>
    parseTags(Array.from({ length: 31 }, (_, i) => `tag${i}`).join(",")),
  );
});
test("attribute rows reject empty, duplicate and reserved keys", () => {
  for (const keys of [
    [""],
    ["color", " color "],
    ["__proto__"],
    ["constructor"],
    ["a".repeat(101)],
  ]) {
    assert.throws(() =>
      parseAttributes({
        mode: "pairs",
        rows: keys.map((key, i) => ({ id: String(i), key, value: "RED" })),
      }),
    );
  }
});
test("structured metadata is preserved through JSON mode and edits", () => {
  const structured = {
    count: 2,
    visible: true,
    nested: { habitat: "WATER" },
    tags: ["fish"],
    optional: null,
  };
  const editor = attributeInputFrom(structured);
  assert.equal(editor.mode, "json");
  assert.deepEqual(parseAttributes(editor), structured);
  assert.deepEqual(
    prepareMetadata("Fish", "ANIMAL", "fish", editor).attributes,
    structured,
  );
});
test("JSON validation rejects malformed/array/null/deep/oversize/prototype values", () => {
  for (const json of [
    "{bad",
    "[]",
    "null",
    '{"__proto__":{"bad":true}}',
    JSON.stringify({ a: { b: { c: { d: { e: { f: 1 } } } } } }),
    JSON.stringify({ color: "a".repeat(16385) }),
  ]) {
    assert.throws(() => parseAttributes({ mode: "json", json }));
  }
});
test("multipart body has exactly file/name/objectType/tags/attributes and preserves bytes", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "ball.png", {
    type: "image/png",
  });
  const body = createUploadBody(metadata, file);
  assert.deepEqual(
    [...body.keys()],
    ["file", "name", "objectType", "tags", "attributes"],
  );
  assert.equal(body.get("name"), asset.name);
  assert.deepEqual(JSON.parse(body.get("tags")), ["red"]);
  assert.deepEqual(JSON.parse(body.get("attributes")), { color: "RED" });
  assert.equal(body.get("file").name, "ball.png");
  assert.deepEqual(
    new Uint8Array(await body.get("file").arrayBuffer()),
    new Uint8Array([1, 2, 3]),
  );
});
test("filter changes reset pagination and serialize server-side filters correctly", () => {
  const filters = prepareFilters({
    search: "  bóng đỏ  ",
    objectType: "ball",
    tags: "RED, toy",
    status: "INACTIVE",
    pageSize: 12,
  });
  assert.equal(filters.page, 1);
  const page = changeAssetPage(filters, 3);
  const params = assetSearchParams(page);
  assert.equal(params.get("page"), "3");
  assert.equal(params.get("pageSize"), "12");
  assert.equal(params.get("search"), "bóng đỏ");
  assert.equal(params.get("objectType"), "BALL");
  assert.equal(params.get("status"), "INACTIVE");
  assert.deepEqual(JSON.parse(params.get("tags")), ["red", "toy"]);
  assert.equal(assetSearchParams(DEFAULT_FILTERS).has("search"), false);
});
test("pagination/filter bounds follow backend constraints", () => {
  for (const page of [0, -1, 1.5, 10001])
    assert.throws(() => changeAssetPage(DEFAULT_FILTERS, page));
  assert.throws(() =>
    prepareFilters({
      search: "",
      objectType: "BALL!",
      tags: "",
      status: "ACTIVE",
      pageSize: 20,
    }),
  );
  assert.throws(() =>
    prepareFilters({
      search: "",
      objectType: "",
      tags: "",
      status: "ACTIVE",
      pageSize: 101,
    }),
  );
});
test("API list uses Bearer token/cookies, no-store, URL params and actual response envelope", async () => {
  const api = fixtureApi(async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/api/v1/game-assets");
    assert.equal(parsed.searchParams.get("pageSize"), "20");
    assert.equal(options.headers.Authorization, "Bearer fixture-token");
    assert.equal(options.credentials, "include");
    assert.equal(options.cache, "no-store");
    return response({
      items: [asset],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
  });
  assert.equal(
    (await api.list(assetSearchParams(DEFAULT_FILTERS))).items[0].id,
    asset.id,
  );
});
test("API uploads FormData without setting Content-Type or automatic retries", async () => {
  let requests = 0;
  const body = createUploadBody(
    metadata,
    new File(["fixture"], "ball.png", { type: "image/png" }),
  );
  const api = fixtureApi(async (_url, options) => {
    requests++;
    assert.equal(options.method, "POST");
    assert.equal(options.body, body);
    assert.equal(options.headers["Content-Type"], undefined);
    return response(asset);
  });
  assert.equal((await api.upload(body)).id, asset.id);
  assert.equal(requests, 1);
});
test("metadata PATCH contains editable fields only and keeps asset ID", async () => {
  const api = fixtureApi(async (url, options) => {
    assert.equal(url.endsWith(`/game-assets/${asset.id}`), true);
    assert.equal(options.method, "PATCH");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), metadata);
    assert.equal("objectKey" in JSON.parse(options.body), false);
    return response(asset);
  });
  assert.equal((await api.update(asset.id, metadata)).id, asset.id);
});
test("status API uses separate PATCH for both ACTIVE and INACTIVE", async () => {
  const seen = [];
  const api = fixtureApi(async (url, options) => {
    assert.equal(url.endsWith(`/${asset.id}/status`), true);
    assert.equal(options.method, "PATCH");
    const { status } = JSON.parse(options.body);
    seen.push(status);
    return response({ ...asset, status });
  });
  assert.equal((await api.setStatus(asset.id, "INACTIVE")).status, "INACTIVE");
  assert.equal((await api.setStatus(asset.id, "ACTIVE")).status, "ACTIVE");
  assert.deepEqual(seen, ["INACTIVE", "ACTIVE"]);
});
for (const status of [400, 401, 403, 404, 409, 413, 429, 500, 503]) {
  test(`HTTP ${status} becomes a localized typed error without echoing server internals`, async () => {
    const api = fixtureApi(async () =>
      Response.json({ message: "private database details" }, { status }),
    );
    await assert.rejects(
      api.detail(asset.id),
      (error) =>
        error instanceof GameAssetApiError &&
        error.status === status &&
        !error.message.includes("private"),
    );
  });
}
test("network failure is readable and an aborted stale request remains cancellable", async () => {
  await assert.rejects(
    fixtureApi(async () => {
      throw new Error("private internals");
    }).detail(asset.id),
    (error) =>
      error instanceof GameAssetApiError &&
      error.status === 0 &&
      !error.message.includes("private"),
  );
  await assert.rejects(
    fixtureApi(async () => {
      throw new DOMException("Aborted", "AbortError");
    }).detail(asset.id),
    { name: "AbortError" },
  );
});
test("rejects malformed response/envelope and unbounded page result", async () => {
  await assert.rejects(
    fixtureApi(async () => response({ ...asset, tags: null })).detail(asset.id),
    GameAssetApiError,
  );
  await assert.rejects(
    fixtureApi(async () => Response.json({ data: asset })).detail(asset.id),
    GameAssetApiError,
  );
  await assert.rejects(
    fixtureApi(async () =>
      response({
        items: [asset],
        pagination: { page: 1, pageSize: 1000, total: 1, totalPages: 1 },
      }),
    ).list(new URLSearchParams()),
    GameAssetApiError,
  );
});
test("presigned URL stays unchanged, in-memory cache/single-flight avoid repeated requests", async () => {
  let requests = 0;
  const signed = {
    url: "http://media.example.test:9000/bucket/image.png?X-Amz-Signature=fixture%2Funchanged",
    expiresIn: 900,
    expiresAt: new Date(Date.now() + 900000).toISOString(),
  };
  const api = fixtureApi(async () => {
    requests++;
    return response(signed);
  });
  const [first, second] = await Promise.all([
    api.getReadUrl(asset.id),
    api.getReadUrl(asset.id),
  ]);
  assert.deepEqual(first, signed);
  assert.equal(second.url, signed.url);
  assert.equal(requests, 1);
  await api.getReadUrl(asset.id);
  assert.equal(requests, 1);
  await api.getReadUrl(asset.id, true);
  assert.equal(requests, 2);
});
test("near-expiry URL is renewed using Backend instead of changing host/query", async (context) => {
  let now = Date.now();
  context.mock.method(Date, "now", () => now);
  let requests = 0;
  const api = fixtureApi(async () =>
    response({
      url: `http://media.example.test/image.png?signature=${++requests}`,
      expiresIn: 900,
      expiresAt: new Date(now + 900000).toISOString(),
    }),
  );
  const first = await api.getReadUrl(asset.id);
  now += 880000;
  const renewed = await api.getReadUrl(asset.id);
  assert.notEqual(first.url, renewed.url);
  assert.equal(requests, 2);
});
test("read URL failure can be retried and unsafe URL protocols are rejected", async () => {
  let requests = 0;
  const api = fixtureApi(async () =>
    ++requests === 1
      ? Response.json({}, { status: 503 })
      : response({
          url: "http://media.example.test/image",
          expiresIn: 900,
          expiresAt: new Date(Date.now() + 900000).toISOString(),
        }),
  );
  await assert.rejects(api.getReadUrl(asset.id), GameAssetApiError);
  assert.equal(
    (await api.getReadUrl(asset.id, true)).url,
    "http://media.example.test/image",
  );
  const unsafe = fixtureApi(async () =>
    response({
      url: "javascript:alert(1)",
      expiresIn: 900,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    }),
  );
  await assert.rejects(unsafe.getReadUrl(asset.id), GameAssetApiError);
});

test("rejects an already expired URL instead of starting a renewal loop", async () => {
  const api = fixtureApi(async () =>
    response({
      url: "http://media.example.test/image",
      expiresIn: 900,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }),
  );
  await assert.rejects(api.getReadUrl(asset.id), GameAssetApiError);
});
