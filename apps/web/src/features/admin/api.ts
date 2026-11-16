import { adminOverviewSchema, issuedPasswordSchema, teacherAccountListSchema, teacherAccountSchema } from "@lumikids/shared";
import type { CreateTeacherAccountInput, UpdateTeacherAccountInput } from "@lumikids/shared";
import type { ClassroomApi } from "../classrooms/api";

/** Admin dashboard and teacher accounts, on the same adult session as the classroom screens. */
export class AdminApi {
  constructor(private readonly api: ClassroomApi) {}
  async overview(signal?: AbortSignal) {
    return adminOverviewSchema.parse(await this.api.raw("/admin/overview", { signal }));
  }
  async teachers(signal?: AbortSignal) {
    return teacherAccountListSchema.parse(await this.api.raw("/admin/teacher-accounts", { signal }));
  }
  async createTeacher(input: CreateTeacherAccountInput) {
    return issuedPasswordSchema.parse(await this.api.raw("/admin/teacher-accounts", { method: "POST", body: input }));
  }
  async updateTeacher(userId: string, input: UpdateTeacherAccountInput) {
    return teacherAccountSchema.parse(
      await this.api.raw(`/admin/teacher-accounts/${encodeURIComponent(userId)}`, { method: "PATCH", body: input }),
    );
  }
  async resetPassword(userId: string) {
    return issuedPasswordSchema.parse(
      await this.api.raw(`/admin/teacher-accounts/${encodeURIComponent(userId)}/password-reset`, { method: "POST", body: {} }),
    );
  }
}
