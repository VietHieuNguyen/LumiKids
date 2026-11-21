# Trò chơi PATTERN — Sắp xếp theo quy tắc (Chỉ số 46)

Ngày: 21/11/2026 · Trạng thái: đã duyệt hướng (người dùng duyệt bản thiết kế ngắn trong hội thoại)

## Mục đích

LumiKids có COUNTING (42/43), CLASSIFICATION (51/52), MATCHING (50/52) nhưng chưa trò nào chấm
**Chỉ số 46 — Sắp xếp theo quy tắc**. PATTERN lấp khoảng trống đó với chi phí AI gần bằng 0:
dãy được sinh bằng code xác định, AI (nếu dùng) chỉ chọn ảnh.

Hướng "giáo án + học liệu + câu chuyện bằng AI" đã được cân nhắc và **bỏ** vì tốn token.

## Mục tiêu / Không phải mục tiêu / Phản mục tiêu

- Mục tiêu: trẻ nhìn một dãy hình lặp theo quy tắc, chọn hình đúng cho ô trống; server chấm lại
  bằng engine shared; ghi CriterionEvaluation theo `ce-score-v2` như trò khác.
- Không thuộc lần này: quy tắc theo kích thước/hướng xoay, ô trống ở giữa dãy, nhiều ô trống,
  sửa thanh trượt mũi tên của MATCHING, giáo án/câu chuyện AI.
- Phản mục tiêu: **trẻ phải dùng nút mũi tên/cuộn để thấy đủ thành phần** — mọi thứ của một màn
  phải nằm gọn trong màn iPad (ngang và dọc). Cũng không được tăng số lần gọi model.

## Trải nghiệm trẻ (iPad)

```
        ●  ●  ●  ○  ○          ← tiến độ (chỉ hiển thị)
   🐰  🐥  🐰  🐥  🐰  [ ? ]   ← dãy, ô ? nhấp nháy nhẹ
        ┌────┐ ┌────┐ ┌────┐
        │ 🐥 │ │ 🐷 │ │ 🐰 │   ← 2–3 thẻ to: chạm hoặc kéo vào ô ?
        └────┘ └────┘ └────┘
```

- Một dãy mỗi màn. Đúng → ô điền hình, gấu linh vật chúc mừng, cả dãy nhún theo nhịp, **tự chuyển**
  sang dãy tiếp (không có nút "Tiếp"). Sai → thẻ nảy về, chọn lại.
- Gợi ý (một lần/dãy): làm sáng một chu kỳ quy tắc đầu dãy (ví dụ 🐰🐥) để trẻ thấy nhịp lặp.
- Thẻ tối thiểu 96px, kéo và chạm đều được; dùng lại `use-speech` đọc hướng dẫn như trò khác.

## Độ khó theo nhóm tuổi (bảng system.md, k = 5)

| Nhóm tuổi | Quy tắc | Số thẻ | Độ dài dãy hiển thị |
|---|---|---|---|
| 3–4 | AB | 2 | 5–6 |
| 4–5 | AAB, ABB, ABC | 3 | 6–7 |
| 5–6 | AABB, ABCD, ABC | 3 | 7–8 |

Người lớn chọn độ khó (invariant hiện hành); nhóm tuổi chỉ là mặc định gợi ý.

## Hợp đồng nội dung (shared, mới: PATTERN v1)

```ts
patternContentSchema = {
  schemaVersion: 1,
  instruction: string,
  gameType: "PATTERN",
  items: AssetItem[2..4],            // các "viên" hình phân biệt; mỗi viên một assetId khác nhau
  sequences: Array<{
    id: GameElementId,
    rule: "AB" | "AAB" | "ABB" | "ABC" | "AABB" | "ABCD",
    cells: GameElementId[4..8],      // itemId theo thứ tự HIỂN THỊ, không gồm ô trống
    choiceIds: GameElementId[2..3],  // itemId của thẻ
    correctItemId: GameElementId,    // hình đúng của ô trống ở cuối
  }>[3..6],                          // mặc định 5 → N ≥ 5
  completionRule: "ALL_SEQUENCES_COMPLETED",
}
```

