import { getCountedItemIds } from '@lumikids/shared';
import type { CountingContent } from '@lumikids/shared';
import type { CandidateAsset } from '@lumikids/ai-client';
import {
  assetColor,
  requestedCountingIntent,
  requestedColors,
  matchesObjectType,
  requestedObjectTypes,
} from './asset-selection.js';

/** Recompute the subset from trusted asset metadata; never trust model-selected IDs alone. */
export function validateCountingRule(
  content: CountingContent,
  prompt: string,
  candidates: CandidateAsset[],
): string[] {
  const errors: string[] = [];
  const intent = requestedCountingIntent(prompt, candidates);
  const rule =
    content.schemaVersion === 2
      ? content.countingRule
      : { type: 'ALL' as const };
  if (
    intent.requiresSubset &&
    rule.type !== (intent.objectType ? 'OBJECT_TYPE' : 'COLOR')
  )
    errors.push('COUNTING_RULE_MISMATCH');
  if (rule.type === 'ALL') return errors;
  if (intent.color && rule.color !== intent.color)
    errors.push('COUNTING_TARGET_COLOR_MISMATCH');
  if (
    rule.type === 'OBJECT_TYPE' &&
    intent.objectType &&
    rule.objectType !== intent.objectType
  )
    errors.push('COUNTING_TARGET_OBJECT_MISMATCH');
  if (
    !intent.requiresSubset &&
    ((rule.type === 'COLOR' &&
      requestedColors(prompt, candidates).length > 1) ||
      (rule.type === 'OBJECT_TYPE' &&
        requestedObjectTypes(prompt, candidates).length > 1))
  )
    errors.push('COUNTING_RULE_MISMATCH');
  const byId = new Map(candidates.map((asset) => [asset.id, asset]));
  const expected = content.items
    .filter((item) => {
      const asset = byId.get(item.assetId);
      if (!asset) return false; // The whitelist check reports a missing asset.
      if (rule.type === 'OBJECT_TYPE') {
        if (!matchesObjectType(asset, rule.objectType)) return false;
        if (!rule.color) return true;
      }
      const color = asset && assetColor(asset);
      if (!color) errors.push('COUNTING_COLOR_METADATA_REQUIRED');
      return color === rule.color;
    })
    .map((item) => item.id);
  const counted = new Set(getCountedItemIds(content));
  if (
    counted.size !== expected.length ||
    expected.some((id) => !counted.has(id))
  )
    errors.push('COUNTING_TARGET_SET_MISMATCH');
  if (intent.requiresDistractors && expected.length === content.items.length)
    errors.push('COUNTING_DISTRACTORS_MISSING');
  return [...new Set(errors)];
}
