# GameContent Schema v1

> COUNTING mới hỗ trợ schemaVersion 2 để đếm theo màu bằng `countingRule` và `countedItemIds`; v1 tiếp tục đếm toàn bộ. Xem [COUNTING_V2.md](./COUNTING_V2.md). Các giới hạn đếm toàn bộ trong phần v1 bên dưới là lịch sử contract, không phải giới hạn của v2.

> Cập nhật: CLASSIFICATION mới có schemaVersion 2 và `correctGroupIds` để nhận nhiều nhóm đúng. v1 bên dưới được giữ tương thích; xem [CLASSIFICATION_V2.md](./CLASSIFICATION_V2.md). Public `gameContentSchema` đọc cả v1 và v2; không âm thầm thay nghĩa v1.

## Phạm vi

GameContent mô tả **một nhiệm vụ trong một ActivityVersion**, chưa có nhiều round/nhiệm vụ trong một content. Trước bước này `packages/shared` chỉ export module rỗng; repository chưa có Prisma model Activity/ActivityVersion hoặc game schema cũ. Code mới nằm trong `packages/shared/src/game-content`, chỉ phụ thuộc Zod **4.6.7**, cùng phiên bản Backend. Không có NestJS/React/Prisma/MinIO/Gemini/Node API trong schema package.

Không sửa Auth, GameAsset Module, permissions, database, migrations hoặc frontend. Không triển khai renderer/runtime/preview, AI, PlaySession, SessionPerformance, scoring hoặc assessment. Các app chưa import shared khi chưa có luồng sử dụng; package ESM đã export schema và types cho bước tích hợp sau.

## Contract và các kiểu dữ liệu

```ts
type GameContent = CountingContent | MatchingContent | ClassificationContent;
```

Type thực tế được suy ra bằng `z.infer`, không duy trì interface GameContent riêng. Union phân biệt theo `gameType`.

| Field chung | Quy tắc |
|---|---|
| schemaVersion | Literal số `1`, bắt buộc, không mặc định/coerce từ chuỗi |
| gameType | COUNTING / MATCHING / CLASSIFICATION |
| instruction | Hướng dẫn cho trẻ, trim, 1–1000 ký tự |
| completionRule | Literal khớp GameType |

Mọi object strict: field không khai báo bị từ chối, kể cả `url`, `presignedUrl`, `state`, `score`. Hình ảnh chỉ dùng assetId, không lưu objectKey/filename/URL. Local element ID có 1–64 ký tự: bắt đầu bằng chữ/số, sau đó chữ/số/`_`/`-`, phân biệt hoa thường, không trim hoặc sinh lại khi parse. ID duy nhất trên **tất cả collection của cùng task**, kể cả item và choice/group/target. Người tạo nội dung phải giữ ID ổn định khi reorder/render.

assetId là UUID theo `GameAsset.id` hiện có. Nhiều item được phép dùng chung assetId nhưng phải có id khác nhau; 4 quả táo cùng ảnh vẫn là 4 đối tượng. Item có `label?` 1–120 ký tự nếu cung cấp, phục vụ mô tả/khả năng tiếp cận.

### COUNTING

- `items`: 1–20 phần tử `{ id, assetId, label? }`, mỗi phần tử là một đối tượng cần đếm.
- `choices`: 2–6 phần tử `{ id, value }`; value nguyên từ 0–20 và không trùng nhau.
- `correctChoiceId`: phải tồn tại trong choices và value phải bằng **items.length**.
- `completionRule: "CORRECT_CHOICE"`: chọn đúng choice mới hoàn thành.

Không thêm quantity riêng để tránh hai nguồn số lượng mâu thuẫn. Đáp án được khai báo rõ và được kiểm tra, Frontend không tự đoán đáp án. V1 đếm toàn bộ items, chưa có đếm tập rỗng hoặc subset phải đoán từ instruction; 0 có thể là đáp án nhiễu.

