import { randomUUID } from 'node:crypto';
import {
  MAX_INTERACTIONS_PER_SESSION,
  applyGameAction,
  createInitialState,
  gameContentSchema,
} from '@lumikids/shared';
import type {
  GameAction,
  GameContent,
  GameInteraction,
} from '@lumikids/shared';
import {
  GameplayRuleError,
  appendInteractions,
  replaySession,
} from './session-replay.js';

const asset = () => randomUUID();
const matching = gameContentSchema.parse({
  schemaVersion: 1,
  gameType: 'MATCHING',
  instruction: 'Ghép con vật với bóng',
  sourceItems: [
    { id: 'cat', assetId: asset() },
    { id: 'dog', assetId: asset() },
  ],
  targetItems: [
    { id: 'dog-shadow', assetId: asset() },
    { id: 'cat-shadow', assetId: asset() },
  ],
  pairs: [
    { sourceId: 'cat', targetId: 'cat-shadow' },
    { sourceId: 'dog', targetId: 'dog-shadow' },
  ],
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
    { id: 'monkey', assetId: asset(), correctGroupIds: ['forest', 'tree'] },
  ],
  groups: [
    { id: 'forest', label: 'Rừng' },
    { id: 'tree', label: 'Cây' },
    { id: 'sea', label: 'Biển' },
  ],
  completionRule: 'ALL_ITEMS_CLASSIFIED_CORRECTLY',
});

/** Simulates the client runtime so fixtures match what the browser would send. */
function play(content: GameContent, actions: GameAction[]): GameInteraction[] {
  let state = createInitialState(content);
  return actions.map((action) => {
    const transition = applyGameAction(content, state, action, {
      eventId: randomUUID(),
      timestamp: '2026-11-13T08:00:00.000+07:00',
    });
    if (!transition.interaction) throw new Error('fixture action ignored');
    state = transition.state;
    return transition.interaction;
  });
}
const matchingRun = () =>
  play(matching, [
    { actionType: 'MATCH_DROP', sourceId: 'cat', targetId: 'dog-shadow' },
    { actionType: 'MATCH_DROP', sourceId: 'cat', targetId: 'cat-shadow' },
    { actionType: 'MATCH_DROP', sourceId: 'dog', targetId: 'dog-shadow' },
  ]);
function ruleCode(run: () => unknown) {
  try {
    run();
  } catch (error) {
    if (error instanceof GameplayRuleError) return error.code;
    throw error;
  }
  return 'NO_ERROR';
}

describe('Gameplay session replay', () => {
  it('accepts an ordered matching run and derives completion on the server', () => {
    const events = matchingRun();
    const result = appendInteractions({
      content: matching,
      status: 'IN_PROGRESS',
      existing: [],
      incoming: events,
    });
    expect(result.accepted.map((event) => event.result)).toEqual([
      'INCORRECT',
      'CORRECT',
      'CORRECT',
    ]);
    expect(result).toMatchObject({
      duplicates: 0,
      completed: true,
      nextAttemptIndex: 4,
    });
  });

  it('treats a retried batch as duplicates even after the session completed', () => {
    const events = matchingRun();
    const result = appendInteractions({
      content: matching,
      status: 'COMPLETED',
      existing: events,
      incoming: events,
    });
    expect(result).toMatchObject({ accepted: [], duplicates: 3 });
  });

  it('accepts a batch split across requests', () => {
    const events = matchingRun();
    const result = appendInteractions({
      content: matching,
      status: 'IN_PROGRESS',
      existing: events.slice(0, 1),
      incoming: events,
    });
    expect(result).toMatchObject({ duplicates: 1, completed: true });
    expect(result.accepted).toHaveLength(2);
  });

  it('rejects gaps, tampered results, unknown elements and reused event IDs', () => {
    const [first, second] = matchingRun();
    const base = { content: matching, status: 'IN_PROGRESS' as const };
    expect(
      ruleCode(() =>
        appendInteractions({ ...base, existing: [], incoming: [second] }),
      ),
    ).toBe('INTERACTION_OUT_OF_ORDER');
    expect(
      ruleCode(() =>
        appendInteractions({
          ...base,
          existing: [],
          incoming: [{ ...first, result: 'CORRECT' }],
        }),
      ),
    ).toBe('INTERACTION_RESULT_MISMATCH');
    expect(
      ruleCode(() =>
        appendInteractions({
          ...base,
          existing: [],
          incoming: [{ ...first, sourceId: 'lion' }],
        }),
      ),
    ).toBe('INTERACTION_INVALID');
    expect(
      ruleCode(() =>
        appendInteractions({
          ...base,
          existing: [first],
          incoming: [{ ...first, timestamp: '2026-11-13T09:00:00.000Z' }],
        }),
      ),
    ).toBe('INTERACTION_ID_CONFLICT');
  });

  it('rejects new events once the session is closed or already complete', () => {
    const events = matchingRun();
    const extra = { ...events[0], eventId: randomUUID(), attemptIndex: 4 };
    expect(
      ruleCode(() =>
        appendInteractions({
          content: matching,
          status: 'IN_PROGRESS',
          existing: events,
          incoming: [extra],
        }),
      ),
    ).toBe('PLAY_SESSION_CLOSED');
    expect(
      ruleCode(() =>
        appendInteractions({
          content: matching,
          status: 'ABANDONED',
          existing: [],
          incoming: events.slice(0, 1),
        }),
      ),
    ).toBe('PLAY_SESSION_CLOSED');
  });

  it('completes counting on the correct choice', () => {
    const events = play(counting, [
      { actionType: 'SELECT_CHOICE', sourceId: 'two' },
      { actionType: 'SELECT_CHOICE', sourceId: 'one' },
    ]);
    expect(replaySession(counting, events)).toMatchObject({
      completed: true,
      attemptCount: 2,
    });
  });

  it('accepts any declared classification v2 group', () => {
    const events = play(classification, [
      { actionType: 'CLASSIFY_DROP', sourceId: 'monkey', targetId: 'sea' },
      { actionType: 'CLASSIFY_DROP', sourceId: 'monkey', targetId: 'tree' },
    ]);
    const result = appendInteractions({
      content: classification,
      status: 'IN_PROGRESS',
      existing: [],
      incoming: events,
    });
    expect(result.accepted.map((event) => event.result)).toEqual([
      'INCORRECT',
      'CORRECT',
    ]);
    expect(result.completed).toBe(true);
  });

  it('caps the number of stored events per session', () => {
    const wrong = play(
      counting,
      Array.from({ length: MAX_INTERACTIONS_PER_SESSION + 1 }, () => ({
        actionType: 'SELECT_CHOICE' as const,
        sourceId: 'two',
      })),
    );
    expect(
      ruleCode(() =>
        appendInteractions({
          content: counting,
          status: 'IN_PROGRESS',
          existing: wrong.slice(0, MAX_INTERACTIONS_PER_SESSION),
          incoming: wrong.slice(MAX_INTERACTIONS_PER_SESSION),
        }),
      ),
    ).toBe('INTERACTION_LIMIT');
  });
});
