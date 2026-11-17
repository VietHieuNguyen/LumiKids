import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import {
  applyGameAction,
  createInitialState,
  gameContentSchema,
} from '@lumikids/shared';
import type { GameInteraction } from '@lumikids/shared';
import { ApiProblem } from '../../../common/http/api-problem.js';
import type { ChildPrincipal } from '../../../common/security/principal.js';
import type { AssignmentsService } from '../../learning-content/assignments.service.js';
import type { PlayableGameService } from '../../learning-content/playable-game.service.js';
import { GameplayService } from './gameplay.service.js';
import { PlaySessionRepository } from './play-session.repository.js';
import type {
  AppendCommit,
  PlaySessionRecord,
  SessionCompletion,
  StartSessionData,
} from './play-session.repository.js';

const content = gameContentSchema.parse({
  schemaVersion: 1,
  gameType: 'COUNTING',
  instruction: 'Đếm hình',
  items: [{ id: 'a', assetId: randomUUID() }],
  choices: [
    { id: 'one', value: 1 },
    { id: 'two', value: 2 },
  ],
  correctChoiceId: 'one',
  completionRule: 'CORRECT_CHOICE',
});
const child = (childId: string): ChildPrincipal => ({
  childId,
  fullName: 'Trẻ test',
  permissions: [
    'PLAY_GAMES',
    'SUBMIT_OWN_INTERACTIONS',
    'READ_OWN_PLAY_SESSIONS',
  ],
});
function event(sourceId: string, attemptIndex = 1): GameInteraction {
  const state = {
    ...createInitialState(content),
    attemptCount: attemptIndex - 1,
  };
  const transition = applyGameAction(
    content,
    state,
    { actionType: 'SELECT_CHOICE', sourceId },
    { eventId: randomUUID(), timestamp: new Date().toISOString() },
  );
  if (!transition.interaction) throw new Error('fixture ignored');
  return transition.interaction;
}

class MemoryRepository extends PlaySessionRepository {
  sessions = new Map<
    string,
    PlaySessionRecord & { childId: string; startRequestId: string }
  >();
  events = new Map<string, GameInteraction[]>();
  loseNextRaces = 0;
  criterionCode: string | null = '50';
  completions = new Map<string, SessionCompletion>();
  findById(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return Promise.resolve(session ? { ...session } : null);
  }
  findByStartRequest(childId: string, startRequestId: string) {
    const session = [...this.sessions.values()].find(
      (s) => s.childId === childId && s.startRequestId === startRequestId,
    );
    return Promise.resolve(session ? { ...session } : null);
  }
  start(data: StartSessionData) {
    for (const session of this.sessions.values())
      if (session.childId === data.childId && session.status === 'IN_PROGRESS')
        session.status = 'ABANDONED';
    const record = {
      ...data,
      sessionId: randomUUID(),
      status: 'IN_PROGRESS' as const,
      eventCount: 0,
      startedAt: new Date(),
      endedAt: null,
    };
    this.sessions.set(record.sessionId, record);
    return Promise.resolve({ ...record });
  }
  listInteractions(sessionId: string) {
    return Promise.resolve([...(this.events.get(sessionId) ?? [])]);
  }
  findForeignEventIds(sessionId: string, eventIds: readonly string[]) {
    return Promise.resolve(
      [...this.events.entries()]
        .filter(([id]) => id !== sessionId)
        .flatMap(([, list]) => list.map((e) => e.eventId))
        .filter((id) => eventIds.includes(id)),
    );
  }
  commitAppend(commit: AppendCommit) {
    if (this.loseNextRaces > 0) {
      this.loseNextRaces--;
      return Promise.resolve(false);
    }
    const session = this.sessions.get(commit.sessionId);
    if (!session || session.eventCount !== commit.expectedEventCount)
      return Promise.resolve(false);
    this.events.set(commit.sessionId, [
      ...(this.events.get(commit.sessionId) ?? []),
      ...commit.accepted,
    ]);
    session.eventCount += commit.accepted.length;
    if (commit.completion) {
      if (this.completions.has(commit.sessionId))
        throw new Error('second evaluation for one session');
      session.status = 'COMPLETED';
      this.completions.set(commit.sessionId, commit.completion);
    }
    return Promise.resolve(true);
  }
  primaryCriterionCode() {
    return Promise.resolve(this.criterionCode);
  }
  abandon(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session?.status === 'IN_PROGRESS') session.status = 'ABANDONED';
    return Promise.resolve();
  }
}

