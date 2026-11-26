"use client";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { currentComparisonQuestion } from "@lumikids/shared";
import type {
  ComparisonChangeContent,
  ComparisonChangeState,
  ComparisonQuestion,
} from "@lumikids/shared";
import type { RendererCommonProps } from "./types";
import { GamePicture } from "./game-picture";
import { usePointerPairing } from "./use-pointer-pairing";
import { DragGhost } from "./pairing-parts";
import { moveComparisonObject } from "../model/comparison-adjustment";
import { createTapGuard } from "../model/tap-guard";

type BoardProps = RendererCommonProps & {
  content: ComparisonChangeContent;
  state: ComparisonChangeState;
};
export function ComparisonChangeGame(props: BoardProps) {
  const question = currentComparisonQuestion(props.content, props.state);
  const id = question?.id;
  const onDisplayed = props.onDisplayedQuestion;
  useEffect(() => {
    if (id) onDisplayed?.(id);
  }, [id, onDisplayed]);
  if (!question) return null;
  return (
    <div className="comparison-board">
      <ol className="comparison-steps" aria-label="Ba màn chơi">
        {props.content.questions.map((q, index) => (
          <li
            key={q.id}
            aria-current={q.id === question.id ? "step" : undefined}
            data-done={
              props.state.solvedQuestionIds.includes(q.id) || undefined
            }
          >
            <span className="sr-only">
              Màn {index + 1}:{" "}
              {{ COMPARE: "So sánh", ADD: "Thêm", REMOVE: "Bớt" }[q.mode]}
            </span>
          </li>
        ))}
      </ol>
      <p className="sr-only">{question.instruction}</p>
      <QuestionBoard key={question.id} {...props} question={question} />
    </div>
  );
}

