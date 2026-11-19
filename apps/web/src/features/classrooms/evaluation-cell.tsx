import type { PlayHistoryItem } from "@lumikids/shared";
import { StatusPill } from "./classroom-shell";
import { criterionLevelLabels, formatScore } from "./format";

const levelTones = { LEVEL_0: "slate", LEVEL_1: "amber", LEVEL_2: "amber", LEVEL_3: "green", LEVEL_4: "green" } as const;

/**
 * Stored result of one completed session. The score comes from the server formula;
 * level and summary are shown when the assessment phase fills them, otherwise a placeholder.
 */
export function EvaluationCell({ evaluation }: { evaluation: PlayHistoryItem["evaluation"] }) {
  if (!evaluation) return <span className="text-ink-soft">—</span>;
  const p = evaluation.performance;
  return (
    <div className="min-w-[200px] space-y-1">
      <p className="font-semibold tabular-nums" title={`Chỉ số ${evaluation.criterionCode}: ${evaluation.criterionDescription}`}>
        {formatScore(evaluation.score)}
        <span className="ml-1 text-xs font-normal text-ink-soft">· Chỉ số {evaluation.criterionCode}</span>
      </p>
      <p className="text-xs text-ink-soft">
        Đúng ngay {p.firstAttemptCorrectCount} · Sửa đúng {p.retryCorrectCount} · {p.totalScoredItems} nhiệm vụ
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {evaluation.level ? (
          <StatusPill tone={levelTones[evaluation.level]}>{criterionLevelLabels[evaluation.level]}</StatusPill>
        ) : (
          <span className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-ink-soft">Mức: chờ đánh giá</span>
        )}
        {!evaluation.minimumItemsMet && <span className="text-xs font-medium text-amber-700">Chưa đủ 5 nhiệm vụ</span>}
      </div>
      {evaluation.summary ? (
        <p className="rounded-xl bg-paper px-2.5 py-1.5 text-xs leading-5">{evaluation.summary}</p>
      ) : (
        <p className="text-xs italic text-ink-soft">Nhận xét sẽ có khi bật đánh giá tự động.</p>
      )}
    </div>
  );
}
