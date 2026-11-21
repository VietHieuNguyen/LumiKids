# PATTERN Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth game type, PATTERN ("Sắp xếp theo quy tắc", Chỉ số 46): the child completes repeating picture sequences on an iPad, the server replays and scores it like the other games.

**Architecture:** Canonical contract + pure engine in `packages/shared` (schema, deterministic sequence builder, evaluator, hints). Nest composes PATTERN content **without calling the model** (prompt aliases → whitelisted ACTIVE assets → shared builder), saves/replays/scores it through the existing library and gameplay paths. Web adds one renderer registered in the game registry plus PATTERN options in the creator.

**Tech Stack:** TypeScript strict, Zod 4, NestJS 12 + Prisma 7, Next.js 16 / React 19, Vitest (API), node:test (shared, web).

**Spec:** `docs/superpowers/specs/2026-11-21-pattern-game-design.md`

## Global Constraints

- One screen per sequence, everything visible: no scroll rail, no arrow buttons (reuse of `MatchingCardRail` is forbidden in the PATTERN renderer). Cards ≥ 96px.
- Rules: `AB | AAB | ABB | ABC | AABB | ABCD`; sequences 3–6 (default 5); cells 4–8 and `cells.length >= 2 × period`; blank is always after the last cell; 2 choices for AB, otherwise 3.
- `items` 2–4, each a distinct `assetId`; ids follow `gameElementIdSchema`; ids unique across `items` and `sequences`.
- PATTERN generation makes **zero** model calls; do not touch `services/ai` or the Gemini path. Only ACTIVE whitelisted assets; SHADOW variants excluded.
- Migration file is written but **not run** (`prisma migrate` needs explicit user permission). No seed/reset.
- Backend ESM relative imports end in `.js`; no `any`; API tests Vitest, web/shared tests node:test.
- Scoring unchanged: each sequence is one task (F/R/H), `ce-score-v2`, `minimumItemsMet` when N ≥ 5.

## Review Focus

1. A child taps a card while the previous sequence's celebration is still animating → the action must target the *current* unsolved sequence only; engine rejects actions for any other sequence (test in Task 2).
2. Hint requested, then answered correctly → H, not F; hint on an already solved sequence ignored (test in Task 2 + Task 3 scoring test).
3. Prompt names an animal with no ACTIVE asset, or fewer distinct assets than the chosen rule needs (ABCD needs 4) → `PATTERN_ASSETS_INSUFFICIENT`, no partial game (test in Task 4).
4. Same request previewed twice → identical content (deterministic seed from requestId is *not* acceptable; seed from prompt+rules+asset ids) so the teacher saves what they saw (test in Task 1).
5. Portrait iPad (768×1024) with 8 cells → cell size shrinks to fit, never overflows (test in Task 5 on `patternCellSize`).

---

### Task 1: Shared contract and sequence builder

**Files:**
- Create: `packages/shared/src/game-content/pattern.schema.ts`
- Create: `packages/shared/src/game-content/pattern-builder.ts`
- Create: `packages/shared/examples/game-content/pattern.v1.json`
- Modify: `packages/shared/src/game-content/common.ts` (add `"PATTERN"` to `gameTypeSchema`, `"ALL_SEQUENCES_COMPLETED"` to `completionRuleSchema`)
- Modify: `packages/shared/src/game-content/game-content.schema.ts` (add to v1 structure + v1 unions)
- Modify: `packages/shared/src/game-content/interaction.schema.ts` (new `patternInteractionSchema`)
- Modify: `packages/shared/src/game-content/asset-references.ts` (PATTERN case → `items`)
- Modify: `packages/shared/src/index.ts` (exports)
- Test: `packages/shared/tests/game-content.test.mjs`

