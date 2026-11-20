"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AgeGroup, GameDifficulty, SavedGameDetail, Skill } from "@lumikids/shared";
import type { GeneratedGame } from "../game-creation/types";
import { GameLibraryApi, libraryError } from "./api";

export function SaveGamePanel({
  api,
  game,
  difficulty,
  libraryHref,
  disabled,
}: {
  api: GameLibraryApi;
  game: GeneratedGame;
  difficulty: GameDifficulty | null;
  libraryHref: string;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [codes, setCodes] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
  const [ageGroupId, setAgeGroupId] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState<SavedGameDetail | null>(null);
  const [loaded, setLoaded] = useState<{
    api: GameLibraryApi;
    retry: number;
  } | null>(null);
  const loading = !loaded || loaded.api !== api || loaded.retry !== retry;
  const [requestId] = useState(() => crypto.randomUUID());
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    Promise.all([api.curriculum(abort.signal), api.ageGroups(abort.signal)])
      .then(([value, groups]) => {
        if (abort.signal.aborted) return;
        setSkills(value);
        setAgeGroups(groups);
        setCatalogError(
          value.length ? "" : "Danh mục Chuẩn và Chỉ số chưa được thiết lập.",
        );
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setCatalogError(libraryError(failure));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoaded({ api, retry });
      });
    return () => abort.abort();
  }, [api, retry]);
  async function save() {
    if (
      busy ||
      disabled ||
      !difficulty ||
      !review ||
      !name.trim() ||
      !codes.length ||
      !ageGroupId ||
      saved
    )
      return;
    const abort = new AbortController();
    operation.current = abort;
    setBusy(true);
    setError("");
    try {
      const result = await api.save(
        {
          saveRequestId: requestId,
          name,
          description,
          difficulty,
          ageGroupId,
          criterionCodes: codes,
          content: game.gameContent,
          previewToken: game.generation.preview.token,
          reviewConfirmed: true,
        },
        abort.signal,
      );
      if (!abort.signal.aborted) setSaved(result);
    } catch (failure) {
      if (!abort.signal.aborted) setError(libraryError(failure));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="rounded-3xl border border-line bg-paper p-5 shadow-sm sm:p-7"
      aria-label="Lưu trò chơi vào kho"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-leaf">
            Kho trò chơi chung
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold text-ink">
            Lưu trò chơi đã duyệt
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Chọn một chỉ số mà trò chơi này đánh giá. Mọi giáo viên có thể mở
            và dùng lại trò đã lưu.
          </p>
        </div>
        <Link href={libraryHref} className="asset-button-secondary">
          Mở kho →
        </Link>
      </div>
      {saved ? (
        <div
          role="status"
          className="mt-5 rounded-2xl bg-leaf-soft p-5 text-ink"
        >
          <strong>Đã lưu “{saved.name}” vào kho.</strong>
          <p className="mt-2 text-sm">
            Nội dung, độ khó và chỉ số đánh giá đã được lưu lại.
          </p>
          <Link
            className="asset-button-primary mt-4"
            href={`${libraryHref}/${saved.versionId}`}
          >
            Mở trò chơi đã lưu →
          </Link>
        </div>
      ) : (
        <>
          <fieldset disabled={busy || disabled} className="mt-6 space-y-5">
            <label className="block text-sm font-semibold">
              Tên trò chơi <span className="text-berry">*</span>
              <input
                className="asset-input mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="Ví dụ: Bé tìm đúng môi trường sống"
              />
            </label>
            <label className="block text-sm font-semibold">
              Ghi chú cho giáo viên{" "}
              <span className="font-normal text-ink-soft/70">· tùy chọn</span>
              <textarea
                className="asset-input mt-2"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                placeholder="Mục tiêu, cách hướng dẫn hoặc lưu ý khi tổ chức…"
              />
            </label>
            <div>
              <h3 className="text-sm font-bold" id="save-age-heading">
                Nhóm tuổi <span className="text-berry">*</span>
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-soft">
                Chỉ giao được cho trẻ có tháng tuổi thuộc nhóm này tại ngày mở bài.
              </p>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="save-age-heading">
                {ageGroups.map((group) => (
                  <label
                    key={group.ageGroupId}
                    className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${ageGroupId === group.ageGroupId ? "border-leaf bg-leaf-soft text-ink" : "border-line text-ink-soft hover:bg-cream"}`}
                  >
                    <input
                      type="radio"
                      name="age-group"
                      className="h-4 w-4 accent-leaf"
                      checked={ageGroupId === group.ageGroupId}
                      onChange={() => setAgeGroupId(group.ageGroupId)}
                    />
                    {group.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold">
                Chỉ số đánh giá <span className="text-berry">*</span>
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-soft">
                Mỗi trò chơi đánh giá đúng một chỉ số. Khi trẻ chơi xong, hệ thống
                tính điểm của lượt chơi cho chỉ số này.
              </p>
              {loading && (
                <p className="mt-3 text-sm" role="status">
                  Đang tải danh mục…
                </p>
              )}
              {catalogError && (
                <div className="asset-error mt-3" role="alert">
                  {catalogError}
                  <button
                    type="button"
                    className="asset-text-button ml-3"
                    onClick={() => setRetry((n) => n + 1)}
                  >
                    Thử lại
                  </button>
                </div>
              )}
              <div className="mt-3 space-y-3">
                {skills.map((skill) => (
                  <details
                    key={skill.skillCode}
                    open
                    className="rounded-2xl border border-line p-4"
                  >
                    <summary className="cursor-pointer text-sm font-bold text-ink">
                      Chuẩn {skill.skillCode} · {skill.name}
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-ink-soft">
                      {skill.description}
                    </p>
                    <div className="mt-3 space-y-2">
                      {skill.criterions.map((c) => (
                        <label
                          key={c.criterionCode}
                          className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm leading-6 ${codes.includes(c.criterionCode) ? "border-leaf bg-leaf-soft" : "border-line hover:bg-cream"}`}
                        >
                          <input
                            type="radio"
                            name="criterion"
                            className="mt-1 h-4 w-4 shrink-0 accent-leaf"
                            checked={codes.includes(c.criterionCode)}
                            onChange={() => setCodes([c.criterionCode])}
                          />
                          <span>
                            <strong>Chỉ số {c.criterionCode}.</strong>{" "}
                            {c.description}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
              <p className="mt-3 text-sm font-medium text-leaf">
                {codes.length
                  ? `Đã chọn chỉ số ${codes.join(", ")}.`
                  : "Chưa chọn chỉ số."}
              </p>
            </div>
            <label className="flex cursor-pointer gap-3 rounded-xl bg-sun-soft p-4 text-sm leading-6 text-[#805b13]">
              <input
                type="checkbox"
                checked={review}
                onChange={(e) => setReview(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-leaf"
              />
              <span>
                Tôi đã kiểm tra hình ảnh, hướng dẫn, đáp án và sự phù hợp với
                chỉ số đã chọn.
              </span>
            </label>
          </fieldset>
          {!difficulty && (
            <p className="mt-4 text-sm text-[#805b13]">
              Chọn độ khó Dễ, Trung bình hoặc Khó ở phía trên trước khi lưu.
            </p>
          )}
          {error && (
            <p role="alert" className="asset-error mt-4">
              {error}
            </p>
          )}
          <button
            type="button"
            className="lumi-button-sun mt-5"
            disabled={
              busy ||
              disabled ||
              loading ||
              !!catalogError ||
              !difficulty ||
              !review ||
              !name.trim() ||
              !codes.length ||
              !ageGroupId
            }
            onClick={() => void save()}
          >
            {busy ? "Đang lưu…" : "Lưu vào kho trò chơi"}
          </button>
          <p className="mt-3 text-xs text-ink-soft">
            Lưu không gọi lại AI và không thay đổi lượt chơi hiện tại.
          </p>
        </>
      )}
    </section>
  );
}
