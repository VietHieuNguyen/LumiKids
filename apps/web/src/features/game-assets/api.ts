import type {
  AssetMetadata,
  AssetPage,
  AssetReadUrl,
  AssetStatus,
  GameAsset,
  JsonValue,
} from "./types";

export class GameAssetApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
const messages: Record<number, string> = {
  400: "Dữ liệu chưa hợp lệ. Hãy kiểm tra file ảnh và các trường đã nhập.",
  401: "Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.",
  403: "Tài khoản của bạn chưa được cấp quyền thực hiện thao tác này.",
  404: "Không tìm thấy hình ảnh này. Vui lòng tải lại thư viện.",
  409: "Hình ảnh đang ngừng sử dụng hoặc đã có thay đổi. Vui lòng tải lại.",
  413: "Ảnh vượt quá giới hạn dung lượng mà hệ thống cho phép.",
  429: "Có quá nhiều yêu cầu. Vui lòng đợi một chút rồi thử lại.",
  503: "Kho học liệu tạm thời chưa sẵn sàng. Vui lòng thử lại sau.",
};
// Only translate known static server messages; never render arbitrary response details.
const uploadBadRequestMessages: Record<string, string> = {
  "Invalid game asset name.":
    "Tên hình ảnh không hợp lệ. Hãy nhập tên từ 1–200 ký tự.",
  "Invalid game asset object type.":
    "Loại đối tượng không hợp lệ. Dùng 1–40 ký tự viết hoa A–Z, số hoặc dấu gạch dưới; bắt đầu bằng chữ cái.",
  "Invalid game asset tags.":
    "Tags không hợp lệ. Tối đa 30 từ khóa, mỗi từ khóa tối đa 50 ký tự.",
  "Invalid game asset attributes.":
    "Thuộc tính bị API từ chối. Nhập một JSON object hợp lệ, tối đa 16 KiB, không quá 5 cấp lồng nhau.",
  "Invalid game asset metadata or query.":
    "API từ chối metadata hoặc trường dữ liệu gửi lên. Hãy tải lại trang sau khi cập nhật API và thử lại.",
  "An image file is required.":
    "API không nhận được nội dung file ảnh. Hãy chọn lại file rồi tải lên.",
  "Only PNG, JPEG and WebP image content is accepted.":
    "Nội dung file không được nhận diện là PNG, JPEG hoặc WebP. Hãy mở ảnh và xuất lại đúng định dạng; đổi đuôi file không chuyển đổi định dạng ảnh.",
  "Unsupported image content.":
    "Định dạng thực của ảnh chưa được hỗ trợ. Hãy xuất lại thành PNG, JPEG hoặc WebP.",
  "Too many parts":
    "API từ chối vì giới hạn số phần của form upload. Hãy restart API để nạp cấu hình multipart mới rồi thử lại.",
  "Too many fields":
    "Form upload có quá nhiều trường. Hãy tải lại trang và thử lại.",
  "Too many files": "Mỗi lần chỉ được tải lên một file ảnh.",
  "Field value too long":
    "Một trường thông tin vượt giới hạn dung lượng. Hãy rút gọn tags hoặc JSON thuộc tính.",
  "Unexpected field":
    "API nhận được trường file không đúng. Hãy tải lại trang để đồng bộ giao diện và API.",
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function jsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 10) return false;
  return (
    value === null ||
    ["string", "boolean"].includes(typeof value) ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (Array.isArray(value) &&
      value.every((item: unknown) => jsonValue(item, depth + 1))) ||
    (record(value) &&
      Object.values(value).every((item) => jsonValue(item, depth + 1)))
  );
}
function isAsset(value: unknown): value is GameAsset {
  if (!record(value)) return false;
  return (
    [
      "id",
      "name",
      "objectKey",
      "originalFileName",
      "mimeType",
      "objectType",
      "createdAt",
      "updatedAt",
    ].every((key) => typeof value[key] === "string") &&
    typeof value.sizeBytes === "number" &&
    value.sizeBytes > 0 &&
    (value.status === "ACTIVE" || value.status === "INACTIVE") &&
    (typeof value.createdBy === "string" || value.createdBy === null) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag: unknown) => typeof tag === "string") &&
    record(value.attributes) &&
    jsonValue(value.attributes) &&
    Number.isFinite(Date.parse(String(value.createdAt))) &&
    Number.isFinite(Date.parse(String(value.updatedAt)))
  );
}
function invalidResponse(): never {
  throw new GameAssetApiError(
    "Phản hồi thư viện hình ảnh không hợp lệ. Vui lòng thử lại.",
    0,
  );
}
function parseAsset(value: unknown): GameAsset {
  return isAsset(value) ? value : invalidResponse();
}
function parsePage(value: unknown): AssetPage {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isAsset) ||
    !record(value.pagination)
  )
    return invalidResponse();
  const p = value.pagination;
  if (
    !["page", "pageSize", "total", "totalPages"].every(
      (key) => typeof p[key] === "number" && Number.isSafeInteger(p[key]),
    ) ||
    Number(p.page) < 1 ||
    Number(p.pageSize) < 1 ||
    Number(p.pageSize) > 100 ||
    Number(p.total) < 0 ||
    Number(p.totalPages) < 0 ||
    value.items.length > Number(p.pageSize)
  )
    return invalidResponse();
  return value as unknown as AssetPage;
}
export function parseAssetReadUrl(value: unknown): AssetReadUrl {
  if (
    !record(value) ||
    typeof value.url !== "string" ||
    typeof value.expiresIn !== "number" ||
    !Number.isFinite(value.expiresIn) ||
    value.expiresIn <= 0 ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.now()
  )
    return invalidResponse();
  try {
    const url = new URL(value.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return invalidResponse();
  } catch {
    return invalidResponse();
  }
  return value as unknown as AssetReadUrl;
}

// One instance per access token; private URLs live only in this in-memory cache.
export class GameAssetsApi {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly readCache = new Map<string, AssetReadUrl>();
  private readonly readInFlight = new Map<string, Promise<AssetReadUrl>>();

  constructor(
    token: string,
    baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "",
    fetcher: typeof fetch = fetch,
  ) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetcher = fetcher;
  }
  private async request(
    path: string,
    options: {
      method?: string;
      body?: BodyInit;
      json?: boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<unknown> {
    if (!this.baseUrl)
      throw new GameAssetApiError(
        "Chưa cấu hình địa chỉ API cho giao diện.",
        0,
      );
    let response: Response;
    try {
      // Browser fetch must receive Window/globalThis, not this API client instance.
      response = await this.fetcher.call(
        globalThis,
        `${this.baseUrl}/api/v1/game-assets${path}`,
        {
          method: options.method ?? "GET",
          credentials: "include",
          cache: "no-store",
          signal: options.signal,
          headers: {
            Authorization: `Bearer ${this.token}`,
            ...(options.json ? { "Content-Type": "application/json" } : {}),
          },
          body: options.body,
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new GameAssetApiError(
        "Không kết nối được hệ thống. Vui lòng kiểm tra kết nối và thử lại.",
        0,
      );
    }
    if (!response.ok) {
      let specificMessage: string | undefined;
      if (response.status === 400) {
        try {
          const failure: unknown = await response.json();
          if (record(failure) && typeof failure.message === "string") {
            specificMessage = uploadBadRequestMessages[failure.message];
            // Nest may append the multipart field name; match only fixed prefixes.
            if (!specificMessage) {
              for (const prefix of [
                "Field value too long",
                "Unexpected field",
              ]) {
                if (failure.message.startsWith(`${prefix} - `))
                  specificMessage = uploadBadRequestMessages[prefix];
              }
            }
          }
        } catch {
          // Keep the safe status-based fallback for non-JSON error responses.
        }
      }
      throw new GameAssetApiError(
        specificMessage ??
          messages[response.status] ??
          "Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.",
        response.status,
      );
    }
    let envelope: unknown;
    try {
      envelope = await response.json();
    } catch {
      return invalidResponse();
    }
    if (!record(envelope) || envelope.success !== true || !("data" in envelope))
      return invalidResponse();
    return envelope.data;
  }
  async list(
    params: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<AssetPage> {
    return parsePage(await this.request(`?${params}`, { signal }));
  }
  async detail(id: string, signal?: AbortSignal): Promise<GameAsset> {
    return parseAsset(
      await this.request(`/${encodeURIComponent(id)}`, { signal }),
    );
  }
  async upload(body: FormData): Promise<GameAsset> {
    return parseAsset(await this.request("", { method: "POST", body }));
  }
  async update(id: string, metadata: AssetMetadata): Promise<GameAsset> {
    return parseAsset(
      await this.request(`/${encodeURIComponent(id)}`, {
        method: "PATCH",
        json: true,
        body: JSON.stringify(metadata),
      }),
    );
  }
  async setStatus(id: string, status: AssetStatus): Promise<GameAsset> {
    return parseAsset(
      await this.request(`/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        json: true,
        body: JSON.stringify({ status }),
      }),
    );
  }
  getReadUrl(id: string, force = false): Promise<AssetReadUrl> {
    const cached = this.readCache.get(id);
    if (!force && cached && Date.parse(cached.expiresAt) > Date.now() + 30000)
      return Promise.resolve(cached);
    const running = this.readInFlight.get(id);
    if (running) return running;
    const promise = this.request(`/${encodeURIComponent(id)}/url`)
      .then(parseAssetReadUrl)
      .then((result) => {
        if (this.readCache.size >= 200) this.readCache.clear();
        this.readCache.set(id, result);
        return result;
      })
      .finally(() => this.readInFlight.delete(id));
    this.readInFlight.set(id, promise);
    return promise;
  }
}

export function assetErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Thao tác chưa thành công. Vui lòng thử lại.";
}
