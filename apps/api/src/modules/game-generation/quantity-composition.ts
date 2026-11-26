import { BadRequestException } from '@nestjs/common';
import {
  quantityContentSchema,
  quantityOptionsSchema,
  voiceInstructionText,
} from '@lumikids/shared';
import type { QuantityOptions } from '@lumikids/shared';
import type { CandidateAsset } from '@lumikids/ai-client';
import { requestedObjectTypes, matchesObjectType } from './asset-selection.js';
import { isShadowAsset, isEnvironmentAsset } from './asset-policy.js';

export function composeQuantity(
  value: QuantityOptions,
  candidates: CandidateAsset[],
) {
  const options = quantityOptionsSchema.parse(value);
  const selected = options.fruits.map((fruit) => {
    const types = requestedObjectTypes(fruit.name, candidates);
    const usable = candidates.filter(
      (a) =>
        types.length === 1 &&
        matchesObjectType(a, types[0]) &&
        !isShadowAsset(a) &&
        !isEnvironmentAsset(a),
    );
    if (!usable.length)
      throw new BadRequestException(
        `Không tìm thấy học liệu cho ${fruit.name}. Hãy dùng tên quả trong kho.`,
      );
    return { ...fruit, asset: usable[0] };
  });
  if (new Set(selected.map((f) => f.asset.id)).size !== selected.length)
    throw new BadRequestException('Mỗi loại quả chỉ khai báo một lần.');
  const items = selected.flatMap((f, index) =>
    Array.from({ length: f.available }, (_, i) => ({
      id: `fruit-${index}-${i}`,
      assetId: f.asset.id,
      label: f.asset.name,
    })),
  );
  const baskets =
    options.mode === 'MERGE'
      ? [
          {
            id: 'basket-1',
            label: 'Giỏ của bé',
            requirements: selected.map((f) => ({
              assetId: f.asset.id,
              count: f.required,
            })),
          },
        ]
      : options.splitCounts.map((count, index) => ({
          id: `basket-${index + 1}`,
          label: `Giỏ ${index + 1}`,
          requirements: [{ assetId: selected[0].asset.id, count }],
        }));
  const instruction =
    options.mode === 'MERGE'
      ? `Bé hãy đưa ${selected.map((f) => `${f.required} ${/^(quả|trái)\s/i.test(f.name) ? '' : 'quả '}${f.name}`).join(', ')} vào cùng một giỏ nhé!`
      : `Bé hãy tách ${items.length} ${/^(quả|trái)\s/i.test(selected[0].name) ? '' : 'quả '}${selected[0].name} vào các giỏ, lần lượt ${options.splitCounts.join(', ')} quả nhé!`;
  const basketAssetId = candidates.find(
    (a) => a.objectType === 'BASKET' && !isShadowAsset(a),
  )?.id;
  if (!basketAssetId)
    throw new BadRequestException(
      'Kho học liệu chưa có ảnh giỏ BASKET đang hoạt động.',
    );
  return quantityContentSchema.parse({
    schemaVersion: 1,
    gameType: 'QUANTITY',
    mode: options.mode,
    basketAssetId,
    items,
    baskets,
    instruction: voiceInstructionText(instruction),
    instructions: 'Bé hãy kéo từng quả vào giỏ theo số lượng được yêu cầu nhé!',
    completionRule: 'ALL_BASKETS_FILLED',
  });
}