function setup() {
  const repository = new MemoryRepository();
  const versionId = randomUUID();
  const games = {
    detail: vi.fn((_player: ChildPrincipal, id: string) =>
      id === versionId
        ? Promise.resolve({ versionId, content })
        : Promise.reject(new NotFoundException()),
    ),
    versionContent: vi.fn(() => Promise.resolve(content)),
  } as unknown as PlayableGameService;
  const register = () => child(randomUUID());
  return {
    service: new GameplayService(
      repository,
      games,
      {} as unknown as AssignmentsService,
    ),
    repository,
    versionId,
    register,
  };
}
const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;

describe('GameplayService (offline)', () => {
  it('records the session for the signed-in child', async () => {
    const { service, versionId, register, repository } = setup();
    const player = register();
    const { sessionId } = await service.start(player, {
      versionId,
      startRequestId: randomUUID(),
    });
    expect(repository.sessions.get(sessionId)?.childId).toBe(player.childId);
  });

  it('starts idempotently and abandons the previous running session', async () => {
    const { service, versionId, register, repository } = setup();
    const user = register();
    const startRequestId = randomUUID();
    const first = await service.start(user, { versionId, startRequestId });
    expect(await service.start(user, { versionId, startRequestId })).toEqual(
      first,
    );
    await expect(
      service.start(user, { versionId: randomUUID(), startRequestId }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const second = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    expect(repository.sessions.get(first.sessionId)?.status).toBe('ABANDONED');
    expect(second.status).toBe('IN_PROGRESS');
  });

  it('records events, completes on the server and hides other children sessions', async () => {
    const { service, versionId, register } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    const batch = [event('two', 1), event('one', 2)];
    const saved = await service.submit(user, sessionId, batch);
    expect(saved).toMatchObject({
      accepted: 2,
      duplicates: 0,
      status: 'COMPLETED',
      nextAttemptIndex: 3,
    });
    expect(await service.submit(user, sessionId, batch)).toMatchObject({
      accepted: 0,
      duplicates: 2,
    });
    const other = register();
    await expect(service.get(other, sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.submit(other, sessionId, [event('one')]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores one score when the session completes, from the server-verified events', async () => {
    const { service, versionId, register, repository } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    await service.submit(user, sessionId, [event('two', 1)]);
    expect(repository.completions.has(sessionId)).toBe(false);
    const batch = [event('one', 2)];
    await service.submit(user, sessionId, batch);
    await service.submit(user, sessionId, batch); // retried batch: duplicate, no new score
    const completion = repository.completions.get(sessionId);
    expect(completion?.performance.criterionPerformance).toEqual({
      totalScoredItems: 1,
      finalizedScoredItems: 1,
      firstAttemptCorrectCount: 0,
      retryCorrectCount: 1,
      attemptCount: 2,
    });
    expect(completion?.evaluation).toEqual({
      criterionCode: '50',
      score: 50,
      minimumItemsMet: false,
      ruleVersion: 'ce-score-v1',
    });
  });

  it('completes without a score when the version has no criterion', async () => {
    const { service, versionId, register, repository } = setup();
    repository.criterionCode = null;
    const user = register();
    const { sessionId } = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    await service.submit(user, sessionId, [event('one')]);
    expect(repository.completions.get(sessionId)?.evaluation).toBeNull();
  });

  it('rejects event IDs that belong to another session', async () => {
    const { service, versionId, register } = setup();
    const user = register();
    const a = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    const reused = event('two');
    await service.submit(user, a.sessionId, [reused]);
    const b = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    await expect(service.submit(user, b.sessionId, [reused])).rejects.toEqual(
      problem('INTERACTION_ID_CONFLICT'),
    );
  });

  it('retries one lost optimistic race, then reports busy', async () => {
    const { service, versionId, register, repository } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    repository.loseNextRaces = 1;
    expect(await service.submit(user, sessionId, [event('two')])).toMatchObject(
      {
        accepted: 1,
      },
    );
    repository.loseNextRaces = 2;
    await expect(
      service.submit(user, sessionId, [event('two', 2)]),
    ).rejects.toEqual(problem('PLAY_SESSION_BUSY'));
  });

  it('abandons only running sessions', async () => {
    const { service, versionId, register } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      versionId,
      startRequestId: randomUUID(),
    });
    expect((await service.abandon(user, sessionId)).status).toBe('ABANDONED');
    await expect(
      service.submit(user, sessionId, [event('one')]),
    ).rejects.toEqual(problem('PLAY_SESSION_CLOSED'));
  });
});
