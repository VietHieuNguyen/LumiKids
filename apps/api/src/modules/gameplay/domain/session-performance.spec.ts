import { randomUUID } from 'node:crypto';
import {
  applyGameAction,
  createInitialState,
  gameContentSchema,
} from '@lumikids/shared';
import type {
  CriterionPerformance,
  GameAction,
  GameContent,
  GameInteraction,
} from '@lumikids/shared';
import {
  CRITERION_SCORE_RULE_VERSION,
  CriterionPerformanceInvalidError,
  criterionScore,
  evaluateCriterion,
} from './criterion-evaluation.js';
import { computeSessionPerformance } from './session-performance.js';

const asset = () => randomUUID();
const animals = ['cat', 'dog', 'cow', 'pig', 'duck', 'hen'];
const matching6 = gameContentSchema.parse({
  schemaVersion: 1,
  gameType: 'MATCHING',
  instruction: 'Ghép con vật với bóng',
  sourceItems: animals.map((id) => ({ id, assetId: asset() })),
  targetItems: animals.map((id) => ({ id: `${id}-shadow`, assetId: asset() })),
  pairs: animals.map((id) => ({ sourceId: id, targetId: `${id}-shadow` })),
  completionRule: 'ALL_PAIRS_CORRECT',
});
const counting = gameContentSchema.parse({
  schemaVersion: 1,
  gameType: 'COUNTING',
  instruction: 'Đếm hình',
  items: [{ id: 'a', assetId: asset() }],
  choices: [
    { id: 'one', value: 1 },
    { id: 'two', value: 2 },
  ],
  correctChoiceId: 'one',
  completionRule: 'CORRECT_CHOICE',
});
const classification = gameContentSchema.parse({
  schemaVersion: 2,
  gameType: 'CLASSIFICATION',
  instruction: 'Xếp con vật vào nơi sống',
  items: [
    { id: 'monkey', assetId: asset(), correctGroupIds: ['forest'] },
    { id: 'fish', assetId: asset(), correctGroupIds: ['sea'] },
  ],
  groups: [
    { id: 'forest', label: 'Rừng' },
    { id: 'sea', label: 'Biển' },
  ],
  completionRule: 'ALL_ITEMS_CLASSIFIED_CORRECTLY',
});

/** Runs actions through the shared engine so events carry server-equivalent results. */
function play(content: GameContent, actions: GameAction[]): GameInteraction[] {
  let state = createInitialState(content);
  return actions.map((action) => {
    const transition = applyGameAction(content, state, action, {
      eventId: randomUUID(),
      timestamp: '2026-11-17T08:00:00.000+07:00',
    });
    if (!transition.interaction) throw new Error('fixture action ignored');
    state = transition.state;
    return transition.interaction;
  });
}
const drop = (sourceId: string, target: string): GameAction => ({
  actionType: 'MATCH_DROP',
  sourceId,
  targetId: `${target}-shadow`,
});
const startedAt = new Date('2026-11-17T01:00:00.000Z');
const endedAt = new Date('2026-11-17T01:02:00.000Z');
const perf = (
  overrides: Partial<CriterionPerformance>,
): CriterionPerformance => ({
  totalScoredItems: 6,
  finalizedScoredItems: 6,
  firstAttemptCorrectCount: 0,
  retryCorrectCount: 0,
  hintCorrectCount: 0,
  hintCount: 0,
  attemptCount: 6,
  ...overrides,
});

