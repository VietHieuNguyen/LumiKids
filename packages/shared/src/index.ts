export {
  GAME_CONTENT_SCHEMA_VERSION,
  gameTypeSchema,
  gameElementIdSchema,
  gameAssetIdSchema,
  completionRuleSchema,
  assetItemSchema,
} from "./game-content/common.js";
export type {
  GameType,
  CompletionRule,
  AssetItem,
} from "./game-content/common.js";
export {
  countingChoiceSchema,
  countingContentSchema,
  countingContentStructureSchema,
  countingColorSchema,
  countingRuleSchema,
  countingContentV2Schema,
  countingContentV2StructureSchema,
  getCountedItemIds,
} from "./game-content/counting.schema.js";
export type {
  CountingChoice,
  CountingContent,
  CountingContentV1,
  CountingContentV2,
  CountingColor,
} from "./game-content/counting.schema.js";
export {
  matchingPairSchema,
  matchingContentSchema,
  matchingContentStructureSchema,
} from "./game-content/matching.schema.js";
export type {
  MatchingPair,
  MatchingContent,
} from "./game-content/matching.schema.js";
export {
  classificationItemSchema,
  classificationGroupSchema,
  classificationContentSchema,
  classificationContentStructureSchema,
  classificationItemV2Schema,
  classificationContentV2Schema,
  classificationContentV2StructureSchema,
  getClassificationCorrectGroupIds,
} from "./game-content/classification.schema.js";
export type {
  ClassificationItem,
  ClassificationGroup,
  ClassificationContent,
  ClassificationContentV1,
  ClassificationContentV2,
} from "./game-content/classification.schema.js";
export {
  gameContentV1Schema,
  gameContentV2Schema,
  gameContentSchema,
  gameContentStructureSchema,
} from "./game-content/game-content.schema.js";
export type {
  GameContent,
  GameContentV1,
} from "./game-content/game-content.schema.js";
export {
  PATTERN_RULE_UNITS,
  patternContentSchema,
  patternContentStructureSchema,
  patternLetterCount,
  patternRuleSchema,
  patternSequenceSchema,
} from "./game-content/pattern.schema.js";
export type {
  PatternContent,
  PatternRule,
  PatternSequence,
} from "./game-content/pattern.schema.js";
export { buildPatternContent } from "./game-content/pattern-builder.js";
export type { BuildPatternInput } from "./game-content/pattern-builder.js";
export {
  getGameContentAssetIds,
  getGameContentAssetIssues,
} from "./game-content/asset-references.js";
export type {
  GameAssetAvailability,
  GameContentAssetIssue,
} from "./game-content/asset-references.js";
export {
  GAME_INTERACTION_SCHEMA_VERSION,
  interactionResultSchema,
  countingInteractionSchema,
  matchingInteractionSchema,
  classificationInteractionSchema,
  patternInteractionSchema,
  hintInteractionSchema,
  gameInteractionSchema,
  isAnswerInteraction,
} from "./game-content/interaction.schema.js";
export {
  habitatAliases,
  habitatConcepts,
  expandHabitats,
  mostSpecificHabitats,
  declaredHabitats,
} from "./game-content/habitats.js";
export { gameDifficultySchema } from "./game-content/authoring.js";
export * from "./game-library.js";
export { cognitiveCurriculum } from "./cognitive-curriculum.js";
export type { GameDifficulty } from "./game-content/authoring.js";
export {
  AI_ASSET_ATTRIBUTE_KEYS,
  AI_ASSET_ARRAY_ATTRIBUTE_KEYS,
  ASSET_VARIANTS,
  ASSET_LIFE_STAGES,
  ASSET_VISUAL_STYLES,
} from "./game-content/asset-metadata.js";
export type {
  InteractionResult,
  CountingInteraction,
  MatchingInteraction,
  ClassificationInteraction,
  PatternInteraction,
  HintInteraction,
  AnswerInteraction,
  GameInteraction,
} from "./game-content/interaction.schema.js";
export {
  applyGameAction,
  checkCompletion,
  createInitialState,
  getGameProgress,
} from "./game-runtime/engine.js";
export { canRequestHint, getHintTargets, nextHintTarget } from "./game-runtime/hint.js";
export { currentPatternSequence, patternHintCellIds } from "./game-runtime/pattern.js";
export type { HintTarget } from "./game-runtime/hint.js";
export type {
  GameAction,
  CountingState,
  MatchingState,
  ClassificationState,
  PatternState,
  GameState,
  GameProgress,
  GameCompletion,
  ActionEvaluation,
  GameTransition,
  InteractionIdentity,
} from "./game-runtime/types.js";
export * from "./gameplay.js";
export * from "./classroom.js";
export * from "./assignment.js";
export * from "./assignment-window.js";
export * from "./staff.js";
export * from "./site-settings.js";
export * from "./admin-overview.js";
export * from "./assessment.js";
export * from './token-usage.js';
export * from './age.js';
export * from './family.js';
export * from './game-content/voice-instruction.js';
export * from './lesson-plan.js';

export * from "./game-content/quantity.schema.js";
export type { QuantityState } from "./game-runtime/types.js";

export * from "./game-content/comparison-change.schema.js";
export * from "./game-runtime/comparison-change.js";
export type {ComparisonChangeState} from "./game-runtime/types.js";

export * from "./classroom-batch.js";
