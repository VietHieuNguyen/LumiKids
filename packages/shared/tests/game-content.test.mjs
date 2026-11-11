import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  countingContentSchema,
  matchingContentSchema,
  classificationContentSchema,
  gameContentSchema,
  gameContentStructureSchema,
  gameInteractionSchema,
  getGameContentAssetIds,
  getGameContentAssetIssues,
} from "../dist/index.js";

function example(name) {
  return JSON.parse(
    readFileSync(
      new URL(`../examples/game-content/${name}.v1.json`, import.meta.url),
      "utf8",
    ),
  );
}
const counting = () => example("counting");
const matching = () => example("matching");
const classification = () => example("classification");
const cases = [
  ["COUNTING", counting, countingContentSchema],
  ["MATCHING", matching, matchingContentSchema],
  ["CLASSIFICATION", classification, classificationContentSchema],
];
function assertInvalid(schema, value, path) {
  const result = schema.safeParse(value);
  assert.equal(result.success, false);
  if (path)
    assert.ok(
      result.error.issues.some((issue) => issue.path.join(".") === path),
      JSON.stringify(result.error.issues),
    );
}

for (const [name, fixture, specificSchema] of cases) {
  test(`${name}: JSON example passes both individual and discriminated union schemas`, () => {
    const content = fixture();
    assert.deepEqual(gameContentSchema.parse(content), content);
    assert.deepEqual(specificSchema.parse(content), content);
  });
  test(`${name}: rejects unsupported or absent schemaVersion without coercion`, () => {
    for (const version of [2, 0, -1, "1", null, undefined])
      assertInvalid(
        gameContentSchema,
        { ...fixture(), schemaVersion: version },
        "schemaVersion",
      );
  });
  test(`${name}: rejects incompatible completion rules`, () => {
    for (const rule of [
      "CORRECT_CHOICE",
      "ALL_PAIRS_CORRECT",
      "ALL_ITEMS_CLASSIFIED_CORRECTLY",
      "ANY_CORRECT",
    ]) {
      if (rule !== fixture().completionRule)
        assertInvalid(
          gameContentSchema,
          { ...fixture(), completionRule: rule },
          "completionRule",
        );
    }
  });
  test(`${name}: rejects missing/blank instruction, unknown fields and embedded URLs`, () => {
    for (const instruction of ["", "   ", undefined, 123])
      assertInvalid(gameContentSchema, { ...fixture(), instruction });
    assertInvalid(gameContentSchema, {
      ...fixture(),
      presignedUrl: "https://media.example.test/signed",
    });
    assertInvalid(gameContentSchema, {
      ...fixture(),
      state: { completed: true },
    });
    const content = fixture();
    const items = content.items ?? content.sourceItems;
    items[0].url = "https://media.example.test/signed";
    assertInvalid(gameContentSchema, content);
  });
  test(`${name}: requires UUID assetId and stable nonempty local ID`, () => {
    for (const bad of ["", "not-a-uuid", "https://media.example.test/image"]) {
      const content = fixture();
      (content.items ?? content.sourceItems)[0].assetId = bad;
      assertInvalid(gameContentSchema, content);
    }
    for (const id of [
      "",
      " leading",
      "trailing ",
      "../image",
      "id with space",
    ]) {
      const content = fixture();
      (content.items ?? content.sourceItems)[0].id = id;
      assertInvalid(gameContentSchema, content);
    }
  });
  test(`${name}: rejects duplicate element IDs but permits repeated assetId`, () => {
    const content = fixture();
    const items = content.items ?? content.sourceItems;
    items[1].id = items[0].id;
    assertInvalid(gameContentSchema, content);
    const repeated = fixture();
    const repeatedItems = repeated.items ?? repeated.sourceItems;
    repeatedItems[1].assetId = repeatedItems[0].assetId;
    assert.equal(gameContentSchema.safeParse(repeated).success, true);
  });
}

test("unknown gameType and non-object JSON are rejected", () => {
  for (const value of [
    null,
    [],
    "COUNTING",
    1,
    { ...counting(), gameType: "UNKNOWN" },
  ])
    assertInvalid(gameContentSchema, value);
});

