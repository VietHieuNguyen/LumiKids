import type { CriterionPerformance, SessionPerformance } from '@lumikids/shared';

/** Stored with every evaluation so results stay traceable when the rule changes. */
// v2 (2026-11-20): items solved after a hint (H) weigh 0.25, per system.md. v1 evaluations keep their score.
export const CRITERION_SCORE_RULE_VERSION = 'ce-score-v2';
/** Trial rule (system.md): a valid session needs at least 5 scored items for the criterion. */
export const MIN_SCORED_ITEMS = 5;
/** Weight of an item corrected after a wrong attempt (R); first-attempt correct (F) weighs 1. */
export const RETRY_WEIGHT = 0.5;
/** Weight of an item solved after the child asked for a hint (H). */
export const HINT_WEIGHT = 0.25;

export class CriterionPerformanceInvalidError extends Error {
  constructor(reason: string) {
    super(`Invalid criterion performance: ${reason}`);
  }
}

function assertConsistent(p: CriterionPerformance): void {
  const values = [
    p.totalScoredItems,
    p.finalizedScoredItems,
    p.firstAttemptCorrectCount,
    p.retryCorrectCount,
    p.hintCorrectCount,
    p.hintCount,
    p.attemptCount,
  ];
  if (values.some((value) => !Number.isInteger(value) || value < 0))
    throw new CriterionPerformanceInvalidError('counts must be non-negative integers');
  if (p.finalizedScoredItems > p.totalScoredItems)
    throw new CriterionPerformanceInvalidError('finalized > N');
  if (
    p.firstAttemptCorrectCount + p.retryCorrectCount + p.hintCorrectCount >
    p.finalizedScoredItems
  )
    throw new CriterionPerformanceInvalidError('F + R + H > finalized');
}

/** ScoreCE = (F + 0.5 × R + 0.25 × H) / N × 100, unrounded. Null when N = 0 (nothing to score). */
export function criterionScore(p: CriterionPerformance): number | null {
  assertConsistent(p);
  if (p.totalScoredItems === 0) return null;
  return (
    ((p.firstAttemptCorrectCount +
      RETRY_WEIGHT * p.retryCorrectCount +
      HINT_WEIGHT * p.hintCorrectCount) /
      p.totalScoredItems) *
    100
  );
}

export interface CriterionEvaluationDraft {
  criterionCode: string;
  score: number | null;
  minimumItemsMet: boolean;
  ruleVersion: string;
}

/**
 * Score of one completed session for its single criterion. LEVEL and summary are left for the
 * assessment/AI phase. Returns null when the version has no criterion.
 */
export function evaluateCriterion(
  performance: SessionPerformance,
): CriterionEvaluationDraft | null {
  if (!performance.criterionCode) return null;
  return {
    criterionCode: performance.criterionCode,
    score: criterionScore(performance.criterionPerformance),
    minimumItemsMet:
      performance.criterionPerformance.totalScoredItems >= MIN_SCORED_ITEMS,
    ruleVersion: CRITERION_SCORE_RULE_VERSION,
  };
}
