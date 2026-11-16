import {
  assignmentDetailSchema,
  assignmentSummaryListSchema,
  classGroupListSchema,
  classGroupSchema,
  createAssignmentSchema,
  ageGroupListSchema,
  childProfileListSchema,
  childProfileSchema,
  classroomChildDetailSchema,
  classroomDetailSchema,
  classroomSummaryListSchema,
  classroomTeacherListSchema,
  issuedLoginCodeSchema,
  playHistoryPageSchema,
  schoolYearListSchema,
  schoolYearSchema,
} from "@lumikids/shared";
import type {
  CreateAssignmentInput,
  CreateClassGroupInput,
  DecideReplayInput,
  ExtendAssignmentInput,
  UpdateAssignmentInput,
  UpdateClassGroupInput,
  CreateChildInput,
  CreateClassroomInput,
  CreateSchoolYearInput,
  UpdateChildInput,
  UpdateClassroomInput,
} from "@lumikids/shared";

export class ClassroomApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
const fallback: Record<number, string> = {
  401: "Phiên đăng nhập đã hết hạn.",
  403: "Bạn chưa có quyền thực hiện thao tác này.",
  404: "Không tìm thấy dữ liệu, hoặc bạn không phụ trách lớp này.",
  429: "Có quá nhiều yêu cầu. Vui lòng đợi một chút.",
};

