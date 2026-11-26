import { comparisonChangeSchema, voiceInstructionText } from '@lumikids/shared';
import type { ComparisonChangeContent } from '@lumikids/shared';
import type { CandidateAsset } from '@lumikids/ai-client';
import {
  isAllowedForTask,
  isShadowAsset,
  isEnvironmentAsset,
} from './asset-policy.js';
import { requestedObjectTypes, matchesObjectType } from './asset-selection.js';

/** Counts are authoritative; no model-supplied answer or solving hint is accepted. */
export function validateComparisonChange(
  value: unknown,
  prompt: string,
  candidates: CandidateAsset[],
) {
  const parsed = comparisonChangeSchema.safeParse(value);
  if (!parsed.success) return { errors: ['GAME_SCHEMA_INVALID'], warnings: [] };
  const content = parsed.data;
  const assets = new Map(candidates.map((a) => [a.id, a]));
  const errors: string[] = [];
  if (assets.get(content.basketAssetId)?.objectType !== 'BASKET')
    errors.push('BASKET_ASSET_INVALID');
  for (const item of content.items)
    if (!assets.has(item.assetId)) errors.push('ASSET_NOT_WHITELISTED');
  for (const q of content.questions) {
    const asset = assets.get(q.assetId);
    if (
      !asset ||
      asset.objectType === 'BASKET' ||
      isShadowAsset(asset) ||
      isEnvironmentAsset(asset) ||
      !isAllowedForTask(asset, content.gameType, prompt)
    )
      errors.push('QUESTION_ASSET_INVALID');
  }
  const requested = requestedObjectTypes(prompt, candidates).filter(
    (t) => t !== 'BASKET',
  );
  if (
    requested.some(
      (type) =>
        !content.questions.some((q) => {
          const a = assets.get(q.assetId);
          return a && matchesObjectType(a, type);
        }),
    )
  )
    errors.push('REQUESTED_OBJECT_TYPE_MISSING');
  return {
    content,
    errors: [...new Set(errors)],
    warnings: ['ADULT_REVIEW_REQUIRED', 'FREE_TEXT_CONSTRAINTS_REQUIRE_REVIEW'],
  };
}

export function prepareComparisonVoice(
  content: ComparisonChangeContent,
  candidates: CandidateAsset[],
): ComparisonChangeContent {
  const assets = new Map(candidates.map((a) => [a.id, a]));
  return {
    ...content,
    instructions:
      'Bé hãy so sánh hai nhóm, thêm rồi bớt đồ vật qua ba màn chơi nhé!',
    instruction: 'Cùng bé so sánh, thêm và bớt số lượng trong phạm vi mười.',
    questions: content.questions.map((q) => {
      const label = (assets.get(q.assetId)?.name ?? q.label ?? 'đồ vật').slice(
        0,
        120,
      );
      const start =
        q.initialCount === 0
          ? 'Giỏ đang trống.'
          : `Trong giỏ có ${q.initialCount} ${label}.`;
      const instruction =
        q.mode === 'COMPARE'
          ? `Bé hãy so sánh số ${label} ở hai giỏ rồi kéo dấu lớn hơn, bé hơn hoặc bằng vào ô giữa nhé!`
          : q.mode === 'ADD'
            ? `${start} Bé hãy thêm ${label} để giỏ có ${q.targetCount} rồi nhấn xác nhận nhé!`
            : q.targetCount === 0
              ? `${start} Bé hãy lấy bớt để giỏ không còn ${label} rồi nhấn xác nhận nhé!`
              : `${start} Bé hãy lấy bớt để còn ${q.targetCount} rồi nhấn xác nhận nhé!`;
      return { ...q, label, instruction: voiceInstructionText(instruction) };
    }),
  };
}
