import type { QuantityOptions } from "@lumikids/shared";

export function QuantityOptionsForm({
  value,
  onChange,
}: {
  value: QuantityOptions;
  onChange: (value: QuantityOptions) => void;
}) {
  const update = (
    index: number,
    key: "name" | "available" | "required",
    next: string,
  ) =>
    onChange({
      ...value,
      fruits: value.fruits.map((f, i) =>
        i === index ? { ...f, [key]: key === "name" ? next : Number(next) } : f,
      ),
    });
  return (
    <div className="space-y-4 rounded-2xl border border-line bg-cream p-4">
      <p className="text-sm font-semibold">
        Chuẩn 15 · Chỉ số 42 · Trong phạm vi mười
      </p>
      <div className="flex gap-3">
        {(
          [
            ["MERGE", "Gộp"],
            ["SPLIT", "Tách"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value.mode === mode}
            className={
              value.mode === mode
                ? "asset-button-primary"
                : "asset-button-secondary"
            }
            onClick={() =>
              onChange({
                ...value,
                mode,
                fruits:
                  mode === "SPLIT"
                    ? [{ ...value.fruits[0], available: 5, required: 5 }]
                    : value.fruits,
                splitCounts: [2, 3],
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      {value.fruits.map((fruit, index) => (
        <div key={index} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">
            Tên quả trong kho
            <input
              className="asset-input"
              value={fruit.name}
              onChange={(e) => update(index, "name", e.target.value)}
              maxLength={120}
            />
          </label>
          <label className="text-sm">
            Số quả ban đầu
            <input
              className="asset-input"
              type="number"
              min={1}
              max={10}
              value={fruit.available}
              onChange={(e) => update(index, "available", e.target.value)}
            />
          </label>
          {value.mode === "MERGE" && (
            <label className="text-sm">
              Số quả cần vào giỏ
              <input
                className="asset-input"
                type="number"
                min={1}
                max={fruit.available}
                value={fruit.required}
                onChange={(e) => update(index, "required", e.target.value)}
              />
            </label>
          )}
          {value.mode === "MERGE" && value.fruits.length > 1 && (
            <button
              type="button"
              className="asset-button-secondary"
              onClick={() =>
                onChange({
                  ...value,
                  fruits: value.fruits.filter((_, i) => i !== index),
                })
              }
            >
              Bỏ loại quả
            </button>
          )}
        </div>
      ))}
      {value.mode === "MERGE" && value.fruits.length < 4 && (
        <button
          type="button"
          className="asset-button-secondary"
          onClick={() =>
            onChange({
              ...value,
              fruits: [
                ...value.fruits,
                { name: "", available: 1, required: 1 },
              ],
            })
          }
        >
          Thêm loại quả
        </button>
      )}
      {value.mode === "SPLIT" && (
        <div className="flex flex-wrap gap-3">
          {value.splitCounts.map((count, index) => (
            <label key={index} className="text-sm">
              Giỏ {index + 1}
              <input
                className="asset-input"
                type="number"
                min={1}
                max={9}
                value={count}
                onChange={(e) =>
                  onChange({
                    ...value,
                    splitCounts: value.splitCounts.map((n, i) =>
                      i === index ? Number(e.target.value) : n,
                    ),
                  })
                }
              />
            </label>
          ))}
          <button
            type="button"
            className="asset-button-secondary"
            onClick={() =>
              onChange({
                ...value,
                splitCounts:
                  value.splitCounts.length === 2
                    ? [...value.splitCounts, 1]
                    : value.splitCounts.slice(0, 2),
              })
            }
          >
            {value.splitCounts.length === 2
              ? "Thêm giỏ thứ ba"
              : "Dùng hai giỏ"}
          </button>
        </div>
      )}
      <p className="text-xs text-ink-soft">
        Tổng số quả ban đầu tối đa mười. Khi tách, tổng số quả yêu cầu trong các
        giỏ phải bằng số quả ban đầu. Các ô số lượng quyết định bài chơi.
      </p>
    </div>
  );
}
