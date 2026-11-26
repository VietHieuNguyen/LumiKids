import type { ComparisonQuestion } from "@lumikids/shared";

/** Local, unscored edits preserve the identity of the exact object the child moved. */
export function moveComparisonObject(
  question: ComparisonQuestion,
  inside: readonly number[],
  token: number,
  target: string,
): readonly number[] {
  const stock = question.mode === "ADD" ? 10 : question.initialCount;
  if (
    question.mode === "COMPARE" ||
    !Number.isInteger(token) ||
    token < 0 ||
    token >= stock
  )
    return inside;
  if (target === "inside" && !inside.includes(token)) return [...inside, token];
  if (target === "outside" && inside.includes(token)) {
    if (question.mode === "ADD" && token < question.initialCount) return inside;
    return inside.filter((id) => id !== token);
  }
  return inside;
}
