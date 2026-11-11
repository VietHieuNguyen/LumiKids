import { ApiProblem } from '../../common/http/api-problem.js';
import {
  requestedObjectTypes,
  searchTerms,
  selectCandidates,
  toCandidate,
} from './asset-selection.js';
import type { GenerationAssetRow } from './asset-selection.js';
import { validateGeneratedContent } from './game-validation.js';

const lionId = '61aa17ec-2380-4f39-9229-045322b692d7';
const otherId = '1e819292-dae8-4eb3-a24c-9a60974203d2';
const prompt =
  'Tạo trò chơi đếm 5 con sư tử, cho trẻ chọn đáp án đúng từ 3 lựa chọn.';
const lion = (): GenerationAssetRow => ({
  id: lionId,
  name: 'LION',
  objectType: 'LION',
  tags: [
    'lion',
    'animal',
    'land',
    'savanna',
    'grassland',
    'classification',
    'counting',
  ],
  attributes: { habitat: 'LAND', category: 'ANIMAL' },
  status: 'ACTIVE',
});
const counting = (assetId = lionId) => ({
  schemaVersion: 1,
  gameType: 'COUNTING',
  instruction: 'Có bao nhiêu con sư tử?',
  items: Array.from({ length: 5 }, (_, index) => ({
    id: `lion-${index + 1}`,
    assetId,
  })),
  choices: [
    { id: 'four', value: 4 },
    { id: 'five', value: 5 },
    { id: 'six', value: 6 },
  ],
  correctChoiceId: 'five',
  completionRule: 'CORRECT_CHOICE',
});

