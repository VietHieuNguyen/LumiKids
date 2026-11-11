import type { CandidateAsset } from '@lumikids/ai-client';
import type { GameType } from '@lumikids/shared';
import {
  habitatAliases,
  habitatConcepts,
  declaredHabitats,
  expandHabitats,
  AI_ASSET_ATTRIBUTE_KEYS,
  AI_ASSET_ARRAY_ATTRIBUTE_KEYS,
} from '@lumikids/shared';
import {
  isAllowedForTask,
  isCompatiblePair,
  isEnvironmentAsset,
  metadataString,
  requestedMatchingMode,
  assetObjectType,
} from './asset-policy.js';
export { isShadowAsset, requestsShadow } from './asset-policy.js';
import { ApiProblem } from '../../common/http/api-problem.js';
import type { GenerationAssetRow } from '../game-assets/dto/generation-asset.js';
export type { GenerationAssetRow } from '../game-assets/dto/generation-asset.js';

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
// Vocabulary assists bilingual lookup; it does not restrict GameAsset.objectType.
// Keep object recognition shared by retrieval coverage and output validation.
const objectAliases: Record<string, string[]> = {
  BALL: ['ball', 'bóng'],
  APPLE: ['apple', 'táo'],
  CAT: ['cat', 'mèo'],
  DOG: ['dog', 'chó'],
  FISH: ['fish', 'cá'],
  BIRD: ['bird', 'chim'],
  PENGUIN: ['penguin', 'chim cánh cụt'],
  LION: ['lion', 'sư tử'],
  PIG: ['pig', 'lợn', 'heo'],
  ELEPHANT: ['elephant', 'voi'],
  TIGER: ['tiger', 'hổ', 'cọp'],
  RABBIT: ['rabbit', 'thỏ'],
  BEAR: ['bear', 'gấu'],
  POLAR_BEAR: ['polar bear', 'gấu bắc cực'],
  CAMEL: ['camel', 'lạc đà'],
  MONKEY: ['monkey', 'khỉ'],
  COW: ['cow', 'bò'],
  HORSE: ['horse', 'ngựa'],
  CHICKEN: ['chicken', 'gà'],
  DUCK: ['duck', 'vịt'],
  TURTLE: ['turtle', 'rùa'],
  DOLPHIN: ['dolphin', 'cá heo'],
  WHALE: ['whale', 'cá voi'],
  SHARK: ['shark', 'cá mập'],
  BASKET: ['basket', 'giỏ'],
};
const aliases: Record<string, string[]> = {
  ...objectAliases,
  RED: ['red', 'đỏ'],
  BLUE: ['blue', 'xanh dương', 'xanh nước biển'],
  GREEN: ['green', 'xanh lá', 'lục'],
  YELLOW: ['yellow', 'vàng'],
  PURPLE: ['purple', 'tím'],
  ORANGE: ['orange', 'cam'],
  WHITE: ['white', 'trắng'],
  BLACK: ['black', 'đen'],
  CIRCLE: ['circle', 'tròn'],
  SQUARE: ['square', 'vuông'],
  TRIANGLE: ['triangle', 'tam giác'],
  ...Object.fromEntries(
    Object.entries(habitatAliases).map(([key, values]) => [key, [...values]]),
  ),
};
const colors = new Set([
  'RED',
  'BLUE',
  'GREEN',
  'YELLOW',
  'PURPLE',
  'ORANGE',
  'WHITE',
  'BLACK',
]);
function objectVocabulary(
  assets: readonly CandidateAsset[],
): Map<string, Set<string>> {
  const vocabulary = new Map(
    Object.entries(objectAliases).map(([key, values]) => [
      key,
      new Set(values),
    ]),
  );
  for (const asset of assets) {
    // Environment names describe destinations, not the objects to classify.
    if (
      /^(?:ENVIRONMENT|HABITAT)(?:_|$)/i.test(asset.objectType) ||
      ['ENVIRONMENT', 'HABITAT'].includes(
        String(asset.attributes.category ?? '').toUpperCase(),
      )
    )
      continue;
    const identity = assetObjectType(asset);
    const values = vocabulary.get(identity) ?? new Set<string>();
    for (const value of [
      asset.name,
      asset.name.replace(
        /^(?:con|quả|trái|cái|chiếc|hình|quyển|cuốn|tờ|bức|viên|bông)\s+/iu,
        '',
      ),
      identity.replace(/_/g, ' '),
      ...(Array.isArray(asset.attributes.aliases)
        ? asset.attributes.aliases.filter(
            (value): value is string => typeof value === 'string',
          )
        : []),
    ]) {
      const phrase = value
        .normalize('NFC')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
      if (
        phrase.length >= 2 &&
        ![
          'con vật',
          'động vật',
          'hình ảnh',
          'animal',
          'animals',
          'image',
        ].includes(phrase)
      )
        values.add(phrase);
    }
    vocabulary.set(identity, values);
  }
  return vocabulary;
}

