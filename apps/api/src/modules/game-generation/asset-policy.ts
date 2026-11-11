import type { CandidateAsset } from '@lumikids/ai-client';
import type { GameType } from '@lumikids/shared';

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}
export function metadataString(
  asset: CandidateAsset,
  key: string,
): string | undefined {
  const value = asset.attributes[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export function isEnvironmentAsset(asset: CandidateAsset): boolean {
  return (
    /^(?:ENVIRONMENT|HABITAT)(?:_|$)/i.test(asset.objectType) ||
    /^(?:ENVIRONMENT|HABITAT)$/i.test(metadataString(asset, 'category') ?? '')
  );
}
/** animalType is a legacy species identity; non-animal learning materials use objectType. */
export function assetObjectType(asset: CandidateAsset): string {
  const category = metadataString(asset, 'category')?.toUpperCase();
  const animalType = metadataString(asset, 'animalType');
  return (!category || category === 'ANIMAL') &&
    animalType &&
    /^[A-Z][A-Z0-9_]{0,39}$/.test(animalType)
    ? animalType
    : asset.objectType;
}
export function isShadowAsset(asset: CandidateAsset): boolean {
  return (
    /shadow|silhouette/.test(fold(metadataString(asset, 'variant') ?? '')) ||
    /(?:^|_)SHADOW(?:_|$)/i.test(asset.objectType)
  );
}
export function requestsShadow(prompt: string): boolean {
  const text = fold(prompt).replace(
    /\b(?:khong|tranh)\s+(?:(?:su dung|dung|lay|chon|hien thi)\s+)?(?:(?:anh|hinh)\s+)?bong(?:\s+den)?\b/g,
    '',
  );
  return /\b(?:hinh bong|bong cua|bong con|tim bong|bong den|shadow|silhouette)\b/.test(
    text,
  );
}
export type MatchingMode = 'SHADOW' | 'OFFSPRING' | 'IDENTICAL' | 'GENERIC';
export function requestedMatchingMode(prompt: string): MatchingMode {
  if (requestsShadow(prompt)) return 'SHADOW';
  const text = fold(prompt);
  if (
    /\b(?:con non|me va con|me con|bo va con|offspring|baby animals?)\b|\bme\b[^.!?;]{0,50}\bcon\b|\badult\b[^.!?;]{0,50}\byoung\b/.test(
      text,
    )
  )
    return 'OFFSPRING';
  if (
    /\b(?:hinh giong nhau|hinh giong het|hai hinh giong|same image|identical)\b/.test(
      text,
    )
  )
    return 'IDENTICAL';
  return 'GENERIC';
}
export function requestedVisualStyle(prompt: string): string | undefined {
  const text = fold(prompt).replace(
    /\b(?:khong|tranh)\s+(?:(?:su dung|dung|lay|chon)\s+)?(?:anh\s+)?(?:hoat hinh|cartoon|realistic|anh that|anh chup|anh thuc te)\b/g,
    '',
  );
  const realistic =
    /\b(?:anh that|anh chup|sat thuc te|anh thuc te|realistic|photo)\b/.test(
      text,
    );
  const cartoon = /\b(?:hoat hinh|cartoon)\b/.test(text);
  return realistic !== cartoon
    ? realistic
      ? 'REALISTIC'
      : 'CARTOON_2D'
    : undefined;
}
export function isAllowedForTask(
  asset: CandidateAsset,
  gameType: GameType | undefined,
  prompt: string,
): boolean {
  if (isShadowAsset(asset) && !requestsShadow(prompt)) return false;
  const style = requestedVisualStyle(prompt);
  if (style && metadataString(asset, 'visualStyle')?.toUpperCase() !== style)
    return false;
  if (
    gameType === 'MATCHING' &&
    requestedMatchingMode(prompt) === 'OFFSPRING'
  ) {
    return (
      !isShadowAsset(asset) &&
      /^(?:ADULT|YOUNG)$/i.test(metadataString(asset, 'lifeStage') ?? '')
    );
  }
  return true;
}
function sameDeclaredValue(
  left: CandidateAsset,
  right: CandidateAsset,
  key: string,
): boolean {
  const a = metadataString(left, key);
  const b = metadataString(right, key);
  return !!a && !!b && fold(a) === fold(b);
}
/** Exact shadow identity and family relations must be declared; tags/species alone are insufficient. */
export function isCompatiblePair(
  source: CandidateAsset,
  target: CandidateAsset,
  mode: MatchingMode,
): boolean {
  for (const key of mode === 'GENERIC'
    ? ['animalType']
    : ['animalType', 'visualStyle', 'assetSet']) {
    if (
      metadataString(source, key) &&
      metadataString(target, key) &&
      !sameDeclaredValue(source, target, key)
    )
      return false;
  }
  if (mode === 'SHADOW')
    return (
      !isShadowAsset(source) &&
      isShadowAsset(target) &&
      sameDeclaredValue(source, target, 'matchKey')
    );
  if (mode === 'OFFSPRING')
    return (
      !isShadowAsset(source) &&
      !isShadowAsset(target) &&
      metadataString(source, 'lifeStage')?.toUpperCase() === 'ADULT' &&
      metadataString(target, 'lifeStage')?.toUpperCase() === 'YOUNG' &&
      sameDeclaredValue(source, target, 'animalType') &&
      sameDeclaredValue(source, target, 'familyKey')
    );
  if (mode === 'IDENTICAL')
    return (
      !isShadowAsset(source) &&
      !isShadowAsset(target) &&
      (source.id === target.id || sameDeclaredValue(source, target, 'matchKey'))
    );
  return !isShadowAsset(source) && !isShadowAsset(target);
}