test("reordering items, choices, targets and groups does not change ID-based answers", () => {
  const count = counting();
  count.items.reverse();
  count.choices.reverse();
  assert.equal(gameContentSchema.parse(count).correctChoiceId, "choice-4");
  const match = matching();
  match.sourceItems.reverse();
  match.targetItems.reverse();
  match.pairs.reverse();
  assert.equal(gameContentSchema.safeParse(match).success, true);
  const classify = classification();
  classify.items.reverse();
  classify.groups.reverse();
  assert.equal(gameContentSchema.safeParse(classify).success, true);
});
test("structural validation is distinct from business consistency", () => {
  const content = counting();
  content.correctChoiceId = "does-not-exist";
  assert.equal(gameContentStructureSchema.safeParse(content).success, true);
  assertInvalid(gameContentSchema, content, "correctChoiceId");
});
test("COUNTING: correct choice must exist and equal the actual item count", () => {
  assertInvalid(
    gameContentSchema,
    { ...counting(), correctChoiceId: "missing" },
    "correctChoiceId",
  );
  assertInvalid(
    countingContentSchema,
    { ...counting(), correctChoiceId: "choice-3" },
    "correctChoiceId",
  );
  const content = counting();
  content.choices[1].value = 9;
  assertInvalid(gameContentSchema, content, "correctChoiceId");
});
test("COUNTING: option IDs/numeric values are unique, including IDs shared with items", () => {
  const duplicateId = counting();
  duplicateId.choices[1].id = duplicateId.choices[0].id;
  assertInvalid(gameContentSchema, duplicateId, "choices.1.id");
  const duplicateValue = counting();
  duplicateValue.choices[1].value = duplicateValue.choices[0].value;
  assertInvalid(gameContentSchema, duplicateValue, "choices.1.value");
  const crossId = counting();
  crossId.choices[0].id = crossId.items[0].id;
  assertInvalid(gameContentSchema, crossId, "choices.0.id");
});
test("COUNTING: rejects empty groups, insufficient choices, floats and out-of-range numbers", () => {
  assertInvalid(gameContentSchema, { ...counting(), items: [] });
  assertInvalid(gameContentSchema, {
    ...counting(),
    choices: [counting().choices[1]],
  });
  for (const value of [-1, 21, 1.5, "4"]) {
    const content = counting();
    content.choices[1].value = value;
    assertInvalid(gameContentSchema, content);
  }
});
test("COUNTING: supports the documented upper item bound, not just four objects", () => {
  const content = counting();
  content.items = Array.from({ length: 20 }, (_, i) => ({
    id: `apple-${i + 1}`,
    assetId: content.items[0].assetId,
  }));
  content.choices = [
    { id: "choice-19", value: 19 },
    { id: "choice-20", value: 20 },
  ];
  content.correctChoiceId = "choice-20";
  assert.equal(gameContentSchema.safeParse(content).success, true);
  content.items.push({ id: "apple-21", assetId: content.items[0].assetId });
  assertInvalid(gameContentSchema, content, "items");
});
test("MATCHING: source and target references must exist", () => {
  const source = matching();
  source.pairs[0].sourceId = "unknown";
  assertInvalid(gameContentSchema, source, "pairs.0.sourceId");
  const target = matching();
  target.pairs[0].targetId = "unknown";
  assertInvalid(matchingContentSchema, target, "pairs.0.targetId");
});
test("MATCHING: requires complete one-to-one coverage, without duplicate/reused pairs", () => {
  const duplicateSource = matching();
  duplicateSource.pairs[1].sourceId = duplicateSource.pairs[0].sourceId;
  assertInvalid(gameContentSchema, duplicateSource, "pairs.1.sourceId");
  const duplicateTarget = matching();
  duplicateTarget.pairs[1].targetId = duplicateTarget.pairs[0].targetId;
  assertInvalid(gameContentSchema, duplicateTarget, "pairs.1.targetId");
  const missingPair = matching();
  missingPair.pairs.pop();
  assertInvalid(gameContentSchema, missingPair, "pairs");
  const extraTarget = matching();
  extraTarget.targetItems.push({
    ...extraTarget.targetItems[0],
    id: "target-extra",
  });
  assertInvalid(gameContentSchema, extraTarget, "pairs");
});
test("MATCHING: IDs cannot collide across source and target collections", () => {
  const content = matching();
  content.targetItems[0].id = content.sourceItems[0].id;
  assertInvalid(gameContentSchema, content, "targetItems.0.id");
});
test("CLASSIFICATION: rejects missing/unknown/multiple group assignments", () => {
  const missing = classification();
  delete missing.items[0].correctGroupId;
  assertInvalid(gameContentSchema, missing, "items.0.correctGroupId");
  const unknown = classification();
  unknown.items[0].correctGroupId = "unknown-group";
  assertInvalid(classificationContentSchema, unknown, "items.0.correctGroupId");
  const multiple = classification();
  multiple.items[0].correctGroupId = ["red-basket", "blue-basket"];
  assertInvalid(gameContentSchema, multiple, "items.0.correctGroupId");
});
test("CLASSIFICATION: duplicate group IDs and collisions with item IDs fail", () => {
  const duplicate = classification();
  duplicate.groups[1].id = duplicate.groups[0].id;
  assertInvalid(gameContentSchema, duplicate, "groups.1.id");
  const crossId = classification();
  crossId.groups[0].id = crossId.items[0].id;
  assertInvalid(gameContentSchema, crossId, "groups.0.id");
});
test("CLASSIFICATION: supports three groups, five items and groups without illustrations", () => {
  const content = classification();
  content.items = content.items.slice(0, 5);
  content.groups.push({ id: "green-basket", label: "Giỏ xanh lá" });
  content.items[4].correctGroupId = "green-basket";
  for (const group of content.groups) delete group.assetId;
  assert.equal(gameContentSchema.safeParse(content).success, true);
});
test("CLASSIFICATION: arrays are bounded and group labels are mandatory", () => {
  assertInvalid(gameContentSchema, { ...classification(), items: [] });
  assertInvalid(gameContentSchema, {
    ...classification(),
    groups: [classification().groups[0]],
  });
  const missing = classification();
  delete missing.groups[0].label;
  assertInvalid(gameContentSchema, missing);
  const emptyAsset = classification();
  emptyAsset.groups[0].assetId = "";
  assertInvalid(gameContentSchema, emptyAsset);
});

