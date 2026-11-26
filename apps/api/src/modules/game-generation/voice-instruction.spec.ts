import { describe, expect, it } from 'vitest';
import { GAME_INSTRUCTIONS, gameContentSchema } from '@lumikids/shared';
import { prepareVoiceInstructions } from './voice-instruction.js';

describe('voice instructions on validated drafts', () => {
  it('keeps the counting target and answers, normalizes prose only and does not mutate input', () => {
    const content = gameContentSchema.parse({
      schemaVersion: 2,
      gameType: 'COUNTING',
      instruction: 'Bé hãy đếm các hình màu đỏ rồi chọn 1 số nhé!',
      instructions: 'Use a keyboard to type the answer.',
      items: [
        { id: 'red', assetId: '00000000-0000-4000-8000-000000000001' },
        { id: 'blue', assetId: '00000000-0000-4000-8000-000000000002' },
      ],
      choices: [
        { id: 'one', value: 1 },
        { id: 'two', value: 2 },
      ],
      countingRule: { type: 'COLOR', color: 'RED' },
      countedItemIds: ['red'],
      correctChoiceId: 'one',
      completionRule: 'CORRECT_CHOICE',
    });
    const original = structuredClone(content);
    const output = prepareVoiceInstructions(content);
    expect(output.instruction).toBe(
      'Bé hãy đếm các hình màu đỏ rồi chạm vào số đúng nhé!',
    );
    expect(output.instructions).toBe(GAME_INSTRUCTIONS.COUNTING);
    expect({
      ...output,
      instruction: original.instruction,
      instructions: original.instructions,
    }).toEqual(original);
    expect(content).toEqual(original);
    expect(gameContentSchema.parse(JSON.parse(JSON.stringify(output)))).toEqual(
      output,
    );
  });
  it.each([
    [{ type: 'ALL' }, 'tất cả các hình'],
    [
      { type: 'OBJECT_TYPE', objectType: 'APPLE' },
      'các hình cùng loại với hình mẫu',
    ],
    [
      { type: 'OBJECT_TYPE', objectType: 'APPLE', color: 'GREEN' },
      'các hình màu xanh lá cùng loại với hình mẫu',
    ],
  ])(
    'derives the spoken target from rule %j without reading the answer key',
    (countingRule, target) => {
      const content = gameContentSchema.parse({
        schemaVersion: 2,
        gameType: 'COUNTING',
        instruction: 'The wrong target from a model.',
        items: [
          { id: 'apple', assetId: '00000000-0000-4000-8000-000000000001' },
        ],
        countingRule,
        countedItemIds: ['apple'],
        choices: [
          { id: 'one', value: 1 },
          { id: 'two', value: 2 },
        ],
        correctChoiceId: 'one',
        completionRule: 'CORRECT_CHOICE',
      });
      expect(prepareVoiceInstructions(content).instruction).toBe(
        `Bé hãy đếm ${target} rồi chạm vào số đúng nhé!`,
      );
    },
  );
});
