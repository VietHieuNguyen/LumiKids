import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ageGroupAccepts,
  ageInMonths,
  assignmentState,
  canStart,
  vietnamDate,
  gameContentSchema,
  getGameContentAssetIds,
  playableUntil,
} from '@lumikids/shared';
import type {
  AssignmentDetail,
  AssignmentGame,
  AssignmentSummary,
  ChildAssignment,
  CreateAssignmentData,
  DecideReplayInput,
  ExtendAssignmentInput,
  FamilyActivity,
  UpdateAssignmentInput,
} from '@lumikids/shared';
import { ApiProblem } from '../../common/http/api-problem.js';
import type {
  ChildPrincipal,
  Principal,
} from '../../common/security/principal.js';
import { ClassroomsService } from '../classrooms/classrooms.service.js';
import { recipientProgress, sessionsByChild } from './assignment-progress.js';
import { AssignmentsRepository } from './assignments.repository.js';
import type {
  AssignmentRow,
  AssignmentVersion,
  SessionFact,
} from './assignments.repository.js';

const NOT_FOUND = 'Không tìm thấy bài giao.';

function game(version: AssignmentVersion): AssignmentGame {
  return {
    versionId: version.versionId,
    name: version.activity.name,
    gameType: version.gameType,
    difficulty: version.difficulty,
    available: version.activity.status === 'ACTIVE',
  };
}
function coverAssetIds(version: AssignmentVersion): string[] {
  const parsed = gameContentSchema.safeParse(version.content);
  return parsed.success ? getGameContentAssetIds(parsed.data).slice(0, 3) : [];
}

/** Teacher assignments and the child's view of them (3-layer, learning-content). */
@Injectable()
export class AssignmentsService {
  /** Overridable clock for tests. */
  now: () => Date = () => new Date();

  constructor(
    private readonly repository: AssignmentsRepository,
    private readonly classrooms: ClassroomsService,
  ) {}

  /**
   * R-01: every game must have an age group, and every recipient's age in months on the opening day
   * (Vietnam date) must fall in it. Games must still be ACTIVE in the library.
   */
  async requireAgeFit(
    versionIds: readonly string[],
    childIds: readonly string[],
    opensAt: Date,
  ): Promise<void> {
    const versions = await this.repository.playableVersions(versionIds);
    if (versions.length !== versionIds.length)
      throw new ApiProblem('ASSIGNMENT_GAMES_INVALID');
    const groups = versions.map((version) => version.activity.ageGroup);
    if (groups.some((group) => group === null))
      throw new ApiProblem('GAME_AGE_GROUP_MISSING');
    const day = vietnamDate(opensAt);
    const children = await this.repository.childDobs(childIds);
    for (const child of children) {
      const months = ageInMonths(child.dob.toISOString().slice(0, 10), day);
      if (groups.some((group) => group && !ageGroupAccepts(group, months)))
        throw new ApiProblem('ASSIGNMENT_AGE_MISMATCH');
    }
  }

  // ---------- Guardian: family picks (child without a class) ----------