for (const [name, fixture] of cases) {
  test(`${name}: asset validation is a separate, pure authoring boundary`, () => {
    const content = gameContentSchema.parse(fixture());
    const ids = getGameContentAssetIds(content);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(getGameContentAssetIssues(content, []).length, ids.length);
    const available = ids.map((id) => ({ id, status: "ACTIVE" }));
    assert.deepEqual(getGameContentAssetIssues(content, available), []);
    available[0].status = "INACTIVE";
    assert.deepEqual(getGameContentAssetIssues(content, available), [
      { assetId: ids[0], code: "ASSET_INACTIVE" },
    ]);
    // A syntactically valid UUID does not establish database existence.
    assert.equal(gameContentSchema.safeParse(fixture()).success, true);
  });
}
test("asset collection includes optional group illustrations and deduplicates repeated images", () => {
  assert.equal(
    getGameContentAssetIds(gameContentSchema.parse(counting())).length,
    1,
  );
  assert.equal(
    getGameContentAssetIds(gameContentSchema.parse(classification())).length,
    4,
  );
  const content = classification();
  content.groups.forEach((group) => delete group.assetId);
  assert.equal(
    getGameContentAssetIds(gameContentSchema.parse(content)).length,
    2,
  );
});

function interaction(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "dd387324-6c34-4c23-b1ad-082372388616",
    actionType: "CLASSIFY_DROP",
    sourceId: "red-ball-1",
    targetId: "blue-basket",
    result: "INCORRECT",
    timestamp: "2026-11-10T07:00:00.000Z",
    attemptIndex: 1,
    ...overrides,
  };
}
test("interaction contract accepts choice selection and both types of drop", () => {
  const selection = interaction({
    actionType: "SELECT_CHOICE",
    sourceId: "choice-4",
    result: "CORRECT",
  });
  delete selection.targetId;
  assert.equal(gameInteractionSchema.safeParse(selection).success, true);
  assert.equal(
    gameInteractionSchema.safeParse(
      interaction({
        actionType: "MATCH_DROP",
        sourceId: "source-cat",
        targetId: "target-cat-shadow",
        result: "CORRECT",
      }),
    ).success,
    true,
  );
  assert.equal(gameInteractionSchema.safeParse(interaction()).success, true);
});
test("a wrong drop and subsequent correction are separate events, not merged state", () => {
  const wrong = gameInteractionSchema.parse(interaction());
  const corrected = gameInteractionSchema.parse(
    interaction({
      eventId: "4db53e58-76cb-4670-b706-710685d01f17",
      targetId: "red-basket",
      result: "CORRECT",
      attemptIndex: 2,
      timestamp: "2026-11-10T07:00:03.000Z",
    }),
  );
  assert.equal(wrong.sourceId, corrected.sourceId);
  assert.notEqual(wrong.eventId, corrected.eventId);
  assert.equal(wrong.result, "INCORRECT");
  assert.equal(corrected.attemptIndex, 2);
});
test("drop requires targetId, selection forbids targetId, and events cannot contain game state", () => {
  const missing = interaction();
  delete missing.targetId;
  assertInvalid(gameInteractionSchema, missing, "targetId");
  assertInvalid(
    gameInteractionSchema,
    interaction({ actionType: "SELECT_CHOICE" }),
  );
  assertInvalid(gameInteractionSchema, interaction({ completed: true }));
  assertInvalid(gameInteractionSchema, interaction({ score: 10 }));
});
test("interaction validates result, event ID, timestamp, attemptIndex and contract version", () => {
  for (const changes of [
    { result: "SUCCESS" },
    { eventId: "" },
    { timestamp: 123 },
    { timestamp: "yesterday" },
    { timestamp: "2026-11-10T07:00:00" },
    { attemptIndex: 0 },
    { attemptIndex: 1.5 },
    { attemptIndex: "1" },
    { schemaVersion: 2 },
    { actionType: "DRAG_START" },
  ]) {
    assertInvalid(gameInteractionSchema, interaction(changes));
  }
  assert.equal(
    gameInteractionSchema.safeParse(
      interaction({ timestamp: "2026-11-10T14:00:00+07:00" }),
    ).success,
    true,
  );
});
