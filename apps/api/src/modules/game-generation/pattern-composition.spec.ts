import type { CandidateAsset } from '@lumikids/ai-client';
import { pickPatternAssets } from './pattern-composition.js';

const animal = (
  id: string,
  objectType: string,
  aliases: string[],
  extra: Record<string, string> = {},
): CandidateAsset => ({
  id,
  name: aliases[0],
  objectType,
  tags: [],
  attributes: { category: 'ANIMAL', aliases, ...extra },
});
const pastel = { visualStyle: 'CARTOON_2D', assetSet: 'LUMI_PASTEL_01' };
const rabbit = animal('8b0c1f0e-0000-4000-8000-000000000001', 'RABBIT', ['thỏ', 'con thỏ'], pastel);
const chick = animal('8b0c1f0e-0000-4000-8000-000000000002', 'CHICK', ['gà con'], pastel);
const pig = animal('8b0c1f0e-0000-4000-8000-000000000003', 'PIG', ['heo', 'lợn'], pastel);
const cat = animal('8b0c1f0e-0000-4000-8000-000000000004', 'CAT', ['mèo'], pastel);
const realisticLion = animal('8b0c1f0e-0000-4000-8000-000000000005', 'LION', ['sư tử'], {
  visualStyle: 'REALISTIC',
  assetSet: 'ANIMALS_REALISTIC_01',
});
const rabbitShadow = animal('8b0c1f0e-0000-4000-8000-000000000006', 'RABBIT', ['thỏ'], {
  variant: 'SHADOW',
});

describe('pickPatternAssets', () => {
  it('takes the animals named in the prompt first, in prompt order', () => {
    const picked = pickPatternAssets('dãy thỏ và gà con', [pig, chick, rabbit], 2);
    expect(picked.slice(0, 2).map((asset) => asset.objectType)).toEqual(['RABBIT', 'CHICK']);
  });
  it('throws PATTERN_ASSETS_INSUFFICIENT when there are not enough pictures', () => {
    expect(() => pickPatternAssets('dãy con vật', [rabbit, chick, pig], 4)).toThrow(
      expect.objectContaining({ publicCode: 'PATTERN_ASSETS_INSUFFICIENT' }),
    );
  });
  it('never picks a shadow picture', () => {
    const picked = pickPatternAssets('dãy thỏ', [rabbitShadow, rabbit, chick], 2);
    expect(picked.map((asset) => asset.id)).not.toContain(rabbitShadow.id);
  });
  it('fills with pictures from the same set as the first pick', () => {
    const picked = pickPatternAssets('dãy thỏ', [realisticLion, rabbit, cat], 2);
    expect(picked.map((asset) => asset.objectType)).toEqual(['RABBIT', 'CAT']);
  });
  it('uses one picture per animal type', () => {
    const second = { ...rabbit, id: '8b0c1f0e-0000-4000-8000-000000000007' };
    const picked = pickPatternAssets('dãy thỏ', [rabbit, second, cat, pig], 3);
    expect(new Set(picked.map((asset) => asset.objectType)).size).toBe(picked.length);
  });
});
