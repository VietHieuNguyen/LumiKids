import {
  curriculumSchema,
  gameLibraryPageSchema,
  savedGameDetailSchema,
  saveGameSchema,
} from "@lumikids/shared";
import type { SaveGameInput } from "@lumikids/shared";
import { parseAssetReadUrl } from "../game-assets/api";
import type { AssetReadUrl } from "../game-assets/types";
import type { PreviewAssetReader } from "../game-preview/asset-resolver";

export class GameLibraryApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export class GameLibraryApi {
  private readonly cache = new Map<string, AssetReadUrl>();
  private readonly pending = new Map<string, Promise<AssetReadUrl>>();
  constructor(
    private readonly token: string,
    private readonly unauthorized: () => void,
    private readonly origin = process.env.NEXT_PUBLIC_API_URL ?? "",
  ) {}
  private async request(
    path: string,
    options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
  ) {
    if (!this.origin)
      throw new GameLibraryApiError("Chưa cấu hình địa chỉ API.", 0);
    let response: Response;
    try {
      response = await fetch(
        `${this.origin.replace(/\/$/, "")}/api/v1${path}`,
        {
          method: options.method ?? "GET",
          credentials: "include",
          cache: "no-store",
          redirect: "error",
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(25000)])
            : AbortSignal.timeout(25000),
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...(options.body ? { "Content-Type": "application/json" } : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        },
      );
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new GameLibraryApiError(
        "Chưa kết nối được kho trò chơi. Nếu vừa lưu, hãy thử lại với cùng nội dung để kiểm tra kết quả.",
        0,
      );
    }
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new GameLibraryApiError(
        "Kho trò chơi trả về phản hồi chưa hợp lệ.",
        response.status,
      );
    }
    if (!response.ok) {
      if (response.status === 401) this.unauthorized();
      const messages: Record<number, string> = {
        400: "Kiểm tra tên, độ khó, chỉ số và xác nhận duyệt nội dung.",
        401: "Phiên đăng nhập đã hết hạn.",
        403: "Bạn chưa có quyền thực hiện thao tác này.",
        404: "Trò chơi hoặc học liệu không còn khả dụng.",
        409: "Nội dung hoặc học liệu đã thay đổi. Hãy tải lại kho để kiểm tra.",
        410: "Quyền xác thực bản chơi thử đã hết hạn. Vui lòng tạo lại trước khi lưu.",
        429: "Có quá nhiều yêu cầu. Vui lòng đợi một chút.",
        500: "Kho trò chơi chưa sẵn sàng. Nhờ quản trị viên kiểm tra cấu hình dữ liệu.",
      };
      throw new GameLibraryApiError(
        messages[response.status] ??
          "Chưa xử lý được yêu cầu. Vui lòng thử lại.",
        response.status,
      );
    }
    if (!record(envelope) || envelope.success !== true)
      throw new GameLibraryApiError("Phản hồi kho trò chơi chưa hợp lệ.", 0);
    return envelope.data;
  }
  async curriculum(signal?: AbortSignal) {
    return curriculumSchema.parse(
      await this.request("/curriculum/skills", { signal }),
    );
  }
  async list(params: URLSearchParams, signal?: AbortSignal) {
    return gameLibraryPageSchema.parse(
      await this.request(`/game-library?${params}`, { signal }),
    );
  }
  async detail(id: string, signal?: AbortSignal) {
    return savedGameDetailSchema.parse(
      await this.request(`/game-library/${encodeURIComponent(id)}`, { signal }),
    );
  }
  async save(input: SaveGameInput, signal?: AbortSignal) {
    return savedGameDetailSchema.parse(
      await this.request("/game-library", {
        method: "POST",
        body: saveGameSchema.parse(input),
        signal,
      }),
    );
  }
  async status(
    id: string,
    status: "ACTIVE" | "ARCHIVED",
    signal?: AbortSignal,
  ) {
    return savedGameDetailSchema.parse(
      await this.request(`/game-library/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: { status },
        signal,
      }),
    );
  }
  readUrl(versionId: string, id: string, force = false): Promise<AssetReadUrl> {
    const key = `${versionId}:${id}`;
    const cached = this.cache.get(key);
    if (!force && cached && Date.parse(cached.expiresAt) > Date.now() + 30000)
      return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const result = this.request(
      `/game-library/${encodeURIComponent(versionId)}/assets/${encodeURIComponent(id)}/read-url`,
    )
      .then(parseAssetReadUrl)
      .then((value) => {
        if (this.cache.size >= 200) this.cache.clear();
        this.cache.set(key, value);
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, result);
    return result;
  }
  reader(versionId: string): PreviewAssetReader {
    return { getReadUrl: (id, force) => this.readUrl(versionId, id, force) };
  }
}
export function libraryError(error: unknown) {
  return error instanceof GameLibraryApiError
    ? error.message
    : "Chưa đọc được dữ liệu kho trò chơi. Vui lòng thử lại.";
}
