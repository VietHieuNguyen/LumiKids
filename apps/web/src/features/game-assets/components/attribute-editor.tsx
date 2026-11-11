"use client";

import { useId, useState } from "react";
import {
  AI_ASSET_ATTRIBUTE_KEYS,
  AI_ASSET_ARRAY_ATTRIBUTE_KEYS,
} from "@lumikids/shared";
import { attributeInputFrom, parseAttributes } from "../metadata";
import type { AttributeInput } from "../types";

// Guidance for the current metadata-only AI gateway; not a storage restriction.
const aiAttributes = [
  { key: "color", label: "Màu sắc", example: "RED, BLUE, GREEN" },
  { key: "shape", label: "Hình dạng", example: "CIRCLE, SQUARE, TRIANGLE" },
  {
    key: "habitat",
    label: "Một môi trường sống",
    example: "LAND, WATER, AIR, SEA… (một giá trị)",
  },
  {
    key: "habitats",
    label: "Các môi trường được chấp nhận",
    example: '["FOREST", "TREE"] (mảng JSON)',
  },
  {
    key: "specificHabitats",
    label: "Môi trường cụ thể",
    example: '["SEA", "RIVER"] (mảng JSON, nếu cả hai phù hợp)',
  },
  { key: "category", label: "Nhóm đối tượng", example: "ANIMAL, FRUIT" },
  { key: "animalType", label: "Loài vật", example: "LION, CAT, DOG" },
  {
    key: "aliases",
    label: "Tên gọi đồng nghĩa của đối tượng",
    example: '["dâu tây", "quả dâu tây", "strawberry"] (mảng JSON)',
  },
  {
    key: "matchKey",
    label: "Khóa ghép cặp",
    example: "LION_POSE_01 (giống nhau ở ảnh gốc và đúng bóng của ảnh đó)",
  },
  { key: "variant", label: "Dạng ảnh", example: "NORMAL, SHADOW" },
  {
    key: "familyKey",
    label: "Cặp trưởng thành–con non",
    example: "LION_FAMILY_01 (cùng khóa cho hai ảnh cùng cặp)",
  },
  { key: "lifeStage", label: "Giai đoạn phát triển", example: "ADULT, YOUNG" },
  {
    key: "visualStyle",
    label: "Phong cách ảnh",
    example: "REALISTIC, CARTOON_2D",
  },
  { key: "assetSet", label: "Bộ học liệu", example: "ANIMALS_REALISTIC_01" },
  { key: "material", label: "Chất liệu", example: "WOOD" },
  { key: "size", label: "Kích thước", example: "SMALL, LARGE" },
  {
    key: "number",
    label: "Số trên hình",
    example: "5 (không phải số lần lặp ảnh)",
  },
];
const aiAttributeKeys = new Set<string>(AI_ASSET_ATTRIBUTE_KEYS);
const aiArrayAttributeKeys = new Set<string>(AI_ASSET_ARRAY_ATTRIBUTE_KEYS);