/** Admin (`/admin/*`) and teacher (`/teacher/classrooms/*`) classroom endpoints, on the adult session. */
export class ClassroomApi {
  constructor(
    private readonly token: string,
    private readonly unauthorized: () => void,
    private readonly origin = process.env.NEXT_PUBLIC_API_URL ?? "",
  ) {}
  private async request(
    path: string,
    options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<unknown> {
    if (!this.origin) throw new ClassroomApiError("Chưa cấu hình địa chỉ API.", 0);
    let response: Response;
    try {
      response = await fetch(`${this.origin.replace(/\/$/, "")}/api/v1${path}`, {
        method: options.method ?? "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ClassroomApiError("Chưa kết nối được máy chủ. Vui lòng thử lại.", 0);
    }
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new ClassroomApiError("Phản hồi chưa hợp lệ.", response.status);
    }
    if (!response.ok) {
      if (response.status === 401) this.unauthorized();
      const code = record(envelope) && typeof envelope.code === "string" ? envelope.code : undefined;
      // 4xx messages from these endpoints are reviewed Vietnamese text written by the API.
      const message =
        response.status < 500 && ![401, 403].includes(response.status) && record(envelope) && typeof envelope.message === "string"
          ? envelope.message
          : undefined;
      throw new ClassroomApiError(
        message ?? fallback[response.status] ?? "Chưa xử lý được yêu cầu. Vui lòng thử lại.",
        response.status,
        code,
      );
    }
    if (!record(envelope) || envelope.success !== true)
      throw new ClassroomApiError("Phản hồi chưa hợp lệ.", 0);
    return envelope.data;
  }
  /** For feature clients built on the same session (AssignmentApi). */
  raw(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}) {
    return this.request(path, options);
  }
  private send(path: string, method: string, body?: unknown) {
    return this.request(path, { method, body: body ?? {} });
  }
  private static id(value: string) {
    return encodeURIComponent(value);
  }

  // ---------- Admin ----------
  async ageGroups(signal?: AbortSignal) {
    return ageGroupListSchema.parse(await this.request("/admin/age-groups", { signal }));
  }
  async schoolYears(signal?: AbortSignal) {
    return schoolYearListSchema.parse(await this.request("/admin/school-years", { signal }));
  }
  async createSchoolYear(input: CreateSchoolYearInput) {
    return schoolYearSchema.parse(await this.send("/admin/school-years", "POST", input));
  }
  async teachers(signal?: AbortSignal) {
    return classroomTeacherListSchema.parse(await this.request("/admin/teachers", { signal }));
  }
  async adminClassrooms(params: URLSearchParams, signal?: AbortSignal) {
    return classroomSummaryListSchema.parse(await this.request(`/admin/classrooms?${params}`, { signal }));
  }
  async adminClassroom(classId: string, signal?: AbortSignal) {
    return classroomDetailSchema.parse(await this.request(`/admin/classrooms/${ClassroomApi.id(classId)}`, { signal }));
  }
  async createClassroom(input: CreateClassroomInput) {
    return classroomDetailSchema.parse(await this.send("/admin/classrooms", "POST", input));
  }
  async updateClassroom(classId: string, input: UpdateClassroomInput) {
    return classroomDetailSchema.parse(await this.send(`/admin/classrooms/${ClassroomApi.id(classId)}`, "PATCH", input));
  }
  async addTeacher(classId: string, userId: string) {
    return classroomDetailSchema.parse(await this.send(`/admin/classrooms/${ClassroomApi.id(classId)}/teachers`, "POST", { userId }));
  }
  async removeTeacher(classId: string, userId: string) {
    return classroomDetailSchema.parse(
      await this.request(`/admin/classrooms/${ClassroomApi.id(classId)}/teachers/${ClassroomApi.id(userId)}`, { method: "DELETE" }),
    );
  }
  async unassignedChildren(signal?: AbortSignal) {
    return childProfileListSchema.parse(await this.request("/admin/children/unassigned", { signal }));
  }
  async createChild(input: CreateChildInput) {
    return classroomDetailSchema.parse(await this.send("/admin/children", "POST", input));
  }
  async updateChild(childId: string, input: UpdateChildInput) {
    return childProfileSchema.parse(await this.send(`/admin/children/${ClassroomApi.id(childId)}`, "PATCH", input));
  }
  async transferChild(childId: string, classId: string) {
    return classroomDetailSchema.parse(await this.send(`/admin/children/${ClassroomApi.id(childId)}/transfer`, "POST", { classId }));
  }

  // ---------- Teacher ----------
  async myClassrooms(signal?: AbortSignal) {
    return classroomSummaryListSchema.parse(await this.request("/teacher/classrooms", { signal }));
  }
  async myClassroom(classId: string, signal?: AbortSignal) {
    return classroomDetailSchema.parse(await this.request(`/teacher/classrooms/${ClassroomApi.id(classId)}`, { signal }));
  }
  async child(classId: string, childId: string, signal?: AbortSignal) {
    return classroomChildDetailSchema.parse(
      await this.request(`/teacher/classrooms/${ClassroomApi.id(classId)}/children/${ClassroomApi.id(childId)}`, { signal }),
    );
  }
  async playHistory(classId: string, childId: string, page: number, signal?: AbortSignal) {
    return playHistoryPageSchema.parse(
      await this.request(
        `/teacher/classrooms/${ClassroomApi.id(classId)}/children/${ClassroomApi.id(childId)}/play-sessions?${new URLSearchParams({ page: String(page), pageSize: "20" })}`,
        { signal },
      ),
    );
  }
  async issueLoginCode(classId: string, childId: string) {
    return issuedLoginCodeSchema.parse(
      await this.send(`/teacher/classrooms/${ClassroomApi.id(classId)}/children/${ClassroomApi.id(childId)}/login-code`, "POST"),
    );
  }
}

/** Groups and assignments of one class (teacher). */
export class AssignmentApi {
  constructor(
    private readonly classrooms: ClassroomApi,
    private readonly classId: string,
  ) {}
  private path(suffix = "") {
    return `/teacher/classrooms/${encodeURIComponent(this.classId)}${suffix}`;
  }
  async groups(signal?: AbortSignal) {
    return classGroupListSchema.parse(await this.classrooms.raw(this.path("/groups"), { signal }));
  }
  async createGroup(input: CreateClassGroupInput) {
    return classGroupSchema.parse(await this.classrooms.raw(this.path("/groups"), { method: "POST", body: input }));
  }
  async updateGroup(groupId: string, input: UpdateClassGroupInput) {
    return classGroupSchema.parse(
      await this.classrooms.raw(this.path(`/groups/${encodeURIComponent(groupId)}`), { method: "PATCH", body: input }),
    );
  }
  async deleteGroup(groupId: string) {
    await this.classrooms.raw(this.path(`/groups/${encodeURIComponent(groupId)}`), { method: "DELETE" });
  }
  async list(signal?: AbortSignal) {
    return assignmentSummaryListSchema.parse(await this.classrooms.raw(this.path("/assignments"), { signal }));
  }
  async detail(assignmentId: string, signal?: AbortSignal) {
    return assignmentDetailSchema.parse(
      await this.classrooms.raw(this.path(`/assignments/${encodeURIComponent(assignmentId)}`), { signal }),
    );
  }
  async create(input: CreateAssignmentInput) {
    return assignmentDetailSchema.parse(
      await this.classrooms.raw(this.path("/assignments"), { method: "POST", body: createAssignmentSchema.parse(input) }),
    );
  }
  async update(assignmentId: string, input: UpdateAssignmentInput) {
    return assignmentDetailSchema.parse(
      await this.classrooms.raw(this.path(`/assignments/${encodeURIComponent(assignmentId)}`), { method: "PATCH", body: input }),
    );
  }
  async extend(assignmentId: string, input: ExtendAssignmentInput) {
    return assignmentDetailSchema.parse(
      await this.classrooms.raw(this.path(`/assignments/${encodeURIComponent(assignmentId)}/extend`), { method: "POST", body: input }),
    );
  }
  async decide(assignmentId: string, requestId: string, input: DecideReplayInput) {
    return assignmentDetailSchema.parse(
      await this.classrooms.raw(
        this.path(`/assignments/${encodeURIComponent(assignmentId)}/replay-requests/${encodeURIComponent(requestId)}/decision`),
        { method: "POST", body: input },
      ),
    );
  }
}

export function classroomError(error: unknown) {
  return error instanceof ClassroomApiError ? error.message : "Chưa xử lý được yêu cầu. Vui lòng thử lại.";
}
