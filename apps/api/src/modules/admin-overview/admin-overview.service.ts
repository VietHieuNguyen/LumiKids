import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { AdminOverview } from '@lumikids/shared';
import appConfig from '../../common/config/app.config.js';
import { AdminOverviewRepository } from './admin-overview.repository.js';
import {
  SCHOOL_TIME_ZONE,
  currentYear,
  fillDays,
  localDay,
  shiftDay,
} from './overview-calendar.js';

const DAYS = 14;
/** A teacher in charge of a class who has not signed in for this long needs a nudge. */
const DORMANT_DAYS = 14;

@Injectable()
export class AdminOverviewService {
  /** Overridable in tests. */
  now = () => new Date();

  constructor(
    private readonly repository: AdminOverviewRepository,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async overview(): Promise<AdminOverview> {
    const now = this.now();
    const today = localDay(now, SCHOOL_TIME_ZONE);
    const firstDay = shiftDay(today, -(DAYS - 1));
    const weekStart = shiftDay(today, -6);
    const [
      years,
      classes,
      teachers,
      games,
      unassigned,
      withoutCode,
      archived,
      replays,
      daily,
      active,
    ] = await Promise.all([
      this.repository.schoolYears(),
      this.repository.activeClasses(now),
      this.repository.activeTeachers(),
      this.repository.libraryGames(),
      this.repository.unassignedChildren(this.config.devMode),
      this.repository.childrenWithoutCode(),
      this.repository.archivedGamesInOpenAssignments(now),
      this.repository.pendingReplayRequests(),
      this.repository.daily(firstDay, SCHOOL_TIME_ZONE, this.config.devMode),
      this.repository.activeChildren(weekStart, SCHOOL_TIME_ZONE, this.config.devMode),
    ]);
    const days = fillDays(daily, today, DAYS);
    const sum = (list: typeof days, key: 'sessions' | 'completed') =>
      list.reduce((total, day) => total + day[key], 0);
    const thisWeek = days.slice(-7);
    const lastWeek = days.slice(0, -7);
    const activeByClass = new Map(
      active.perClass.map((row) => [row.classId, row.children]),
    );
    const dormantBefore = now.getTime() - DORMANT_DAYS * 86_400_000;
    const ref = (row: { classId: string; className: string }) => ({
      classId: row.classId,
      className: row.className,
    });
    return {
      generatedAt: now.toISOString(),
      schoolYear: currentYear(
        years.map((year) => ({
          schoolYearId: year.schoolYearId,
          name: year.name,
          startDate: year.startDate.toISOString().slice(0, 10),
          endDate: year.endDate.toISOString().slice(0, 10),
        })),
        today,
      ),
      totals: {
        activeClasses: classes.length,
        enrolledChildren: classes.reduce(
          (total, row) => total + row._count.enrollments,
          0,
        ),
        activeTeachers: teachers.length,
        libraryGames: games,
      },
      days,
      week: {
        sessions: sum(thisWeek, 'sessions'),
        previousSessions: sum(lastWeek, 'sessions'),
        completed: sum(thisWeek, 'completed'),
        activeChildren: active.total,
      },
      attention: {
        unassignedChildren: unassigned,
        childrenWithoutCode: withoutCode,
        classesWithoutTeacher: classes
          .filter((row) => row.teachers.length === 0)
          .map(ref),
        classesWithoutChildren: classes
          .filter((row) => row._count.enrollments === 0)
          .map(ref),
        classesWithoutOpenAssignment: classes
          .filter(
            (row) => row._count.enrollments > 0 && row._count.assignments === 0,
          )
          .map(ref),
        dormantTeachers: teachers
          .filter((teacher) => teacher.classrooms.length > 0)
          .filter(
            (teacher) =>
              (teacher.authSessions[0]?.createdAt.getTime() ?? 0) <
              dormantBefore,
          )
          .map((teacher) => ({
            userId: teacher.userId,
            fullName: teacher.fullName,
            lastLoginAt:
              teacher.authSessions[0]?.createdAt.toISOString() ?? null,
          })),
        archivedGamesInOpenAssignments: archived,
        pendingReplayRequests: replays,
      },
      classes: classes.map((row) => ({
        ...ref(row),
        ageGroupName: row.ageGroup.name,
        teacherCount: row.teachers.length,
        childCount: row._count.enrollments,
        activeChildren7d: activeByClass.get(row.classId) ?? 0,
        openAssignments: row._count.assignments,
      })),
    };
  }
}
