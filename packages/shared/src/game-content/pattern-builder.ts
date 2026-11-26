import type { AssetItem } from "./common.js";
import { GAME_INSTRUCTIONS } from "./voice-instruction.js";
import {
  PATTERN_RULE_UNITS,
  patternLetterCount,
  type PatternContent,
  type PatternRule,
  type PatternSequence,
} from "./pattern.schema.js";

export interface BuildPatternInput {
  items: readonly AssetItem[];
  rules: readonly PatternRule[];
  sequenceCount: number;
  /** Same seed → same content, so a teacher saves exactly what they previewed. */
  seed: string;
  instruction?: string;
}

const DEFAULT_INSTRUCTION = "Bé hãy chọn hình tiếp theo để điền vào ô trống nhé!";
/** Shortest visible length per period length (spec table: AB 5–6, 3-period 6–7, 4-period 8). */
const BASE_LENGTH: Record<number, number> = { 2: 5, 3: 6, 4: 8 };

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/** Builds PATTERN v1 content from 2–4 pictures; throws PATTERN_ASSETS_INSUFFICIENT when a rule needs more. */
export function buildPatternContent(input: BuildPatternInput): PatternContent {
  const needed = Math.max(...input.rules.map(patternLetterCount));
  if (input.rules.length === 0 || input.items.length < needed)
    throw new Error("PATTERN_ASSETS_INSUFFICIENT");
  const random = seededRandom(input.seed);
  const itemIds = input.items.map((item) => item.id);
  const sequences: PatternSequence[] = [];
  for (let index = 0; index < input.sequenceCount; index++) {
    const rule = input.rules[index % input.rules.length];
    const units = PATTERN_RULE_UNITS[rule];
    const letters = shuffle(itemIds, random).slice(0, patternLetterCount(rule));
    const length = Math.min(8, BASE_LENGTH[units.length] + Math.floor(random() * 2));
    const cells = Array.from({ length }, (_, position) => letters[units[position % units.length]]);
    const correctItemId = letters[units[length % units.length]];
    const choiceCount = rule === "AB" ? 2 : Math.min(3, itemIds.length);
    const distractors = [
      ...shuffle(letters.filter((id) => id !== correctItemId), random),
      ...shuffle(itemIds.filter((id) => !letters.includes(id)), random),
    ];
    sequences.push({
      id: `seq-${index + 1}`,
      instruction: DEFAULT_INSTRUCTION,
      rule,
      cells,
      choiceIds: shuffle([correctItemId, ...distractors.slice(0, choiceCount - 1)], random),
      correctItemId,
    });
  }
  return {
    schemaVersion: 1,
    gameType: "PATTERN",
    instruction: input.instruction ?? DEFAULT_INSTRUCTION,
    instructions: GAME_INSTRUCTIONS.PATTERN,
    items: input.items.map((item) => ({ ...item })),
    sequences,
    completionRule: "ALL_SEQUENCES_COMPLETED",
  };
}
