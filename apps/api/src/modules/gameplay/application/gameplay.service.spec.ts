import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
      session.endedAt = commit.completion.completedAt;
      this.completions.set(commit.sessionId, commit.completion);
    }
    return Promise.resolve(true);
  }
  primaryCriterionCode() {
    return Promise.resolve(this.criterionCode);
  }
  finishedPlays(childId: string) {
    return Promise.resolve(
      [...this.sessions.values()]
        .filter((session) => session.childId === childId && session.status === 'COMPLETED' && session.endedAt)
        .map((session) => ({ versionId: session.versionId, title: 'Đếm quả', gameType: 'COUNTING' as const, endedAt: session.endedAt as Date })),
    );
  }
  currentClassroom() {
    return Promise.resolve({ className: 'Lá 1', teacherNames: ['Cô Lan'] });
  }
  abandon(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session?.status === 'IN_PROGRESS') session.status = 'ABANDONED';
    return Promise.resolve();
  }
}

function setup(source: 'TEACHER' | 'GUARDIAN' = 'TEACHER') {
  const repository = new MemoryRepository();
  const versionId = randomUUID();
  const assignmentId = randomUUID();
  const games = {
    versionContent: vi.fn(() => Promise.resolve(content)),
  } as unknown as PlayableGameService;
  const register = () => child(randomUUID());
  const requirePlayableAssignment = vi.fn(() =>
    Promise.resolve({
      assignment: { source },
      ageGroup: '5-6',
      version: {
        content,
        difficulty: 'EASY',
      },
    }),
  );
  const assignments = { requirePlayableAssignment } as unknown as AssignmentsService;
  return {
    service: new GameplayService(repository, games, assignments),
    repository,
    versionId,
    assignmentId,
    register,
  };
}
const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;

describe('GameplayService (offline)', () => {
  it('cannot reuse a start request on a different assignment for the same game', async () => {
    const { service, versionId, assignmentId, register } = setup();
    const player = register();
    const startRequestId = randomUUID();
    const first = await service.start(player, { assignmentId, versionId, startRequestId });
    expect(await service.start(player, { assignmentId, versionId, startRequestId })).toEqual(first);
    await expect(
      service.start(player, { assignmentId: randomUUID(), versionId, startRequestId }),
    ).rejects.toEqual(problem('PLAY_SESSION_REQUEST_CONFLICT'));
  });

  it.each([['TEACHER', 'SCHOOL'], ['GUARDIAN', 'HOME']] as const)(
    'records the assignment and settings when the source is %s',
    async (source, context) => {
      const { service, versionId, assignmentId, register, repository } =
        setup(source);
      const player = register();
      const { sessionId } = await service.start(player, {
        assignmentId,
        versionId,
        startRequestId: randomUUID(),
      });
      expect(repository.sessions.get(sessionId)).toMatchObject({
        childId: player.childId,
        assignmentId,
        versionId,
        context,
        ageGroup: '5-6',
        difficulty: 'EASY',
        hintLimitPerTask: 1,
      });
    },
  );

  it('starts idempotently and abandons the previous running session', async () => {
    const { service, versionId, assignmentId, register, repository } = setup();
    const user = register();
    const startRequestId = randomUUID();
    const first = await service.start(user, { assignmentId, versionId, startRequestId });
    expect(await service.start(user, { assignmentId, versionId, startRequestId })).toEqual(
      first,
    );
    await expect(
      service.start(user, { assignmentId, versionId: randomUUID(), startRequestId }),
    ).rejects.toEqual(problem('PLAY_SESSION_REQUEST_CONFLICT'));
    const second = await service.start(user, {
      assignmentId,
      versionId,
      startRequestId: randomUUID(),
    });
    expect(repository.sessions.get(first.sessionId)?.status).toBe('ABANDONED');
    expect(second.status).toBe('IN_PROGRESS');
  });

  it('records events, completes on the server and hides other children sessions', async () => {
    const { service, versionId, assignmentId, register } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      assignmentId,
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
    const { service, versionId, assignmentId, register, repository } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      assignmentId,
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
      hintCorrectCount: 0,
      hintCount: 0,
      attemptCount: 2,
    });
    expect(completion?.evaluation).toEqual({
      criterionCode: '50',
      score: 50,
      minimumItemsMet: false,
      ruleVersion: 'ce-score-v2',
    });
  });

  it("shows the child what they finished and where they learn, never a score", async () => {
    const { service, versionId, assignmentId, register } = setup();
    const user = register();
    expect(await service.corner(user)).toMatchObject({ finishedGames: 0, stickers: [] });
    const { sessionId } = await service.start(user, { assignmentId, versionId, startRequestId: randomUUID() });
    await service.submit(user, sessionId, [event('two', 1), event('one', 2)]);
    const corner = await service.corner(user);
    expect(corner).toMatchObject({
      fullName: user.fullName,
      classroom: { className: 'Lá 1', teacherNames: ['Cô Lan'] },
      finishedGames: 1,
      finishedPlays: 1,
    });
    expect(corner.playedThisWeek[corner.todayIndex]).toBe(true);
    expect(JSON.stringify(corner)).not.toMatch(/score|performance/i);
  });

  it('completes without a score when the version has no criterion', async () => {
    const { service, versionId, assignmentId, register, repository } = setup();
    repository.criterionCode = null;
    const user = register();
    const { sessionId } = await service.start(user, {
      assignmentId,
      versionId,
      startRequestId: randomUUID(),
    });
    await service.submit(user, sessionId, [event('one')]);
    expect(repository.completions.get(sessionId)?.evaluation).toBeNull();
  });

  it('rejects event IDs that belong to another session', async () => {
    const { service, versionId, assignmentId, register } = setup();
    const user = register();
    const a = await service.start(user, {
      assignmentId,
      versionId,
      startRequestId: randomUUID(),
    });
    const reused = event('two');
    await service.submit(user, a.sessionId, [reused]);
    const b = await service.start(user, {
      assignmentId,
      versionId,
      startRequestId: randomUUID(),
    });
    await expect(service.submit(user, b.sessionId, [reused])).rejects.toEqual(
      problem('INTERACTION_ID_CONFLICT'),
    );
  });

  it('retries one lost optimistic race, then reports busy', async () => {
    const { service, versionId, assignmentId, register, repository } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      assignmentId,
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
    const { service, versionId, assignmentId, register } = setup();
    const user = register();
    const { sessionId } = await service.start(user, {
      assignmentId,
      versionId,
      startRequestId: randomUUID(),
    });
    expect((await service.abandon(user, sessionId)).status).toBe('ABANDONED');
    await expect(
      service.submit(user, sessionId, [event('one')]),
    ).rejects.toEqual(problem('PLAY_SESSION_CLOSED'));
  });
});