**Interfaces:**
- Produces:
  - `patternRuleSchema = z.enum(["AB","AAB","ABB","ABC","AABB","ABCD"])`, `type PatternRule`
  - `PATTERN_RULE_UNITS: Record<PatternRule, readonly number[]>` = `AB:[0,1] AAB:[0,0,1] ABB:[0,1,1] ABC:[0,1,2] AABB:[0,0,1,1] ABCD:[0,1,2,3]`
  - `patternContentStructureSchema`, `patternContentSchema`, `type PatternContent`, `type PatternSequence = { id; rule; cells: string[]; choiceIds: string[]; correctItemId }`
  - `patternInteractionSchema`: `{ ...eventShape, actionType: "FILL_PATTERN", targetId }` — **`sourceId` = sequenceId, `targetId` = chosen itemId** (so scoring keys by `sourceId` like MATCHING/CLASSIFICATION); `type PatternInteraction`
  - `buildPatternContent(input: { items: AssetItem[]; rules: PatternRule[]; sequenceCount: number; seed: string; instruction?: string }): PatternContent` — throws `Error("PATTERN_ASSETS_INSUFFICIENT")` when `items.length < max period distinct letters`.

- [ ] **Step 1: Write failing tests** in `game-content.test.mjs` (import from `../dist/index.js`):
  - `pattern example is valid` → `patternContentSchema.safeParse(example("pattern")).success === true` and `gameContentSchema` accepts it.
  - `pattern rejects cells that break the rule` → AB sequence `cells: ["a","b","b","a"]` invalid at path `sequences.0.cells`.
  - `pattern rejects wrong correct item` → path `sequences.0.correctItemId`.
  - `pattern rejects correct item missing from choices` → path `sequences.0.choiceIds`.
  - `pattern rejects too few cells` → ABC with 5 cells invalid (needs ≥ 6).
  - `pattern rejects duplicate assetId across items` → path `items.1.assetId`.
  - `FILL_PATTERN interaction parses` with `targetId`; without `targetId` fails.
  - `buildPatternContent is deterministic` → same input twice → `deepEqual`; different `seed` → sequences differ.
  - `buildPatternContent output validates` for each rule with 4 items, `sequenceCount: 5` → `patternContentSchema` success, `sequences.length === 5`, AB sequences have 2 choices, others 3.
  - `buildPatternContent throws when ABCD gets 3 items` → `/PATTERN_ASSETS_INSUFFICIENT/`.
  - `getGameContentAssetIds(pattern)` returns the 4 item asset ids.

- [ ] **Step 2: Run** `pnpm --filter @lumikids/shared test` → FAIL (exports missing).

- [ ] **Step 3: Implement schema + interaction + unions + asset references.** Validation (superRefine): unique ids; `cells`, `choiceIds`, `correctItemId` reference `items`; letters→items mapping from first occurrence must be injective and match `PATTERN_RULE_UNITS[rule][i % L]` for every cell; distinct item count = distinct letters; `correctItemId` = item of letter `units[cells.length % L]`; `correctItemId ∈ choiceIds`; `choiceIds` unique; `cells.length >= 2*L`. `instruction` default copy in builder: `"Con hãy tìm hình tiếp theo cho đúng quy tắc nhé!"`.

- [ ] **Step 4: Implement `buildPatternContent`.** Seeded PRNG (FNV-1a hash of `seed` → mulberry32) — write it in `pattern-builder.ts`, not exported from index. Per sequence i: rule = `rules[i % rules.length]`; pick `L` distinct items by seeded shuffle; length = `min(8, 2L + rand(0..1))`; choices = correct + distractors (prefer other letters of the same sequence, then other items) to 2 (AB) or 3 cards, seeded order; ids `seq-1…`, items keep given ids.

- [ ] **Step 5: Run** `pnpm --filter @lumikids/shared test` → PASS.

- [ ] **Step 6: Commit** `feat(shared): PATTERN game contract and sequence builder`

### Task 2: Shared engine (evaluate, progress, hints)

**Files:**
- Create: `packages/shared/src/game-runtime/pattern.ts`
- Modify: `packages/shared/src/game-runtime/types.ts` (`PatternState`, `GameAction` union adds `Pick<PatternInteraction,"actionType"|"sourceId"|"targetId">`)
- Modify: `packages/shared/src/game-runtime/engine.ts` (`createInitialState`, `getGameProgress`, `checkCompletion`, `applyGameAction`)
- Modify: `packages/shared/src/game-runtime/hint.ts` (`solvedTaskIds`, `getHintTargets`)
- Test: `packages/shared/tests/game-content.test.mjs` (engine section)