Kiểm tra (superRefine): id duy nhất; mọi tham chiếu tồn tại; số hình phân biệt trong `cells`
đúng bằng độ dài chu kỳ của `rule` (AB=2, ABC=3, AAB/ABB/AABB=2, ABCD=4); `cells` thực sự lặp
đúng `rule` (so khớp theo chu kỳ, bắt đầu từ đầu chu kỳ); `correctItemId` là phần tử kế tiếp của
chu kỳ; `correctItemId ∈ choiceIds`; `choiceIds` không trùng.

Thêm vào: `gameTypeSchema`, `completionRuleSchema`, `gameContentV1Schema` (+ structure).
Prisma: `GameType.PATTERN`, `CompletionRule.ALL_SEQUENCES_COMPLETED` → **một migration** (viết sẵn,
chỉ chạy khi người dùng cho phép).

## Tương tác & engine (shared)

- Event mới `FILL_PATTERN`: `sourceId` = sequenceId, `targetId` = itemId thẻ đã chọn.
- Dãy được giải theo thứ tự: event phải nhắm dãy chưa giải đầu tiên, nếu không thì bị từ chối
  như event lệch thứ tự hiện nay.
- CORRECT khi `sourceId === sequence.correctItemId`. Hoàn thành khi mọi dãy đã CORRECT.
- Tiến độ: `{ correct: số dãy đã giải, total: sequences.length }`.
- Gợi ý: `taskId` = sequenceId; `targetIds` = các ô thuộc chu kỳ đầu tiên (renderer làm sáng).
- `REQUEST_HINT.sourceId` = sequenceId. SessionPerformance/ScoreCE tính nguyên như trò khác (mỗi dãy
  là một nhiệm vụ: F/R/H).

## Sinh trò (game-generation)

- **Không gọi AI** (quyết định khi lập kế hoạch, cần người dùng xác nhận): giáo viên nhập prompt
  ("dãy thỏ và gà con") + chọn quy tắc/số dãy; Nest tìm ảnh qua tên/alias trong whitelist ACTIVE
  bằng bộ chọn hiện có, rồi dựng dãy bằng hàm thuần trong shared (`buildPatternContent`), xác định
  theo seed để Preview/Save ổn định. Không có màn chọn ảnh thủ công vì Teacher không có
  READ_GAME_ASSETS. Thiếu ảnh → `PATTERN_ASSETS_INSUFFICIENT`.
- Event trả lời: `FILL_PATTERN` với `sourceId` = sequenceId, `targetId` = itemId thẻ đã chọn
  (để chấm điểm theo `sourceId` như các trò khác).
- Loại SHADOW mặc định; ưu tiên ảnh cùng `visualStyle`/`assetSet` để dãy đồng bộ.

## Renderer web

- `pattern-game.tsx` đăng ký trong `game-runtime/registry.tsx` (label "Sắp xếp theo quy tắc").
- Bố cục co giãn theo khung: kích thước ô = min(chiều rộng / số ô, chiều cao / 3); không cuộn.
- Kéo dùng pointer events như `use-pointer-pairing`; chạm thẻ cũng điền.
- Màn tạo trò (game-creation) thêm lựa chọn loại PATTERN, chọn quy tắc/số dãy/ảnh.

## Học liệu mới (Blender)

Bộ ảnh tái sử dụng cho mọi loại trò, phong cách 3D mềm pastel như gấu linh vật: thỏ, gà con, heo,
mèo, cá, ếch, gấu, vịt (+ biến thể màu nếu cần cho quy tắc màu). Render PNG nền trong suốt,
1024px, cùng camera/ánh sáng. Metadata: `objectType`, `aliases`, `category: ANIMAL`,
`animalType`, `visualStyle: CARTOON`, `assetSet: LUMI_PASTEL_01`, `color` khi rõ.
File nguồn `.blend` + PNG lưu trong repo; tải vào MinIO/DB qua API quản trị tài sản hiện có
(người dùng đã cho phép đưa vào MinIO).

## Cách tiếp cận đã cân nhắc

- **PATTERN (chọn):** lấp Chỉ số 46, dãy sinh bằng code, dùng lại kho ảnh, khớp chấm điểm.
- Vị trí trong không gian (47): hay nhưng cần dựng cảnh ghép và nhập nhằng trái/phải với 3–4 tuổi.
- So sánh kích thước (44): dễ nhất nhưng chỉ phủ nửa chỉ số (không có dung tích).

## Để người xây dựng tự quyết

Tên file/hàm cụ thể, animation chi tiết, cấu trúc test (Vitest API, node:test web, test shared),
chiến lược seed cho sinh dãy.
