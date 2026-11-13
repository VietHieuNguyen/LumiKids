import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import {
  applyGameAction,
  createInitialState,
  gameContentSchema,
} from '@lumikids/shared';
import type { GameInteraction } from '@lumikids/shared';
import { ApiProblem } from '../../../common/http/api-problem.js';
import type { Principal } from '../../../common/security/principal.js';
import type { PlayableGameService } from '../../learning-content/playable-game.service.js';
import type { UsersService } from '../../users/users.service.js';
import { GameplayService } from './gameplay.service.js';
import { PlaySessionRepository } from './play-session.repository.js';
import type {
  AppendCommit,
  PlaySessionRecord,
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
const child = (userId: string): Principal => ({
  userId,
  fullName: 'Trẻ test',
  email: `${userId}@lumikids.local`,
  phone: '',
  address: '',
  status: 'ACTIVE',
  roles: ['ROLE_CHILD'],
  permissions: [
    'READ_OWN_ACCOUNT',
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
  owners = new Map<string, string>();
  loseNextRaces = 0;
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
      ownerUserId: this.owners.get(data.childId) ?? '',
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
    if (commit.completed) session.status = 'COMPLETED';
    return Promise.resolve(true);
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
  const children = new Map<string, string>();
  const games = {
    detail: vi.fn((_user: Principal, id: string) =>
      id === versionId
        ? Promise.resolve({ versionId, content })
        : Promise.reject(new NotFoundException()),
    ),
    versionContent: vi.fn(() => Promise.resolve(content)),
  } as unknown as PlayableGameService;
  const users = {
    findChildByUserId: vi.fn((userId: string) => {
      const childId = children.get(userId);
      return Promise.resolve(childId ? { childId, userId } : null);
    }),
  } as unknown as UsersService;
  const register = (userId: string) => {
    const childId = randomUUID();
    children.set(userId, childId);
    repository.owners.set(childId, userId);
    return child(userId);
  };
  return {
    service: new GameplayService(repository, games, users),
    repository,
    versionId,
    register,
  };
}
const problem = (code: string) =>
  expect.objectContaining({ publicCode: code }) as ApiProblem;

describe('GameplayService (offline)', () => {
  it('requires a Child profile linked to the account', async () => {
    const { service, versionId } = setup();
    await expect(
      service.start(child(randomUUID()), {
        versionId,
        startRequestId: randomUUID(),
      }),
    ).rejects.toEqual(problem('CHILD_PROFILE_MISSING'));
  });

  it('starts idempotently and abandons the previous running session', async () => {
    const { service, versionId, register, repository } = setup();
    const user = register(randomUUID());
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
    const user = register(randomUUID());
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
    const other = register(randomUUID());
    await expect(service.get(other, sessionId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.submit(other, sessionId, [event('one')]),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects event IDs that belong to another session', async () => {
    const { service, versionId, register } = setup();
    const user = register(randomUUID());
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
    const user = register(randomUUID());
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
    const user = register(randomUUID());
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