function QuestionBoard({
  question: q,
  state,
  onAction,
  ...props
}: BoardProps & { question: ComparisonQuestion }) {
  const scope = useRef<HTMLDivElement>(null);
  const initialObjects = Array.from({ length: q.initialCount }, (_, i) => i);
  const [history, setHistory] = useState<readonly (readonly number[])[]>([
    initialObjects,
  ]);
  const insideObjects = history[history.length - 1];
  const count = insideObjects.length;
  const stock = q.mode === "ADD" ? 10 : q.initialCount;
  const [tapGuard] = useState(createTapGuard);
  const move = (sourceId: string, targetId: string) => {
    if (q.mode === "COMPARE") {
      if (
        targetId === "relation" &&
        (sourceId === "GT" || sourceId === "LT" || sourceId === "EQ")
      )
        onAction({
          actionType: "COMPARE_QUANTITIES",
          sourceId: q.id,
          targetId: sourceId,
        });
      return;
    }
    const index = Number(sourceId.replace("token-", ""));
    const next = moveComparisonObject(q, insideObjects, index, targetId);
    if (next !== insideObjects) setHistory((h) => [...h, next]);
  };
  const pairing = usePointerPairing(scope, move);
  const picture = (key: string) => (
    <GamePicture
      key={key}
      assetId={q.assetId}
      label={q.label ?? "Đồ vật"}
      assetUrls={props.assetUrls}
      assetRevisions={props.assetRevisions}
      onAssetError={props.onAssetError}
      className="comparison-object"
    />
  );
  const draggable = (
    id: string,
    label: string,
    child: ReactNode,
    onTap: () => void,
    disabled = false,
  ) => (
    <button
      key={id}
      type="button"
      className="comparison-draggable"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        tapGuard.down();
        pairing.pointerDown(event, id);
      }}
      onPointerMove={pairing.pointerMove}
      onPointerUp={(event) => tapGuard.up(pairing.pointerUp(event))}
      onPointerCancel={pairing.pointerCancel}
      onClick={(event) => {
        if (tapGuard.click(event.detail)) onTap();
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      {child}
    </button>
  );
  const basket = (amount: number, label: string, editable = false) => (
    <section
      className="comparison-group"
      aria-label={`${label}: ${amount} ${q.label ?? "đồ vật"}`}
      data-game-target-id={editable ? "inside" : undefined}
      data-hovered={(editable && pairing.hoverId === "inside") || undefined}
    >
      <h3 className="sr-only">{label}</h3>
      <div className="comparison-objects">
        {(editable
          ? insideObjects
          : Array.from({ length: amount }, (_, index) => index)
        ).map((index) =>
          editable
            ? draggable(
                `token-${index}`,
                `Lấy ra ${q.label ?? "đồ vật"}`,
                picture(String(index)),
                () => move(`token-${index}`, "outside"),
                q.mode === "ADD" && index < q.initialCount,
              )
            : picture(String(index)),
        )}
        {amount === 0 && (
          <span className="comparison-empty" aria-label="Vùng trống">
            0
          </span>
        )}
      </div>
    </section>
  );
  return (
    <div
      ref={scope}
      className="comparison-question"
      onKeyDown={pairing.onKeyDown}
    >
      {q.mode === "COMPARE" ? (
        <>
          <div className="comparison-pair">
            {basket(q.initialCount, "Giỏ bên trái")}
            <button
              type="button"
              className="comparison-slot"
              data-game-target-id="relation"
              aria-label="Ô đặt dấu so sánh"
              onClick={() => pairing.drop("relation")}
            >
              ?
            </button>
            {basket(q.targetCount, "Giỏ bên phải")}
          </div>
          <div className="comparison-symbols" aria-label="Chọn dấu">
            {(
              [
                ["GT", ">", "lớn hơn"],
                ["LT", "<", "bé hơn"],
                ["EQ", "=", "bằng"],
              ] as const
            ).map(([id, symbol, label]) =>
              draggable(id, `Dấu ${label}`, symbol, () => move(id, "relation")),
            )}
          </div>
        </>
      ) : (
        <>
          <div
            className="comparison-goal"
            aria-label={`Số lượng cần có: ${q.targetCount} ${q.label ?? "đồ vật"}`}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
            </svg>
            {picture("goal")}
            <span aria-hidden="true">×</span>
            <strong>{q.targetCount}</strong>
          </div>
          <div className="comparison-editing">
            {basket(count, "Giỏ của bé", true)}
            <section
              className="comparison-group comparison-outside"
              data-game-target-id="outside"
              data-hovered={pairing.hoverId === "outside" || undefined}
              aria-label={
                q.mode === "ADD" ? "Đồ vật bên ngoài" : "Đồ vật đã lấy ra"
              }
            >
              <h3 className="sr-only">
                {q.mode === "ADD" ? "Đồ vật bên ngoài" : "Đã lấy ra"}
              </h3>
              <div className="comparison-objects">
                {Array.from({ length: stock }, (_, index) => index)
                  .filter((index) => !insideObjects.includes(index))
                  .map((index) => {
                    return draggable(
                      `token-${index}`,
                      `Đưa vào ${q.label ?? "đồ vật"}`,
                      picture(String(index)),
                      () => move(`token-${index}`, "inside"),
                    );
                  })}
              </div>
            </section>
          </div>
          <div className="comparison-actions">
            <button
              type="button"
              className="asset-button-secondary"
              aria-label="Hoàn tác"
              title="Hoàn tác"
              disabled={history.length < 2}
              onClick={() => setHistory((h) => h.slice(0, -1))}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 5-5 5 5 5M4 10h10a6 6 0 0 1 0 12" />
              </svg>
            </button>
            <button
              type="button"
              className="asset-button-secondary"
              aria-label="Làm lại màn này"
              title="Làm lại màn này"
              onClick={() => setHistory([initialObjects])}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" />
              </svg>
            </button>
            <button
              type="button"
              className="asset-button-primary"
              aria-label="Xác nhận"
              title="Xác nhận"
              onClick={() =>
                onAction({
                  actionType: "CONFIRM_QUANTITY_CHANGE",
                  sourceId: q.id,
                  count,
                })
              }
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m4 12 5 5L20 6" />
              </svg>
            </button>
          </div>
        </>
      )}
      {state.lastInteraction?.sourceId === q.id &&
        "result" in state.lastInteraction &&
        state.lastInteraction.result === "INCORRECT" && (
          <p role="status" className="sr-only">
            Chưa đúng rồi. Bé hãy điều chỉnh và thử lại nhé!
          </p>
        )}
      <DragGhost pairing={pairing} label="Đang kéo">
        {pairing.drag &&
          (q.mode === "COMPARE"
            ? ({ GT: ">", LT: "<", EQ: "=" }[pairing.drag.sourceId] ?? "?")
            : picture("drag"))}
      </DragGhost>
    </div>
  );
}
