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
  gameInteractionSchema,
} from "./game-content/interaction.schema.js";
export {
  habitatAliases,
  habitatConcepts,
  expandHabitats,
  mostSpecificHabitats,
  declaredHabitats,
} from "./game-content/habitats.js";
export { gameDifficultySchema } from "./game-content/authoring.js";
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
  GameInteraction,
} from "./game-content/interaction.schema.js";
