import {
  gameContentSchema,
  gameTypeSchema,
  getGameContentAssetIds,
} from "@lumikids/shared";
import type { GameType } from "@lumikids/shared";
import { parseAssetReadUrl } from "../game-assets/api";
import type { AssetReadUrl } from "../game-assets/types";
import type { PreviewAssetReader } from "../game-preview/asset-resolver";
import { MAX_GAME_PROMPT_LENGTH } from "./types";
import type {
  GeneratedGame,
  GeneratedPreviewAccess,
  GenerateGameInput,
} from "./types";

export class GameGenerationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "GameGenerationApiError";
  }
}
const messages: Record<string, string> = {
  COUNTING_OBJECT_NOT_FOUND:
    "Một học liệu chưa khớp tên trong thư viện. Nhờ quản trị viên bổ sung aliases cho ảnh ACTIVE hoặc dùng tên học liệu cụ thể hơn.",
  COUNTING_OBJECT_AMBIGUOUS:
    "Tên gọi học liệu đang trùng giữa nhiều loại. Nhờ quản trị viên kiểm tra objectType và aliases, hoặc dùng tên cụ thể hơn.",
  COUNTING_COMPOSITION_AMBIGUOUS:
    "Số lượng từng loại chưa rõ hoặc mâu thuẫn. Hãy nêu mỗi loại một số lượng cụ thể.",
  SHADOW_PAIRS_INSUFFICIENT:
    "Chưa đủ cặp ảnh và bóng tương ứng. Nhờ quản trị viên khai báo variant NORMAL/SHADOW và cùng matchKey cho đúng hai ảnh của mỗi cặp.",
  OFFSPRING_PAIRS_INSUFFICIENT:
    "Chưa đủ cặp con trưởng thành và con non. Cần cùng animalType, familyKey và lifeStage ADULT/YOUNG tương ứng.",
  COUNTING_TARGET_AMBIGUOUS:
    "Hãy nêu rõ loại đối tượng hoặc màu cần đếm, ví dụ: chỉ đếm chim cánh cụt giữa các con vật khác.",
  ASSETS_INSUFFICIENT:
    "Chưa đủ hình ảnh hoặc metadata ACTIVE phù hợp với đối tượng, đặc điểm hoặc phong cách được yêu cầu. Với bài môi trường sống, kiểm tra habitat/habitats của từng con vật.",
  ASSETS_CHANGED:
    "Học liệu vừa thay đổi hoặc ngừng sử dụng. Vui lòng tạo lại trò chơi.",
  PROMPT_AMBIGUOUS:
    "Mô tả chưa rõ màu sắc. Hãy dùng “xanh dương” hoặc “xanh lá” thay cho “xanh”.",
  PROMPT_OUT_OF_RANGE:
    "Đếm/ghép tối đa 20 hình; bài đếm có 2–6 đáp án. Phân loại tối đa 50 đối tượng và 2–10 nhóm.",
  AI_NOT_CONFIGURED:
    "Chức năng AI chưa được cấu hình. Vui lòng liên hệ quản trị viên.",
  AI_PROVIDER_AUTH_ERROR:
    "Dịch vụ AI chưa xác thực được. Vui lòng liên hệ quản trị viên.",
  AI_PROVIDER_CONFIG_ERROR:
    "Cấu hình dịch vụ AI chưa sẵn sàng. Vui lòng liên hệ quản trị viên.",
  AI_QUOTA_EXCEEDED:
    "Dịch vụ AI đã đạt giới hạn sử dụng. Vui lòng thử lại sau.",
  AI_TIMEOUT:
    "AI xử lý lâu hơn thời gian cho phép. Hãy thử mô tả ngắn hơn hoặc thử lại sau.",
  AI_SERVICE_UNAVAILABLE: "Chưa kết nối được dịch vụ AI. Vui lòng thử lại sau.",
  AI_OUTPUT_INVALID:
    "AI chưa tạo được trò chơi hợp lệ. Hãy làm rõ mô tả rồi thử lại.",
  AI_CONTRACT_INVALID:
    "Phản hồi từ dịch vụ AI chưa hợp lệ. Vui lòng thử lại sau.",
  AI_OUTPUT_BLOCKED:
    "AI không thể tạo nội dung này. Hãy điều chỉnh mô tả phù hợp với trẻ mầm non.",
  AI_OUTPUT_TRUNCATED:
    "Trò chơi quá dài. Hãy giảm số lượng đối tượng rồi thử lại.",
  AI_PROVIDER_ERROR: "Dịch vụ AI đang gặp lỗi. Vui lòng thử lại sau.",
  GENERATION_BUSY:
    "Yêu cầu tạo trò chơi trước vẫn đang xử lý. Vui lòng chờ một chút.",
  PREVIEW_ACCESS_EXPIRED:
    "Quyền tải ảnh cho bản chơi thử này đã hết hạn. Hãy tạo lại trò chơi.",
};
const statusMessages: Record<number, string> = {
  400: "Vui lòng kiểm tra loại trò chơi và mô tả đã nhập.",
  401: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  403: "Tài khoản chưa được cấp quyền thực hiện thao tác này.",
  404: "Không tìm thấy ảnh của trò chơi. Nhờ quản trị viên kiểm tra học liệu.",
  409: "Ảnh đã thay đổi hoặc ngừng sử dụng. Vui lòng tạo lại trò chơi.",
  413: "Mô tả quá dài. Vui lòng rút gọn rồi thử lại.",
  429: "Bạn tạo trò chơi quá nhanh. Vui lòng đợi một phút rồi thử lại.",
  503: "Dịch vụ tạo trò chơi chưa sẵn sàng. Vui lòng thử lại sau.",
  504: "Dịch vụ tạo trò chơi phản hồi quá chậm. Vui lòng thử lại sau.",
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function invalidResponse(): never {
  throw new GameGenerationApiError(
    "Phản hồi tạo trò chơi không hợp lệ. Bản xem thử trước vẫn được giữ lại.",
    0,
    "INVALID_RESPONSE",
  );
}
export function validateGameRequest(
  value: GenerateGameInput,
): GenerateGameInput {
  const prompt = value.prompt.trim();
  if (
    !gameTypeSchema.safeParse(value.gameType).success ||
    !prompt ||
    prompt.length > MAX_GAME_PROMPT_LENGTH
  )
    throw new GameGenerationApiError(
      `Hãy chọn loại trò chơi và nhập mô tả từ 1 đến ${MAX_GAME_PROMPT_LENGTH} ký tự.`,
      400,
      "INVALID_INPUT",
    );
  return { gameType: value.gameType, prompt };
}
export function parseGeneratedGame(
  value: unknown,
  expectedType: GameType,
): GeneratedGame {
  if (
    !record(value) ||
    value.gameType !== expectedType ||
    !record(value.generation)
  )
    return invalidResponse();
  const content = gameContentSchema.safeParse(value.gameContent);
  const meta = value.generation;
  if (
    !content.success ||
    content.data.gameType !== expectedType ||
    typeof meta.requestId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(meta.requestId) ||
    typeof meta.model !== "string" ||
    !meta.model ||
    meta.model.length > 100 ||
    !Number.isInteger(meta.attempts) ||
    (meta.attempts !== 1 && meta.attempts !== 2) ||
    meta.reviewRequired !== true ||
    !validDate(meta.validatedAt) ||
    !Array.isArray(meta.warnings) ||
    meta.warnings.length > 30 ||
    !meta.warnings.every(
      (warning: unknown) =>
        typeof warning === "string" && /^[A-Z_]{1,80}$/.test(warning),
    ) ||
    !record(meta.preview) ||
    typeof meta.preview.token !== "string" ||
    !meta.preview.token ||
    meta.preview.token.length > 16384 ||
    !validDate(meta.preview.expiresAt) ||
    Date.parse(meta.preview.expiresAt) <= Date.now()
  )
    return invalidResponse();
  return {
    gameType: expectedType,
    gameContent: content.data,
    generation: {
      requestId: meta.requestId,
      model: meta.model,
      attempts: meta.attempts,
      reviewRequired: true,
      warnings: meta.warnings,
      validatedAt: meta.validatedAt,
      preview: { token: meta.preview.token, expiresAt: meta.preview.expiresAt },
    },
  };
}

export class GameGenerationApi {
  constructor(
    private readonly token: string,
    private readonly baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "",
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 150000,
  ) {}

  private async post(
    path: string,
    body: object,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.baseUrl)
      throw new GameGenerationApiError(
        "Chưa cấu hình địa chỉ API cho giao diện.",
        0,
        "API_NOT_CONFIGURED",
      );
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, this.timeoutMs);
    try {
      const response = await this.fetcher.call(
        globalThis,
        `${this.baseUrl.replace(/\/$/, "")}/api/v1/game-generation${path}`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      let envelope: unknown;
      try {
        envelope = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        if (response.ok) return invalidResponse();
      }
      if (!response.ok) {
        const code =
          record(envelope) && typeof envelope.code === "string"
            ? envelope.code
            : "REQUEST_FAILED";
        throw new GameGenerationApiError(
          messages[code] ??
            statusMessages[response.status] ??
            "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.",
          response.status,
          code,
        );
      }
      if (
        !record(envelope) ||
        envelope.success !== true ||
        !("data" in envelope)
      )
        return invalidResponse();
      return envelope.data;
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException("Request cancelled", "AbortError");
      if (error instanceof GameGenerationApiError) throw error;
      if (controller.signal.aborted)
        throw new GameGenerationApiError(
          "Yêu cầu mất quá nhiều thời gian và có thể vẫn đang xử lý. Hãy đợi một chút trước khi thử lại.",
          0,
          "CLIENT_TIMEOUT",
        );
      throw new GameGenerationApiError(
        "Không kết nối được hệ thống. Vui lòng kiểm tra kết nối và thử lại.",
        0,
        "NETWORK_ERROR",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  async generate(
    input: GenerateGameInput,
    signal?: AbortSignal,
  ): Promise<GeneratedGame> {
    const request = validateGameRequest(input);
    try {
      return parseGeneratedGame(
        await this.post("/generate", request, signal),
        request.gameType,
      );
    } catch (error) {
      if (
        request.gameType === "COUNTING" &&
        error instanceof GameGenerationApiError &&
        error.code === "ASSETS_INSUFFICIENT"
      )
        throw new GameGenerationApiError(
          "Chưa đủ hình ảnh phù hợp. Nếu đếm theo màu, hãy khai báo color cho từng ảnh (ví dụ RED, BLUE) và bổ sung ảnh khác màu để làm hình gây nhiễu.",
          error.status,
          error.code,
        );
      throw error;
    }
  }
  createPreviewReader(
    game: GeneratedGame,
    onUnauthorized?: () => void,
  ): PreviewAssetReader {
    const ids = new Set(getGameContentAssetIds(game.gameContent));
    const access: GeneratedPreviewAccess = game.generation.preview;
    const cache = new Map<string, AssetReadUrl>();
    const inFlight = new Map<string, Promise<AssetReadUrl>>();
    return {
      getReadUrl: async (
        assetId: string,
        force = false,
      ): Promise<AssetReadUrl> => {
        if (!ids.has(assetId))
          throw new GameGenerationApiError(
            "Ảnh không thuộc bản chơi thử này.",
            403,
            "FORBIDDEN",
          );
        if (Date.parse(access.expiresAt) <= Date.now())
          throw new GameGenerationApiError(
            messages.PREVIEW_ACCESS_EXPIRED,
            410,
            "PREVIEW_ACCESS_EXPIRED",
          );
        const cached = cache.get(assetId);
        if (
          !force &&
          cached &&
          Date.parse(cached.expiresAt) > Date.now() + 30000
        )
          return cached;
        const pending = inFlight.get(assetId);
        if (pending) return pending;
        const promise = this.post(
          `/preview-assets/${encodeURIComponent(assetId)}/read-url`,
          { previewToken: access.token },
        )
          .then(parseAssetReadUrl)
          .then((resource) => {
            cache.set(assetId, resource);
            return resource;
          })
          .catch((error) => {
            if (error instanceof GameGenerationApiError && error.status === 401)
              onUnauthorized?.();
            throw error;
          })
          .finally(() => inFlight.delete(assetId));
        inFlight.set(assetId, promise);
        return promise;
      },
    };
  }
}
