import { z } from "zod";

/**
 * Admin dashboard: is the school set up, is it being used, what needs a decision today.
 * Everything is derived from existing tables at request time (nothing stored).
 */
const classRef = z.object({ classId: z.uuid(), className: z.string() });

export const adminOverviewSchema = z.object({
  generatedAt: z.iso.datetime(),
  /** The school year containing today (or the latest one when none does). */
  schoolYear: z
    .object({
      schoolYearId: z.uuid(),
      name: z.string(),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      daysLeft: z.number().int(),
      hasNextYear: z.boolean(),
    })
    .nullable(),
  totals: z.object({
    activeClasses: z.number().int(),
    enrolledChildren: z.number().int(),
    activeTeachers: z.number().int(),
    libraryGames: z.number().int(),
  }),
  /** Last 14 school-local days, oldest first (days without play included as zeros). */
  days: z.array(
    z.object({
      date: z.iso.date(),
      sessions: z.number().int(),
      completed: z.number().int(),
      children: z.number().int(),
    }),
  ),
  week: z.object({
    sessions: z.number().int(),
    previousSessions: z.number().int(),
    completed: z.number().int(),
    activeChildren: z.number().int(),
  }),
  attention: z.object({
    unassignedChildren: z.number().int(),
    childrenWithoutCode: z.number().int(),
    classesWithoutTeacher: z.array(classRef),
    classesWithoutChildren: z.array(classRef),
    classesWithoutOpenAssignment: z.array(classRef),
    dormantTeachers: z.array(z.object({ userId: z.uuid(), fullName: z.string(), lastLoginAt: z.iso.datetime().nullable() })),
    archivedGamesInOpenAssignments: z.number().int(),
    pendingReplayRequests: z.number().int(),
  }),
  classes: z.array(
    classRef.extend({
      ageGroupName: z.string(),
      teacherCount: z.number().int(),
      childCount: z.number().int(),
      activeChildren7d: z.number().int(),
      openAssignments: z.number().int(),
    }),
  ),
});

export type AdminOverview = z.infer<typeof adminOverviewSchema>;
