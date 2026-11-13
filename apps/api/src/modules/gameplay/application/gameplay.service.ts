import { Injectable, NotFoundException } from '@nestjs/common';
import { subject } from '@casl/ability';
import type {
  GameInteraction,
  PlayableGameQuery,
  PlaySessionView,
  StartPlaySessionInput,
  SubmitInteractionsResult,
} from '@lumikids/shared';
import { ApiProblem } from '../../../common/http/api-problem.js';
import { buildAbility } from '../../../common/security/ability.js';
import type { Principal } from '../../../common/security/principal.js';
import type { PermissionCode } from '../../../generated/prisma/enums.js';
import { PlayableGameService } from '../../learning-content/playable-game.service.js';
import { UsersService } from '../../users/users.service.js';
import {
  GameplayRuleError,
  appendInteractions,
} from '../domain/session-replay.js';
import { PlaySessionRepository } from './play-session.repository.js';
import type { PlaySessionRecord } from './play-session.repository.js';

// One reload after a lost optimistic race usually turns the batch into duplicates.
const APPEND_ATTEMPTS = 2;

function view(session: PlaySessionRecord): PlaySessionView {
  return {
    sessionId: session.sessionId,
    versionId: session.versionId,
    status: session.status,
    nextAttemptIndex: session.eventCount + 1,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class GameplayService {
  constructor(
    private readonly sessions: PlaySessionRepository,
    private readonly games: PlayableGameService,
    private readonly users: UsersService,
  ) {}

  listGames(user: Principal, query: PlayableGameQuery) {
    return this.games.list(user, query);
  }
  gameDetail(user: Principal, versionId: string) {
    return this.games.detail(user, versionId);
  }
  assetReadUrl(user: Principal, versionId: string, assetId: string) {
    return this.games.readUrl(user, versionId, assetId);
  }

  async start(
    user: Principal,
    input: StartPlaySessionInput,
  ): Promise<PlaySessionView> {
    // detail() checks PLAY_GAMES and that the version is still ACTIVE.
    await this.games.detail(user, input.versionId);
    const child = await this.users.findChildByUserId(user.userId);
    if (!child) throw new ApiProblem('CHILD_PROFILE_MISSING');
    const existing = await this.sessions.findByStartRequest(
      child.childId,
      input.startRequestId,
    );
    if (existing) return this.sameStart(existing, input.versionId);
    try {
      return view(
        await this.sessions.start({ childId: child.childId, ...input }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const retry = await this.sessions.findByStartRequest(
        child.childId,
        input.startRequestId,
      );
      if (!retry) throw error;
      return this.sameStart(retry, input.versionId);
    }
  }

  async get(user: Principal, sessionId: string): Promise<PlaySessionView> {
    return view(await this.owned(user, sessionId, 'READ_OWN_PLAY_SESSIONS'));
  }

  async submit(
    user: Principal,
    sessionId: string,
    incoming: readonly GameInteraction[],
  ): Promise<SubmitInteractionsResult> {
    let session = await this.owned(user, sessionId, 'SUBMIT_OWN_INTERACTIONS');
    const content = await this.games.versionContent(session.versionId);
    const foreign = await this.sessions.findForeignEventIds(
      sessionId,
      incoming.map((event) => event.eventId),
    );
    if (foreign.length) throw new ApiProblem('INTERACTION_ID_CONFLICT');
    for (let attempt = 1; ; attempt++) {
      const existing = await this.sessions.listInteractions(sessionId);
      let result;
      try {
        result = appendInteractions({
          content,
          status: session.status,
          existing,
          incoming,
        });
      } catch (error) {
        if (error instanceof GameplayRuleError)
          throw new ApiProblem(error.code);
        throw error;
      }
      if (
        !result.accepted.length ||
        (await this.sessions.commitAppend({
          sessionId,
          expectedEventCount: existing.length,
          accepted: result.accepted,
          completed: result.completed,
        }))
      ) {
        const saved = await this.sessions.findById(sessionId);
        if (!saved) throw new NotFoundException();
        return {
          ...view(saved),
          accepted: result.accepted.length,
          duplicates: result.duplicates,
        };
      }
      if (attempt >= APPEND_ATTEMPTS) throw new ApiProblem('PLAY_SESSION_BUSY');
      const reloaded = await this.sessions.findById(sessionId);
      if (!reloaded) throw new NotFoundException();
      session = reloaded;
    }
  }

  async abandon(user: Principal, sessionId: string): Promise<PlaySessionView> {
    const session = await this.owned(
      user,
      sessionId,
      'SUBMIT_OWN_INTERACTIONS',
    );
    if (session.status !== 'IN_PROGRESS') return view(session);
    await this.sessions.abandon(sessionId);
    const saved = await this.sessions.findById(sessionId);
    if (!saved) throw new NotFoundException();
    return view(saved);
  }

  private sameStart(session: PlaySessionRecord, versionId: string) {
    if (session.versionId !== versionId)
      throw new ApiProblem('PLAY_SESSION_REQUEST_CONFLICT');
    return view(session);
  }

  /** Ownership comes from the DB row; another child's session is reported as missing. */
  private async owned(
    user: Principal,
    sessionId: string,
    permission: Extract<
      PermissionCode,
      'SUBMIT_OWN_INTERACTIONS' | 'READ_OWN_PLAY_SESSIONS'
    >,
  ) {
    const session = await this.sessions.findById(sessionId);
    if (
      !session ||
      !buildAbility(user).can(
        permission,
        subject('PlaySession', { userId: session.ownerUserId }),
      )
    )
      throw new NotFoundException('Không tìm thấy lượt chơi.');
    return session;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
