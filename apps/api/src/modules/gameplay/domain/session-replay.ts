import {
  MAX_INTERACTIONS_PER_SESSION,
  applyGameAction,
  createInitialState,
} from '@lumikids/shared';
import type {
  GameAction,
  GameContent,
  GameInteraction,
  GameState,
  PlaySessionStatus,
} from '@lumikids/shared';

export type GameplayRuleCode =
  | 'PLAY_SESSION_CLOSED'
  | 'INTERACTION_OUT_OF_ORDER'
  | 'INTERACTION_INVALID'
  | 'INTERACTION_RESULT_MISMATCH'
  | 'INTERACTION_ID_CONFLICT'
  | 'INTERACTION_LIMIT';

export class GameplayRuleError extends Error {
  constructor(readonly code: GameplayRuleCode) {
    super(code);
  }
}

export interface AppendInput {
  content: GameContent;
  status: PlaySessionStatus;
  existing: readonly GameInteraction[];
  incoming: readonly GameInteraction[];
}
export interface AppendResult {
  accepted: GameInteraction[];
  duplicates: number;
  completed: boolean;
  nextAttemptIndex: number;
}

function toAction(event: GameInteraction): GameAction {
  return event.actionType === 'SELECT_CHOICE'
    ? { actionType: event.actionType, sourceId: event.sourceId }
    : {
        actionType: event.actionType,
        sourceId: event.sourceId,
        targetId: event.targetId,
      };
}

function samePayload(a: GameInteraction, b: GameInteraction): boolean {
  return (
    a.actionType === b.actionType &&
    a.sourceId === b.sourceId &&
    ('targetId' in a ? a.targetId : undefined) ===
      ('targetId' in b ? b.targetId : undefined) &&
    a.attemptIndex === b.attemptIndex &&
    a.result === b.result &&
    Date.parse(a.timestamp) === Date.parse(b.timestamp)
  );
}

/** Applies one event through the shared engine; the server result is authoritative. */
function step(
  content: GameContent,
  state: GameState,
  event: GameInteraction,
): GameState {
  if (state.completed) throw new GameplayRuleError('PLAY_SESSION_CLOSED');
  if (event.attemptIndex !== state.attemptCount + 1)
    throw new GameplayRuleError('INTERACTION_OUT_OF_ORDER');
  const transition = applyGameAction(content, state, toAction(event), {
    eventId: event.eventId,
    timestamp: event.timestamp,
  });
  if (!transition.interaction)
    throw new GameplayRuleError('INTERACTION_INVALID');
  if (transition.interaction.result !== event.result)
    throw new GameplayRuleError('INTERACTION_RESULT_MISMATCH');
  return transition.state;
}

export function replaySession(
  content: GameContent,
  events: readonly GameInteraction[],
): GameState {
  return events.reduce(
    (state, event) => step(content, state, event),
    createInitialState(content),
  );
}

/** Idempotent append: known eventIds with the same payload are duplicates, never re-applied. */
export function appendInteractions(input: AppendInput): AppendResult {
  let state = replaySession(input.content, input.existing);
  const known = new Map(input.existing.map((event) => [event.eventId, event]));
  const accepted: GameInteraction[] = [];
  let duplicates = 0;
  for (const event of input.incoming) {
    const previous = known.get(event.eventId);
    if (previous) {
      if (!samePayload(previous, event))
        throw new GameplayRuleError('INTERACTION_ID_CONFLICT');
      duplicates++;
      continue;
    }
    if (input.status !== 'IN_PROGRESS')
      throw new GameplayRuleError('PLAY_SESSION_CLOSED');
    if (input.existing.length + accepted.length >= MAX_INTERACTIONS_PER_SESSION)
      throw new GameplayRuleError('INTERACTION_LIMIT');
    state = step(input.content, state, event);
    known.set(event.eventId, event);
    accepted.push(event);
  }
  return {
    accepted,
    duplicates,
    completed: state.completed,
    nextAttemptIndex: state.attemptCount + 1,
  };
}