**Interfaces:**
- Consumes: Task 1 `PatternContent`, `PatternInteraction`, `PATTERN_RULE_UNITS`.
- Produces: `interface PatternState extends BaseState { gameType: "PATTERN"; solvedSequenceIds: readonly string[] }`; `evaluatePattern(content, state, action): ActionEvaluation | null`; `currentPatternSequence(content, state): PatternSequence | null`; hint target for a sequence = `{ taskId: seq.id, targetIds: [`${seq.id}:cell:0` … `${seq.id}:cell:${L-1}`] }`.

- [ ] **Step 1: Write failing tests:**
  - `pattern: correct fill solves the current sequence` → result CORRECT, `solvedSequenceIds` = `["seq-1"]`, progress `{correct:1,total:N}`.
  - `pattern: wrong fill is INCORRECT and does not advance`.
  - `pattern: action on a later sequence is ignored` → `applyGameAction` returns `interaction: null`, `attemptCount` unchanged.
  - `pattern: choice not offered in the sequence is ignored`.
  - `pattern: completes after all sequences` → `completedNow` true on the last correct fill.
  - `pattern: hint targets first period cells` and `canRequestHint` false for solved sequence.
- [ ] **Step 2: Run** shared tests → FAIL.
- [ ] **Step 3: Implement** `pattern.ts` + engine/hint switches (`ALL_SEQUENCES_COMPLETED` joins the `progress.correct === progress.total` branch).
- [ ] **Step 4: Run** `pnpm --filter @lumikids/shared test` → PASS; `pnpm --filter @lumikids/shared typecheck` → no errors.
- [ ] **Step 5: Commit** `feat(shared): PATTERN engine and hints`

### Task 3: API persistence, replay and scoring

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`GameType.PATTERN`, `CompletionRule.ALL_SEQUENCES_COMPLETED`)
- Create: `apps/api/prisma/migrations/20261121000100_pattern_game_type/migration.sql`:
  ```sql
  ALTER TYPE "GameType" ADD VALUE 'PATTERN';
  ALTER TYPE "CompletionRule" ADD VALUE 'ALL_SEQUENCES_COMPLETED';
  ```
- Modify: `apps/api/src/modules/gameplay/domain/session-performance.ts` (`scoredItemIds` PATTERN → `sequences.map(s => s.id)`)
- Modify: any exhaustive `switch (gameType)` the typecheck reports in `apps/api/src` (do not change behaviour of existing types)
- Test: `apps/api/src/modules/gameplay/domain/session-performance.spec.ts`, `session-replay.spec.ts`

**Interfaces:**
- Consumes: Task 1/2 shared exports.
- Produces: PATTERN versions savable through the existing library endpoint and playable/replayable through `/gameplay/*` with no new endpoints.

- [ ] **Step 1: Write failing tests:**
  - session-performance: 5 sequences; events = seq-1 CORRECT, seq-2 INCORRECT then CORRECT, hint seq-3 then CORRECT, seq-4 CORRECT, seq-5 CORRECT → F=3, R=1, H=1, N=5, score `(3 + 0.5 + 0.25)/5*100 = 75`, `minimumItemsMet: true`.
  - session-replay: replaying a client batch whose seq-2 event claims CORRECT for a wrong item is rejected (same error the existing replay uses for mismatched results).
- [ ] **Step 2: Run** `pnpm --filter api prisma:generate && pnpm --filter api test -- session-` → FAIL.
- [ ] **Step 3: Implement** schema enum values, migration file, `scoredItemIds` case; fix compile errors from exhaustive switches.
- [ ] **Step 4: Run** `pnpm --filter api typecheck && pnpm --filter api test` → PASS. Do **not** run `prisma migrate`.
- [ ] **Step 5: Commit** `feat(api): persist and score PATTERN sessions` (include migration file).

### Task 4: Deterministic PATTERN composition in game-generation

