/** Internal projection: no storage object keys, URLs or creator information. */
export interface GenerationAssetRow {
  id: string;
  name: string;
  objectType: string;
  tags: string[];
  attributes: unknown;
  status: 'ACTIVE' | 'INACTIVE';
}
