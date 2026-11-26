import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { CandidateAsset } from '@lumikids/ai-client';
import {
  comparisonChangeSchema,
  applyGameAction,
  createInitialState,
  gameInteractionSchema,
  currentVoiceInstruction,
} from '@lumikids/shared';
import type { GameInteraction } from '@lumikids/shared';
import {
  validateComparisonChange,
  prepareComparisonVoice,
} from './comparison-change-validation.js';
import {
  appendInteractions,
  replaySession,
} from '../gameplay/domain/session-replay.js';
import { computeSessionPerformance } from '../gameplay/domain/session-performance.js';
import { evaluateCriterion } from '../gameplay/domain/criterion-evaluation.js';
import {
  toEventData,
  toInteraction,
} from '../gameplay/infrastructure/prisma-play-session.repository.js';
import { GameGenerationService } from './game-generation.service.js';
import { adminFixture } from '../../../test/game-asset.fixtures.js';

const assetId = randomUUID(),
  basketId = randomUUID();
const candidates: CandidateAsset[] = [
  {
    id: assetId,
    name: 'Ô tô',
    objectType: 'CAR',
    tags: [],
    attributes: { aliases: ['ô tô', 'xe hơi'] },
  },
  { id: basketId, name: 'Giỏ', objectType: 'BASKET', tags: [], attributes: {} },
];
function fixture() {
  return comparisonChangeSchema.parse({
    schemaVersion: 1,
    gameType: 'QUANTITY_COMPARISON_CHANGE',
    instruction: 'Ba màn chơi',
    instructions: 'Hướng dẫn',
    items: [{ id: 'car', assetId }],
    basketAssetId: basketId,
    completionRule: 'ALL_QUESTIONS_COMPLETED',
    questions: [
      {
        id: 'compare',
        mode: 'COMPARE',
        assetId,
        initialCount: 3,
        targetCount: 5,
        instruction: 'So sánh',
      },
      {
        id: 'add',
        mode: 'ADD',
        assetId,
        initialCount: 2,
        targetCount: 6,
        instruction: 'Thêm',
      },
      {
        id: 'remove',
        mode: 'REMOVE',
        assetId,
        initialCount: 7,
        targetCount: 0,
        instruction: 'Bớt',
      },
    ],
  });
}
describe('comparison/change', () => {
  it('validates all boundaries, mode order, identities and rejects invented answer fields', () => {
    const c = fixture();
    for (const invalid of [-1, 11, 1.5])
      expect(
        comparisonChangeSchema.safeParse({
          ...c,
          questions: c.questions.map((q, i) =>
            i === 0 ? { ...q, initialCount: invalid } : q,
          ),
        }).success,
      ).toBe(false);
    for (const index of [1, 2])
      expect(
        comparisonChangeSchema.safeParse({
          ...c,
          questions: c.questions.map((q, i) =>
            i === index ? { ...q, targetCount: q.initialCount } : q,
          ),
        }).success,
      ).toBe(false);
    expect(
      comparisonChangeSchema.safeParse({
        ...c,
        questions: [...c.questions].reverse(),
      }).success,
    ).toBe(false);
    expect(
      comparisonChangeSchema.safeParse({
        ...c,
        questions: c.questions.map((q) => ({ ...q, correctAnswer: 'GT' })),
      }).success,
    ).toBe(false);
    expect(validateComparisonChange(c, 'ô tô', candidates).errors).toEqual([]);
    expect(
      validateComparisonChange(
        { ...c, basketAssetId: assetId },
        'ô tô',
        candidates,
      ).errors,
    ).toContain('BASKET_ASSET_INVALID');
    expect(
      validateComparisonChange(c, 'ô tô', []).errors.length,
    ).toBeGreaterThan(0);
  });
  it.each([
    [0, 0, 'EQ'],
    [0, 10, 'LT'],
    [10, 0, 'GT'],
  ])('derives comparison %i versus %i from counts', (left, right, answer) => {
    const c = fixture();
    c.questions[0].initialCount = left as number;
    c.questions[0].targetCount = right as number;
    const result = applyGameAction(
      c,
      createInitialState(c),
      {
        actionType: 'COMPARE_QUANTITIES',
        sourceId: 'compare',
        targetId: answer as 'GT' | 'LT' | 'EQ',
      },
      { eventId: randomUUID(), timestamp: new Date().toISOString() },
    );
    expect(
      result.interaction &&
        'result' in result.interaction &&
        result.interaction.result,
    ).toBe('CORRECT');
    expect(
      result.state.gameType === 'QUANTITY_COMPARISON_CHANGE' &&
        result.state.solvedQuestionIds,
    ).toEqual(['compare']);
  });
  it('records only submitted answers, replays three rounds, detects forgery and keeps the assessment formula', () => {
    const c = fixture();
    let state = createInitialState(c);
    const events: GameInteraction[] = [];
    const submit = (action: Parameters<typeof applyGameAction>[2]) => {
      const r = applyGameAction(c, state, action, {
        eventId: randomUUID(),
        timestamp: new Date().toISOString(),
      });
      state = r.state;
      if (r.interaction) events.push(r.interaction);
      return r;
    };
    expect(
      submit({
        actionType: 'CONFIRM_QUANTITY_CHANGE',
        sourceId: 'add',
        count: 6,
      }).interaction,
    ).toBeNull();
    submit({
      actionType: 'COMPARE_QUANTITIES',
      sourceId: 'compare',
      targetId: 'GT',
    });
    submit({
      actionType: 'COMPARE_QUANTITIES',
      sourceId: 'compare',
      targetId: 'LT',
    });
    expect(
      submit({
        actionType: 'CONFIRM_QUANTITY_CHANGE',
        sourceId: 'add',
        count: 1,
      }).interaction,
    ).toBeNull();
    submit({
      actionType: 'CONFIRM_QUANTITY_CHANGE',
      sourceId: 'add',
      count: 9,
    });
    submit({
      actionType: 'CONFIRM_QUANTITY_CHANGE',
      sourceId: 'add',
      count: 6,
    });
    expect(
      submit({
        actionType: 'CONFIRM_QUANTITY_CHANGE',
        sourceId: 'remove',
        count: 8,
      }).interaction,
    ).toBeNull();
    submit({
      actionType: 'CONFIRM_QUANTITY_CHANGE',
      sourceId: 'remove',
      count: 0,
    });
    expect(state.completed).toBe(true);
    expect(events).toHaveLength(5);
    expect(replaySession(c, events)).toEqual(state);
    expect(
      appendInteractions({
        content: c,
        status: 'COMPLETED',
        existing: events,
        incoming: events,
      }).duplicates,
    ).toBe(5);
    expect(() =>
      appendInteractions({
        content: c,
        status: 'IN_PROGRESS',
        existing: events.slice(0, 3),
        incoming: [{ ...events[3], count: 7 } as GameInteraction],
      }),
    ).toThrow();
    const perf = computeSessionPerformance({
      content: c,
      events,
      criterionCode: '43',
      startedAt: new Date(),
      endedAt: new Date(),
    });
    expect(perf.totalItemCount).toBe(3);
    expect(perf.attemptCount).toBe(5);
    expect(perf.finalizedItemCount).toBe(3);
    expect(perf.criterionPerformance.hintCount).toBe(0);
    expect(evaluateCriterion(perf)?.minimumItemsMet).toBe(false);
  });
  it('preserves the submitted zero count in database JSON and client round-trip', () => {
    const event = gameInteractionSchema.parse({
      schemaVersion: 1,
      eventId: randomUUID(),
      actionType: 'CONFIRM_QUANTITY_CHANGE',
      sourceId: 'remove',
      count: 0,
      result: 'CORRECT',
      timestamp: new Date().toISOString(),
      attemptIndex: 3,
    });
    const data = toEventData(randomUUID(), event);
    expect(data.actionData).toEqual({ sourceId: 'remove', count: 0 });
    expect(
      toInteraction({ ...data, receivedAt: new Date() } as Parameters<
        typeof toInteraction
      >[0]),
    ).toEqual(event);
  });
  it('replaces model prose with per-question instructions and never voices the arithmetic solution', () => {
    const c = prepareComparisonVoice(fixture(), candidates);
    expect(c.questions[0].instruction).toContain('Ô tô');
    expect(c.questions[1].instruction).toContain('hai');
    expect(c.questions[1].instruction).toContain('sáu');
    expect(c.questions[1].instruction).not.toContain('thêm bốn');
    expect(c.questions[2].instruction).toContain('không');
    expect(currentVoiceInstruction(c, 'add')).toBe(c.questions[1].instruction);
  });
  it('uses the model pipeline with difficulty and whitelisted pictures, then normalizes voice before saving', async () => {
    const rows = candidates.map((a) => ({ ...a, status: 'ACTIVE' }));
    const assets = {
      generationCandidates: vi.fn().mockResolvedValue(rows),
      generationAssets: vi.fn().mockResolvedValue(rows),
    };
    const ai = {
        generate: vi
          .fn()
          .mockResolvedValue({ gameContent: fixture(), model: 'mock' }),
      },
      usage = { record: vi.fn() };
    const service = new GameGenerationService(
      assets as unknown as ConstructorParameters<
        typeof GameGenerationService
      >[0],
      {
        url: 'http://ai.local',
        token: 'fixture',
        timeoutMs: 25000,
        requestDeadlineMs: 30000,
      },
      ai as unknown as ConstructorParameters<typeof GameGenerationService>[2],
      usage as unknown as ConstructorParameters<
        typeof GameGenerationService
      >[3],
    );
    const result = await service.generate(
      { ...adminFixture, permissions: ['GENERATE_GAME_CONTENT'] },
      {
        gameType: 'QUANTITY_COMPARISON_CHANGE',
        prompt: 'ô tô',
        comparisonDifficulty: 'EASY',
      },
    );
    expect(ai.generate).toHaveBeenCalledOnce();
    expect(ai.generate.mock.calls[0][0].comparisonDifficulty).toBe('EASY');
    expect(
      comparisonChangeSchema.parse(result.gameContent).questions[2].instruction,
    ).toContain('không');
    expect(result.generation.reviewRequired).toBe(true);
  });
});
