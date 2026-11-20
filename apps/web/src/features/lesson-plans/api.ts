import { lessonPlanListSchema, lessonPlanSchema } from "@lumikids/shared";
import type { CreateLessonPlanInput, SaveLessonPlanInput } from "@lumikids/shared";
import type { ClassroomApi } from "../classrooms/api";

const id = (value: string) => encodeURIComponent(value);

/** The teacher's own lesson plans (`/teacher/lesson-plans`). */
export class LessonPlanApi {
  constructor(private readonly api: ClassroomApi) {}
  async list(params: URLSearchParams, signal?: AbortSignal) {
    return lessonPlanListSchema.parse(await this.api.raw(`/teacher/lesson-plans?${params}`, { signal }));
  }
  async detail(lessonPlanId: string, signal?: AbortSignal) {
    return lessonPlanSchema.parse(await this.api.raw(`/teacher/lesson-plans/${id(lessonPlanId)}`, { signal }));
  }
  async create(input: CreateLessonPlanInput) {
    return lessonPlanSchema.parse(await this.api.raw("/teacher/lesson-plans", { method: "POST", body: input }));
  }
  async save(lessonPlanId: string, input: SaveLessonPlanInput) {
    return lessonPlanSchema.parse(await this.api.raw(`/teacher/lesson-plans/${id(lessonPlanId)}`, { method: "PUT", body: input }));
  }
  async duplicate(lessonPlanId: string) {
    return lessonPlanSchema.parse(await this.api.raw(`/teacher/lesson-plans/${id(lessonPlanId)}/duplicate`, { method: "POST", body: {} }));
  }
  async remove(lessonPlanId: string) {
    await this.api.raw(`/teacher/lesson-plans/${id(lessonPlanId)}`, { method: "DELETE" });
  }
}

export const lessonStatusLabels = { DRAFT: "Bản nháp", COMPLETE: "Hoàn thành" } as const;
export const lessonStatusTones = { DRAFT: "amber", COMPLETE: "green" } as const;
