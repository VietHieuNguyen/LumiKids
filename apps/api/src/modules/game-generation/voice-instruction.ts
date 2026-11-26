import { GAME_INSTRUCTIONS, voiceInstructionText } from '@lumikids/shared';
import type { GameContent } from '@lumikids/shared';

/** Controls are fixed by the renderer; task-specific prose remains part of the reviewed draft. */
export function prepareVoiceInstructions(content: GameContent): GameContent {
  let instruction = voiceInstructionText(content.instruction);
  // The counting board displays a sample for OBJECT_TYPE and a swatch for COLOR.
  // Derive its spoken target from the validated rule, never from the correct numeric choice.
  if (content.gameType === 'COUNTING') {
    const rule =
      content.schemaVersion === 2
        ? content.countingRule
        : { type: 'ALL' as const };
    const colors = {
      RED: 'đỏ',
      BLUE: 'xanh dương',
      GREEN: 'xanh lá',
      YELLOW: 'vàng',
      PURPLE: 'tím',
      ORANGE: 'cam',
      WHITE: 'trắng',
      BLACK: 'đen',
    };
    const color =
      rule.type !== 'ALL' && rule.color ? ` màu ${colors[rule.color]}` : '';
    const target =
      rule.type === 'ALL'
        ? 'tất cả các hình'
        : rule.type === 'COLOR'
          ? `các hình${color}`
          : `các hình${color} cùng loại với hình mẫu`;
    instruction = `Bé hãy đếm ${target} rồi chạm vào số đúng nhé!`;
  }
  return {
    ...content,
    instructions: GAME_INSTRUCTIONS[content.gameType],
    instruction,
  };
}
