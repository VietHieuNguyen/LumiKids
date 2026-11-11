import { Logger } from '@nestjs/common';
import {
  AiClient,
  AiClientError,
  generateGameSchema,
} from '@lumikids/ai-client';
import type { CandidateAsset } from '@lumikids/ai-client';
import { GameGenerationService } from './game-generation.service.js';
import { GameAssetService } from '../game-assets/game-asset.service.js';
import {
  concepts,
  requestedItemCount,
  searchTerms,
  selectCandidates,
  toCandidate,
} from './asset-selection.js';
import type { GenerationAssetRow } from './asset-selection.js';
import { validateGeneratedContent } from './game-validation.js';
import { adminFixture } from '../../../test/game-asset.fixtures.js';

const red = '61aa17ec-2380-4f39-9229-045322b692d7';
const blue = '1e819292-dae8-4eb3-a24c-9a60974203d2';
const candidate = (id = red, color = 'RED'): CandidateAsset => ({
  id,
  name: `Bóng ${color}`,
  objectType: 'BALL',
  tags: ['ball', color.toLowerCase()],
  attributes: { color },
});
const row = (id = red, color = 'RED'): GenerationAssetRow => ({
  ...candidate(id, color),
  status: 'ACTIVE',
});
const counting = () => ({
  schemaVersion: 1,
  gameType: 'COUNTING' as const,
  instruction: 'Đếm bóng',
  items: [{ id: 'ball-1', assetId: red }],
  choices: [
    { id: 'one', value: 1 },
    { id: 'two', value: 2 },
  ],
  correctChoiceId: 'one',
  completionRule: 'CORRECT_CHOICE',
});
const matching = () => ({
  schemaVersion: 1,
  gameType: 'MATCHING' as const,
  instruction: 'Ghép bóng',
  sourceItems: [{ id: 's1', assetId: red }],
  targetItems: [{ id: 't1', assetId: blue }],
  pairs: [{ sourceId: 's1', targetId: 't1' }],
  completionRule: 'ALL_PAIRS_CORRECT',
});
const classification = () => ({
  schemaVersion: 1,
  gameType: 'CLASSIFICATION' as const,
  instruction: 'Phân loại bóng',
  items: [
    { id: 'r1', assetId: red, correctGroupId: 'red' },
    { id: 'b1', assetId: blue, correctGroupId: 'blue' },
  ],
  groups: [
    { id: 'red', label: 'Đỏ' },
    { id: 'blue', label: 'Xanh dương' },
  ],
  completionRule: 'ALL_ITEMS_CLASSIFIED_CORRECTLY',
});

