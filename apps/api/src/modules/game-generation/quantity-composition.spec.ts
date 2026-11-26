import type { GameInteraction } from '@lumikids/shared';
import { describe, it, expect, vi } from 'vitest';
import { GameGenerationService } from './game-generation.service.js';
import { adminFixture } from '../../../test/game-asset.fixtures.js';
import { randomUUID } from 'node:crypto';
import { composeQuantity } from './quantity-composition.js';
import {
  applyGameAction,
  createInitialState,
  quantityOptionsSchema,
  getGameContentAssetIds,
} from '@lumikids/shared';
import {
  replaySession,
  appendInteractions,
} from '../gameplay/domain/session-replay.js';
import { computeSessionPerformance } from '../gameplay/domain/session-performance.js';

const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const candidates = ['APPLE', 'STRAWBERRY', 'ORANGE', 'BASKET'].map(
  (objectType, index) => ({
    id: ids[index],
    name: objectType,
    tags: [],
    objectType,
    attributes: {
      variant: 'NORMAL',
      aliases: [['táo'], ['dâu'], ['cam'], ['giỏ']][index],
    },
  }),
);
const options = {
  mode: 'MERGE' as const,
  fruits: [
    { name: 'táo', available: 2, required: 1 },
    { name: 'dâu', available: 1, required: 1 },
    { name: 'cam', available: 4, required: 3 },
  ],
  splitCounts: [2, 3],
};

describe('quantity games', () => {
  it('runs the generation pipeline with quantity options, validates basket availability and never calls AI', async () => {
    const rows = candidates.map((asset) => ({ ...asset, status: 'ACTIVE' }));
    const assets = {
      generationCandidates: vi.fn().mockResolvedValue(rows),
      generationAssets: vi.fn().mockResolvedValue(rows),
    };
    const ai = { generate: vi.fn() },
      usage = { record: vi.fn() };
    const service = new GameGenerationService(
      assets as unknown as ConstructorParameters<
        typeof GameGenerationService
      >[0],
      { url: '', token: '', timeoutMs: 25000, requestDeadlineMs: 30000 },
      ai as unknown as ConstructorParameters<typeof GameGenerationService>[2],
      usage as unknown as ConstructorParameters<
        typeof GameGenerationService
      >[3],
    );
    const user = {
      ...adminFixture,
      permissions: ['GENERATE_GAME_CONTENT' as const],
    };
    const result = await service.generate(user, {
      gameType: 'QUANTITY',
      prompt: 'Fruit baskets',
      quantity: options,
    });
    expect(result.gameContent.gameType).toBe('QUANTITY');
    expect(result.generation).toMatchObject({
      model: 'deterministic',
      attempts: 0,
      reviewRequired: true,
    });
    expect(ai.generate).not.toHaveBeenCalled();
    expect(usage.record).not.toHaveBeenCalled();
    expect(assets.generationAssets.mock.calls[0][1]).toContain(ids[3]);
  });
  it('composes the requested mixed fruit counts, one basket and Vietnamese speech without model calls', () => {
    const content = composeQuantity(options, candidates);
    expect(content.items).toHaveLength(7);
    expect(content.baskets).toHaveLength(1);
    expect(content.baskets[0].requirements.map((r) => r.count)).toEqual([
      1, 1, 3,
    ]);
    expect(content.instruction).toContain('ba quả cam');
    expect(getGameContentAssetIds(content)).toContain(ids[3]);
  });
  it('rejects overfilling, returns only the rejected fruit, completes exact quotas and replays on server', () => {
    const content = composeQuantity(options, candidates);
    let state = createInitialState(content);
    const events: GameInteraction[] = [];
    const drop = (sourceId: string) => {
      const transition = applyGameAction(
        content,
        state,
        { actionType: 'QUANTITY_DROP', sourceId, targetId: 'basket-1' },
        { eventId: randomUUID(), timestamp: new Date().toISOString() },
      );
      state = transition.state;
      if (transition.interaction) events.push(transition.interaction);
      return {
        ...transition,
        interaction:
          transition.interaction?.actionType === 'QUANTITY_DROP'
            ? transition.interaction
            : null,
      };
    };
    drop('fruit-0-0');
    expect(drop('fruit-0-1').interaction?.result).toBe('INCORRECT');
    expect(drop('fruit-0-0').interaction).toBeNull();
    for (let i = 0; i < 3; i++)
      expect(drop(`fruit-2-${i}`).interaction?.result).toBe('CORRECT');
    expect(state.completed).toBe(false);
    expect(drop('fruit-2-3').interaction?.result).toBe('INCORRECT');
    expect(state.gameType === 'QUANTITY' && state.placements).toHaveLength(4);
    expect(drop('fruit-1-0').completedNow).toBe(true);
    expect(replaySession(content, events)).toEqual(state);
    expect(
      appendInteractions({
        content,
        status: 'COMPLETED',
        existing: events,
        incoming: events,
      }).duplicates,
    ).toBe(events.length);
    const performance = computeSessionPerformance({
      content,
      events,
      criterionCode: '42',
      startedAt: new Date(),
      endedAt: new Date(),
    });
    expect(performance.totalItemCount).toBe(5);
    expect(performance.finalizedItemCount).toBe(5);
    expect(performance.attemptCount).toBe(7);
  });
  it('splits identical fruit into two quotas without assigning a particular fruit to a basket', () => {
    const content = composeQuantity(
      {
        mode: 'SPLIT',
        fruits: [{ name: 'táo', available: 5, required: 5 }],
        splitCounts: [2, 3],
      },
      candidates,
    );
    let state = createInitialState(content);
    for (let i = 0; i < 5; i++)
      state = applyGameAction(
        content,
        state,
        {
          actionType: 'QUANTITY_DROP',
          sourceId: `fruit-0-${i}`,
          targetId: i < 2 ? 'basket-1' : 'basket-2',
        },
        { eventId: randomUUID(), timestamp: new Date().toISOString() },
      ).state;
    expect(state.completed).toBe(true);
    expect(content.items).toHaveLength(5);
  });
  it('rejects unsatisfiable, out-of-range and missing-asset requests', () => {
    expect(
      quantityOptionsSchema.safeParse({
        ...options,
        fruits: [{ name: 'táo', available: 11, required: 1 }],
      }).success,
    ).toBe(false);
    expect(
      quantityOptionsSchema.safeParse({ ...options, mode: 'SPLIT' }).success,
    ).toBe(false);
    expect(
      quantityOptionsSchema.safeParse({
        ...options,
        fruits: [{ name: 'táo', available: 1, required: 2 }],
      }).success,
    ).toBe(false);
    expect(() => composeQuantity(options, candidates.slice(0, 2))).toThrow();
  });
});
