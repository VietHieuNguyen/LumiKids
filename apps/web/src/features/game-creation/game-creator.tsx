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
import { GameSymbol } from "../game-runtime/components/game-symbol";
import { CreatorIllustration } from "./creator-illustration";

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
  onUnauthorized: () => void;
}
export function GameCreator({
  api,
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
  function openPrompt(type?: GameType) {
    if (type) setGameType(type);
    promptDialog.current?.showModal();
  }
  return (
    <main className="creator-workspace text-ink" ref={workspace}>
      <div className="creator-page-inner">
        <Link href={libraryApi ? libraryHref : "/account"} className="mb-4 inline-flex min-h-9 items-center gap-2 rounded-lg text-sm font-semibold text-leaf hover:text-ink">
          <span aria-hidden="true">←</span>{libraryApi ? "Kho trò chơi" : "Tài khoản"}
        </Link>
        <header className="creator-toolbar">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-leaf">Học liệu · Sáng tạo cùng LumiKids</p>
            <h1 className="font-display text-4xl font-extrabold leading-tight">
              Tạo trò chơi
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">
              {busy
                ? "LumiKids đang chuẩn bị trò chơi từ ý tưởng của bạn…"
                : "Từ một ý tưởng nhỏ, tạo nên giờ học đầy khám phá cho bé."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="lumi-button-sun"
              onClick={() => openPrompt()}
            >
              <span aria-hidden="true">✦</span>
              {busy
                ? "Xem tiến trình tạo"
                : draft
                  ? "Chỉnh mô tả"
                  : "Bắt đầu tạo"}
            </button>
            <button
              type="button"
              className="asset-button-secondary"
              aria-pressed={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
              {fullscreen ? "Thu nhỏ màn hình" : "Toàn màn hình"}
            </button>
          </div>
        </header>
        <ol className="creator-steps" aria-label="Quy trình tạo trò chơi">
          {[
            ["Chọn loại & mô tả", "Kể ý tưởng của bạn"],
            ["Chơi thử & kiểm tra", "Trải nghiệm như bé"],
            ["Hoàn thiện học liệu", libraryApi ? "Chọn độ khó, duyệt và lưu" : "Chọn độ khó phù hợp"],
          ].map(([title, description], index) => {
            const active = index === (!draft ? 0 : !draft.difficulty ? 1 : 2);
            const done = !!draft && (index === 0 || (index === 1 && !!draft.difficulty));
            return <li key={title} className={`creator-step ${active ? "is-current" : ""} ${done ? "is-done" : ""}`} aria-current={active ? "step" : undefined}>
              <span className="creator-step-number" aria-hidden="true">{done ? "✓" : index + 1}</span>
              <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-ink-soft">{description}</p></div>
            </li>;
          })}
        </ol>
        {fullscreenError && (
          <p role="status" className="text-sm text-ink-soft">
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
              <h2 id={dialogTitleId} className="font-display text-2xl font-bold">
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
              className="min-w-0 bg-paper p-5 sm:p-6"
              aria-label="Thiết kế trò chơi bằng mô tả"
            >
              <form onSubmit={submit} noValidate aria-busy={busy}>
                <fieldset disabled={busy} className="disabled:opacity-60">
                  <legend className="text-base font-semibold">
                    1. Chọn loại trò chơi
                  </legend>
                  <div className="creator-type-options">
                    {gameCreationOptions.map((option) => (
                      <label
                        key={option.type}
                        className={`creator-type-option ${gameType === option.type ? "is-selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="gameType"
                          value={option.type}
                          checked={gameType === option.type}
                          onChange={() => setGameType(option.type)}
                          className="mt-1 h-4 w-4 accent-leaf"
                        />
                        <span className="creator-option-symbol"><GameSymbol type={option.type} /></span>
                        <span>
                          <span className="block text-sm font-semibold">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-ink-soft">
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
                  <div className="mt-2 flex justify-between gap-3 text-xs text-ink-soft">
                    <span id={helpId}>
                      Nêu rõ đối tượng, số lượng và cách chơi.
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {prompt.length}/{MAX_GAME_PROMPT_LENGTH}
                    </span>
                  </div>
                  {touched && invalid && (
                    <p id={errorId} className="mt-2 text-sm text-berry">
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
                  <p className="mt-2 text-xs leading-5 text-ink-soft">
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
                  className="lumi-button-sun mt-5 w-full"
                >
                  {busy
                    ? "Đang tạo trò chơi…"
                    : draft
                      ? "Tạo lại trò chơi"
                      : "Tạo trò chơi từ mô tả"}
                </button>
                {busy && (
                  <p
                    role="status"
                    className="mt-3 text-sm leading-6 text-leaf"
                  >
                    AI đang chuẩn bị nội dung. Bạn có thể tiếp tục chơi bản
                    trước trong lúc chờ.
                  </p>
                )}
                <p className="mt-4 text-xs leading-5 text-ink-soft">
                  Bản chơi thử chỉ giữ trong trang này và có thể mất khi tải lại
                  hoặc rời trang. Sau khi duyệt, hãy chọn chỉ số và lưu vào kho
                  ở bên dưới bảng chơi.
                </p>
              </form>
            </section>
          </dialog>
          <section className="min-w-0 space-y-4" aria-label="Khu vực Preview">
            {draft && <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-display text-2xl font-bold">Bản chơi thử của bạn</h2><p className="mt-1 text-xs leading-5 text-ink-soft">Kiểm tra hình ảnh, cách chơi và đáp án trước khi dùng cho bé.</p></div>
              <span className="rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-leaf">{gameCreationOptions.find((option) => option.type === draft.game.gameContent.gameType)?.label}</span>
            </div>}
            {draft && reader ? (
              <>
                <GamePreview
                  key={draft.revision}
                  content={draft.game.gameContent}
                  assetReader={reader}
                  backHref={libraryApi ? libraryHref : "/account"}
                  backLabel={libraryApi ? "Kho trò chơi" : "Tài khoản"}
                  controlsPosition="after"
                />
                <div className="rounded-xl border border-sun-edge/30 bg-sun-soft px-4 py-3 text-sm leading-6 text-[#805b13]">
                  Đây là nội dung do AI tạo. Hãy kiểm tra hình ảnh, hướng dẫn và
                  đáp án trước khi sử dụng với trẻ.
                </div>
                <fieldset
                  disabled={busy}
                  className="rounded-2xl border border-line bg-paper p-4 sm:p-5"
                >
                  <legend className="px-2 font-display text-xl font-bold text-ink">
                    Chọn độ khó phù hợp với bé
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
                        className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-3 text-sm font-medium ${draft.difficulty === value ? "border-leaf bg-leaf-soft text-leaf" : "border-line text-ink-soft"}`}
                      >
                        <input
                          type="radio"
                          name={`${promptId}-difficulty`}
                          value={value}
                          checked={draft.difficulty === value}
                          onChange={() => controller.setDifficulty(value)}
                          className="accent-leaf"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-ink-soft">
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
                  <details className="rounded-xl border border-line bg-paper p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">
                      Duyệt các nhóm được chấp nhận
                    </summary>
                    <p className="mt-3 text-xs leading-5 text-ink-soft">
                      Mỗi hình chỉ cần xếp một lần vào bất kỳ nhóm nào được chấp
                      nhận. Nhiều nhóm có thể cùng đúng; không bắt buộc mỗi nhóm
                      nhận một hình. Giáo viên cần xem lại metadata và đáp án
                      trước khi dùng với trẻ.
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-ink">
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
                  <p className="text-sm leading-6 text-ink-soft">
                    Các nhóm đúng đã được bổ sung từ metadata học liệu. Bạn vẫn
                    cần duyệt hình ảnh, hướng dẫn và đáp án trước khi dùng với
                    trẻ.
                  </p>
                )}
                {draft.game.generation.warnings.includes(
                  "GROUP_IMAGES_NORMALIZED",
                ) && (
                  <p className="text-sm leading-6 text-ink-soft">
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
                  <p className="text-sm leading-6 text-ink-soft">
                    Một số đặc điểm học liệu chưa đủ thông tin để kiểm chứng tự
                    động. Bạn cần xem lại các cặp ghép hoặc nhóm phân loại.
                  </p>
                )}
                {changed && (
                  <p
                    role="status"
                    className="rounded-xl border border-leaf/20 bg-leaf-soft px-4 py-3 text-sm text-ink"
                  >
                    Bạn đã đổi yêu cầu. Bản xem thử phía trên vẫn là kết quả
                    trước; nhấn Tạo lại để cập nhật.
                  </p>
                )}
              </>
            ) : (
              <div className="creator-start">
                <div className="creator-welcome">
                  <div className="creator-welcome-copy">
                    <span className="creator-ai-label"><span aria-hidden="true">✦</span> Trợ lý sáng tạo của giáo viên</span>
                    <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{busy ? "Ý tưởng đang thành trò chơi…" : <>Bạn có ý tưởng.<br />LumiKids giúp bạn tạo trò chơi.</>}</h2>
                    <p className="mt-4 max-w-md text-sm leading-7 text-ink-soft">{busy ? "Nội dung và học liệu đang được chuẩn bị. Bản chơi thử sẽ xuất hiện tại đây khi sẵn sàng." : "Chọn một cách chơi, mô tả điều bé sẽ khám phá. Bạn có thể chơi thử và điều chỉnh trước khi đưa vào giờ học."}</p>
                    <button type="button" className="asset-button-primary mt-5" onClick={() => openPrompt()}>{busy ? "Xem tiến trình tạo" : "Viết ý tưởng của bạn"}<span aria-hidden="true">→</span></button>
                    {busy && <p role="status" className="mt-4 text-sm font-semibold text-leaf">Đang chuẩn bị nội dung trò chơi…</p>}
                  </div>
                  <CreatorIllustration />
                </div>
                <div className="creator-start-options">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-display text-xl font-bold">Hôm nay bé sẽ khám phá điều gì?</h3><p className="text-xs text-ink-soft">Chọn một loại để bắt đầu</p></div>
                  <div className="creator-starter-grid">
                    {gameCreationOptions.map((option) => <button key={option.type} type="button" disabled={busy} onClick={() => openPrompt(option.type)} className="creator-starter-card" data-type={option.type}>
                      <span className="creator-starter-icon"><GameSymbol type={option.type} /></span>
                      <span className="min-w-0"><span className="block font-display text-xl font-bold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-ink-soft">{option.description}</span></span>
                      <span className="creator-starter-arrow" aria-hidden="true">↗</span>
                    </button>)}
                  </div>
                  <p className="mt-5 text-xs leading-5 text-ink-soft">Bạn luôn có thể đổi mô tả và tạo lại. Trò chơi chỉ được lưu vào kho sau khi bạn kiểm tra và xác nhận.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
