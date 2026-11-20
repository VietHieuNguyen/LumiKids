import {
  adminOverviewSchema,
  bulkAccountStatusResultSchema,
  guardianAccountDetailSchema,
  teacherAccountDetailSchema,
  ageGroupSchema,
  ageGroupUsageListSchema,
  schoolYearUsageListSchema,
  siteSettingsSchema,
  guardianAccountListSchema,
  guardianAccountSchema,
  issuedGuardianPasswordSchema,
  issuedPasswordSchema,
  teacherAccountListSchema,
  teacherAccountSchema,
} from "@lumikids/shared";
import type {
  BulkAccountStatusInput,
  CreateTeacherAccountInput,
  UpdateAgeGroupInput,
  UpdateGuardianAccountInput,
  UpdateSiteSettingsInput,
  UpdateTeacherAccountInput,
} from "@lumikids/shared";
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
  async guardians(signal?: AbortSignal) {
    return guardianAccountListSchema.parse(await this.api.raw("/admin/guardian-accounts", { signal }));
  }
  async updateGuardian(userId: string, input: UpdateGuardianAccountInput) {
    return guardianAccountSchema.parse(
      await this.api.raw(`/admin/guardian-accounts/${encodeURIComponent(userId)}`, { method: "PATCH", body: input }),
    );
  }
  async resetGuardianPassword(userId: string) {
    return issuedGuardianPasswordSchema.parse(
      await this.api.raw(`/admin/guardian-accounts/${encodeURIComponent(userId)}/password-reset`, { method: "POST", body: {} }),
    );
  }
  // ---------- Detail panels and bulk status ----------
  async teacherDetail(userId: string, signal?: AbortSignal) {
    return teacherAccountDetailSchema.parse(await this.api.raw(`/admin/teacher-accounts/${encodeURIComponent(userId)}`, { signal }));
  }
  async guardianDetail(userId: string, signal?: AbortSignal) {
    return guardianAccountDetailSchema.parse(await this.api.raw(`/admin/guardian-accounts/${encodeURIComponent(userId)}`, { signal }));
  }
  async bulkTeacherStatus(input: BulkAccountStatusInput) {
    return bulkAccountStatusResultSchema.parse(await this.api.raw("/admin/teacher-accounts/bulk-status", { method: "POST", body: input }));
  }
  async bulkGuardianStatus(input: BulkAccountStatusInput) {
    return bulkAccountStatusResultSchema.parse(await this.api.raw("/admin/guardian-accounts/bulk-status", { method: "POST", body: input }));
  }

  // ---------- Catalogues ----------
  async ageGroups(signal?: AbortSignal) {
    return ageGroupUsageListSchema.parse(await this.api.raw("/admin/age-groups", { signal }));
  }
  async renameAgeGroup(ageGroupId: string, input: UpdateAgeGroupInput) {
    return ageGroupSchema.parse(
      await this.api.raw(`/admin/age-groups/${encodeURIComponent(ageGroupId)}`, { method: "PATCH", body: input }),
    );
  }
  async reorderAgeGroups(ageGroupIds: string[]) {
    return ageGroupUsageListSchema.parse(await this.api.raw("/admin/age-groups/order", { method: "PUT", body: { ageGroupIds } }));
  }
  async schoolYears(signal?: AbortSignal) {
    return schoolYearUsageListSchema.parse(await this.api.raw("/admin/school-years", { signal }));
  }

  // ---------- Site settings ----------
  async siteSettings(signal?: AbortSignal) {
    return siteSettingsSchema.parse(await this.api.raw("/admin/site-settings", { signal }));
  }
  async updateSiteSettings(input: UpdateSiteSettingsInput) {
    return siteSettingsSchema.parse(await this.api.raw("/admin/site-settings", { method: "PATCH", body: input }));
  }
  async uploadLogo(file: File) {
    const form = new FormData();
    form.append("file", file);
    return siteSettingsSchema.parse(await this.api.raw("/admin/site-settings/logo", { method: "PUT", body: form }));
  }
  async removeLogo() {
    return siteSettingsSchema.parse(await this.api.raw("/admin/site-settings/logo", { method: "DELETE" }));
  }

  async resetPassword(userId: string) {
    return issuedPasswordSchema.parse(
      await this.api.raw(`/admin/teacher-accounts/${encodeURIComponent(userId)}/password-reset`, { method: "POST", body: {} }),
    );
  }
}