describe('Generation validation and metadata selection', () => {
  it('validates strict requests without asset injection', () => {
    for (const input of [
      { gameType: 'ALIEN', prompt: 'x' },
      { gameType: 'COUNTING', prompt: ' ' },
      { gameType: 'MATCHING', prompt: 'x'.repeat(2001) },
      { gameType: 'COUNTING', prompt: 'x', assetIds: [red] },
    ])
      expect(generateGameSchema.safeParse(input).success).toBe(false);
  });
  it('expands Vietnamese and still searches arbitrary metadata words', () => {
    expect(
      searchTerms(
        'Tạo trò chơi phân loại bóng đỏ và xanh dương hình tàu vũ trụ',
      ),
    ).toEqual(expect.arrayContaining(['ball', 'red', 'blue', 'tau', 'tru']));
    expect(concepts('Tìm đồ vật cho trẻ')).toEqual([]);
    expect(
      selectCandidates('Tàu vũ trụ', [
        { ...row(), name: 'Tàu vũ trụ', objectType: 'SPACECRAFT' },
      ]),
    ).toHaveLength(1);
  });
  it('does not expose object keys/URLs or nested arbitrary metadata', () => {
    expect(
      toCandidate({
        ...row(),
        attributes: {
          color: 'RED',
          secret: 'do not send',
          url: 'http://private',
          nested: { foo: 'x' },
        },
      }).attributes,
    ).toEqual({ color: 'RED' });
  });
  it('rejects inactive assets, missing types/colors and ambiguous xanh', () => {
    expect(() =>
      selectCandidates('Bóng đỏ', [{ ...row(), status: 'INACTIVE' }]),
    ).toThrow();
    expect(() => selectCandidates('Bóng đỏ và xanh dương', [row()])).toThrow();
    expect(() =>
      selectCandidates('Bóng xanh', [row(red, 'BLUE'), row(blue, 'GREEN')]),
    ).toThrow();
    expect(selectCandidates('Bóng xanh', [row(blue, 'BLUE')])).toHaveLength(1);
  });
  it('caps candidates and keeps color diversity', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({
      ...row(),
      id: `${String(i).padStart(8, '0')}-2380-4f39-9229-045322b692d7`,
    }));
    const selected = selectCandidates('Bóng đỏ và xanh dương', [
      ...rows,
      row(blue, 'BLUE'),
    ]);
    expect(selected).toHaveLength(40);
    expect(selected.some((asset) => asset.id === blue)).toBe(true);
  });
  it('counts repeated instances of the same asset and rejects incorrect COUNTING answers', () => {
    const value = counting();
    expect(
      validateGeneratedContent(value, 'COUNTING', 'Đếm 1 quả bóng', [
        candidate(),
      ]).errors,
    ).toEqual([]);
    expect(
      validateGeneratedContent(
        { ...value, correctChoiceId: 'two' },
        'COUNTING',
        'Đếm bóng',
        [candidate()],
      ).errors,
    ).toContain('GAME_SCHEMA_INVALID');
    expect(
      validateGeneratedContent(value, 'COUNTING', 'Đếm 4 quả bóng', [
        candidate(),
      ]).errors,
    ).toContain('REQUESTED_ITEM_COUNT_MISMATCH');
    expect(requestedItemCount('6 quả bóng gồm 3 quả đỏ và 3 quả xanh')).toBe(6);
    expect(requestedItemCount('3 quả đỏ và 3 quả xanh')).toBe(6);
  });
  it('rejects unsupported versions, game type mismatch and unlisted asset IDs', () => {
    expect(
      validateGeneratedContent(
        { ...counting(), schemaVersion: 2 },
        'COUNTING',
        'Bóng',
        [candidate()],
      ).errors,
    ).toContain('GAME_SCHEMA_INVALID');
    expect(
      validateGeneratedContent(counting(), 'MATCHING', 'Bóng', [candidate()])
        .errors,
    ).toContain('GAME_TYPE_MISMATCH');
    expect(
      validateGeneratedContent(counting(), 'COUNTING', 'Bóng', []).errors,
    ).toContain('ASSET_NOT_WHITELISTED');
  });
  it('validates MATCHING coverage and checks trusted matching keys', () => {
    const candidates = [candidate(), candidate(blue, 'BLUE')].map((asset) => ({
      ...asset,
      attributes: { matchKey: 'cat' },
    }));
    expect(
      validateGeneratedContent(matching(), 'MATCHING', 'Ghép bóng', candidates)
        .errors,
    ).toEqual([]);
    candidates[1].attributes.matchKey = 'dog';
    expect(
      validateGeneratedContent(matching(), 'MATCHING', 'Ghép bóng', candidates)
        .errors,
    ).toContain('MATCHING_METADATA_CONTRADICTION');
    expect(
      validateGeneratedContent(
        { ...matching(), pairs: [{ sourceId: 'missing', targetId: 't1' }] },
        'MATCHING',
        'Ghép bóng',
        candidates,
      ).errors,
    ).toContain('GAME_SCHEMA_INVALID');
  });
  it('distinguishes animal silhouettes from balls and accepts typed shadow assets', () => {
    const prompt = 'Ghép con mèo với hình bóng của nó';
    const rows = [
      {
        ...row(),
        objectType: 'CAT',
        name: 'Mèo',
        attributes: { animalType: 'CAT', matchKey: 'cat', variant: 'NORMAL' },
      },
      {
        ...row(blue),
        objectType: 'CAT_SHADOW',
        name: 'Hình bóng mèo',
        attributes: { animalType: 'CAT', matchKey: 'cat', variant: 'SHADOW' },
      },
    ];
    const candidates = selectCandidates(prompt, rows);
    expect(candidates).toHaveLength(2);
    expect(concepts(prompt)).not.toContain('BALL');
    expect(
      validateGeneratedContent(matching(), 'MATCHING', prompt, candidates)
        .errors,
    ).toEqual([]);
  });
  it('accepts six instances from two images and rejects wrong color counts', () => {
    const value = classification();
    value.items = Array.from({ length: 6 }, (_, index) => ({
      id: `ball-${index}`,
      assetId: index < 3 ? red : blue,
      correctGroupId: index < 3 ? 'red' : 'blue',
    }));
    const candidates = [candidate(), candidate(blue, 'BLUE')];
    const prompt =
      'Phân loại 6 quả bóng gồm 3 quả đỏ và 3 quả xanh dương vào hai nhóm';
    expect(
      validateGeneratedContent(value, 'CLASSIFICATION', prompt, candidates)
        .errors,
    ).toEqual([]);
    value.items[2] = { id: 'ball-2', assetId: blue, correctGroupId: 'blue' };
    expect(
      validateGeneratedContent(value, 'CLASSIFICATION', prompt, candidates)
        .errors,
    ).toContain('REQUESTED_COLOR_COUNT_MISMATCH');
    expect(
      validateGeneratedContent(
        value,
        'CLASSIFICATION',
        'Chia bóng vào ba nhóm',
        candidates,
      ).errors,
    ).toContain('REQUESTED_GROUP_COUNT_MISMATCH');
  });
  it('validates CLASSIFICATION group references, duplicate IDs and metadata contradictions', () => {
    const value = classification();
    const candidates = [candidate(), candidate(blue, 'BLUE')];
    expect(
      validateGeneratedContent(
        value,
        'CLASSIFICATION',
        'Phân loại bóng',
        candidates,
      ).errors,
    ).toEqual([]);
    value.items[0].correctGroupId = 'blue';
    value.items[1].correctGroupId = 'red';
    expect(
      validateGeneratedContent(
        value,
        'CLASSIFICATION',
        'Phân loại bóng',
        candidates,
      ).errors,
    ).toContain('CLASSIFICATION_METADATA_CONTRADICTION');
    expect(
      validateGeneratedContent(
        { ...value, items: [{ ...value.items[0], correctGroupId: 'absent' }] },
        'CLASSIFICATION',
        'Bóng',
        candidates,
      ).errors,
    ).toContain('GAME_SCHEMA_INVALID');
    expect(
      validateGeneratedContent(
        { ...value, items: [value.items[0], value.items[0]] },
        'CLASSIFICATION',
        'Bóng',
        candidates,
      ).errors,
    ).toContain('GAME_SCHEMA_INVALID');
  });
  it('reports missing semantic evidence instead of declaring answers verified', () => {
    const result = validateGeneratedContent(
      matching(),
      'MATCHING',
      'Ghép bóng',
      [candidate(), candidate(blue)],
    );
    expect(result.warnings).toContain('MATCHING_SEMANTICS_NOT_VERIFIABLE');
    expect(result.warnings).toContain('ADULT_REVIEW_REQUIRED');
  });
});