function objectMentions(
  prompt: string,
  assets: readonly CandidateAsset[] = [],
): {
  words: string[];
  matches: { key: string; start: number; length: number }[];
} {
  const words =
    prompt
      .normalize('NFC')
      .toLowerCase()
      .replace(
        /hình bóng(?: đen)?|bóng đen|tìm bóng|bóng (?:của|con)/g,
        'shadow',
      )
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const matches: { key: string; start: number; length: number }[] = [];
  for (const [key, values] of objectVocabulary(assets)) {
    for (const value of values) {
      const tokens = value.split(' ');
      for (let start = 0; start <= words.length - tokens.length; start++) {
        if (tokens.every((token, index) => words[start + index] === token))
          matches.push({ key, start, length: tokens.length });
      }
    }
  }
  // "Bóng cam" describes a color; "quả cam" describes the fruit.
  const contextual = matches.filter((match) => {
    // "ghép cặp" names the interaction, not the schoolbag alias "cặp".
    if (
      match.length === 1 &&
      words[match.start] === 'cặp' &&
      (words[match.start - 1] === 'ghép' ||
        (['các', 'từng', 'thành', 'theo'].includes(
          words[match.start - 1] ?? '',
        ) &&
          words[match.start - 2] === 'ghép'))
    )
      return false;
    if (match.length !== 1 || !['cam', 'orange'].includes(words[match.start]!))
      return true;
    if (
      ['màu', 'color', 'coloured', 'colored'].includes(
        words[match.start - 1] ?? '',
      )
    )
      return false;
    return !matches.some(
      (other) =>
        other.key !== match.key && other.start + other.length === match.start,
    );
  });
  return { words, matches: contextual };
}
export function requestedObjectTypes(
  prompt: string,
  assets: readonly CandidateAsset[] = [],
): string[] {
  const { matches } = objectMentions(prompt, assets);
  // Prefer complete metadata names: "cá sấu" is CROCODILE, not FISH;
  // "chim cánh cụt" is PENGUIN, not the generic BIRD.
  const complete = matches.filter(
    (match) =>
      !matches.some(
        (other) =>
          other.length > match.length &&
          other.start <= match.start &&
          other.start + other.length >= match.start + match.length,
      ),
  );
  const available = new Set(assets.map(assetObjectType));
  // An explicit Library alias can resolve a built-in name whose identity is
  // absent, e.g. "rùa" declared for TORTOISE while no TURTLE asset exists.
  // Do not infer relationships from similar species names or partial words.
  const resolved = complete.filter(
    (match) =>
      available.has(match.key) ||
      !complete.some(
        (other) =>
          other.start === match.start &&
          other.length === match.length &&
          available.has(other.key),
      ),
  );
  if (
    resolved.some((match) =>
      resolved.some(
        (other) =>
          other.start === match.start &&
          other.length === match.length &&
          other.key !== match.key,
      ),
    )
  )
    throw new ApiProblem('PROMPT_AMBIGUOUS');
  return [...new Set(resolved.map((match) => match.key))];
}
export function matchesObjectType(
  asset: CandidateAsset,
  objectType: string,
): boolean {
  return (
    assetObjectType(asset) === objectType ||
    containsPhrase(
      normalize(asset.objectType),
      normalize(objectType)
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim(),
    ) ||
    ((!asset.attributes.category ||
      String(asset.attributes.category).toUpperCase() === 'ANIMAL') &&
      typeof asset.attributes.animalType === 'string' &&
      (containsPhrase(
        normalize(asset.attributes.animalType),
        normalize(objectType)
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim(),
      ) ||
        concepts(asset.attributes.animalType).includes(objectType)))
  );
}
const stopwords = new Set(
  'tao tro choi phan loai gom qua con chiec cai vao hai tuong ung va voi cac nhung cua tre so luong dem hinh anh giup toi mot duoc cho create game classify counting matching choose correct answer answers choices options the a an and into of with please'.split(
    ' ',
  ),
);
export function containsPhrase(text: string, phrase: string): boolean {
  return ` ${text.replace(/[^\p{L}\p{N}]+/gu, ' ')} `.includes(` ${phrase} `);
}
export function concepts(text: string): string[] {
  const normalized = text
    .normalize('NFC')
    .toLowerCase()
    .replace(
      /hình bóng(?: đen)?|bóng đen|tìm bóng|bóng (?:của|con)/g,
      'shadow',
    );
  // Preserve Vietnamese tone marks here: "cho trẻ" is not "chó", "đồ vật" is not "đỏ".
  const objects = requestedObjectTypes(text);
  return Object.entries(aliases)
    .filter(([, values]) =>
      values.some((value) => containsPhrase(normalized, value)),
    )
    .map(([key]) => key)
    .filter(
      (key) => !Object.hasOwn(objectAliases, key) || objects.includes(key),
    );
}
export function searchTerms(prompt: string): string[] {
  // Remove answer instructions before accent folding so the noun "tủ" stays searchable.
  const metadataPrompt = prompt
    .normalize('NFC')
    .toLowerCase()
    .replace(/chọn\s+đáp\s+án(?:\s+đúng)?(?:\s+từ)?|lựa\s+chọn/gu, ' ');
  const words = normalize(metadataPrompt).match(/[\p{L}\p{N}]+/gu) ?? [];
  const useful = words.filter(
    (word) => word.length >= 2 && !stopwords.has(word) && !/^\d+$/.test(word),
  );
  const expanded = concepts(prompt).flatMap((key) => [
    key.toLowerCase(),
    ...aliases[key].map(normalize),
  ]);
  return [...new Set([...expanded, ...useful])].slice(0, 32);
}
const metadataKeys = new Set<string>(AI_ASSET_ATTRIBUTE_KEYS);
const arrayMetadataKeys = new Set<string>(AI_ASSET_ARRAY_ATTRIBUTE_KEYS);
export function toCandidate(row: GenerationAssetRow): CandidateAsset {
  const attributes: CandidateAsset['attributes'] = {};
  if (
    typeof row.attributes === 'object' &&
    row.attributes !== null &&
    !Array.isArray(row.attributes)
  ) {
    for (const [key, value] of Object.entries(row.attributes)) {
      if (!metadataKeys.has(key)) continue;
      if (arrayMetadataKeys.has(key)) {
        if (
          Array.isArray(value) &&
          value.length > 0 &&
          value.length <= 12 &&
          value.every(
            (entry): entry is string =>
              typeof entry === 'string' &&
              entry.length > 0 &&
              entry.length <= 40,
          )
        )
          attributes[key] = [...new Set(value)];
      } else if (typeof value === 'string' && value.length <= 200)
        attributes[key] = value;
      else if (
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value))
      )
        attributes[key] = value;
    }
  }
  return {
    id: row.id,
    name: row.name.slice(0, 200),
    objectType: row.objectType.slice(0, 40),
    tags: row.tags.slice(0, 20).map((tag) => tag.slice(0, 80)),
    attributes,
  };
}
export function assetColor(asset: CandidateAsset): string | undefined {
  // Answers rely on structured metadata, not a guessed color from the filename.
  const value = asset.attributes.color;
  if (typeof value !== 'string') return undefined;
  const found = concepts(value).filter((key) => colors.has(key));
  return found.length === 1 ? found[0] : undefined;
}
export function requestedColors(
  prompt: string,
  candidates: CandidateAsset[],
): string[] {
  const { words, matches } = objectMentions(prompt, candidates);
  const partOfIdentity = (start: number, length: number) =>
    matches.some(
      (object) =>
        object.start <= start &&
        object.start + object.length >= start + length &&
        !matches.some(
          (shorter) =>
            shorter.key === object.key &&
            shorter.start === object.start &&
            shorter.start + shorter.length <= start,
        ),
    );
  const found: string[] = [];
  for (const color of colors)
    for (const alias of aliases[color]!) {
      const tokens = alias.split(' ');
      for (let start = 0; start <= words.length - tokens.length; start++) {
        if (!tokens.every((token, index) => words[start + index] === token))
          continue;
        const explicitColor = ['màu', 'color', 'colored', 'coloured'].includes(
          words[start - 1] ?? '',
        );
        if (explicitColor || !partOfIdentity(start, tokens.length))
          found.push(color);
      }
    }
  if (
    words.some(
      (word, index) =>
        word === 'xanh' &&
        !['dương', 'lá', 'nước'].includes(words[index + 1] ?? '') &&
        (words[index - 1] === 'màu' || !partOfIdentity(index, 1)),
    )
  ) {
    const available = new Set(
      candidates
        .map(assetColor)
        .filter((color) => color === 'BLUE' || color === 'GREEN'),
    );
    if (available.size !== 1) throw new ApiProblem('PROMPT_AMBIGUOUS');
    found.push([...available][0]!);
  }
  return [...new Set(found)];
}
export function selectCandidates(
  prompt: string,
  rows: GenerationAssetRow[],
  gameType?: GameType,
): CandidateAsset[] {
  const terms = searchTerms(prompt);
  const active = rows.filter((row) => row.status === 'ACTIVE').map(toCandidate);
  const requested = requestedObjectTypes(prompt, active);
  const scored = active
    .filter((asset) => isAllowedForTask(asset, gameType, prompt))
    .map((asset) => {
      const text = normalize(JSON.stringify(asset));
      const identity = normalize(
        [asset.name, asset.objectType, ...asset.tags].join(' '),
      );
      return {
        asset,
        score: terms.reduce(
          (score, term) =>
            score +
            (text.includes(term)
              ? (identity.includes(term) ? 4 : 1) * (term.includes(' ') ? 3 : 1)
              : 0),
          0,
        ),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
  // Round-robin over semantic buckets avoids filling the limit with 40 red balls.
  const buckets = new Map<string, CandidateAsset[]>();
  for (const { asset } of scored) {
    const shape =
      typeof asset.attributes.shape === 'string' ? asset.attributes.shape : '';
    const variant =
      typeof asset.attributes.variant === 'string'
        ? asset.attributes.variant
        : '';
    const key = `${asset.objectType}:${assetColor(asset) ?? ''}:${shape}:${variant}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(asset);
    buckets.set(key, bucket);
  }
  const selected: CandidateAsset[] = [];
  const add = (asset: CandidateAsset | undefined) => {
    if (
      asset &&
      selected.length < 40 &&
      !selected.some((item) => item.id === asset.id)
    )
      selected.push(asset);
  };
  const primaryTypes = requested.filter((type) => type !== 'BASKET');
  const mode = requestedMatchingMode(prompt);
  const relationMode =
    gameType === 'MATCHING' && (mode === 'SHADOW' || mode === 'OFFSPRING');
  if (relationMode) {
    // Reserve complete pairs together before applying the 40-asset cap.
    const pairs = scored.flatMap(({ asset: source }) => {
      const target = scored.find(({ asset }) =>
        isCompatiblePair(source, asset, mode),
      )?.asset;
      return target ? [{ source, target }] : [];
    });
    const keys = new Set<string>();
    const addPair = (pair: (typeof pairs)[number] | undefined) => {
      if (!pair) return;
      const key = normalize(
        metadataString(
          pair.source,
          mode === 'SHADOW' ? 'matchKey' : 'familyKey',
        )!,
      );
      if (keys.has(key) || selected.length + 2 > 40) return;
      keys.add(key);
      add(pair.source);
      add(pair.target);
    };
    for (const type of primaryTypes) {
      const pair = pairs.find(
        ({ source, target }) =>
          matchesObjectType(source, type) && matchesObjectType(target, type),
      );
      if (!pair)
        throw new ApiProblem(
          mode === 'SHADOW'
            ? 'SHADOW_PAIRS_INSUFFICIENT'
            : 'OFFSPRING_PAIRS_INSUFFICIENT',
        );
      addPair(pair);
    }
    for (const pair of pairs) addPair(pair);
    if (
      !keys.size ||
      keys.size < (requestedMatchingCount(prompt) ?? primaryTypes.length)
    )
      throw new ApiProblem(
        mode === 'SHADOW'
          ? 'SHADOW_PAIRS_INSUFFICIENT'
          : 'OFFSPRING_PAIRS_INSUFFICIENT',
      );
  } else {
    // Cover explicit objects/colors/destinations before filling with alternatives.
    for (const type of primaryTypes) {
      const match = scored.find(
        ({ asset }) =>
          !isEnvironmentAsset(asset) &&
          matchesObjectType(asset, type) &&
          !(
            gameType === 'CLASSIFICATION' &&
            habitatConcepts(prompt).length &&
            !expandHabitats(declaredHabitats(asset.attributes)).some(
              (habitat) => habitatConcepts(prompt).includes(habitat),
            )
          ),
      );
      add(match?.asset);
    }
    for (const color of requestedColors(
      prompt,
      scored.map(({ asset }) => asset),
    )) {
      add(
        scored.find(
          ({ asset }) =>
            assetColor(asset) === color &&
            (!primaryTypes.length ||
              primaryTypes.some((type) => matchesObjectType(asset, type))),
        )?.asset,
      );
    }
    if (gameType === 'CLASSIFICATION')
      for (const habitat of habitatConcepts(prompt)) {
        add(
          scored.find(
            ({ asset }) =>
              isEnvironmentAsset(asset) &&
              declaredHabitats(asset.attributes).includes(habitat),
          )?.asset,
        );
      }
  }
  while (!relationMode && selected.length < 40 && buckets.size) {
    for (const [key, bucket] of buckets) {
      const asset = bucket.shift();
      add(asset);
      if (!bucket.length) buckets.delete(key);
      if (selected.length === 40) break;
    }
  }
  if (!selected.length) throw new ApiProblem('ASSETS_INSUFFICIENT');
  for (const color of requestedColors(prompt, selected)) {
    if (!selected.some((asset) => assetColor(asset) === color))
      throw new ApiProblem('ASSETS_INSUFFICIENT');
  }
  // Object types are extensible; aliases help Vietnamese but generic metadata terms still work.
  for (const objectType of requested) {
    if (!selected.some((asset) => matchesObjectType(asset, objectType)))
      throw new ApiProblem('ASSETS_INSUFFICIENT');
  }
  for (const objectType of primaryTypes.length === 1 ? primaryTypes : []) {
    for (const color of requestedColors(prompt, selected)) {
      if (
        !selected.some(
          (asset) =>
            matchesObjectType(asset, objectType) && assetColor(asset) === color,
        )
      )
        throw new ApiProblem('ASSETS_INSUFFICIENT');
    }
  }
  if (gameType === 'CLASSIFICATION' && habitatConcepts(prompt).length) {
    // Habitat lessons need declared evidence; do not ask AI to invent animal ecology.
    for (const type of primaryTypes) {
      if (
        !selected.some(
          (asset) =>
            matchesObjectType(asset, type) &&
            expandHabitats(declaredHabitats(asset.attributes)).some((habitat) =>
              habitatConcepts(prompt).includes(habitat),
            ),
        )
      )
        throw new ApiProblem('ASSETS_INSUFFICIENT');
    }
  }
  if (gameType === 'COUNTING') {
    const intent = requestedCountingIntent(prompt, selected);
    if (intent.requiresSubset && !intent.color && !intent.objectType)
      throw new ApiProblem('COUNTING_TARGET_AMBIGUOUS');
    if (
      intent.requiresDistractors &&
      !selected.some(
        (asset) =>
          (!primaryTypes.length ||
            primaryTypes.some((type) => matchesObjectType(asset, type))) &&
          (intent.objectType
            ? !matchesObjectType(asset, intent.objectType) ||
              (!!intent.color &&
                !!assetColor(asset) &&
                assetColor(asset) !== intent.color)
            : !!assetColor(asset) && assetColor(asset) !== intent.color),
      )
    )
      throw new ApiProblem('ASSETS_INSUFFICIENT');
  }
  return selected;
}

export function requestedMatchingCount(prompt: string): number | undefined {
  const text = normalize(prompt);
  const pairs = text.match(/\b(\d{1,2})\s+(?:cap|pairs?)\b/);
  if (pairs) return Number(pairs[1]);
  const family = text.match(
    /\b(\d{1,2})\s+(?:con\s+)?(?:me|truong thanh|adults?)\b[^.!?;]*?\b(\d{1,2})\s+(?:con\s+non|con|young|babies)\b/,
  );
  if (family && family[1] === family[2]) return Number(family[1]);
  return requestedItemCount(prompt);
}

/** Only an explicit numeric item quantity is enforced; age/difficulty numbers are ignored. */
export function requestedItemCount(prompt: string): number | undefined {
  const matches = [
    ...normalize(prompt).matchAll(
      /\b(\d{1,2})\s*(?:qua|trai|con|cai|chiec|quyen|cuon|to|buc|cuc|vien|bong|cay|hinh|do vat|doi tuong|items?|balls?|apples?|cats?|dogs?|cap|pairs?)\b/g,
    ),
  ].map((match) => Number(match[1]));
  if (!matches.length) return undefined;
  if (matches.length === 1) return matches[0];
  const rest = matches.slice(1).reduce((sum, value) => sum + value, 0);
  return matches.length > 2 && matches[0] === rest
    ? matches[0]
    : matches.reduce((sum, value) => sum + value, 0);
}

export interface CountingPromptIntent {
  color?: string;
  objectType?: string;
  requiresSubset: boolean;
  requiresDistractors: boolean;
}
export function requestedCountingIntent(
  prompt: string,
  candidates: CandidateAsset[] = [],
): CountingPromptIntent {
  const text = prompt.normalize('NFC').toLowerCase();
  const extractColors = (value: string) =>
    candidates.length
      ? requestedColors(value, candidates)
      : concepts(value).filter((key) => colors.has(key));
  const queries = [
    ...text.matchAll(
      /(?=((?:chỉ\s+(?:đếm|tính)|có\s+bao\s+nhiêu|đếm)[^.!?;\n]*))/gu,
    ),
  ];
  let color: string | undefined;
  let targetObject: string | undefined;
  for (const query of queries.reverse()) {
    const subject = query[1]!.split(
      /giữa|trong số|trong các|trong những|xen lẫn|lẫn với|trộn với|,/u,
    )[0]!;
    const found = extractColors(subject);
    const objects = requestedObjectTypes(subject, candidates);
    if (found.length === 1) color = found[0];
    if (objects.length === 1) targetObject = objects[0];
    if (color || targetObject) break;
  }
  const mentionedTypes = requestedObjectTypes(prompt, candidates);
  const objectSubset =
    !!targetObject &&
    (mentionedTypes.length > 1 ||
      /loại khác|loài khác|con vật khác|các con khác|đối tượng khác/u.test(
        text,
      ));
  const requiresDistractors =
    objectSubset ||
    (!!color &&
      (/xen lẫn|lẫn với|trộn với|màu khác|khác màu/u.test(text) ||
        (/giữa/u.test(text) && extractColors(text).length > 1)));
  return {
    color,
    objectType:
      objectSubset ||
      (!!targetObject && !color && /chỉ\s+(?:đếm|tính)/u.test(text))
        ? targetObject
        : undefined,
    requiresDistractors,
    requiresSubset:
      requiresDistractors ||
      /chỉ\s+(?:đếm|tính)/u.test(text) ||
      (/có\s+bao\s+nhiêu/u.test(text) &&
        !!color &&
        extractColors(text).length > 1),
  };
}

const measurePrefix =
  /^(?:con|chú|bạn|quả|trái|cái|chiếc|hình|đối tượng|quyển|cuốn|tờ|bức|cục|viên|bông|hộp|cây)\s+/u;
function leadingObject(
  subject: string,
  vocabulary: Map<string, Set<string>>,
): { objectType: string; remainder: string } | undefined {
  const clean = subject
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  const alternatives = [clean, clean.replace(measurePrefix, '')];
  const matches = [...vocabulary].flatMap(([objectType, phrases]) =>
    alternatives.flatMap((text) =>
      [...phrases]
        .filter((phrase) => text === phrase || text.startsWith(`${phrase} `))
        .map((phrase) => ({
          objectType,
          phrase,
          remainder: text.slice(phrase.length),
        })),
    ),
  );
  matches.sort(
    (a, b) => b.phrase.split(' ').length - a.phrase.split(' ').length,
  );
  const best = matches[0];
  if (!best) return undefined;
  if (
    matches.some(
      (match) =>
        match.objectType !== best.objectType &&
        match.phrase.split(' ').length === best.phrase.split(' ').length,
    )
  )
    throw new ApiProblem('COUNTING_OBJECT_AMBIGUOUS');
  // After resolving identity, a shorter synonym leaves descriptive colors available.
  const identity = matches
    .filter((match) => match.objectType === best.objectType)
    .sort(
      (a, b) => a.phrase.split(' ').length - b.phrase.split(' ').length,
    )[0]!;
  return { objectType: best.objectType, remainder: identity.remainder };
}

/** Explicit composition by generic object identity, not choice counts or a repeated question. */
export function requestedObjectQuantities(
  prompt: string,
  candidates: CandidateAsset[] = [],
): { objectType: string; count: number; color?: string }[] {
  const quantities = new Map<
    string,
    { objectType: string; count: number; color?: string }
  >();
  const vocabulary = objectVocabulary(candidates);
  const text = prompt.normalize('NFC').toLowerCase();
  for (const match of text.matchAll(/\b(\d{1,2})\s+([^\d,.!?;\n]{1,100})/gu)) {
    const subject = leadingObject(match[2]!, vocabulary);
    if (!subject) {
      if (
        candidates.length &&
        measurePrefix.test(match[2]!) &&
        !/^(?:con vật|đồ vật|đối tượng|hình(?: ảnh)?|quả bóng gồm)\b/u.test(
          match[2]!,
        )
      )
        throw new ApiProblem('COUNTING_OBJECT_NOT_FOUND');
      continue;
    }
    const { objectType } = subject;
    const count = Number(match[1]);
    const specifiedColors = requestedColors(subject.remainder, candidates);
    if (specifiedColors.length > 1) continue;
    const color = specifiedColors[0];
    const key = `${objectType}:${color ?? ''}`;
    const previous = quantities.get(key);
    if (previous !== undefined && previous.count !== count)
      throw new ApiProblem('COUNTING_COMPOSITION_AMBIGUOUS');
    quantities.set(key, { objectType, count, ...(color ? { color } : {}) });
  }
  return [...quantities.values()];
}

export function requestedChoiceCount(prompt: string): number | undefined {
  const match = normalize(prompt).match(
    /\b(\d{1,2})\s+(?:dap an|lua chon|choices?|options?)\b/,
  );
  return match ? Number(match[1]) : undefined;
}
export function requestedColorQuantities(
  prompt: string,
  candidates: CandidateAsset[] = [],
): { color: string; count: number; objectType?: string }[] {
  const vocabulary = objectVocabulary(candidates);
  const quantities: { color: string; count: number; objectType?: string }[] =
    [];
  for (const match of prompt
    .normalize('NFC')
    .toLowerCase()
    .matchAll(/\b(\d{1,2})\s+([^\d,.!?;\n]{1,100})/gu)) {
    const text = match[2]!.trim();
    if (/^(?:đáp án|lựa chọn|tuổi|choices?|options?)\b/u.test(text)) continue;
    const subject = leadingObject(text, vocabulary);
    if (
      !subject &&
      !measurePrefix.test(text) &&
      !/^(?:màu\s+)?(?:đỏ|xanh|vàng|tím|cam|trắng|đen|red|blue|green|yellow|purple|orange|white|black)\b/u.test(
        text,
      )
    )
      continue;
    const found = requestedColors(text, candidates);
    if (found.length === 1)
      quantities.push({
        color: found[0]!,
        count: Number(match[1]),
        ...(subject ? { objectType: subject.objectType } : {}),
      });
  }
  return quantities;
}
export function requestedCountingDisplayCount(
  prompt: string,
  intent: CountingPromptIntent,
  candidates: CandidateAsset[] = [],
): number | undefined {
  const composition = requestedObjectQuantities(prompt, candidates);
  if (
    composition.length > 1 ||
    (!intent.requiresSubset && composition.length === 1)
  ) {
    const types = new Set(composition.map((entry) => entry.objectType));
    let total = 0;
    for (const objectType of types) {
      const entries = composition.filter(
        (entry) => entry.objectType === objectType,
      );
      const plain = entries.find((entry) => !entry.color);
      const colored = entries
        .filter((entry) => entry.color)
        .reduce((sum, entry) => sum + entry.count, 0);
      if (plain && colored > plain.count)
        throw new ApiProblem('COUNTING_COMPOSITION_AMBIGUOUS');
      total += plain?.count ?? colored;
    }
    return total;
  }
  if (!intent.requiresSubset) return requestedItemCount(prompt);
  const text = normalize(prompt);
  const total = text.match(
    /(?:hien thi|xuat hien|tong cong|tong so|tat ca)\s+(\d{1,2})\s+(?:(?:qua|con|chiec)\s+)?(?:hinh|doi tuong|bong|vat|do vat|items?|balls?)\b/,
  );
  // "Hiển thị 3 bóng đỏ và 2 bóng xanh" declares a composition, not a total of 3.
  if (
    total &&
    !/^\s+(?:mau\s+)?(?:do|red|blue|green|xanh|vang|yellow|tim|purple|cam|orange|trang|white|den|black)\b/.test(
      text.slice((total.index ?? 0) + total[0].length),
    )
  )
    return Number(total[1]);
  const ballComposition = text.match(
    /\b(\d{1,2})\s+(?:qua\s+)?bong\s*(?:gom|bao gom|trong do)\b/,
  );
  if (ballComposition) return Number(ballComposition[1]);
  const quantities = new Map(
    requestedColorQuantities(prompt, candidates).map(
      ({ color, count, objectType }) => [`${objectType ?? ''}:${color}`, count],
    ),
  );
  return quantities.size > 1
    ? [...quantities.values()].reduce((sum, count) => sum + count, 0)
    : undefined;
}

export function requestedGroupCount(prompt: string): number | undefined {
  const match = normalize(prompt).match(
    /\b(\d{1,2}|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+(?:gio|nhom|moi truong|groups?|baskets?)\b/,
  );
  if (!match) return undefined;
  return (
    (
      {
        hai: 2,
        ba: 3,
        bon: 4,
        nam: 5,
        sau: 6,
        bay: 7,
        tam: 8,
        chin: 9,
        muoi: 10,
      } as Record<string, number>
    )[match[1]] ?? Number(match[1])
  );
}

export function checkRequestedLimits(
  gameType: GameType,
  prompt: string,
  candidates: CandidateAsset[] = [],
): void {
  const count =
    gameType === 'COUNTING'
      ? requestedCountingDisplayCount(
          prompt,
          requestedCountingIntent(prompt, candidates),
          candidates,
        )
      : gameType === 'MATCHING'
        ? requestedMatchingCount(prompt)
        : requestedItemCount(prompt);
  const groupCount =
    gameType === 'CLASSIFICATION' ? requestedGroupCount(prompt) : undefined;
  const choices =
    gameType === 'COUNTING' ? requestedChoiceCount(prompt) : undefined;
  if (
    (count !== undefined &&
      (count < 1 || count > (gameType === 'CLASSIFICATION' ? 50 : 20))) ||
    (groupCount !== undefined && (groupCount < 2 || groupCount > 10)) ||
    (choices !== undefined && (choices < 2 || choices > 6)) ||
    (gameType === 'COUNTING' &&
      requestedObjectQuantities(prompt, candidates).some(
        ({ count: quantity }) => quantity < 1 || quantity > 20,
      )) ||
    (gameType === 'COUNTING' &&
      requestedColorQuantities(prompt, candidates).some(
        ({ count: quantity }) => quantity > 20,
      ))
  )
    throw new ApiProblem('PROMPT_OUT_OF_RANGE');
}
