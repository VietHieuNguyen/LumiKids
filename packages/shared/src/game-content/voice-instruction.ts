import type { GameContent } from "./game-content.schema.js";
import type { GameType } from "./common.js";

/** Describes controls only; never derives a hint from answer keys. */
export const GAME_INSTRUCTIONS: Record<GameType, string> = {
  COUNTING: "Bé hãy quan sát các hình, đếm rồi chạm vào số bé chọn nhé!",
  MATCHING: "Bé hãy chọn một hình rồi chạm hoặc kéo đến hình phù hợp để ghép cặp nhé!",
  CLASSIFICATION: "Bé hãy chọn một hình rồi chạm hoặc kéo vào nhóm phù hợp nhé!",
  PATTERN: "Bé hãy quan sát dãy hình rồi chạm hoặc kéo hình bé chọn vào ô trống nhé!",
};

/** Read-only legacy adapter: repair missing prose, never repair task/answer structures. */
export function withLegacyInstruction(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  if (row.instruction !== undefined && row.instruction !== null && row.instruction !== "") return value;
  if (typeof row.gameType !== "string" || !Object.hasOwn(GAME_INSTRUCTIONS, row.gameType)) return value;
  return { ...row, instruction: GAME_INSTRUCTIONS[row.gameType as GameType] };
}

/** Convert small standalone numerals in legacy prose; new generated prose uses words. */
export function voiceInstructionText(text: string): string {
  const units = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  return text.replace(/\b\d{1,2}\b/g, (token) => {
    const number = Number(token);
    if (number < 10) return units[number];
    const tens = Math.floor(number / 10);
    const unit = number % 10;
    return `${tens === 1 ? "mười" : `${units[tens]} mươi`}${unit === 0 ? "" : ` ${unit === 1 && tens > 1 ? "mốt" : unit === 5 ? "lăm" : units[unit]}`}`;
  });
}

export function currentVoiceInstruction(content: GameContent, sequenceId?: string | null): string {
  const sequence = content.gameType === "PATTERN"
    ? content.sequences.find((entry) => entry.id === sequenceId)
    : undefined;
  return voiceInstructionText(sequence?.instruction ?? content.instruction ?? content.instructions ?? GAME_INSTRUCTIONS[content.gameType]);
}