[counting.v1.json](../packages/shared/examples/game-content/counting.v1.json): 4 quả táo, choices 3/4/5, correctChoiceId=choice-4.

### MATCHING

- `sourceItems` và `targetItems`: mỗi collection 1–20 phần tử `{ id, assetId, label? }`.
- `pairs`: 1–20 quan hệ `{ sourceId, targetId }`.
- `completionRule: "ALL_PAIRS_CORRECT"`: tất cả cặp đúng mới hoàn thành.

V1 là one-to-one: mỗi source có đúng một cặp, mỗi target thuộc đúng một cặp. Reference thiếu, dùng lại source/target, bỏ sót source/target đều không hợp lệ. Điều này buộc số source/target/pair bằng nhau. Đáp án không phụ thuộc thứ tự hai array. Chưa có many-to-one/many-to-many hoặc target distractor không ghép được.

[matching.v1.json](../packages/shared/examples/game-content/matching.v1.json): mèo/chó ghép với bóng tương ứng; thứ tự target cố ý khác thứ tự source.

### CLASSIFICATION

- `items`: 1–50 phần tử `{ id, assetId, label?, correctGroupId }`.
- `groups`: 2–10 phần tử `{ id, label, assetId? }`; label bắt buộc 1–120 ký tự, ảnh minh họa tùy chọn.
- `correctGroupId`: một ID duy nhất, phải tồn tại trong groups, không nhận array nhiều nhóm.
- `completionRule: "ALL_ITEMS_CLASSIFIED_CORRECTLY"`: tất cả item đúng nhóm mới hoàn thành; thả sai không tính hoàn thành.

Không cố định hai nhóm/sáu item. Nhiều item có thể cùng nhóm, nhóm không có item đúng có thể đóng vai trò distractor. Test có ví dụ ba nhóm/năm item, không có ảnh nhóm.

[classification.v1.json](../packages/shared/examples/game-content/classification.v1.json): 3 bóng đỏ, 3 bóng xanh và 2 giỏ có hình minh họa.

Các giới hạn array là phạm vi/payload của v1, không phải level hoặc công thức đánh giá trẻ.

## Ba lớp validation

1. **Cấu trúc:** `gameContentStructureSchema` kiểm tra shape, version/type/rule, ID, loại dữ liệu và giới hạn. Có schema cấu trúc riêng cho từng game; kết quả này chưa đủ để lưu/publish.
2. **Tính nhất quán:** `gameContentSchema` (alias của `gameContentV1Schema`) kết hợp cấu trúc với `.superRefine`: uniqueness, reference, count/answer, cặp matching và group assignment. Schema riêng `countingContentSchema`, `matchingContentSchema`, `classificationContentSchema` cũng có business checks. Lỗi Zod chỉ rõ path field liên quan.
3. **Asset Library:** UUID hợp lệ không chứng minh ảnh tồn tại/ACTIVE. `getGameContentAssetIds(content)` thu thập/deduplicate assetId; `getGameContentAssetIssues(content, assets)` kiểm tra projection do Backend cung cấp: `{ id, status: 'ACTIVE' | 'INACTIVE' }`. Helper trả `ASSET_NOT_FOUND` hoặc `ASSET_INACTIVE`, không kết nối DB/network.

Ví dụ boundary cho bước Backend tiếp theo (không giả định GameAsset service hiện có method batch lookup):

```ts
import {
  gameContentSchema,
  getGameContentAssetIds,
  getGameContentAssetIssues,
} from '@lumikids/shared';
import type { GameAssetAvailability } from '@lumikids/shared';

async function validateForAuthoring(
  input: unknown,
  loadAssets: (ids: readonly string[]) => Promise<readonly GameAssetAvailability[]>,
) {
  const parsed = gameContentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  const records = await loadAssets(getGameContentAssetIds(parsed.data));
  const issues = getGameContentAssetIssues(parsed.data, records);
  if (issues.length) return { ok: false as const, issues };
  return { ok: true as const, content: parsed.data };
}
```