describe('computeSessionPerformance', () => {
  it('classifies each matching pair once as F or R and counts every attempt', () => {
    const events = play(matching6, [
      drop('cat', 'cat'),
      drop('dog', 'cow'), // dog wrong
      drop('dog', 'dog'), // dog corrected → R
      drop('cow', 'cow'),
      drop('pig', 'duck'), // pig wrong
      drop('pig', 'hen'), // pig wrong again
      drop('pig', 'pig'), // pig corrected → R (counted once)
      drop('duck', 'duck'),
      drop('hen', 'hen'),
    ]);
    const result = computeSessionPerformance({
      content: matching6,
      events,
      criterionCode: '46',
      startedAt,
      endedAt,
    });
    expect(result).toEqual({
      totalItemCount: 6,
      finalizedItemCount: 6,
      attemptCount: 9,
      completionDurationSeconds: 120,
      criterionCode: '46',
      criterionPerformance: {
        totalScoredItems: 6,
        finalizedScoredItems: 6,
        firstAttemptCorrectCount: 4,
        retryCorrectCount: 2,
        hintCorrectCount: 0,
        hintCount: 0,
        attemptCount: 9,
      },
    });
    // (4 + 0.5 × 2) / 6 × 100
    expect(criterionScore(result.criterionPerformance)).toBeCloseTo(83.3333, 4);
  });

  it('uses N from the content, not from items that received events', () => {
    const events = play(matching6, [drop('cat', 'cat'), drop('dog', 'cow')]);
    const result = computeSessionPerformance({
      content: matching6,
      events,
      criterionCode: '46',
      startedAt,
      endedAt: null,
    });
    expect(result.criterionPerformance).toEqual({
      totalScoredItems: 6,
      finalizedScoredItems: 1,
      firstAttemptCorrectCount: 1,
      retryCorrectCount: 0,
      hintCorrectCount: 0,
      hintCount: 0,
      attemptCount: 2,
    });
    expect(result.completionDurationSeconds).toBeNull();
  });

  it('treats a counting game as one item', () => {
    const events = play(counting, [
      { actionType: 'SELECT_CHOICE', sourceId: 'two' },
      { actionType: 'SELECT_CHOICE', sourceId: 'one' },
    ]);
    const result = computeSessionPerformance({
      content: counting,
      events,
      criterionCode: '50',
      startedAt,
      endedAt,
    });
    expect(result.criterionPerformance).toMatchObject({
      totalScoredItems: 1,
      firstAttemptCorrectCount: 0,
      retryCorrectCount: 1,
      attemptCount: 2,
    });
    expect(criterionScore(result.criterionPerformance)).toBe(50);
  });

  it('attributes classification attempts to the dragged item', () => {
    const events = play(classification, [
      { actionType: 'CLASSIFY_DROP', sourceId: 'monkey', targetId: 'forest' },
      { actionType: 'CLASSIFY_DROP', sourceId: 'fish', targetId: 'forest' },
      { actionType: 'CLASSIFY_DROP', sourceId: 'fish', targetId: 'sea' },
    ]);
    const result = computeSessionPerformance({
      content: classification,
      events,
      criterionCode: '51',
      startedAt,
      endedAt,
    });
    expect(result.criterionPerformance).toMatchObject({
      totalScoredItems: 2,
      firstAttemptCorrectCount: 1,
      retryCorrectCount: 1,
    });
    expect(criterionScore(result.criterionPerformance)).toBe(75);
  });
});

describe('criterionScore', () => {
  it('CE-01: N=6, F=4, R=1, one unsolved item → 75', () => {
    expect(
      criterionScore(
        perf({ firstAttemptCorrectCount: 4, retryCorrectCount: 1, attemptCount: 8 }),
      ),
    ).toBe(75);
  });
  it('CE-02: a valid session with no correct item scores 0, not null', () => {
    expect(criterionScore(perf({ totalScoredItems: 5, finalizedScoredItems: 5 }))).toBe(0);
  });
  it('keeps full precision (rounding is a display concern)', () => {
    expect(
      criterionScore(perf({ firstAttemptCorrectCount: 5, retryCorrectCount: 1 })),
    ).toBe((5.5 / 6) * 100);
  });
  it('returns null when there is nothing to score', () => {
    expect(
      criterionScore(perf({ totalScoredItems: 0, finalizedScoredItems: 0 })),
    ).toBeNull();
  });
  it('rejects inconsistent counts', () => {
    expect(() =>
      criterionScore(perf({ firstAttemptCorrectCount: 5, retryCorrectCount: 2 })),
    ).toThrow(CriterionPerformanceInvalidError);
    expect(() =>
      criterionScore(perf({ finalizedScoredItems: 7 })),
    ).toThrow(CriterionPerformanceInvalidError);
    expect(() => criterionScore(perf({ retryCorrectCount: -1 }))).toThrow(
      CriterionPerformanceInvalidError,
    );
  });
});

