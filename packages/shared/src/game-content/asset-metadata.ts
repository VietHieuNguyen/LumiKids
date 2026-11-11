/** Metadata projected to the AI gateway, independent from the GameContent contract. */
export const AI_ASSET_ATTRIBUTE_KEYS = [
  "color",
  "shape",
  "habitat",
  "habitats",
  "specificHabitats",
  "animalType",
  "aliases",
  "matchKey",
  "familyKey",
  "variant",
  "lifeStage",
  "visualStyle",
  "assetSet",
  "category",
  "material",
  "size",
  "number",
] as const;
export const AI_ASSET_ARRAY_ATTRIBUTE_KEYS = [
  "aliases",
  "habitats",
  "specificHabitats",
] as const;
export const ASSET_VARIANTS = ["NORMAL", "SHADOW"] as const;
export const ASSET_LIFE_STAGES = ["ADULT", "YOUNG"] as const;
export const ASSET_VISUAL_STYLES = ["REALISTIC", "CARTOON_2D"] as const;
