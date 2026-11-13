"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { FormEvent } from "react";
import { getClassificationCorrectGroupIds } from "@lumikids/shared";
import type { GameDifficulty, GameType } from "@lumikids/shared";
import { GamePreview } from "../game-preview/game-preview";
import { GameGenerationApi } from "./api";
import { createGameCreationController } from "./controller";
import { MAX_GAME_PROMPT_LENGTH } from "./types";
import { GameLibraryApi } from "../game-library/api";
import { SaveGamePanel } from "../game-library/save-game-panel";

export const gameCreationOptions: {
  type: GameType;
  label: string;
  description: string;
  example: string;
}[] = [
  {
    type: "COUNTING",
    label: "Đếm số lượng",
    description: "Đếm toàn bộ, đếm theo màu hoặc chỉ một loại đối tượng.",
    example:
      "Tạo trò chơi đếm 5 quả táo, cho trẻ chọn đáp án đúng từ 3 lựa chọn.",
  },
  {
    type: "MATCHING",
    label: "Ghép cặp",
    description: "Ghép các đối tượng tương ứng với nhau.",
    example: "Tạo trò chơi ghép con mèo và con chó với hình bóng tương ứng.",
  },
  {
    type: "CLASSIFICATION",
    label: "Phân loại",
    description: "Đưa các đối tượng vào đúng nhóm.",
    example:
      "Tạo trò chơi phân loại 6 quả bóng gồm 3 quả đỏ và 3 quả xanh dương vào hai nhóm tương ứng.",
  },
];
interface GameCreatorProps {
  libraryApi?: GameLibraryApi | null;
  libraryHref?: string;
  api: GameGenerationApi;
  fullName: string;
  onUnauthorized: () => void;
}
export function GameCreator({
  api,
  fullName,
  onUnauthorized,
  libraryApi,
  libraryHref = "/teacher/games",
}: GameCreatorProps) {
  const [gameType, setGameType] = useState<GameType>("COUNTING");
  const [prompt, setPrompt] = useState("");
  const [touched, setTouched] = useState(false);
  const promptDialog = useRef<HTMLDialogElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const dialogTitleId = useId();
  useEffect(() => {
    const update = () =>
      setFullscreen(document.fullscreenElement === workspace.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await workspace.current?.requestFullscreen();
    } catch {
      setFullscreenError(
        "Trình duyệt chưa mở được toàn màn hình. Bạn vẫn có thể chơi với khung rộng bên dưới.",
      );
    }
  }
  const [controller] = useState(() => createGameCreationController(api));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const promptId = useId();
  const helpId = useId();
  const errorId = useId();
  const selected = gameCreationOptions.find(
    (option) => option.type === gameType,
  )!;
  const busy = snapshot.status === "generating";
  const draft = snapshot.draft;
  const generatedGame = draft?.game;
  const invalid =
    !prompt.trim() || prompt.trim().length > MAX_GAME_PROMPT_LENGTH;
  useEffect(() => {
    controller.setGateway(api);
  }, [api, controller]);
  useEffect(() => () => controller.cancel(), [controller]);
  useEffect(() => {
    if (snapshot.error?.status === 401) onUnauthorized();
  }, [snapshot.error, onUnauthorized]);
  const reader = useMemo(
    () =>
      generatedGame
        ? api.createPreviewReader(generatedGame, onUnauthorized)
        : null,
    [generatedGame, api, onUnauthorized],
  );
  const changed =
    draft &&
    (draft.source.gameType !== gameType ||
      draft.source.prompt !== prompt.trim());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!invalid)
      void controller.generate({ gameType, prompt }).then((success) => {
        if (success) promptDialog.current?.close();
      });
  }
  return (
    <main className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Link
            href="/account"
            className="text-xl font-bold tracking-tight text-blue-700"
          >
            LumiKids
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span>{fullName}</span>
            {libraryApi && (
              <Link href={libraryHref} className="asset-button-secondary">
                Kho trò chơi
              </Link>
            )}
            <Link href="/account" className="asset-button-secondary">
              ← Tài khoản
            </Link>
          </div>
        </div>
      </header>
      <div className="creator-workspace" ref={workspace}>
        <div className="creator-toolbar">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Không gian trò chơi
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              {busy
                ? "Đang tạo nội dung mới…"
                : "Mở mô tả để tạo hoặc điều chỉnh trò chơi."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="asset-button-primary"
              onClick={() => promptDialog.current?.showModal()}
            >
              {busy
                ? "Xem tiến trình tạo"
                : draft
                  ? "Chỉnh mô tả / Tạo lại"
                  : "Tạo trò chơi"}
            </button>
            <button
              type="button"
              className="asset-button-secondary"
              aria-pressed={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? "Thu nhỏ màn hình" : "Toàn màn hình"}
            </button>
          </div>
        </div>
        {fullscreenError && (
          <p role="status" className="text-sm text-slate-600">
            {fullscreenError}
          </p>
        )}
        {snapshot.error && (
          <button
            type="button"
            className="asset-error mb-3 w-full text-left"
            onClick={() => promptDialog.current?.showModal()}
          >
            {snapshot.error.message} · Mở mô tả
          </button>
        )}
        <div className="creator-content">
          <dialog
            ref={promptDialog}
            className="creator-prompt-dialog"
            aria-labelledby={dialogTitleId}
          >
            <div className="creator-dialog-heading">
              <h2 id={dialogTitleId} className="text-lg font-semibold">
                Thiết kế trò chơi bằng AI
              </h2>
              <button
                type="button"
                className="asset-button-secondary"
                aria-label="Đóng mô tả"
                onClick={() => promptDialog.current?.close()}
              >
                ✕
              </button>
            </div>
            <section
              className="min-w-0 bg-white p-5 sm:p-6"
              aria-label="Thiết kế trò chơi bằng mô tả"
            >
              <form onSubmit={submit} noValidate aria-busy={busy}>
                <fieldset disabled={busy}>
                  <legend className="text-base font-semibold">
                    1. Chọn loại trò chơi
                  </legend>
                  <div className="mt-4 space-y-3">
                    {gameCreationOptions.map((option) => (
                      <label
                        key={option.type}
                        className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border p-4 ${gameType === option.type ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                      >
                        <input
                          type="radio"
                          name="gameType"
                          value={option.type}
                          checked={gameType === option.type}
                          onChange={() => setGameType(option.type)}
                          className="mt-1 h-4 w-4 accent-blue-700"
                        />
                        <span>
                          <span className="block text-sm font-semibold">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-slate-600">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <label
                    htmlFor={promptId}
                    className="mt-6 block text-base font-semibold"
                  >
                    2. Mô tả trò chơi
                  </label>
                  <textarea
                    id={promptId}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onBlur={() => setTouched(true)}
                    rows={7}
                    maxLength={MAX_GAME_PROMPT_LENGTH}
                    placeholder={selected.example}
                    aria-invalid={touched && invalid}
                    aria-describedby={`${helpId}${touched && invalid ? ` ${errorId}` : ""}`}
                    className="asset-input mt-3 min-h-44 resize-y leading-6"
                  />
                  <div className="mt-2 flex justify-between gap-3 text-xs text-slate-500">
                    <span id={helpId}>
                      Nêu rõ đối tượng, số lượng và cách chơi.
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {prompt.length}/{MAX_GAME_PROMPT_LENGTH}
                    </span>
                  </div>
                  {touched && invalid && (
                    <p id={errorId} className="mt-2 text-sm text-red-700">
                      Vui lòng nhập mô tả từ 1 đến {MAX_GAME_PROMPT_LENGTH} ký
                      tự.
                    </p>
                  )}
                  <button
                    type="button"
                    className="asset-text-button mt-3 text-left"
                    onClick={() => {
                      setPrompt(selected.example);
                      setTouched(false);
                    }}
                  >
                    Dùng gợi ý cho {selected.label.toLowerCase()}
                  </button>
                  {gameType === "COUNTING" && (
                    <button
                      type="button"
                      className="asset-text-button mt-2 block text-left"
                      onClick={() => {
                        setPrompt(
                          "Cho 2 quả xoài, 3 quả dâu tây, 4 quả mít. Tạo trò chơi chỉ đếm số lượng quả mít. Cho 4 đáp án tùy chọn.",
                        );
                        setTouched(false);
                      }}
                    >
                      Gợi ý: chỉ đếm một loại học liệu
                    </button>
                  )}
                  {gameType === "COUNTING" && (
                    <button
                      type="button"
                      className="asset-text-button mt-2 block text-left"
                      onClick={() => {
                        setPrompt(
                          "Hiển thị 5 quả bóng gồm 3 quả bóng đỏ và 2 quả bóng xanh dương. Chỉ đếm số bóng đỏ và cho trẻ chọn đáp án đúng từ 3 lựa chọn.",
                        );
                        setTouched(false);
                      }}
                    >
                      Gợi ý: chỉ đếm bóng đỏ giữa các màu
                    </button>
                  )}
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Gợi ý cần có ảnh phù hợp trong thư viện. Nếu thiếu học liệu,
                    hãy đổi mô tả hoặc nhờ quản trị viên bổ sung.
                  </p>
                </fieldset>
                {snapshot.error && (
                  <div role="alert" className="asset-error mt-5">
                    <p>{snapshot.error.message}</p>
                    {draft && (
                      <p className="mt-2 font-medium">
                        Bản xem thử trước vẫn được giữ nguyên.
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={busy || invalid}
                  className="asset-button-primary mt-5 w-full"
                >
                  {busy
                    ? "Đang tạo trò chơi…"
                    : draft
                      ? "Regenerate · Tạo lại"
                      : "Generate Game · Tạo trò chơi"}
                </button>
                {busy && (
                  <p
                    role="status"
                    className="mt-3 text-sm leading-6 text-blue-800"
                  >
                    AI đang chuẩn bị nội dung. Bạn có thể tiếp tục chơi bản
                    trước trong lúc chờ.
                  </p>
                )}
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Bản chơi thử chỉ giữ trong trang này và có thể mất khi tải lại
                  hoặc rời trang. Sau khi duyệt, hãy chọn chỉ số và lưu vào kho
                  ở bên dưới bảng chơi.
                </p>
              </form>
            </section>
          </dialog>
          <section className="min-w-0 space-y-4" aria-label="Khu vực Preview">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">3. Chơi thử trò chơi</h2>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                Preview
              </span>
            </div>
            {draft && reader ? (
              <>
                <GamePreview
                  key={draft.revision}
                  content={draft.game.gameContent}
                  assetReader={reader}
                  backHref="/account"
                  backLabel="Tài khoản"
                  controlsPosition="after"
                />
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                  Đây là nội dung do AI tạo. Hãy kiểm tra hình ảnh, hướng dẫn và
                  đáp án trước khi sử dụng với trẻ.
                </div>
                <fieldset
                  disabled={busy}
                  className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
                >
                  <legend className="px-1 text-sm font-semibold text-slate-800">
                    Độ khó do giáo viên lựa chọn
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["EASY", "Dễ"],
                        ["MEDIUM", "Trung bình"],
                        ["HARD", "Khó"],
                      ] satisfies [GameDifficulty, string][]
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-3 text-sm font-medium ${draft.difficulty === value ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600"}`}
                      >
                        <input
                          type="radio"
                          name={`${promptId}-difficulty`}
                          value={value}
                          checked={draft.difficulty === value}
                          onChange={() => controller.setDifficulty(value)}
                          className="accent-blue-700"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {draft.difficulty
                      ? "Đã gán mức độ cho bản đang xem. "
                      : "Chưa gán mức độ. "}
                    Lựa chọn này không gọi lại AI, không đổi đáp án hay tiến độ
                    chơi. Mức độ chỉ giữ trong bản nháp hiện tại; tạo lại thành
                    công cần chọn lại.
                  </p>
                </fieldset>
                {libraryApi && (
                  <SaveGamePanel
                    key={`save-${draft.revision}`}
                    api={libraryApi}
                    game={draft.game}
                    difficulty={draft.difficulty}
                    libraryHref={libraryHref}
                    disabled={busy}
                  />
                )}
                {draft.game.gameContent.gameType === "CLASSIFICATION" && (
                  <details className="rounded-xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Duyệt các nhóm được chấp nhận
                    </summary>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Mỗi hình chỉ cần xếp một lần vào bất kỳ nhóm nào được chấp
                      nhận. Nhiều nhóm có thể cùng đúng; không bắt buộc mỗi nhóm
                      nhận một hình. Giáo viên cần xem lại metadata và đáp án
                      trước khi dùng với trẻ.
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {draft.game.gameContent.items.map((item) => (
                        <li key={item.id}>
                          <strong>{item.label ?? item.id}</strong>:{" "}
                          {getClassificationCorrectGroupIds(item)
                            .map((id) =>
                              draft.game.gameContent.gameType ===
                              "CLASSIFICATION"
                                ? (draft.game.gameContent.groups.find(
                                    (group) => group.id === id,
                                  )?.label ?? id)
                                : id,
                            )
                            .join(" hoặc ")}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {draft.game.generation.warnings.includes(
                  "METADATA_ANSWERS_NORMALIZED",
                ) && (
                  <p className="text-sm leading-6 text-slate-600">
                    Các nhóm đúng đã được bổ sung từ metadata học liệu. Bạn vẫn
                    cần duyệt hình ảnh, hướng dẫn và đáp án trước khi dùng với
                    trẻ.
                  </p>
                )}
                {draft.game.generation.warnings.includes(
                  "GROUP_IMAGES_NORMALIZED",
                ) && (
                  <p className="text-sm leading-6 text-slate-600">
                    Hình minh họa nhóm đã được đối chiếu lại với học liệu. Nhóm
                    không có ảnh phù hợp sẽ hiển thị bằng tên. Bạn vẫn cần duyệt
                    nội dung trước khi dùng với trẻ.
                  </p>
                )}
                {draft.game.generation.warnings.some(
                  (warning) =>
                    ![
                      "ADULT_REVIEW_REQUIRED",
                      "FREE_TEXT_CONSTRAINTS_REQUIRE_REVIEW",
                      "METADATA_ANSWERS_NORMALIZED",
                      "GROUP_IMAGES_NORMALIZED",
                    ].includes(warning),
                ) && (
                  <p className="text-sm leading-6 text-slate-600">
                    Một số đặc điểm học liệu chưa đủ thông tin để kiểm chứng tự
                    động. Bạn cần xem lại các cặp ghép hoặc nhóm phân loại.
                  </p>
                )}
                {changed && (
                  <p
                    role="status"
                    className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"
                  >
                    Bạn đã đổi yêu cầu. Bản xem thử phía trên vẫn là kết quả
                    trước; nhấn Tạo lại để cập nhật.
                  </p>
                )}
              </>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <span
                  aria-hidden="true"
                  className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-3xl text-blue-700"
                >
                  ✦
                </span>
                <h3 className="text-lg font-semibold">
                  {busy
                    ? "Đang chuẩn bị trò chơi của bạn"
                    : "Ý tưởng nhỏ, trò chơi mới"}
                </h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
                  {busy
                    ? "Khi nội dung sẵn sàng, bạn có thể chơi thử ngay tại đây."
                    : "Nhấn Tạo trò chơi để chọn loại và nhập mô tả. Trò chơi sẽ xuất hiện tại đây để bạn thử trước."}
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
