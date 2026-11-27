import {
  familyActivityListSchema,
  familyActivitySchema,
  familyChildListSchema,
  familyChildSchema,
  invitePreviewSchema,
  issuedLoginCodeSchema,
  playHistoryPageSchema,
  SHARING_CONSENT_VERSION,
} from "@lumikids/shared";
import type { CreateFamilyActivityInput, CreateFamilyChildInput, UpdateFamilyChildInput } from "@lumikids/shared";
import type { ClassroomApi } from "../classrooms/api";

const id = (value: string) => encodeURIComponent(value);

/** The guardian's area (`/family`), on the same adult session as the staff screens. */
export class FamilyApi {
  constructor(private readonly api: ClassroomApi) {}
  async children(signal?: AbortSignal) {
    return familyChildListSchema.parse(await this.api.raw("/family/children", { signal }));
  }
  async createChild(input: CreateFamilyChildInput) {
    return familyChildSchema.parse(await this.api.raw("/family/children", { method: "POST", body: input }));
  }
  async updateChild(childId: string, input: UpdateFamilyChildInput) {
    return familyChildSchema.parse(await this.api.raw(`/family/children/${id(childId)}`, { method: "PATCH", body: input }));
  }
  async issueLoginCode(childId: string) {
    return issuedLoginCodeSchema.parse(await this.api.raw(`/family/children/${id(childId)}/login-code`, { method: "POST", body: {} }));
  }
  async playHistory(childId: string, page: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(page), pageSize: "20" });
    return playHistoryPageSchema.parse(await this.api.raw(`/family/children/${id(childId)}/play-sessions?${query}`, { signal }));
  }
  async activities(childId: string, signal?: AbortSignal) {
    return familyActivityListSchema.parse(await this.api.raw(`/family/children/${id(childId)}/activities`, { signal }));
  }
  async createActivity(childId: string, input: CreateFamilyActivityInput) {
    return familyActivitySchema.parse(await this.api.raw(`/family/children/${id(childId)}/activities`, { method: "POST", body: input }));
  }
  async cancelActivity(childId: string, assignmentId: string) {
    await this.api.raw(`/family/children/${id(childId)}/activities/${id(assignmentId)}/cancel`, { method: "POST", body: {} });
  }
  async leaveClass(childId: string) {
    return familyChildSchema.parse(await this.api.raw(`/family/children/${id(childId)}/leave-class`, { method: "POST", body: {} }));
  }
  async previewInvite(code: string, signal?: AbortSignal) {
    return invitePreviewSchema.parse(await this.api.raw("/family/invites/preview", { method: "POST", body: { code }, signal }));
  }
  async requestJoin(code: string, childId: string) {
    return familyChildSchema.parse(
      await this.api.raw("/family/join-requests", {
        method: "POST",
        body: { code, childId, consentVersion: SHARING_CONSENT_VERSION, consentAccepted: true },
      }),
    );
  }
}

/** "ABCDE-FGHJK", or the code inside a pasted `…/family/join?code=…` link. */
export function inviteCodeFrom(input: string): string {
  const trimmed = input.trim();
  const fromLink = /[?&]code=([^&#\s]+)/.exec(trimmed);
  return (fromLink ? decodeURIComponent(fromLink[1]) : trimmed).toUpperCase();
}

export const relationshipLabels = { MOTHER: "Mẹ", FATHER: "Bố", GRANDPARENT: "Ông / bà", OTHER: "Người giám hộ" } as const;
export const consentScopeLabels = {
  PROFILE: "Họ tên, ngày sinh và giới tính của con",
  PLAY_RESULTS: "Các lượt chơi và kết quả từng lượt",
  ASSESSMENT: "Điểm đánh giá theo chỉ số của từng lượt chơi",
} as const;
