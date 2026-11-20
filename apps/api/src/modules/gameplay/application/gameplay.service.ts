import { Injectable, NotFoundException } from '@nestjs/common';
import { subject } from '@casl/ability';
import type {
  ChildCorner,
  GameContent,
  GameInteraction,
  PlayableGameQuery,
  PlaySessionView,
  StartPlaySessionInput,
  SubmitInteractionsResult,
} from '@lumikids/shared';
import { ApiProblem } from '../../../common/http/api-problem.js';
import { buildAbility } from '../../../common/security/ability.js';
import type { ChildPrincipal } from '../../../common/security/principal.js';
import type { PermissionCode } from '../../../generated/prisma/enums.js';
import { AssignmentsService } from '../../learning-content/assignments.service.js';
import { PlayableGameService } from '../../learning-content/playable-game.service.js';
import { evaluateCriterion } from '../domain/criterion-evaluation.js';
import { computeSessionPerformance } from '../domain/session-performance.js';
import { summarizeChildPlays } from '../domain/child-corner.js';
import {
  GameplayRuleError,
  appendInteractions,
} from '../domain/session-replay.js';
import { PlaySessionRepository } from './play-session.repository.js';
import type {
  PlaySessionRecord,
  SessionCompletion,
} from './play-session.repository.js';

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
    private readonly assignments: AssignmentsService,
  ) {}

  /** "Góc của bé": who the child is, where they learn and what they finished (never scores). */
  async corner(child: ChildPrincipal, now = new Date()): Promise<ChildCorner> {
    const [plays, classroom] = await Promise.all([
      this.sessions.finishedPlays(child.childId, 1000),
      this.sessions.currentClassroom(child.childId),
    ]);
    return { fullName: child.fullName, classroom, ...summarizeChildPlays(plays, now) };
  }

  /** What the child has been given to play, open assignments first. */
  listAssignments(child: ChildPrincipal) {
    return this.assignments.forChild(child);
  }
  requestReplay(child: ChildPrincipal, assignmentId: string) {
    return this.assignments.requestReplay(child, assignmentId);
  }

  listGames(child: ChildPrincipal, query: PlayableGameQuery) {
    return this.games.list(child, query);
  }
  gameDetail(child: ChildPrincipal, versionId: string) {
    return this.games.detail(child, versionId);
  }
  assetReadUrl(child: ChildPrincipal, versionId: string, assetId: string) {
    return this.games.readUrl(child, versionId, assetId);
  }

  async start(
    child: ChildPrincipal,
    input: StartPlaySessionInput,
  ): Promise<PlaySessionView> {
    // detail() checks PLAY_GAMES and that the version is still ACTIVE.
    await this.games.detail(child, input.versionId);
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

  async get(
    child: ChildPrincipal,
    sessionId: string,
  ): Promise<PlaySessionView> {
    return view(await this.owned(child, sessionId, 'READ_OWN_PLAY_SESSIONS'));
  }

  async submit(
    child: ChildPrincipal,
    sessionId: string,
    incoming: readonly GameInteraction[],
  ): Promise<SubmitInteractionsResult> {
    let session = await this.owned(child, sessionId, 'SUBMIT_OWN_INTERACTIONS');
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
          completion: result.completed
            ? await this.completion(session, content, [
                ...existing,
                ...result.accepted,
              ])
            : null,
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

  async abandon(
    child: ChildPrincipal,
    sessionId: string,
  ): Promise<PlaySessionView> {
    const session = await this.owned(
      child,
      sessionId,
      'SUBMIT_OWN_INTERACTIONS',
    );
    if (session.status !== 'IN_PROGRESS') return view(session);
    await this.sessions.abandon(sessionId);
    const saved = await this.sessions.findById(sessionId);
    if (!saved) throw new NotFoundException();
    return view(saved);
  }

  /** SessionPerformance and score from the server-verified events of the completing batch. */
  private async completion(
    session: PlaySessionRecord,
    content: GameContent,
    events: readonly GameInteraction[],
  ): Promise<SessionCompletion> {
    const completedAt = new Date();
    const performance = computeSessionPerformance({
      content,
      events,
      criterionCode: await this.sessions.primaryCriterionCode(
        session.versionId,
      ),
      startedAt: session.startedAt,
      endedAt: completedAt,
    });
    return {
      completedAt,
      performance,
      evaluation: evaluateCriterion(performance),
    };
  }

  private sameStart(session: PlaySessionRecord, versionId: string) {
    if (session.versionId !== versionId)
      throw new ApiProblem('PLAY_SESSION_REQUEST_CONFLICT');
    return view(session);
  }

  /** Ownership comes from the DB row; another child's session is reported as missing. */
  private async owned(
    child: ChildPrincipal,
    sessionId: string,
    permission: Extract<
      PermissionCode,
      'SUBMIT_OWN_INTERACTIONS' | 'READ_OWN_PLAY_SESSIONS'
    >,
  ) {
    const session = await this.sessions.findById(sessionId);
    if (
      !session ||
      !buildAbility(child).can(
        permission,
        subject('PlaySession', { childId: session.childId }),
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
