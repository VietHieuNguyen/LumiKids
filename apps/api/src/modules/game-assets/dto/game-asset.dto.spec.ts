import {
  AssetValidationPipe,
  createAssetSchema,
  listAssetsSchema,
  statusSchema,
  updateAssetSchema,
} from './game-asset.dto.js';

describe('GameAsset metadata validation', () => {
  const valid = {
    name: '  Red ball  ',
    objectType: 'BALL',
    tags: '[" Red ","red"]',
    attributes: '{"color":"RED","nested":{"size":2}}',
  };
  it('parses JSON multipart fields, trims name and normalizes tags', () => {
    expect(new AssetValidationPipe(createAssetSchema).transform(valid)).toEqual(
      {
        name: 'Red ball',
        objectType: 'BALL',
        tags: ['red'],
        attributes: { color: 'RED', nested: { size: 2 } },
      },
    );
  });
  it.each([
    { ...valid, tags: 'red,ball' },
    { ...valid, attributes: '{bad' },
    { ...valid, attributes: '[]' },
    { ...valid, attributes: 'null' },
    { ...valid, name: '' },
    { ...valid, objectType: '../BALL' },
    { ...valid, tags: '[1]' },
    { ...valid, status: 'INACTIVE' },
    { ...valid, objectKey: 'override.png' },
    { ...valid, attributes: '{"__proto__":{"admin":true}}' },
    { ...valid, attributes: { a: { b: { c: { d: { e: { f: 1 } } } } } } },
    { ...valid, attributes: { value: 'a'.repeat(16385) } },
  ])('rejects malformed/unexpected metadata (%#)', (value) => {
    expect(() =>
      new AssetValidationPipe(createAssetSchema).transform(value),
    ).toThrow('Invalid game asset metadata or query.');
  });
  it.each([
    { objectKey: 'replacement' },
    { mimeType: 'image/jpeg' },
    { status: 'ACTIVE' },
    { id: 'fake' },
    {},
    { name: null },
    { attributes: null },
  ])('rejects immutable/empty/null PATCH (%#)', (value) => {
    expect(updateAssetSchema.safeParse(value).success).toBe(false);
  });
  it('allows a partial metadata patch and a separate status request', () => {
    expect(
      updateAssetSchema.parse({ attributes: { habitat: 'WATER' } }),
    ).toEqual({ attributes: { habitat: 'WATER' } });
    expect(statusSchema.parse({ status: 'INACTIVE' })).toEqual({
      status: 'INACTIVE',
    });
  });
  it('defaults to bounded active list', () => {
    expect(listAssetsSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      status: 'ACTIVE',
    });
  });
  it.each([
    { pageSize: '101' },
    { page: '0' },
    { status: 'DISABLED' },
    { search: ['a', 'b'] },
    { attributes: '{"color":{"nested":1}}' },
    { unknown: 'value' },
  ])('rejects unsafe list query (%#)', (value) => {
    expect(listAssetsSchema.safeParse(value).success).toBe(false);
  });
});