describe('Vietnamese object retrieval across game types', () => {
  it.each([
    ['sư tử', 'LION'],
    ['lợn', 'PIG'],
    ['heo', 'PIG'],
    ['voi', 'ELEPHANT'],
    ['hổ', 'TIGER'],
    ['thỏ', 'RABBIT'],
    ['gấu', 'BEAR'],
    ['khỉ', 'MONKEY'],
    ['bò', 'COW'],
    ['ngựa', 'HORSE'],
    ['gà', 'CHICKEN'],
    ['vịt', 'DUCK'],
    ['rùa', 'TURTLE'],
  ])(
    'retrieves English metadata for %s and validates the same object type',
    (name, objectType) => {
      const request = `Đếm 5 con ${name}`;
      expect(searchTerms(request)).toContain(objectType.toLowerCase());
      expect(requestedObjectTypes(request)).toEqual([objectType]);
      const asset = { ...lion(), name: objectType, objectType, tags: [] };
      expect(selectCandidates(request, [asset], 'COUNTING')).toHaveLength(1);
      expect(
        validateGeneratedContent(counting(), 'COUNTING', request, [
          toCandidate(asset),
        ]).errors,
      ).toEqual([]);
    },
  );

  it('prioritizes lion lookup and excludes answer instructions from search terms', () => {
    const terms = searchTerms(prompt);
    expect(terms).toContain('lion');
    for (const term of ['chon', 'dap', 'an', 'dung', 'lua'])
      expect(terms).not.toContain(term);
  });

  it('preserves Vietnamese meaning while accepting uppercase and decomposed Unicode', () => {
    expect(requestedObjectTypes('ĐẾM 5 CON SƯ TỬ'.normalize('NFD'))).toEqual([
      'LION',
    ]);
    expect(
      requestedObjectTypes('Tạo trò chơi cho trẻ, ghép với hình tương ứng'),
    ).toEqual([]);
  });

  it('uses one ACTIVE image for five counting instances without requiring a counting tag', () => {
    const asset = { ...lion(), tags: ['lion'] };
    const candidates = selectCandidates(prompt, [asset], 'COUNTING');
    expect(candidates).toHaveLength(1);
    expect(
      validateGeneratedContent(counting(), 'COUNTING', prompt, candidates)
        .errors,
    ).toEqual([]);
    expect(() =>
      selectCandidates(prompt, [{ ...asset, status: 'INACTIVE' }], 'COUNTING'),
    ).toThrow(ApiProblem);
  });

  it('does not accept another animal merely because it has a counting tag', () => {
    const pig = {
      ...lion(),
      id: otherId,
      name: 'PIG',
      objectType: 'PIG',
      tags: ['pig', 'counting'],
    };
    expect(() => selectCandidates(prompt, [pig], 'COUNTING')).toThrow(
      ApiProblem,
    );
    expect(
      validateGeneratedContent(counting(otherId), 'COUNTING', prompt, [
        toCandidate(lion()),
        toCandidate(pig),
      ]).errors,
    ).toContain('REQUESTED_OBJECT_TYPE_MISMATCH');
  });

  it('supports lion silhouette matching using the same object aliases', () => {
    const normal = {
      ...lion(),
      attributes: { animalType: 'LION', matchKey: 'lion', variant: 'NORMAL' },
    };
    const shadow = {
      ...normal,
      id: otherId,
      name: 'LION_SHADOW',
      objectType: 'LION_SHADOW',
      attributes: { ...normal.attributes, variant: 'SHADOW' },
    };
    const request = 'Ghép con sư tử với hình bóng tương ứng';
    const candidates = selectCandidates(request, [normal, shadow], 'MATCHING');
    expect(candidates).toHaveLength(2);
    expect(
      validateGeneratedContent(
        {
          schemaVersion: 1,
          gameType: 'MATCHING',
          instruction: 'Ghép sư tử với hình bóng.',
          sourceItems: [{ id: 'source', assetId: lionId }],
          targetItems: [{ id: 'target', assetId: otherId }],
          pairs: [{ sourceId: 'source', targetId: 'target' }],
          completionRule: 'ALL_PAIRS_CORRECT',
        },
        'MATCHING',
        request,
        candidates,
      ).errors,
    ).toEqual([]);
    expect(() => selectCandidates(request, [normal], 'MATCHING')).toThrow(
      ApiProblem,
    );
  });

  it('classifies lion and fish with habitat metadata and rejects a contradictory answer', () => {
    const fish = {
      ...lion(),
      id: otherId,
      name: 'FISH',
      objectType: 'FISH',
      tags: ['fish'],
      attributes: { habitat: 'WATER' },
    };
    const request = 'Phân loại sư tử và cá vào hai nhóm trên cạn và dưới nước';
    const candidates = selectCandidates(
      request,
      [lion(), fish],
      'CLASSIFICATION',
    );
    const content = {
      schemaVersion: 1,
      gameType: 'CLASSIFICATION',
      instruction: 'Phân loại các con vật theo môi trường sống.',
      items: [
        { id: 'lion', assetId: lionId, correctGroupId: 'land' },
        { id: 'fish', assetId: otherId, correctGroupId: 'water' },
      ],
      groups: [
        { id: 'land', label: 'Trên cạn' },
        { id: 'water', label: 'Dưới nước' },
      ],
      completionRule: 'ALL_ITEMS_CLASSIFIED_CORRECTLY',
    };
    expect(
      validateGeneratedContent(content, 'CLASSIFICATION', request, candidates)
        .errors,
    ).toEqual([]);
    content.items[0].correctGroupId = 'water';
    content.items[1].correctGroupId = 'land';
    expect(
      validateGeneratedContent(content, 'CLASSIFICATION', request, candidates)
        .errors,
    ).toContain('CLASSIFICATION_METADATA_CONTRADICTION');
  });

  it('keeps custom object types searchable through Vietnamese metadata', () => {
    const asset = {
      ...lion(),
      name: 'Tàu vũ trụ',
      objectType: 'SPACECRAFT',
      tags: [],
    };
    expect(
      selectCandidates('Đếm 5 tàu vũ trụ', [asset], 'COUNTING'),
    ).toHaveLength(1);
    expect(
      selectCandidates(
        'Đếm 5 tàu vũ trụ',
        [{ ...asset, name: 'SPACECRAFT', tags: ['tàu vũ trụ'] }],
        'COUNTING',
      ),
    ).toHaveLength(1);
  });

  it('does not confuse the noun tủ with từ in answer instructions', () => {
    const asset = { ...lion(), name: 'Tủ', objectType: 'CABINET', tags: [] };
    expect(
      selectCandidates(
        'Đếm 5 cái tủ, chọn đáp án đúng từ 3 lựa chọn.',
        [asset],
        'COUNTING',
      ),
    ).toHaveLength(1);
  });
});
