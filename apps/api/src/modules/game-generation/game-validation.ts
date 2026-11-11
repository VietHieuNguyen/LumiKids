import {
  gameContentSchema,
  getGameContentAssetIds,
  getClassificationCorrectGroupIds,
  habitatConcepts,
  declaredHabitats,
} from '@lumikids/shared';
import type { GameContent, GameType } from '@lumikids/shared';
import type { CandidateAsset } from '@lumikids/ai-client';
import { validateClassificationHabitats } from './habitat-validation.js';
import { validateCountingRule } from './counting-validation.js';
import {
  isAllowedForTask,
  isCompatiblePair,
  requestedMatchingMode,
  metadataString,
} from './asset-policy.js';
import {
  assetColor,
  concepts,
  matchesObjectType,
  normalize,
  requestedColors,
  requestedCountingIntent,
  requestedCountingDisplayCount,
  requestedColorQuantities,
  requestedGroupCount,
  requestedItemCount,
  requestedMatchingCount,
  requestedObjectTypes,
  requestedObjectQuantities,
  requestedChoiceCount,
} from './asset-selection.js';

export interface ContentValidation {
  content?: GameContent;
  errors: string[];
  warnings: string[];
}
export function validateGeneratedContent(
  value: unknown,
  gameType: GameType,
  prompt: string,
  candidates: CandidateAsset[],
): ContentValidation {
  const parsed = gameContentSchema.safeParse(value);
  if (!parsed.success) return { errors: ['GAME_SCHEMA_INVALID'], warnings: [] };
  const content = parsed.data;
  const errors: string[] = [];
  const warnings = new Set<string>();
  if (content.gameType !== gameType) errors.push('GAME_TYPE_MISMATCH');
  const byId = new Map(candidates.map((asset) => [asset.id, asset]));
  if (getGameContentAssetIds(content).some((id) => !byId.has(id)))
    errors.push('ASSET_NOT_WHITELISTED');
  for (const id of getGameContentAssetIds(content)) {
    const asset = byId.get(id);
    if (asset && !isAllowedForTask(asset, gameType, prompt))
      errors.push('ASSET_REPRESENTATION_MISMATCH');
  }
  const expectedCount =
    content.gameType === 'COUNTING'
      ? requestedCountingDisplayCount(
          prompt,
          requestedCountingIntent(prompt, candidates),
          candidates,
        )
      : content.gameType === 'MATCHING'
        ? requestedMatchingCount(prompt)
        : requestedItemCount(prompt);
  const countingSubset =
    content.gameType === 'COUNTING' &&
    content.schemaVersion === 2 &&
    content.countingRule.type !== 'ALL';
  if (content.gameType === 'COUNTING')
    errors.push(...validateCountingRule(content, prompt, candidates));
  const items =
    content.gameType === 'MATCHING' ? content.sourceItems : content.items;
  const expectedTypes = requestedObjectTypes(prompt, candidates).filter(
    (type) => type !== 'BASKET',
  );
  const allItems =
    content.gameType === 'MATCHING'
      ? [...content.sourceItems, ...content.targetItems]
      : content.items;
  if (expectedTypes.length) {
    if (
      !(
        content.gameType === 'COUNTING' &&
        content.schemaVersion === 2 &&
        content.countingRule.type === 'OBJECT_TYPE'
      ) &&
      allItems.some((item) => {
        const asset = byId.get(item.assetId);
        return (
          asset && !expectedTypes.some((type) => matchesObjectType(asset, type))
        );
      })
    )
      errors.push('REQUESTED_OBJECT_TYPE_MISMATCH');
    if (
      expectedTypes.some(
        (type) =>
          !allItems.some((item) => {
            const asset = byId.get(item.assetId);
            return asset && matchesObjectType(asset, type);
          }),
      )
    )
      errors.push('REQUESTED_OBJECT_TYPE_MISSING');
  }
  if (expectedCount !== undefined && items.length !== expectedCount)
    errors.push('REQUESTED_ITEM_COUNT_MISMATCH');
  if (content.gameType === 'COUNTING') {
    const choices = requestedChoiceCount(prompt);
    if (choices !== undefined && content.choices.length !== choices)
      errors.push('REQUESTED_CHOICE_COUNT_MISMATCH');
    for (const { objectType, count, color } of requestedObjectQuantities(
      prompt,
      candidates,
    )) {
      const actual = content.items.filter((item) => {
        const asset = byId.get(item.assetId);
        return (
          asset &&
          matchesObjectType(asset, objectType) &&
          (!color || assetColor(asset) === color)
        );
      }).length;
      if (actual !== count) errors.push('REQUESTED_OBJECT_COUNT_MISMATCH');
    }
  }
  const wantedColors = requestedColors(prompt, candidates);
  if (wantedColors.length) {
    for (const item of items) {
      const asset = byId.get(item.assetId);
      const color = asset && assetColor(asset);
      if (color && !wantedColors.includes(color) && !countingSubset)
        errors.push('REQUESTED_COLOR_MISMATCH');
      if (!color) warnings.add('REQUESTED_COLOR_NOT_VERIFIABLE');
    }
  }
  for (const color of wantedColors) {
    if (
      !items.some((item) => {
        const asset = byId.get(item.assetId);
        return asset && assetColor(asset) === color;
      })
    )
      errors.push('REQUESTED_COLOR_MISSING');
  }
  // Verify per-color quantities only where the prompt explicitly associates a numeric quantity.
  for (const { color, count, objectType } of requestedColorQuantities(
    prompt,
    candidates,
  )) {
    if (
      color &&
      items.filter((item) => {
        const asset = byId.get(item.assetId);
        return (
          asset &&
          assetColor(asset) === color &&
          (!objectType || matchesObjectType(asset, objectType))
        );
      }).length !== count
    )
      errors.push('REQUESTED_COLOR_COUNT_MISMATCH');
  }
  if (content.gameType === 'MATCHING') {
    const mode = requestedMatchingMode(prompt);
    const usedRelationKeys = new Set<string>();
    for (const pair of content.pairs) {
      const source = byId.get(
        content.sourceItems.find((item) => item.id === pair.sourceId)!.assetId,
      );
      const target = byId.get(
        content.targetItems.find((item) => item.id === pair.targetId)!.assetId,
      );
      let verified = false;
      if (source && target && !isCompatiblePair(source, target, mode))
        errors.push('MATCHING_RELATION_CONTRADICTION');
      if (source && target && (mode === 'SHADOW' || mode === 'OFFSPRING')) {
        const key = metadataString(
          source,
          mode === 'SHADOW' ? 'matchKey' : 'familyKey',
        );
        if (key) {
          const normalized = normalize(key);
          if (usedRelationKeys.has(normalized))
            errors.push('MATCHING_RELATION_DUPLICATED');
          usedRelationKeys.add(normalized);
        }
        verified = isCompatiblePair(source, target, mode);
      }
      if (mode === 'IDENTICAL' && source && target)
        verified = isCompatiblePair(source, target, mode);
      for (const key of mode === 'OFFSPRING'
        ? ['familyKey', 'animalType']
        : ['matchKey', 'animalType']) {
        const left = source?.attributes[key];
        const right = target?.attributes[key];
        if (typeof left === 'string' && typeof right === 'string') {
          verified = true;
          if (normalize(left) !== normalize(right))
            errors.push('MATCHING_METADATA_CONTRADICTION');
        }
      }
      if (!verified) warnings.add('MATCHING_SEMANTICS_NOT_VERIFIABLE');
    }
  } else if (content.gameType === 'CLASSIFICATION') {
    const habitats = validateClassificationHabitats(
      content,
      byId,
      habitatConcepts(prompt),
    );
    errors.push(...habitats.errors);
    habitats.warnings.forEach((warning) => warnings.add(warning));
    const expectedGroups = requestedGroupCount(prompt);
    if (
      expectedGroups !== undefined &&
      content.groups.length !== expectedGroups
    )
      errors.push('REQUESTED_GROUP_COUNT_MISMATCH');
    for (const group of content.groups) {
      const grouped = content.items.filter((item) =>
        getClassificationCorrectGroupIds(item).includes(group.id),
      );
      if (!grouped.length && content.schemaVersion === 1)
        errors.push('EMPTY_CLASSIFICATION_GROUP');
      const groupAsset = group.assetId ? byId.get(group.assetId) : undefined;
      const labelConcepts = concepts(group.label);
      let verified = false;
      for (const key of ['color', 'shape'] as const) {
        const knownValues =
          key === 'color'
            ? [
                'RED',
                'BLUE',
                'GREEN',
                'YELLOW',
                'PURPLE',
                'ORANGE',
                'WHITE',
                'BLACK',
              ]
            : ['CIRCLE', 'SQUARE', 'TRIANGLE'];
        const fromLabel = labelConcepts.filter((concept) =>
          knownValues.includes(concept),
        );
        const rawValue = groupAsset?.attributes[key];
        const fromAsset =
          typeof rawValue === 'string'
            ? concepts(rawValue).filter((concept) =>
                knownValues.includes(concept),
              )
            : [];
        if (fromLabel.length > 1 || fromAsset.length > 1) {
          errors.push('GROUP_METADATA_AMBIGUOUS');
          continue;
        }
        if (fromLabel[0] && fromAsset[0] && fromLabel[0] !== fromAsset[0])
          errors.push('GROUP_METADATA_CONTRADICTION');
        const expected = fromAsset[0] ?? fromLabel[0];
        if (!expected) continue;
        for (const item of grouped) {
          const itemValue = byId.get(item.assetId)?.attributes[key];
          const actual =
            typeof itemValue === 'string'
              ? concepts(itemValue).filter((concept) =>
                  knownValues.includes(concept),
                )[0]
              : undefined;
          if (actual) {
            verified = true;
            if (actual !== expected)
              errors.push('CLASSIFICATION_METADATA_CONTRADICTION');
          } else warnings.add('CLASSIFICATION_METADATA_INCOMPLETE');
        }
      }
      if (
        !verified &&
        !habitatConcepts(group.label).length &&
        !declaredHabitats(groupAsset?.attributes ?? {}).length
      )
        warnings.add('CLASSIFICATION_SEMANTICS_NOT_VERIFIABLE');
    }
  }
  warnings.add('ADULT_REVIEW_REQUIRED');
  warnings.add('FREE_TEXT_CONSTRAINTS_REQUIRE_REVIEW');
  return {
    content,
    errors: [...new Set(errors)].slice(0, 10),
    warnings: [...warnings],
  };
}