Backend thực hiện loadAssets qua GameAsset service, kiểm tra quyền authoring và kiểm tra lại trước lưu/publish để tránh dữ liệu stale. Không query bảng module khác trực tiếp. Projection không phải model Prisma mới và helper không cấp quyền.

Asset helper dành cho **nội dung mới/chỉnh sửa** nên từ chối INACTIVE. Không dùng helper authoring để cấm game đã publish đọc ảnh INACTIVE; file vẫn được giữ theo chính sách GameAsset. Schema không xác minh ảnh thực sự là táo, hình bóng đúng hoặc màu đúng với instruction; cần duyệt nội dung/metadata riêng, chưa có AI nhận diện ảnh.

## Interaction Contract

`gameInteractionSchema` là union theo actionType, type suy ra `GameInteraction`. Đây là một thao tác, không phải game state hay Prisma InteractionEvent; chưa lưu PostgreSQL.

| Field | Quy tắc |
|---|---|
| schemaVersion | `1`, version độc lập của event contract |
| eventId | UUID ổn định của một thao tác, phục vụ idempotency sau này |
| actionType | SELECT_CHOICE / MATCH_DROP / CLASSIFY_DROP |
| sourceId | Choice ID / source item ID / classification item ID tương ứng action |
| targetId | Bắt buộc ở drop: target item ID hoặc group ID; không được có ở SELECT_CHOICE |
| result | CORRECT / INCORRECT |
| timestamp | ISO 8601 string có Z hoặc UTC offset rõ ràng |
| attemptIndex | Số nguyên dương, bắt đầu 1 và tăng theo mỗi thao tác trong một lần chạy nhiệm vụ |

Ví dụ hai lần thả của cùng item:

```json
[
  {
    "schemaVersion": 1,
    "eventId": "dd387324-6c34-4c23-b1ad-082372388616",
    "actionType": "CLASSIFY_DROP",
    "sourceId": "red-ball-1",
    "targetId": "blue-basket",
    "result": "INCORRECT",
    "timestamp": "2026-11-10T07:00:00.000Z",
    "attemptIndex": 1
  },
  {
    "schemaVersion": 1,
    "eventId": "4db53e58-76cb-4670-b706-710685d01f17",
    "actionType": "CLASSIFY_DROP",
    "sourceId": "red-ball-1",
    "targetId": "red-basket",
    "result": "CORRECT",
    "timestamp": "2026-11-10T07:00:03.000Z",
    "attemptIndex": 2
  }
]
```

Mỗi lần thả vào đích là event mới; không gộp sai/rồi đúng. Retry gửi **cùng event** qua mạng giữ nguyên eventId/attemptIndex. Schema một event chỉ kiểm tra cấu trúc; runtime/Backend tương lai phải kiểm tra reference event thuộc đúng content, tính lại result, uniqueness/idempotency, thứ tự attemptIndex và completion. Context lần chạy sẽ được đặt trong envelope khi thiết kế PlaySession, chưa tạo ở bước này.

Một event CORRECT không đồng nghĩa hoàn thành game; số event CORRECT có thể chứa nhiều thao tác trên cùng item. Matching/classification cần đúng tất cả đối tượng riêng biệt. Chưa có reducer/state machine/engine thực hiện điều kiện này. Thả ngoài mọi đích không nằm trong contract hiện tại; nếu cần sẽ thêm action có chủ đích.

Không có metadata tùy ý, score, level, elapsed time hoặc snapshot state trong event v1. Timestamp ghi nhận thời điểm/thứ tự, không dùng thời gian chơi để tính level hay đánh giá trẻ.

## Versioning và ActivityVersion

