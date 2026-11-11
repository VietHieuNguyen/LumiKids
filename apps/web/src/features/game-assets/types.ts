export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type AssetStatus = "ACTIVE" | "INACTIVE";
export interface GameAsset {
  id: string;
  name: string;
  objectKey: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  objectType: string;
  tags: string[];
  attributes: Record<string, JsonValue>;
  status: AssetStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AssetMetadata {
  name: string;
  objectType: string;
  tags: string[];
  attributes: Record<string, JsonValue>;
}
export interface AssetFilters {
  search: string;
  objectType: string;
  tags: string[];
  status: AssetStatus;
  page: number;
  pageSize: number;
}
export interface AssetPage {
  items: GameAsset[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
export interface AssetReadUrl {
  url: string;
  expiresIn: number;
  expiresAt: string;
}
export interface AttributeRow {
  id: string;
  key: string;
  value: string;
}
export type AttributeInput =
  { mode: "pairs"; rows: AttributeRow[] } | { mode: "json"; json: string };