export function AttributeEditor({
  value,
  onChange,
}: {
  value: AttributeInput;
  onChange: (value: AttributeInput) => void;
}) {
  const [error, setError] = useState("");
  const prefix = useId();
  let extraKeys: string[] = [];
  try {
    extraKeys = Object.entries(parseAttributes(value))
      .filter(
        ([key, item]) =>
          !aiAttributeKeys.has(key) ||
          (aiArrayAttributeKeys.has(key)
            ? !Array.isArray(item) ||
              item.length < 1 ||
              item.length > 12 ||
              !item.every(
                (entry) =>
                  typeof entry === "string" &&
                  entry.length > 0 &&
                  entry.length <= 40,
              )
            : !["string", "number", "boolean"].includes(typeof item) ||
              item === null ||
              (typeof item === "string" && item.length > 200)),
      )
      .map(([key]) => key);
  } catch {
    // Allow incomplete rows/JSON while editing; submit retains existing validation.
  }
  function switchMode() {
    setError("");
    try {
      const parsed = parseAttributes(value);
      if (value.mode === "pairs")
        onChange({ mode: "json", json: JSON.stringify(parsed, null, 2) });
      else if (Object.values(parsed).every((item) => typeof item === "string"))
        onChange(attributeInputFrom(parsed));
      else
        setError(
          "Metadata có giá trị số, boolean hoặc cấu trúc lồng nhau. Hãy tiếp tục dùng chế độ JSON để giữ nguyên dữ liệu.",
        );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Vui lòng kiểm tra thuộc tính.",
      );
    }
  }
  return (
    <section aria-labelledby={`${prefix}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${prefix}-heading`} className="asset-label">
          Đặc điểm hình ảnh{" "}
          <span className="font-normal text-slate-400">· tùy chọn</span>
        </h3>
        <button
          type="button"
          className="asset-text-button"
          onClick={switchMode}
        >
          {value.mode === "pairs" ? "Chuyển sang JSON" : "Chuyển sang bảng"}
        </button>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Dùng objectType cụ thể cho mọi học liệu, ví dụ MANGO, JACKFRUIT, BOOK,
        CAR; animalType chỉ dành cho con vật. Thêm aliases dạng JSON cho tên gọi
        ngắn hoặc đồng nghĩa để prompt “dâu tây” vẫn tìm đúng ảnh tên “Quả dâu
        tây đỏ”. Không đưa màu, nhóm chung như fruit/toy hoặc loại trò chơi vào
        aliases.
      </p>
      <p className="text-xs leading-5 text-slate-500">
        Mô tả màu sắc, hình dạng hoặc môi trường phù hợp để ảnh dùng được cho
        nhiều trò chơi. Bài đếm theo màu cần trường color (ví dụ RED), không chỉ
        tag “đỏ”. Với con vật, khai báo tất cả môi trường đúng để trẻ được chấp
        nhận ở nhiều nhóm. Giáo viên gán độ khó sau khi tạo trò chơi.
      </p>
      <details className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-violet-900">
          Thiết lập ảnh thường, hình bóng và con non
        </summary>
        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
          <p>
            Ảnh thường dùng variant NORMAL; ảnh bóng dùng SHADOW. Bài đếm/phân
            loại thông thường không chọn ảnh bóng.
          </p>
          <p>
            Ảnh gốc và đúng bóng của ảnh đó phải có cùng matchKey (ví dụ
            LION_POSE_01), đúng tư thế và đường nét. Hai tư thế khác nhau dùng
            khóa khác nhau; cùng loài chưa đủ để ghép bóng.
          </p>
          <p>
            Ghép trưởng thành–con non: khai báo cùng animalType và familyKey,
            lifeStage lần lượt ADULT và YOUNG. Giữ matchKey riêng cho từng ảnh
            nếu ảnh đó cũng có hình bóng.
          </p>
          <p>
            Dùng visualStyle REALISTIC cho bộ ảnh sát thực tế, CARTOON_2D cho
            hoạt hình; assetSet đặt tên bộ học liệu. Các thuộc tính mô tả ảnh,
            không gắn ảnh cố định vào một loại trò chơi. Nếu không chắc con
            vật/tuổi/cặp tương ứng, cần người quản trị xác nhận.
          </p>
        </div>
      </details>
      <details className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-blue-900">
          Thiết lập ảnh cho bài phân loại môi trường sống
        </summary>
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Dùng chế độ JSON cho danh sách môi trường. Chọn đúng các giá trị phù
          hợp với ảnh và mục tiêu bài học, không mặc định mọi loài cá đều sống ở
          mọi nơi. Các ví dụ dưới đây chỉ áp dụng khi đã được người quản trị xác
          nhận.
        </p>
        <div className="mt-3 space-y-2">
          {[
            [
              "Sư tử",
              '{"animalType":"LION","habitat":"LAND","specificHabitats":["SAVANNA","GRASSLAND"]}',
            ],
            ["Gà", '{"animalType":"CHICKEN","habitats":["LAND","FARM"]}'],
            ["Chim", '{"animalType":"BIRD","habitats":["AIR","TREE","LAND"]}'],
            ["Khỉ", '{"animalType":"MONKEY","habitats":["FOREST","TREE"]}'],
            [
              "Cá minh họa chấp nhận sông và biển",
              '{"animalType":"FISH","habitats":["RIVER","SEA"]}',
            ],
            ["Cá voi biển", '{"animalType":"WHALE","habitats":["SEA"]}'],
            ["Cá heo biển", '{"animalType":"DOLPHIN","habitats":["SEA"]}'],
            ["Cá mập biển", '{"animalType":"SHARK","habitats":["SEA"]}'],
            [
              "Gấu Bắc cực",
              '{"animalType":"POLAR_BEAR","habitats":["LAND","ARCTIC"]}',
            ],
            [
              "Chim cánh cụt",
              '{"animalType":"PENGUIN","habitats":["LAND","SEA"]}',
            ],
          ].map(([label, json]) => (
            <div key={label} className="rounded-lg bg-white px-3 py-2">
              <p className="text-xs font-semibold text-slate-700">{label}</p>
              <code className="mt-1 block select-all whitespace-pre-wrap break-all text-xs leading-5 text-blue-900">
                {json}
              </code>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Mã hỗ trợ: LAND (trên cạn), WATER (dưới nước), AIR (bầu trời), SAVANNA
          (thảo nguyên), GRASSLAND (đồng cỏ), FOREST (rừng), TREE (trên cây),
          SEA (biển), RIVER (sông), LAKE (hồ), FARM (nông trại), DESERT (sa
          mạc), ARCTIC (Bắc cực), ANTARCTIC (Nam cực). Hai vùng cực không thay
          thế cho nhau và không tự suy ra LAND/WATER. Chim cánh cụt không sống ở
          Bắc cực; chỉ thêm ANTARCTIC khi loài đã được xác định phù hợp. Môi
          trường cụ thể trên cạn cũng chấp nhận LAND; biển/sông/hồ cũng chấp
          nhận WATER. LAND hoặc WATER riêng lẻ không chứng minh được môi trường
          cụ thể.
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          Với ảnh nhóm đích, nhập tên như “Đồng cỏ”, loại đối tượng HABITAT, và
          thuộc tính tương ứng, ví dụ {`{"habitat":"GRASSLAND"}`}. Ảnh nhóm là
          tùy chọn; trò chơi vẫn có thể dùng nhãn chữ.
        </p>
      </details>
      <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Thuộc tính AI hiện nhận và ví dụ nhập
        </summary>
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Nhập đúng tên thuộc tính, phân biệt chữ hoa/thường. AI nhận giá trị
          chữ tối đa 200 ký tự, số hoặc đúng/sai. Riêng aliases, habitats và
          specificHabitats nhận mảng từ 1–12 chuỗi, mỗi chuỗi tối đa 40 ký tự;
          nhập bằng chế độ JSON. Không nhận object lồng nhau. Việc nhận thuộc
          tính không có nghĩa mọi đặc điểm đều đã được kiểm chứng tự động; nội
          dung trò chơi vẫn cần người lớn duyệt.
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {aiAttributes.map(({ key, label, example }) => (
            <div key={key} className="min-w-0 rounded-lg bg-white px-3 py-2">
              <dt className="text-xs font-medium text-slate-700">
                {label} <code className="text-blue-800">{key}</code>
              </dt>
              <dd className="mt-1 break-words text-xs leading-5 text-slate-500">
                {example}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Chỉ thêm những đặc điểm đúng với ảnh. Không cần điền đủ các thuộc
          tính.
        </p>
      </details>
      {extraKeys.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"
        >
          <p className="font-semibold">Thông tin bổ sung không gửi tới AI</p>
          <p className="mt-1 break-words">
            {extraKeys.join(", ")}. Các thông tin này vẫn được lưu trong thư
            viện khi bạn lưu thay đổi, nhưng không được chuyển vào mô hình để
            tạo trò chơi.
          </p>
        </div>
      )}
      {value.mode === "pairs" ? (
        <>
          {value.rows.length > 0 && (
            <div
              className="hidden grid-cols-[1fr_1fr_2.5rem] gap-2 px-1 text-xs font-medium text-slate-500 sm:grid"
              aria-hidden="true"
            >
              <span>Tên thuộc tính</span>
              <span>Giá trị</span>
              <span />
            </div>
          )}
          {value.rows.map((row, index) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_2.5rem] items-start gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1fr_1fr_2.5rem]"
            >
              <label className="col-start-1">
                <span className="sr-only">Tên thuộc tính {index + 1}</span>
                <input
                  className="asset-input"
                  value={row.key}
                  maxLength={100}
                  list={`${prefix}-keys`}
                  placeholder="color"
                  onChange={(event) =>
                    onChange({
                      ...value,
                      rows: value.rows.map((item) =>
                        item.id === row.id
                          ? { ...item, key: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label className="col-start-1 row-start-2 sm:col-start-2 sm:row-start-1">
                <span className="sr-only">Giá trị thuộc tính {index + 1}</span>
                <input
                  className="asset-input"
                  value={row.value}
                  placeholder="RED"
                  onChange={(event) =>
                    onChange({
                      ...value,
                      rows: value.rows.map((item) =>
                        item.id === row.id
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="asset-icon-button col-start-2 row-start-1 text-red-600 sm:col-start-3"
                aria-label={`Xóa thuộc tính ${row.key || index + 1}`}
                onClick={() =>
                  onChange({
                    ...value,
                    rows: value.rows.filter((item) => item.id !== row.id),
                  })
                }
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="asset-button-secondary w-full border-dashed"
            disabled={value.rows.length >= 100}
            onClick={() =>
              onChange({
                ...value,
                rows: [
                  ...value.rows,
                  { id: crypto.randomUUID(), key: "", value: "" },
                ],
              })
            }
          >
            ＋ Thêm thuộc tính
          </button>
        </>
      ) : (
        <label className="block">
          <span className="sr-only">Thuộc tính dưới dạng JSON object</span>
          <textarea
            className="asset-input min-h-44 font-mono text-sm"
            rows={7}
            value={value.json}
            maxLength={16384}
            spellCheck={false}
            onChange={(event) =>
              onChange({ mode: "json", json: event.target.value })
            }
          />
          <span className="mt-2 block text-xs text-slate-500">
            Dùng JSON để giữ các giá trị số, boolean, array hoặc object. Tối đa
            16 KiB.
          </span>
        </label>
      )}
      <datalist id={`${prefix}-keys`}>
        {aiAttributes.map(({ key, label }) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </datalist>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
