import {
  declaredHabitats,
  expandHabitats,
  habitatConcepts,
  mostSpecificHabitats,
  getClassificationCorrectGroupIds,
  gameContentSchema,
} from '@lumikids/shared';
import type { ClassificationContent } from '@lumikids/shared';
import type { CandidateAsset } from '@lumikids/ai-client';
import { isEnvironmentAsset } from './asset-policy.js';

function supportsGroupImage(asset: CandidateAsset, habitat: string): boolean {
  const declared = mostSpecificHabitats(declaredHabitats(asset.attributes));
  return (
    isEnvironmentAsset(asset) &&
    declared.length === 1 &&
    expandHabitats(declared).includes(habitat)
  );
}

/** Resolve habitat answers and optional illustrations from whitelisted metadata. */
export function normalizeHabitatAnswers(
  value: unknown,
  candidates: CandidateAsset[],
): { value: unknown; warnings: string[] } {
  const parsed = gameContentSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.gameType !== 'CLASSIFICATION' ||
    parsed.data.schemaVersion !== 2
  )
    return { value, warnings: [] };
  const content = parsed.data;
  const byId = new Map(candidates.map((asset) => [asset.id, asset]));
  const habitats = content.groups.map((group) => {
    const label = mostSpecificHabitats(habitatConcepts(group.label));
    // Unknown references must still fail whitelist validation, never be repaired away.
    if (label.length !== 1 || (group.assetId && !byId.has(group.assetId)))
      return undefined;
    return { id: group.id, habitat: label[0]! };
  });
  if (habitats.some((group) => !group)) return { value, warnings: [] };
  let changed = false;
  const items = content.items.map((item) => {
    const declared = declaredHabitats(byId.get(item.assetId)?.attributes ?? {});
    const supported = expandHabitats(declared);
    const correctGroupIds = habitats
      .filter((group) => group && supported.includes(group.habitat))
      .map((group) => group!.id);
    if (!correctGroupIds.length) return undefined;
    if (
      correctGroupIds.length !== item.correctGroupIds.length ||
      correctGroupIds.some((id) => !item.correctGroupIds.includes(id))
    )
      changed = true;
    return { ...item, correctGroupIds };
  });
  if (items.some((item) => !item)) return { value, warnings: [] };
  let imagesChanged = false;
  const groups = content.groups.map((group, index) => {
    if (!group.assetId) return group;
    const habitat = habitats[index]!.habitat;
    if (supportsGroupImage(byId.get(group.assetId)!, habitat)) return group;
    const compatible = candidates.filter((asset) =>
      supportsGroupImage(asset, habitat),
    );
    const replacement =
      compatible.find((asset) =>
        mostSpecificHabitats(declaredHabitats(asset.attributes)).includes(
          habitat,
        ),
      ) ?? compatible[0];
    imagesChanged = true;
    if (replacement) return { ...group, assetId: replacement.id };
    // Images are optional: keep the group's label and ID, without a misleading image.
    const { assetId: omittedImage, ...textGroup } = group;
    void omittedImage;
    return textGroup;
  });
  if (!changed && !imagesChanged) return { value, warnings: [] };
  return {
    value: { ...content, items, groups },
    warnings: [
      ...(changed ? ['METADATA_ANSWERS_NORMALIZED'] : []),
      ...(imagesChanged ? ['GROUP_IMAGES_NORMALIZED'] : []),
    ],
  };
}

/** Check the entire accepted-answer set, including valid alternatives AI omitted. */
export function validateClassificationHabitats(
  content: ClassificationContent,
  byId: ReadonlyMap<string, CandidateAsset>,
  requestedHabitats: readonly string[] = [],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const groups = content.groups.map((group) => {
    const fromLabel = mostSpecificHabitats(habitatConcepts(group.label));
    const groupAsset = group.assetId ? byId.get(group.assetId) : undefined;
    const fromAsset = mostSpecificHabitats(
      declaredHabitats(groupAsset?.attributes ?? {}),
    );
    if (fromLabel.length > 1 || (!fromLabel.length && fromAsset.length > 1))
      errors.push('GROUP_METADATA_AMBIGUOUS');
    const habitat =
      fromLabel.length === 1
        ? fromLabel[0]
        : fromAsset.length === 1
          ? fromAsset[0]
          : undefined;
    if (habitat && groupAsset && !supportsGroupImage(groupAsset, habitat))
      errors.push('GROUP_METADATA_CONTRADICTION');
    return { id: group.id, habitat };
  });
  if (
    requestedHabitats.length === content.groups.length &&
    requestedHabitats.some(
      (habitat) => !groups.some((group) => group.habitat === habitat),
    )
  )
    errors.push('REQUESTED_HABITAT_GROUP_MISSING');
  if (!groups.some((group) => group.habitat)) return { errors, warnings };
  for (const item of content.items) {
    const asset = byId.get(item.assetId);
    if (!asset) continue; // Whitelist validation reports the missing asset.
    const declared = declaredHabitats(asset.attributes);
    if (!declared.length) {
      errors.push('HABITAT_METADATA_REQUIRED');
      continue;
    }
    const available = expandHabitats(declared);
    const accepted = getClassificationCorrectGroupIds(item);
    for (const group of groups) {
      if (!group.habitat) continue;
      const supported = available.includes(group.habitat);
      if (accepted.includes(group.id) && !supported)
        errors.push('CLASSIFICATION_METADATA_CONTRADICTION');
      if (
        content.schemaVersion === 2 &&
        supported &&
        !accepted.includes(group.id)
      )
        errors.push('CLASSIFICATION_ACCEPTED_GROUP_MISSING');
    }
    if (
      accepted.some((id) => !groups.find((group) => group.id === id)?.habitat)
    )
      warnings.push('CLASSIFICATION_SEMANTICS_NOT_VERIFIABLE');
  }
  return { errors, warnings };
}
