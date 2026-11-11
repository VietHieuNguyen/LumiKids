import type {
  AssetFilters,
  AssetMetadata,
  AttributeInput,
  GameAsset,
  JsonValue,
} from "./types";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
// Suggestions only: administrators can still enter any valid object code.
export const OBJECT_TYPES = [
  "LION",
  "PIG",
  "ELEPHANT",
  "TIGER",
  "RABBIT",
  "BEAR",
  "POLAR_BEAR",
  "CAMEL",
  "MONKEY",
  "COW",
  "HORSE",
  "CHICKEN",
  "DUCK",
  "TURTLE",
  "DOLPHIN",
  "WHALE",
  "SHARK",
  "HABITAT",
  "CAT",
  "DOG",
  "FISH",
  "BIRD",
  "APPLE",
  "MANGO",
  "STRAWBERRY",
  "JACKFRUIT",
  "BANANA",
  "BOOK",
  "CAR",
  "CIRCLE",
  "SQUARE",
  "TRIANGLE",
  "BALL",
  "BASKET",
  "ANIMAL",
  "FRUIT",
  "SHAPE",
];
export const DEFAULT_FILTERS: AssetFilters = {
  search: "",
  objectType: "",
  tags: [],
  status: "ACTIVE",
  page: 1,
  pageSize: 20,
};
const reservedKeys = new Set(["__proto__", "constructor", "prototype"]);

export function validateFile(
  file: Pick<File, "size" | "type"> | null,
): string | null {
  if (!file) return "Vui lòng chọn một ảnh.";
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return "Chỉ chấp nhận ảnh PNG, JPEG hoặc WebP.";
  if (file.size === 0) return "File ảnh đang trống. Vui lòng chọn ảnh khác.";
  if (file.size > MAX_FILE_BYTES)
    return "Ảnh vượt quá giới hạn 5 MiB. Vui lòng chọn ảnh nhỏ hơn.";
  return null;
}

export function parseTags(text: string): string[] {
  const tags = [
    ...new Set(
      text
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 30 || tags.some((tag) => tag.length > 50))
    throw new Error("Tối đa 30 tags, mỗi tag không quá 50 ký tự.");
  return tags;
}

function isJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > 5) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return (
      value.length <= 100 &&
      value.every((item: unknown) => isJson(item, depth + 1))
    );
  if (typeof value !== "object") return false;
  return (
    Object.entries(value).length <= 100 &&
    Object.entries(value).every(
      ([key, item]) =>
        key.trim().length > 0 &&
        key.length <= 100 &&
        !reservedKeys.has(key) &&
        isJson(item, depth + 1),
    )
  );
}

export function parseAttributes(
  input: AttributeInput,
): Record<string, JsonValue> {
  let attributes: unknown;
  if (input.mode === "pairs") {
    const entries = input.rows.map(
      (row) => [row.key.trim(), row.value] as const,
    );
    if (
      entries.some(([key]) => !key || key.length > 100 || reservedKeys.has(key))
    )
      throw new Error(
        "Tên thuộc tính phải có 1–100 ký tự và không dùng tên dành riêng.",
      );
    if (new Set(entries.map(([key]) => key)).size !== entries.length)
      throw new Error(
        "Tên thuộc tính bị trùng. Mỗi key chỉ được xuất hiện một lần.",
      );
    attributes = Object.fromEntries(entries);
  } else {
    if (new TextEncoder().encode(input.json).length > 16384)
      throw new Error("Thuộc tính vượt quá giới hạn 16 KiB.");
    try {
      attributes = JSON.parse(input.json) as unknown;
    } catch {
      throw new Error(
        "JSON thuộc tính không hợp lệ. Vui lòng kiểm tra dấu ngoặc và dấu nháy.",
      );
    }
  }
  if (
    !attributes ||
    typeof attributes !== "object" ||
    Array.isArray(attributes) ||
    !isJson(attributes)
  )
    throw new Error(
      "Thuộc tính phải là một JSON object hợp lệ, tối đa 5 cấp và 100 mục mỗi cấp.",
    );
  if (new TextEncoder().encode(JSON.stringify(attributes)).length > 16384)
    throw new Error("Thuộc tính vượt quá giới hạn 16 KiB.");
  return attributes as Record<string, JsonValue>;
}

export function attributeInputFrom(
  attributes: GameAsset["attributes"],
): AttributeInput {
  if (Object.values(attributes).every((value) => typeof value === "string")) {
    return {
      mode: "pairs",
      rows: Object.entries(attributes).map(([key, value], index) => ({
        id: `existing-${index}`,
        key,
        value: String(value),
      })),
    };
  }
  return { mode: "json", json: JSON.stringify(attributes, null, 2) };
}

export function prepareMetadata(
  name: string,
  objectType: string,
  tagsText: string,
  attributes: AttributeInput,
): AssetMetadata {
  const trimmedName = name.trim();
  const type = objectType.trim().toUpperCase();
  if (!trimmedName || trimmedName.length > 200)
    throw new Error("Tên hình ảnh phải có 1–200 ký tự.");
  if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(type))
    throw new Error(
      "Loại đối tượng phải bắt đầu bằng chữ cái, tối đa 40 ký tự A–Z, 0–9 hoặc dấu gạch dưới.",
    );
  return {
    name: trimmedName,
    objectType: type,
    tags: parseTags(tagsText),
    attributes: parseAttributes(attributes),
  };
}

export function createUploadBody(
  metadata: AssetMetadata,
  file: File,
): FormData {
  const body = new FormData();
  body.append("file", file);
  body.append("name", metadata.name);
  body.append("objectType", metadata.objectType);
  body.append("tags", JSON.stringify(metadata.tags));
  body.append("attributes", JSON.stringify(metadata.attributes));
  return body;
}

export function assetSearchParams(filters: AssetFilters): URLSearchParams {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    status: filters.status,
  });
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.objectType.trim())
    params.set("objectType", filters.objectType.trim());
  if (filters.tags.length) params.set("tags", JSON.stringify(filters.tags));
  return params;
}

export function prepareFilters(input: {
  search: string;
  objectType: string;
  status: AssetFilters["status"];
  tags: string;
  pageSize: number;
}): AssetFilters {
  const search = input.search.trim();
  const objectType = input.objectType.trim().toUpperCase();
  if (search.length > 200)
    throw new Error("Tên tìm kiếm không được vượt quá 200 ký tự.");
  if (objectType && !/^[A-Z][A-Z0-9_]{0,39}$/.test(objectType))
    throw new Error("Loại đối tượng chưa hợp lệ.");
  if (
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 100
  )
    throw new Error("Số ảnh mỗi trang phải từ 1 đến 100.");
  return {
    search,
    objectType,
    status: input.status,
    tags: parseTags(input.tags),
    pageSize: input.pageSize,
    page: 1,
  };
}

export function changeAssetPage(
  filters: AssetFilters,
  page: number,
): AssetFilters {
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new Error("Trang không hợp lệ.");
  return { ...filters, page };
}

export function formatBytes(size: number): string {
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KiB`
    : `${(size / (1024 * 1024)).toFixed(2)} MiB`;
}
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