describe('GameGenerationService (no DB, storage or Gemini calls)', () => {
  const assets = { generationCandidates: vi.fn(), generationAssets: vi.fn() };
  const ai = { generate: vi.fn() };
  const user = {
    ...adminFixture,
    permissions: ['GENERATE_GAME_CONTENT' as const],
  };
  const config = {
    url: 'http://ai.example.test',
    token: 'x'.repeat(32),
    timeoutMs: 25000,
  };
  let service: GameGenerationService;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    assets.generationCandidates.mockResolvedValue([row()]);
    assets.generationAssets.mockResolvedValue([row()]);
    ai.generate.mockImplementation(async (input) => ({
      requestId: input.requestId,
      gameContent: counting(),
      model: 'fixture',
    }));
    service = new GameGenerationService(
      assets as unknown as GameAssetService,
      config,
      ai as unknown as AiClient,
    );
  });
  afterEach(() => vi.restoreAllMocks());
  it('logs safe provider status/category in the Nest summary', async () => {
    const logs = vi.spyOn(Logger.prototype, 'log');
    ai.generate.mockRejectedValue(
      new AiClientError('AI_PROVIDER_CONFIG_ERROR', false, {
        providerStatus: 404,
        category: 'MODEL_OR_ENDPOINT_UNAVAILABLE',
      }),
    );
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: 'AI_PROVIDER_CONFIG_ERROR' });
    expect(logs).toHaveBeenCalledWith(
      expect.stringContaining('"category":"MODEL_OR_ENDPOINT_UNAVAILABLE"'),
    );
    expect(logs).toHaveBeenCalledWith(
      expect.stringContaining('"providerStatus":404'),
    );
  });
  it('returns a validated draft and uses metadata-only service integration', async () => {
    const result = await service.generate(user, {
      gameType: 'COUNTING',
      prompt: 'Đếm bóng đỏ',
    });
    expect(result.generation).toMatchObject({
      attempts: 1,
      reviewRequired: true,
    });
    expect(assets.generationAssets).toHaveBeenCalledWith(user, [red]);
    expect(ai.generate.mock.calls[0][0].candidates).toEqual([candidate()]);
  });
  it('retrieves LION for a Vietnamese prompt and reuses one image for five items', async () => {
    const lion = {
      ...row(),
      name: 'LION',
      objectType: 'LION',
      tags: ['lion', 'animal', 'land'],
      attributes: { habitat: 'LAND', category: 'ANIMAL' },
    };
    assets.generationCandidates.mockResolvedValue([lion]);
    assets.generationAssets.mockResolvedValue([lion]);
    ai.generate.mockImplementation(async (input) => ({
      requestId: input.requestId,
      gameContent: {
        ...counting(),
        instruction: 'Có bao nhiêu con sư tử?',
        items: Array.from({ length: 5 }, (_, index) => ({
          id: `lion-${index + 1}`,
          assetId: red,
        })),
        choices: [
          { id: 'four', value: 4 },
          { id: 'five', value: 5 },
          { id: 'six', value: 6 },
        ],
        correctChoiceId: 'five',
      },
      model: 'fixture',
    }));
    const result = await service.generate(user, {
      gameType: 'COUNTING',
      prompt:
        'Tạo trò chơi đếm 5 con sư tử, cho trẻ chọn đáp án đúng từ 3 lựa chọn.',
    });
    expect(assets.generationCandidates).toHaveBeenCalledWith(
      user,
      expect.arrayContaining(['lion']),
    );
    expect(ai.generate).toHaveBeenCalledTimes(1);
    expect(ai.generate.mock.calls[0][0].candidates).toEqual([
      toCandidate(lion),
    ]);
    expect(result.gameContent.gameType).toBe('COUNTING');
    if (result.gameContent.gameType === 'COUNTING') {
      expect(result.gameContent.items).toHaveLength(5);
      expect(
        new Set(result.gameContent.items.map((item) => item.assetId)),
      ).toEqual(new Set([red]));
    }
    expect(assets.generationAssets).toHaveBeenCalledWith(user, [red]);
  });
  it('rejects another animal tagged counting before calling AI for a lion request', async () => {
    assets.generationCandidates.mockResolvedValue([
      {
        ...row(),
        name: 'PIG',
        objectType: 'PIG',
        tags: ['pig', 'counting'],
      },
    ]);
    await expect(
      service.generate(user, {
        gameType: 'COUNTING',
        prompt: 'Tạo trò chơi đếm 5 con sư tử.',
      }),
    ).rejects.toMatchObject({ publicCode: 'ASSETS_INSUFFICIENT' });
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('checks permission/configuration before any AI call', async () => {
    await expect(
      service.generate(
        { ...user, permissions: [] },
        { gameType: 'COUNTING', prompt: 'Bóng' },
      ),
    ).rejects.toThrow();
    const unconfigured = new GameGenerationService(
      assets as unknown as GameAssetService,
      { ...config, url: undefined },
      ai as unknown as AiClient,
    );
    await expect(
      unconfigured.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: 'AI_NOT_CONFIGURED' });
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('fails before calling AI when assets are insufficient', async () => {
    assets.generationCandidates.mockResolvedValue([]);
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: 'ASSETS_INSUFFICIENT' });
    expect(ai.generate).not.toHaveBeenCalled();
  });
  it('retries invalid generation exactly once with sanitized codes', async () => {
    ai.generate.mockResolvedValueOnce({
      gameContent: { secret: 'bad' },
      model: 'fixture',
    });
    const result = await service.generate(user, {
      gameType: 'COUNTING',
      prompt: 'Bóng',
    });
    expect(result.generation.attempts).toBe(2);
    expect(ai.generate.mock.calls[1][0].validationErrors).toEqual([
      'GAME_SCHEMA_INVALID',
    ]);
  });
  it('bounds repeated invalid outputs and leaves no stale in-flight lock', async () => {
    ai.generate.mockResolvedValue({ gameContent: {}, model: 'fixture' });
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: 'AI_OUTPUT_INVALID' });
    expect(ai.generate).toHaveBeenCalledTimes(2);
    ai.generate.mockResolvedValue({
      gameContent: counting(),
      model: 'fixture',
    });
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).resolves.toBeDefined();
  });
  it.each([
    'AI_PROVIDER_AUTH_ERROR',
    'AI_QUOTA_EXCEEDED',
    'AI_NOT_CONFIGURED',
  ] as const)('does not retry %s', async (code) => {
    ai.generate.mockRejectedValue(new AiClientError(code, false));
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: code });
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });
  it.each(['AI_TIMEOUT', 'AI_SERVICE_UNAVAILABLE'] as const)(
    'bounds retries for %s',
    async (code) => {
      ai.generate.mockRejectedValue(new AiClientError(code, true));
      await expect(
        service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
      ).rejects.toMatchObject({ publicCode: code });
      expect(ai.generate).toHaveBeenCalledTimes(2);
    },
  );
  it('rechecks ACTIVE after generation and never returns a deactivated asset', async () => {
    assets.generationAssets.mockResolvedValue([
      { ...row(), status: 'INACTIVE' },
    ]);
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: 'ASSETS_CHANGED' });
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });
  it('rejects changed metadata and deleted referenced assets', async () => {
    assets.generationAssets.mockResolvedValue([]);
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: 'ASSETS_CHANGED' });
    assets.generationAssets.mockResolvedValue([row(red, 'BLUE')]);
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng đỏ' }),
    ).rejects.toMatchObject({ publicCode: 'ASSETS_CHANGED' });
  });
  it('does not overlap requests for one account and releases the lock on failure', async () => {
    let finish: (value: unknown) => void = () => undefined;
    ai.generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.generate(user, {
      gameType: 'COUNTING',
      prompt: 'Bóng',
    });
    await vi.waitFor(() => expect(ai.generate).toHaveBeenCalledTimes(1));
    await expect(
      service.generate(user, { gameType: 'COUNTING', prompt: 'Bóng' }),
    ).rejects.toMatchObject({ publicCode: 'GENERATION_BUSY' });
    finish({ gameContent: counting(), model: 'fixture' });
    await expect(first).resolves.toBeDefined();
  });
});