**Files:**
- Create: `apps/api/src/modules/game-generation/pattern-composition.ts`
- Modify: `packages/ai-client/src/index.ts` (`generateGameSchema` gains optional `pattern: { rules: PatternRule[1..3], sequenceCount: int 3..6 default 5 }`, allowed only when `gameType === "PATTERN"`; `structures` map gets `PATTERN: patternContentStructureSchema` to satisfy the `Record<GameType>`; `aiRequestSchema` must strip/omit `pattern` — it never reaches Python)
- Modify: `apps/api/src/modules/game-generation/game-generation.service.ts` (PATTERN branch before the AI-config check)
- Modify: `apps/api/src/common/http/api-problem.ts` (`PATTERN_ASSETS_INSUFFICIENT`, 422, Vietnamese message: "Kho chưa đủ hình phù hợp để tạo dãy theo quy tắc này.")
- Modify: `apps/api/src/modules/game-generation/asset-selection.ts` / `game-validation.ts` only where exhaustive switches require a PATTERN case
- Test: `apps/api/src/modules/game-generation/pattern-composition.spec.ts`, `game-generation.spec.ts`

**Interfaces:**
- Consumes: `selectCandidates`, `searchTerms`, `GameAssetService.generationCandidates/generationAssets`, `buildPatternContent`.
- Produces: `pickPatternAssets(prompt: string, candidates: GenerationCandidate[], needed: number): GenerationCandidate[]` — assets named in the prompt (by name/alias/objectType, prompt order, one per objectType) first; fill remaining from candidates preferring the same `assetSet` then `visualStyle` as the first pick; never SHADOW; returns up to 4; throws `ApiProblem('PATTERN_ASSETS_INSUFFICIENT')` when fewer than `needed`.
- Response shape identical to AI generation: `{ gameType, gameContent, generation: { requestId, model: "deterministic", attempts: 0, reviewRequired: true, warnings: [], validatedAt } }`.

- [ ] **Step 1: Write failing tests** (`pattern-composition.spec.ts`):
  - prompt "dãy thỏ và gà con" with RABBIT, CHICK, PIG candidates → first two picks RABBIT then CHICK.
  - needed 4, only 3 non-shadow candidates → throws `PATTERN_ASSETS_INSUFFICIENT`.
  - shadow variant of RABBIT never picked.
  - fill prefers `assetSet: LUMI_PASTEL_01` matching the first pick over a REALISTIC asset.
  - `game-generation.spec.ts`: PATTERN request → `ai.generate` **not called**, token usage not recorded, returned content passes `patternContentSchema`; same request twice → equal `gameContent`; `pattern` option on a COUNTING request → 400 from the validation pipe.
- [ ] **Step 2: Run** `pnpm --filter api test -- pattern-composition game-generation` → FAIL.
- [ ] **Step 3: Implement.** Seed = `sha256(prompt + rules.join() + pickedIds.join())`. Needed distinct = max letters over chosen rules. Re-check picked assets with `generationAssets` + `getGameContentAssetIssues` before returning (same guard as AI path).
- [ ] **Step 4: Run** `pnpm --filter @lumikids/ai-client test && pnpm --filter api typecheck && pnpm --filter api test` → PASS.
- [ ] **Step 5: Commit** `feat(api): compose PATTERN games without a model call`

### Task 5: Web renderer and creator options

**Files:**
- Create: `apps/web/src/features/game-runtime/components/pattern-game.tsx`
- Create: `apps/web/src/features/game-runtime/model/pattern-layout.ts`
- Modify: `apps/web/src/features/game-runtime/registry.tsx` (`PATTERN: { label: "Sắp xếp theo quy tắc", render }`)
- Modify: every `Record<GameType, …>` / exhaustive switch the web typecheck reports (`game-runtime.tsx`, `model/controller.ts`, `model/backgrounds.ts`, `components/game-music.tsx`, `game-library/library-icon.tsx`, `library-page.tsx`, `game-preview/game-preview.tsx`, `token-usage-page.tsx`, `landing-copy.ts`)
- Modify: `apps/web/src/features/game-creation/game-creator.tsx`, `controller.ts`, `api.ts` (PATTERN option, rule chips, sequence count, `PATTERN_ASSETS_INSUFFICIENT` message)
- Modify: a game-runtime CSS file next to existing ones for `.pattern-*` classes
- Test: `apps/web/tests/game-runtime.test.mjs`, `apps/web/tests/game-creation.test.mjs`

