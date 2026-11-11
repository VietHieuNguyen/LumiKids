import type { MatchingContent } from "@lumikids/shared";

// Presentation only: never reorder or change the answer key in GameContent.
export function arrangeMatchingTargets(content: MatchingContent, seed: string) {
  let value = 2166136261;
  for (const character of seed) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  }
  const randomIndex = (length: number) => {
    value += 0x6d2b79f5;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296) * length);
  };
  const targets = [...content.targetItems];
  for (let index = targets.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1);
    [targets[index], targets[other]] = [targets[other], targets[index]];
  }
  if (targets.length < 2) return targets;

  const answers = new Map(
    content.pairs.map((pair) => [pair.sourceId, pair.targetId]),
  );
  const aligned = targets.flatMap((target, index) =>
    answers.get(content.sourceItems[index].id) === target.id ? [index] : [],
  );
  // Rotate fixed points; a lone fixed point can safely swap with any other slot.
  if (aligned.length > 1) {
    const first = targets[aligned[0]];
    for (let index = 0; index < aligned.length - 1; index++) {
      targets[aligned[index]] = targets[aligned[index + 1]];
    }
    targets[aligned[aligned.length - 1]] = first;
  } else if (aligned.length === 1) {
    const index = aligned[0];
    const other =
      (index + 1 + randomIndex(targets.length - 1)) % targets.length;
    [targets[index], targets[other]] = [targets[other], targets[index]];
  }
  return targets;
}