  /** The caller (family service) has checked that the guardian manages this child. */
  async createFamilyPick(
    guardian: Principal,
    childId: string,
    input: { title: string; versionIds: string[]; dueAt: string | null },
  ): Promise<FamilyActivity> {
    if (await this.classrooms.currentClassId(childId))
      throw new ApiProblem('FAMILY_CHILD_CLASS_MANAGED');
    const now = this.now();
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && dueAt <= now) throw new ApiProblem('ASSIGNMENT_PERIOD_INVALID');
    await this.requireAgeFit(input.versionIds, [childId], now);
    const assignmentId = await this.repository.create({
      source: 'GUARDIAN',
      classId: null,
      title: input.title,
      note: '',
      createdBy: guardian.userId,
      opensAt: now,
      dueAt,
      targetType: 'CHILDREN',
      targetLabel: 'Phụ huynh chọn',
      versionIds: input.versionIds,
      childIds: [childId],
    });
    const created = (await this.familyPicks(childId)).find(
      (item) => item.assignmentId === assignmentId,
    );
    if (!created) throw new NotFoundException(NOT_FOUND);
    return created;
  }

  async familyPicks(childId: string): Promise<FamilyActivity[]> {
    const rows = await this.repository.listFamilyPicks(childId);
    if (!rows.length) return [];
    const versionIds = [
      ...new Set(rows.flatMap((row) => row.items.map((i) => i.version.versionId))),
    ];
    const since = new Date(Math.min(...rows.map((row) => row.opensAt.getTime())));
    const sessions = await this.repository.sessions([childId], versionIds, since);
    const now = this.now();
    return rows.map((row) => {
      const ids = row.items.map((item) => item.version.versionId);
      const done = new Set(
        recipientProgress(ids, row.opensAt, sessions).completedVersionIds,
      );
      const state = assignmentState(row, now);
      return {
        assignmentId: row.assignmentId,
        title: row.title,
        opensAt: row.opensAt.toISOString(),
        dueAt: row.dueAt?.toISOString() ?? null,
        state: state === 'UPCOMING' ? 'OPEN' : state,
        games: row.items.map(({ version }) => ({
          versionId: version.versionId,
          name: version.activity.name,
          completed: done.has(version.versionId),
          available: version.activity.status === 'ACTIVE',
        })),
      };
    });
  }

  async cancelFamilyPick(childId: string, assignmentId: string): Promise<void> {
    const row = await this.repository.findFamilyPick(childId, assignmentId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.status === 'CANCELLED') return;
    await this.repository.update(assignmentId, { status: 'CANCELLED' });
  }

  // ---------- Teacher ----------

  async create(
    teacher: Principal,
    classId: string,
    input: CreateAssignmentData,
  ): Promise<AssignmentDetail> {
    await this.classrooms.requireTeacherOfActive(teacher, classId);
    const now = this.now();
    const opensAt = input.opensAt ? new Date(input.opensAt) : now;
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && (dueAt <= opensAt || dueAt <= now))
      throw new ApiProblem('ASSIGNMENT_PERIOD_INVALID');

    const current = await this.classrooms.currentChildren(classId);
    const inClass = new Set(current.map((child) => child.childId));
    let childIds: string[];
    let targetLabel: string;
    if (input.target.type === 'CLASS') {
      childIds = current.map((child) => child.childId);
      targetLabel = 'Cả lớp';
    } else if (input.target.type === 'GROUP') {
      const group = await this.classrooms.group(classId, input.target.groupId);
      childIds = group.childIds;
      targetLabel = `Nhóm ${group.name}`.slice(0, 120);
    } else {
      if (input.target.childIds.some((id) => !inClass.has(id)))
        throw new ApiProblem('ASSIGNMENT_RECIPIENTS_INVALID');
      childIds = input.target.childIds;
      targetLabel = `${childIds.length} trẻ`;
    }
    if (!childIds.length) throw new ApiProblem('ASSIGNMENT_NO_RECIPIENTS');
    await this.requireAgeFit(input.versionIds, childIds, opensAt);

    const assignmentId = await this.repository.create({
      classId,
      title: input.title,
      note: input.note,
      createdBy: teacher.userId,
      opensAt,
      dueAt,
      targetType: input.target.type,
      targetLabel,
      versionIds: input.versionIds,
      childIds,
    });
    return this.detail(teacher, classId, assignmentId);
  }

  async list(
    teacher: Principal,
    classId: string,
  ): Promise<AssignmentSummary[]> {
    await this.classrooms.requireTeacherOf(teacher, classId);
    return this.listForClass(classId);
  }
  /** Admin, read-only: any class (404 when it does not exist). */
  async adminList(classId: string): Promise<AssignmentSummary[]> {
    await this.classrooms.classroom(classId);
    return this.listForClass(classId);
  }
  private async listForClass(classId: string): Promise<AssignmentSummary[]> {
    const rows = await this.repository.listForClass(classId);
    if (!rows.length) return [];
    const childIds = [
      ...new Set(rows.flatMap((row) => row.recipients.map((r) => r.childId))),
    ];
    const versionIds = [
      ...new Set(
        rows.flatMap((row) => row.items.map((item) => item.version.versionId)),
      ),
    ];
    const since = new Date(
      Math.min(...rows.map((row) => row.opensAt.getTime())),
    );
    const byChild = sessionsByChild(
      await this.repository.sessions(childIds, versionIds, since),
    );
    const now = this.now();
    return rows.map((row) => this.summary(row, byChild, now));
  }

  private summary(
    row: AssignmentRow,
    byChild: Map<string, SessionFact[]>,
    now: Date,
  ): AssignmentSummary {
    const versionIds = row.items.map((item) => item.version.versionId);
    const completedCount = row.recipients.filter(
      (recipient) =>
        recipientProgress(
          versionIds,
          row.opensAt,
          byChild.get(recipient.childId) ?? [],
        ).completionStatus === 'COMPLETED',
    ).length;
    return {
      assignmentId: row.assignmentId,
      title: row.title,
      note: row.note,
      opensAt: row.opensAt.toISOString(),
      dueAt: row.dueAt?.toISOString() ?? null,
      state: assignmentState(row, now),
      targetType: row.targetType,
      targetLabel: row.targetLabel,
      createdByName: row.creator.fullName,
      gameCount: row.items.length,
      recipientCount: row.recipients.length,
      completedCount,
      pendingReplayCount: row.recipients.filter(
        (recipient) => recipient.replayRequests.length > 0,
      ).length,
    };
  }

  async detail(
    teacher: Principal,
    classId: string,
    assignmentId: string,
  ): Promise<AssignmentDetail> {
    await this.classrooms.requireTeacherOf(teacher, classId);
    return this.detailForClass(classId, assignmentId);
  }
  /** Admin, read-only. find() is scoped to the class, so another class's assignment is a 404. */
  adminDetail(
    classId: string,
    assignmentId: string,
  ): Promise<AssignmentDetail> {
    return this.detailForClass(classId, assignmentId);
  }
  private async detailForClass(
    classId: string,
    assignmentId: string,
  ): Promise<AssignmentDetail> {
    const row = await this.repository.find(classId, assignmentId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    const versionIds = row.items.map((item) => item.version.versionId);
    const childIds = row.recipients.map((recipient) => recipient.childId);
    const [byChild, names, current] = await Promise.all([
      this.repository
        .sessions(childIds, versionIds, row.opensAt)
        .then(sessionsByChild),
      this.classrooms.childNames(childIds),
      this.classrooms.currentChildren(classId),
    ]);
    const inClass = new Set(current.map((child) => child.childId));
    return {
      ...this.summary(row, byChild, this.now()),
      games: row.items.map((item) => game(item.version)),
      recipients: row.recipients
        .map((recipient) => {
          const progress = recipientProgress(
            versionIds,
            row.opensAt,
            byChild.get(recipient.childId) ?? [],
          );
          const pending = recipient.replayRequests[0];
          return {
            childId: recipient.childId,
            fullName: names.get(recipient.childId) ?? '',
            inClass: inClass.has(recipient.childId),
            extendedUntil: recipient.extendedUntil?.toISOString() ?? null,
            ...progress,
            pendingReplay: pending
              ? {
                  requestId: pending.requestId,
                  requestedAt: pending.requestedAt.toISOString(),
                }
              : null,
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi')),
    };
  }

  private async requireOpenForChanges(
    teacher: Principal,
    classId: string,
    assignmentId: string,
  ) {
    await this.classrooms.requireTeacherOfActive(teacher, classId);
    const row = await this.repository.find(classId, assignmentId);
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.status === 'CANCELLED')
      throw new ApiProblem('ASSIGNMENT_CANCELLED');
    return row;
  }

  async update(
    teacher: Principal,
    classId: string,
    assignmentId: string,
    input: UpdateAssignmentInput,
  ): Promise<AssignmentDetail> {
    const row = await this.requireOpenForChanges(
      teacher,
      classId,
      assignmentId,
    );
    let dueAt: Date | null | undefined;
    if (input.dueAt !== undefined) {
      dueAt = input.dueAt === null ? null : new Date(input.dueAt);
      if (dueAt && (dueAt <= row.opensAt || dueAt <= this.now()))
        throw new ApiProblem('ASSIGNMENT_PERIOD_INVALID');
    }
    await this.repository.update(assignmentId, {
      title: input.title,
      note: input.note,
      dueAt,
      status: input.status,
    });
    return this.detail(teacher, classId, assignmentId);
  }

  /** "Giao lại": these children may start the games again until `until`. */
  async extend(
    teacher: Principal,
    classId: string,
    assignmentId: string,
    input: ExtendAssignmentInput,
  ): Promise<AssignmentDetail> {
    const row = await this.requireOpenForChanges(
      teacher,
      classId,
      assignmentId,
    );
    const until = new Date(input.until);
    if (until <= this.now()) throw new ApiProblem('ASSIGNMENT_PERIOD_INVALID');
    const recipients = new Set(
      row.recipients.map((recipient) => recipient.childId),
    );
    if (input.childIds.some((id) => !recipients.has(id)))
      throw new ApiProblem('ASSIGNMENT_RECIPIENTS_INVALID');
    await this.repository.extend(assignmentId, input.childIds, until);
    return this.detail(teacher, classId, assignmentId);
  }

  async decideReplay(
    teacher: Principal,
    classId: string,
    assignmentId: string,
    requestId: string,
    input: DecideReplayInput,
  ): Promise<AssignmentDetail> {
    await this.requireOpenForChanges(teacher, classId, assignmentId);
    const request = await this.repository.findRequest(assignmentId, requestId);
    if (!request)
      throw new NotFoundException('Không tìm thấy yêu cầu chơi lại.');
    if (request.status !== 'PENDING')
      throw new ApiProblem('REPLAY_ALREADY_DECIDED');
    const now = this.now();
    const until = input.approve && input.until ? new Date(input.until) : null;
    if (input.approve && (!until || until <= now))
      throw new ApiProblem('ASSIGNMENT_PERIOD_INVALID');
    const decided = await this.repository.decide(request, {
      approve: input.approve,
      until,
      decidedBy: teacher.userId,
      now,
    });
    if (!decided) throw new ApiProblem('REPLAY_ALREADY_DECIDED');
    return this.detail(teacher, classId, assignmentId);
  }

  // ---------- Child ----------

  /** The child's current-class assignments that have opened, open ones first. */
  async forChild(child: ChildPrincipal): Promise<ChildAssignment[]> {
    const classId = await this.classrooms.currentClassId(child.childId);
    const now = this.now();
    const rows = await this.repository.forChild(child.childId, classId, now);
    if (!rows.length) return [];
    const versionIds = [
      ...new Set(
        rows.flatMap((row) =>
          row.assignment.items.map((item) => item.version.versionId),
        ),
      ),
    ];
    const since = new Date(
      Math.min(...rows.map((row) => row.assignment.opensAt.getTime())),
    );
    const sessions = await this.repository.sessions(
      [child.childId],
      versionIds,
      since,
    );
    const items = rows.map((row): ChildAssignment => {
      const assignment = row.assignment;
      const ids = assignment.items.map((item) => item.version.versionId);
      const progress = recipientProgress(ids, assignment.opensAt, sessions);
      const done = new Set(progress.completedVersionIds);
      const until = playableUntil(assignment, row.extendedUntil);
      const request = row.replayRequests[0];
      return {
        assignmentId: assignment.assignmentId,
        title: assignment.title,
        note: assignment.note,
        dueAt: assignment.dueAt?.toISOString() ?? null,
        playableUntil: until?.toISOString() ?? null,
        state: canStart(assignment, row.extendedUntil, now) ? 'OPEN' : 'CLOSED',
        completionStatus: progress.completionStatus,
        games: assignment.items.map(({ version }) => ({
          versionId: version.versionId,
          name: version.activity.name,
          gameType: version.gameType,
          difficulty: version.difficulty,
          coverAssetIds: coverAssetIds(version),
          completed: done.has(version.versionId),
          available: version.activity.status === 'ACTIVE',
        })),
        replayRequest: request
          ? {
              status: request.status,
              requestedAt: request.requestedAt.toISOString(),
              grantedUntil: request.grantedUntil?.toISOString() ?? null,
            }
          : null,
      };
    });
    // Open first (nearest deadline first, no deadline last), then closed (most recent first).
    const deadline = (item: ChildAssignment) =>
      item.playableUntil ? Date.parse(item.playableUntil) : Infinity;
    return [
      ...items
        .filter((item) => item.state === 'OPEN')
        .sort((a, b) => deadline(a) - deadline(b)),
      ...items.filter((item) => item.state === 'CLOSED'),
    ];
  }

  async requestReplay(child: ChildPrincipal, assignmentId: string) {
    const recipient = await this.repository.findRecipient(
      child.childId,
      assignmentId,
    );
    const classId = await this.classrooms.currentClassId(child.childId);
    const now = this.now();
    // Family picks have no teacher to ask: the guardian simply picks again.
    if (
      !recipient ||
      !classId ||
      recipient.assignment.classId !== classId ||
      recipient.assignment.status !== 'ACTIVE' ||
      recipient.assignment.opensAt > now
    )
      throw new NotFoundException(NOT_FOUND);
    if (canStart(recipient.assignment, recipient.extendedUntil, now))
      throw new ApiProblem('REPLAY_NOT_NEEDED');
    const request = await this.repository.requestReplay(recipient.recipientId);
    return {
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      grantedUntil: request.grantedUntil?.toISOString() ?? null,
    };
  }

  /** Versions the child may start right now; the single gate used by every gameplay entry point. */
  async playableVersionIds(childId: string): Promise<Set<string>> {
    const classId = await this.classrooms.currentClassId(childId);
    const now = this.now();
    const rows = await this.repository.forChild(childId, classId, now);
    return new Set(
      rows
        .filter((row) => canStart(row.assignment, row.extendedUntil, now))
        .flatMap((row) =>
          row.assignment.items.map((item) => item.version.versionId),
        ),
    );
  }
}