**Interfaces:**
- Consumes: `PatternContent`, `PatternState`, `currentPatternSequence`, `RendererCommonProps`, `GamePicture`, `use-pointer-pairing` (drag), `correct-answer-mascot`.
- Produces: `patternCellSize(viewport: { width: number; height: number }, cellCount: number): number` = `floor(min((width - 32) / (cellCount + 1), height / 3.2))` clamped to `[64, 160]`; `PatternGame` renderer; `onAction({ actionType: "FILL_PATTERN", sourceId: sequence.id, targetId: itemId })`.

- [ ] **Step 1: Write failing tests:**
  - `patternCellSize({width:768,height:1024}, 8)` → `(768-32)/9 = 81`; `({width:1024,height:768}, 8)` → `min(110, 240) = 110`; `({width:320,height:600}, 8)` → `64` (clamp).
  - game-creation: generate request for PATTERN includes `pattern: { rules: ["AB"], sequenceCount: 5 }`; COUNTING request has no `pattern` key; `PATTERN_ASSETS_INSUFFICIENT` maps to its Vietnamese message.
- [ ] **Step 2: Run** `pnpm --filter web test:game-runtime && pnpm --filter web test:game-creation` → FAIL.
- [ ] **Step 3: Implement renderer.** Shows only `currentPatternSequence`: cells row + blinking `?` slot + choice cards; tap or drag a card into the slot; on CORRECT fill the slot, play mascot + row bounce, then the next sequence renders automatically (~1.2 s, no "Tiếp" button); on INCORRECT card springs back; progress dots are non-interactive; `hint` highlights cells whose synthetic id `${seq.id}:cell:${i}` is in `hint.targetIds`; respects `prefers-reduced-motion`.
- [ ] **Step 4: Implement creator options.** PATTERN option card; rule chips (multi-select, max 3) labelled with emoji-free examples ("AB – xen kẽ 2 hình", "AAB", "ABB", "ABC", "AABB", "ABCD") and an age hint line; sequence count stepper 3–6 default 5; prompt placeholder "Ví dụ: dãy thỏ và gà con".
- [ ] **Step 5: Run** `pnpm --filter web typecheck && pnpm --filter web lint && pnpm --filter web test` → PASS.
- [ ] **Step 6: Verify on device size:** with API+web dev running, create a PATTERN preview and screenshot at 1024×768 and 768×1024 (CDP, as in admin UI verification); confirm no scrollbars and no arrow buttons.
- [ ] **Step 7: Commit** `feat(web): PATTERN renderer and creator options`

### Task 6: Asset pack upload and docs

**Files:**
- Existing: `infra/asset-packs/lumi-pastel-01/` (`manifest.json`, `webp/*.webp`, `png/*.png`, `lumi-pastel-01.blend`), `infra/asset-packs/upload-pack.mjs`
- Modify: `docs/GAME_CONTENT.md` (PATTERN v1 section), `docs/ASSET_METADATA.md` (LUMI_PASTEL_01 set), `CLAUDE.md` business invariants (PATTERN v1; Chỉ số 46; zero-model generation)

- [ ] **Step 1:** User applies the migration (`pnpm --filter api prisma migrate deploy` or their usual command) — only with their go-ahead.
- [ ] **Step 2:** User runs `node infra/asset-packs/upload-pack.mjs infra/asset-packs/lumi-pastel-01` with API running and an account holding `MANAGE_GAME_ASSETS` → expect `Xong: tải lên 8/8.`; re-run → all `bỏ qua`.
- [ ] **Step 3:** End-to-end: Teacher creates PATTERN "dãy thỏ và gà con", rule AB → preview → save → assign → child plays 5 sequences → teacher sees a CriterionEvaluation for Chỉ số 46.
- [ ] **Step 4:** Update docs; commit `docs: PATTERN game and LUMI_PASTEL_01 asset pack`.
