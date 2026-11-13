import {
  playableGameDetailSchema,
  playableGamePageSchema,
  playSessionSchema,
  submitInteractionsResultSchema,
  submitInteractionsSchema,
} from "@lumikids/shared";
import type { GameInteraction } from "@lumikids/shared";
import { parseAssetReadUrl } from "../game-assets/api";
import type { AssetReadUrl } from "../game-assets/types";
import type { PreviewAssetReader } from "../game-preview/asset-resolver";

export class GameplayApiError extends Error {
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
const messages: Record<number, string> = {
  401: "Phiên đăng nhập đã hết hạn.",
  403: "Con chưa được phép chơi trò này.",
  404: "Trò chơi không còn khả dụng.",
  409: "Lượt chơi đã thay đổi. Con thử lại nhé.",
  429: "Có quá nhiều yêu cầu. Đợi một chút nhé.",
};
const codeMessages: Record<string, string> = {
  CHILD_PROFILE_MISSING:
    "Tài khoản này chưa có hồ sơ trẻ nên chưa chơi được. Nhờ người lớn liên hệ giáo viên nhé.",
  PLAY_SESSION_CLOSED: "Lượt chơi đã kết thúc. Con bấm Thử lại để chơi lượt mới nhé.",
};

export class GameplayApi {
  private readonly cache = new Map<string, AssetReadUrl>();
  private readonly pending = new Map<string, Promise<AssetReadUrl>>();
  constructor(
    private readonly token: string,
    private readonly unauthorized: () => void,
    private readonly origin = process.env.NEXT_PUBLIC_API_URL ?? "",
  ) {}
  private url(path: string) {
    return `${this.origin.replace(/\/$/, "")}/api/v1/gameplay${path}`;
  }
  private init(body?: unknown, keepalive = false): RequestInit {
    return {
      method: body === undefined && !keepalive ? "GET" : "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      keepalive,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };
  }
  private async request(
    path: string,
    options: { post?: boolean; body?: unknown; signal?: AbortSignal } = {},
  ) {
    if (!this.origin)
      throw new GameplayApiError("Chưa cấu hình địa chỉ API.", 0);
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        ...this.init(options.body ?? (options.post ? {} : undefined)),
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
          : AbortSignal.timeout(20000),
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new GameplayApiError("Chưa kết nối được máy chủ.", 0);
    }
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      throw new GameplayApiError("Phản hồi chưa hợp lệ.", response.status);
    }
    if (!response.ok) {
      if (response.status === 401) this.unauthorized();
      const code =
        record(envelope) && typeof envelope.code === "string"
          ? envelope.code
          : undefined;
      throw new GameplayApiError(
        (code && codeMessages[code]) ??
          messages[response.status] ??
          "Chưa xử lý được. Con thử lại nhé.",
        response.status,
        code,
      );
    }
    if (!record(envelope) || envelope.success !== true)
      throw new GameplayApiError("Phản hồi chưa hợp lệ.", 0);
    return envelope.data;
  }
  async list(params: URLSearchParams, signal?: AbortSignal) {
    return playableGamePageSchema.parse(
      await this.request(`/games?${params}`, { signal }),
    );
  }
  async detail(versionId: string, signal?: AbortSignal) {
    return playableGameDetailSchema.parse(
      await this.request(`/games/${encodeURIComponent(versionId)}`, { signal }),
    );
  }
  async start(versionId: string, startRequestId: string, signal?: AbortSignal) {
    return playSessionSchema.parse(
      await this.request("/sessions", {
        body: { versionId, startRequestId },
        signal,
      }),
    );
  }
  async session(sessionId: string) {
    return playSessionSchema.parse(
      await this.request(`/sessions/${encodeURIComponent(sessionId)}`),
    );
  }
  async submit(sessionId: string, events: GameInteraction[]) {
    return submitInteractionsResultSchema.parse(
      await this.request(`/sessions/${encodeURIComponent(sessionId)}/events`, {
        body: submitInteractionsSchema.parse({ events }),
      }),
    );
  }
  async abandon(sessionId: string) {
    return playSessionSchema.parse(
      await this.request(`/sessions/${encodeURIComponent(sessionId)}/abandon`, {
        post: true,
      }),
    );
  }
  /** Best effort while the page unloads; responses are ignored. */
  sendOnExit(sessionId: string, pending: GameInteraction[]) {
    if (!this.origin) return;
    const id = encodeURIComponent(sessionId);
    // A running session left behind is abandoned by the server on the next start.
    void fetch(
      pending.length
        ? this.url(`/sessions/${id}/events`)
        : this.url(`/sessions/${id}/abandon`),
      this.init(
        pending.length ? { events: pending.slice(0, 50) } : undefined,
        true,
      ),
    ).catch(() => {});
  }
  readUrl(versionId: string, id: string, force = false): Promise<AssetReadUrl> {
    const key = `${versionId}:${id}`;
    const cached = this.cache.get(key);
    if (!force && cached && Date.parse(cached.expiresAt) > Date.now() + 30000)
      return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const result = this.request(
      `/games/${encodeURIComponent(versionId)}/assets/${encodeURIComponent(id)}/read-url`,
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
export function gameplayError(error: unknown) {
  return error instanceof GameplayApiError
    ? error.message
    : "Chưa mở được trò chơi. Con thử lại nhé.";
}
