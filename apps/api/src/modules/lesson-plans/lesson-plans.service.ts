import { Injectable } from '@nestjs/common';
import type {
  LessonPlan,
  LessonPlanQuery,
  LessonPlanSummary,
} from '@lumikids/shared';
import { createLessonPlanSchema, saveLessonPlanSchema } from '@lumikids/shared';
import type { z } from 'zod';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { Principal } from '../../common/security/principal.js';
import { LessonPlansRepository } from './lesson-plans.repository.js';
import type {
  LessonPlanData,
  LessonPlanRow,
  LessonPlanSummaryRow,
} from './lesson-plans.repository.js';

type CreateData = z.infer<typeof createLessonPlanSchema>;
type SaveData = z.infer<typeof saveLessonPlanSchema>;

/** Curriculum scope of the product (CLAUDE.md): Chuẩn 15–17 only. */
const SKILL_CODES = new Set(['15', '16', '17']);

function summary(row: LessonPlanSummaryRow): LessonPlanSummary {
  return {
    lessonPlanId: row.lessonPlanId,
    title: row.title,
    topic: row.topic,
    ageGroupId: row.ageGroupId,
    ageGroupName: row.ageGroup?.name ?? null,
    skillCode: row.skillCode,
    skillName: row.skill?.name ?? null,
    durationMinutes: row.durationMinutes,
    status: row.status,
    revision: row.revision,
    blockCount: row.blocks.length,
    gameCount: new Set(row.blocks.flatMap((block) => (block.versionId ? [block.versionId] : []))).size,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function detail(row: LessonPlanRow): LessonPlan {
  return {
    ...summary(row),
    objectives: row.objectives,
    preparation: row.preparation,
    evaluation: row.evaluation,
    sourceLessonPlanId: row.sourceLessonPlanId,
    updatedByName: row.editor.fullName,
    blocks: row.blocks.map((block) => ({
      blockId: block.blockId,
      position: block.position,
      title: block.title,
      instruction: block.instruction,
      durationMinutes: block.durationMinutes,
      game: block.version
        ? {
            versionId: block.version.versionId,
            name: block.version.activity.name,
            gameType: block.version.gameType,
            available: block.version.activity.status === 'ACTIVE',
          }
        : null,
    })),
  };
}

/**
 * Manual lesson plans (UC-AI-02 without the AI draft): four sections — objectives, preparation, the
 * progression as ordered blocks, evaluation. Each teacher manages their own plans.
 */
@Injectable()
export class LessonPlansService {
  constructor(private readonly repository: LessonPlansRepository) {}

  private async requireOwn(teacher: Principal, lessonPlanId: string): Promise<LessonPlanRow> {
    const row = await this.repository.find(teacher.userId, lessonPlanId);
    if (!row) throw new ApiProblem('LESSON_PLAN_NOT_FOUND');
    return row;
  }

  /** References must exist; a game newly attached must still be in the library. */
  private async validate(data: CreateData | SaveData, keep: ReadonlySet<string> = new Set()) {
    if (data.ageGroupId && !(await this.repository.ageGroupExists(data.ageGroupId)))
      throw new ApiProblem('AGE_GROUP_INVALID');
    if (data.skillCode && (!SKILL_CODES.has(data.skillCode) || !(await this.repository.skillExists(data.skillCode))))
      throw new ApiProblem('LESSON_PLAN_INCOMPLETE');
    const added = [
      ...new Set(data.blocks.flatMap((block) => (block.versionId && !keep.has(block.versionId) ? [block.versionId] : []))),
    ];
    if (added.length) {
      const active = await this.repository.activeVersionIds(added);
      if (active.length !== added.length) throw new ApiProblem('LESSON_PLAN_GAME_INVALID');
    }
  }

  private static toData(data: CreateData | SaveData, status: 'DRAFT' | 'COMPLETE'): LessonPlanData {
    if (
      status === 'COMPLETE' &&
      (!data.objectives || !data.preparation || !data.evaluation || data.blocks.length === 0)
    )
      throw new ApiProblem('LESSON_PLAN_INCOMPLETE');
    return {
      title: data.title,
      topic: data.topic,
      ageGroupId: data.ageGroupId,
      skillCode: data.skillCode,
      durationMinutes: data.durationMinutes,
      objectives: data.objectives,
      preparation: data.preparation,
      evaluation: data.evaluation,
      status,
      blocks: data.blocks,
    };
  }

  async list(teacher: Principal, query: LessonPlanQuery): Promise<LessonPlanSummary[]> {
    return (await this.repository.list(teacher.userId, query)).map(summary);
  }

  async detail(teacher: Principal, lessonPlanId: string): Promise<LessonPlan> {
    return detail(await this.requireOwn(teacher, lessonPlanId));
  }

  async create(teacher: Principal, input: CreateData): Promise<LessonPlan> {
    await this.validate(input);
    const id = await this.repository.create(teacher.userId, LessonPlansService.toData(input, 'DRAFT'));
    return this.detail(teacher, id);
  }

  /** Full save with conflict detection: a stale `revision` means someone saved in between (AC-04). */
  async save(teacher: Principal, lessonPlanId: string, input: SaveData): Promise<LessonPlan> {
    const current = await this.requireOwn(teacher, lessonPlanId);
    if (current.revision !== input.revision) throw new ApiProblem('LESSON_PLAN_CONFLICT');
    const kept = new Set(current.blocks.flatMap((block) => (block.versionId ? [block.versionId] : [])));
    await this.validate(input, kept);
    const saved = await this.repository.save(
      lessonPlanId,
      teacher.userId,
      input.revision,
      LessonPlansService.toData(input, input.status),
    );
    if (!saved) throw new ApiProblem('LESSON_PLAN_CONFLICT');
    return this.detail(teacher, lessonPlanId);
  }

  /** A new draft copy; archived games stay attached (they show as unavailable). */
  async duplicate(teacher: Principal, lessonPlanId: string): Promise<LessonPlan> {
    const source = await this.requireOwn(teacher, lessonPlanId);
    const id = await this.repository.create(
      teacher.userId,
      {
        title: `${source.title} (bản sao)`.slice(0, 200),
        topic: source.topic,
        ageGroupId: source.ageGroupId,
        skillCode: source.skillCode,
        durationMinutes: source.durationMinutes,
        objectives: source.objectives,
        preparation: source.preparation,
        evaluation: source.evaluation,
        status: 'DRAFT',
        blocks: source.blocks.map((block) => ({
          title: block.title,
          instruction: block.instruction,
          durationMinutes: block.durationMinutes,
          versionId: block.versionId,
        })),
      },
      source.lessonPlanId,
    );
    return this.detail(teacher, id);
  }

  async remove(teacher: Principal, lessonPlanId: string): Promise<void> {
    await this.requireOwn(teacher, lessonPlanId);
    await this.repository.remove(lessonPlanId);
  }
}