Hiện hỗ trợ v1 qua `gameContentV1Schema`, alias public `gameContentSchema`, types `GameContentV1`/`GameContent`. Version 2, thiếu version hoặc chuỗi `"1"` bị từ chối; không tự đoán format.

Khi có thay đổi không tương thích, giữ schema v1 và JSON đã publish, thêm schema v2 riêng rồi dispatch theo schemaVersion trước khi phân biệt gameType. Không sửa literal version của schema cũ hoặc âm thầm reinterpret JSON v1. Nâng cấp nội dung cũ cần converter/test riêng. Đổi instruction/đáp án cùng format dùng version nội dung ActivityVersion tương lai, không phải tự tăng schemaVersion.

Class Diagram vẫn có `ActivityVersion.content: GameContent`; subtype TypeScript chỉ là abstraction của JSON, không tạo bảng inheritance. Khi có instruction/completionRule ở cả ActivityVersion và GameContent theo diagram, cần derive hoặc kiểm tra đồng nhất, tránh hai nguồn sự thật. Chưa thêm model/cột/migration. Đáp án hiện nằm trong content nội bộ; payload phân phối cho client/chống gian lận sẽ được thiết kế khi có runtime/API.

## Build và sử dụng

Từ repository root:

```powershell
pnpm --filter @lumikids/shared build
pnpm --filter @lumikids/shared typecheck
pnpm --filter @lumikids/shared test
```

Test script build trước, kiểm tra type narrowing từ declarations rồi chạy Node built-in runner. Không cài test framework mới; không cần .env/database/S3/server/LLM.

Khi app bắt đầu dùng schema, thêm dependency workspace `@lumikids/shared: workspace:*` vào app đó và build shared trước. Backend/Frontend cùng import ESM schema/types:

```ts
import { gameContentSchema } from '@lumikids/shared';
import type { GameContent } from '@lumikids/shared';

const candidate: unknown = {}; // replace with parsed JSON input
const result = gameContentSchema.safeParse(candidate);
if (result.success) {
  const content: GameContent = result.data;
  if (content.gameType === 'COUNTING') {
    console.log(content.correctChoiceId); // narrows to CountingContent
  }
}
```

Schema nhận object đã parse JSON, không nhận chuỗi JSON nguyên văn; xử lý JSON syntax errors tại input boundary. Không ép kiểu `input as GameContent` thay validation. Dùng full `gameContentSchema` trước lưu/publish; structure-only không chứng minh consistency/asset availability.

## File thay đổi và kiểm chứng

- `packages/shared/src/game-content/common.ts`: version, ID, item, completion rule, uniqueness helper.
- `counting.schema.ts`, `matching.schema.ts`, `classification.schema.ts`: shape và business checks.
- `game-content.schema.ts`: union, public v1 schema và types.
- `interaction.schema.ts`: event contract.
- `asset-references.ts`: pure asset boundary helpers.
- `packages/shared/src/index.ts`: exports public.
- `packages/shared/examples/game-content/*.v1.json`: ba JSON mẫu.
- `packages/shared/tests/game-content.test.mjs`: runtime/schema/asset/event tests.
- `packages/shared/tests/game-content.types.ts`, `tests/tsconfig.json`: inferred types/narrowing.
- `packages/shared/package.json`, `pnpm-lock.yaml`: Zod dependency và scripts.
- `docs/GAME_CONTENT.md`, `docs/SETUP.md`: hướng dẫn/trạng thái.

Filename schema/helper không có prefix trong danh sách nằm dưới `packages/shared/src/game-content/`.

AssetId trong mẫu là UUID minh họa, chưa seed/đối chiếu Library thật; phải thay bằng assetId ACTIVE khi dùng nội dung thật. Tests đọc samples và dùng asset projection giả trong bộ nhớ. Chưa kiểm chứng tích hợp endpoint/UI/runtime vì ngoài phạm vi. Không thay policy Admin-only của thư viện, không tạo ảnh, không đọc/ghi DB hoặc MinIO.