describe('evaluateCriterion', () => {
  const session = (n: number, criterionCode: string | null = '46') => ({
    totalItemCount: n,
    finalizedItemCount: n,
    attemptCount: n,
    completionDurationSeconds: 30,
    criterionCode,
    criterionPerformance: perf({
      totalScoredItems: n,
      finalizedScoredItems: n,
      firstAttemptCorrectCount: n,
    }),
  });
  it('CE-03: N < 5 still gets a score but is flagged', () => {
    expect(evaluateCriterion(session(4))).toEqual({
      criterionCode: '46',
      score: 100,
      minimumItemsMet: false,
      ruleVersion: CRITERION_SCORE_RULE_VERSION,
    });
  });
  it('N = 5 meets the minimum', () => {
    expect(evaluateCriterion(session(5))?.minimumItemsMet).toBe(true);
  });
  it('produces nothing when the version has no criterion', () => {
    expect(evaluateCriterion(session(5, null))).toBeNull();
  });
});

describe('hints (ce-score-v2)', () => {
  const hint = (sourceId: string): GameAction => ({
    actionType: 'REQUEST_HINT',
    sourceId,
  });

  it('counts a pair solved after its hint as H, even if the first answer after it is right', () => {
    const events = play(matching6, [
      drop('cat', 'cat'), // F
      hint('dog'),
      drop('dog', 'dog'), // H
      drop('cow', 'pig'),
      hint('cow'),
      drop('cow', 'cow'), // wrong, then hint, then right → H
      drop('pig', 'duck'),
      drop('pig', 'pig'), // R
      drop('duck', 'duck'),
      drop('hen', 'hen'),
    ]);
    const result = computeSessionPerformance({
      content: matching6,
      events,
      criterionCode: '46',
      startedAt,
      endedAt,
    });
    expect(result.criterionPerformance).toEqual({
      totalScoredItems: 6,
      finalizedScoredItems: 6,
      firstAttemptCorrectCount: 3,
      retryCorrectCount: 1,
      hintCorrectCount: 2,
      hintCount: 2,
      attemptCount: 8,
    });
    expect(result.attemptCount).toBe(8);
    // (3 + 0.5 × 1 + 0.25 × 2) / 6 × 100
    expect(criterionScore(result.criterionPerformance)).toBeCloseTo(66.6667, 4);
  });

  it('maps a counting hint (named by the correct choice) to the question', () => {
    const events = play(counting, [
      hint('one'),
      { actionType: 'SELECT_CHOICE', sourceId: 'one' },
    ]);
    const result = computeSessionPerformance({
      content: counting,
      events,
      criterionCode: '50',
      startedAt,
      endedAt,
    });
    expect(result.criterionPerformance).toMatchObject({
      hintCorrectCount: 1,
      firstAttemptCorrectCount: 0,
      hintCount: 1,
      attemptCount: 1,
    });
    expect(criterionScore(result.criterionPerformance)).toBe(25);
  });

  it('allows one hint per unsolved task only', () => {
    let state = createInitialState(classification);
    const id = { eventId: randomUUID(), timestamp: '2026-11-17T08:00:00.000+07:00' };
    state = applyGameAction(classification, state, hint('fish'), id).state;
    expect(
      applyGameAction(classification, state, hint('fish'), { ...id, eventId: randomUUID() }).interaction,
    ).toBeNull();
    state = applyGameAction(
      classification,
      state,
      { actionType: 'CLASSIFY_DROP', sourceId: 'monkey', targetId: 'forest' },
      { ...id, eventId: randomUUID() },
    ).state;
    // monkey is solved: no hint for it any more.
    expect(
      applyGameAction(classification, state, hint('monkey'), { ...id, eventId: randomUUID() }).interaction,
    ).toBeNull();
    expect(state.attemptCount).toBe(2);
  });

  it('rejects inconsistent hint counts', () => {
    expect(() =>
      criterionScore(perf({ firstAttemptCorrectCount: 5, hintCorrectCount: 2 })),
    ).toThrow(CriterionPerformanceInvalidError);
  });
});
