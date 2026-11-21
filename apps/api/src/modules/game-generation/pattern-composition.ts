import type { CandidateAsset } from '@lumikids/ai-client';
import { ApiProblem } from '../../common/http/api-problem.js';
import {
  assetObjectType,
  isAllowedForTask,
  isEnvironmentAsset,
  isShadowAsset,
  metadataString,
} from './asset-policy.js';
import { matchesObjectType, requestedObjectTypes } from './asset-selection.js';

const MAX_PATTERN_ITEMS = 4;

/**
 * Pictures for a PATTERN game, chosen without a model call: the animals/objects the prompt names
 * (in prompt order), then pictures that look alike (same assetSet, then visualStyle) up to `wanted`.
 * One picture per objectType; shadows and backgrounds never. Throws when a named animal has no
 * usable picture, or when fewer than `needed` are found.
 */
export function pickPatternAssets(
  prompt: string,
  candidates: readonly CandidateAsset[],
  needed: number,
  wanted = needed,
): CandidateAsset[] {
  const usable = candidates.filter(
    (asset) =>
      !isShadowAsset(asset) &&
      !isEnvironmentAsset(asset) &&
      isAllowedForTask(asset, 'PATTERN', prompt),
  );
  const limit = Math.min(MAX_PATTERN_ITEMS, Math.max(needed, wanted));
  const picked: CandidateAsset[] = [];
  const take = (asset: CandidateAsset) => {
    if (
      picked.length < limit &&
      !picked.some((other) => assetObjectType(other) === assetObjectType(asset))
    )
      picked.push(asset);
  };
  for (const objectType of requestedObjectTypes(prompt, usable)) {
    const asset = usable.find((candidate) => matchesObjectType(candidate, objectType));
    // A named animal without a usable picture must not be swapped for another one silently.
    if (!asset) throw new ApiProblem('PATTERN_ASSETS_INSUFFICIENT');
    take(asset);
  }
  const anchor = picked[0] ?? usable[0];
  const affinity = (asset: CandidateAsset) => {
    if (!anchor) return 0;
    const set = metadataString(asset, 'assetSet');
    const style = metadataString(asset, 'visualStyle');
    return (
      (set && set === metadataString(anchor, 'assetSet') ? 2 : 0) +
      (style && style === metadataString(anchor, 'visualStyle') ? 1 : 0)
    );
  };
  [...usable].sort((a, b) => affinity(b) - affinity(a)).forEach(take);
  if (picked.length < needed) throw new ApiProblem('PATTERN_ASSETS_INSUFFICIENT');
  return picked;
}
