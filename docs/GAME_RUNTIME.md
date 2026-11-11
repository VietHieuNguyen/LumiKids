# Game Runtime & Renderer — Bước 4B

> Matching: khi ghép đúng, nguồn được bỏ khỏi hàng trên; đích giữ nguyên vị trí và hiển thị ảnh của nguồn đã ghép thay cho ảnh bóng/đích cũ, kèm trạng thái đúng và khóa thao tác. Chỉ dùng `state.matches` đã được controller xác nhận, không hiện đáp án trước khi đúng. Hàng nguồn cập nhật số hình còn lại, hết hình hiển thị ngôi sao; chơi lại khôi phục toàn bộ ảnh. Đã kiểm tra typecheck/lint và render offline cho chuyển ảnh, hết nguồn và reset; chưa kiểm tra tương tác trình duyệt trực tiếp.

> Giao diện hiện tại: phong cách thẻ treo cho cả COUNTING/MATCHING/CLASSIFICATION, khung vàng có độ nổi, dây cong và kẹp màu, nút chuyển hình tròn ở hai bên khay. Hình ở hàng trên, nhóm/đích hoặc đáp án ở hàng dưới; khay ngắn căn giữa, khay dài cuộn ngang, không thêm hàng. Một nền duy nhất `playroom-scene.webp` được chuyển từ `background1.jpg` do người dùng cung cấp; bỏ danh sách nền ngẫu nhiên cũ. Thanh tiến độ, biểu tượng loại trò chơi và phản hồi hoàn thành được thống nhất. Kéo thả hiển thị bản thu nhỏ của ảnh đang kéo. Giữ giao diện không chữ cho trẻ, màu kẹp không mang ý nghĩa đáp án, trạng thái chọn/đúng/sai có phản hồi riêng. Prompt dialog và toàn màn hình giữ nguyên. Typecheck/lint/CSS đạt; đã xem ảnh chụp headless từ bản render tĩnh của ba runtime ở màn hình rộng và bố cục phân loại 390px. Chưa xác nhận tương tác kéo thả trên trang thật. Các mô tả giao diện bên dưới là lịch sử thiết kế.

> Bảng chơi của cả ba dạng dùng giao diện hình ảnh: ẩn chữ hướng dẫn/nhãn học liệu/tiêu đề trang trí trong runtime, giữ tên truy cập cho trình đọc màn hình. Nút chơi lại và phản hồi dùng biểu tượng; đáp án đếm và chỉ báo số vẫn giữ. COUNTING có luật chọn lọc hiển thị hình mẫu cần đếm hoặc ô màu, không chỉ dựa vào hướng dẫn bằng chữ. Các thiết lập/ghi chú dành cho giáo viên ngoài runtime giữ nguyên. Chữ có sẵn bên trong file ảnh không được tự xóa; nhóm phân loại cần ảnh để trẻ nhận biết (nhóm thiếu ảnh vẫn chỉ có ký hiệu số, nên giáo viên cần bổ sung ảnh).

> MATCHING cập nhật: hai khay nguồn/đích xếp thành hai hàng thẻ ngang, mỗi hàng có nút trước/sau, chỉ báo khoảng hình đang xem, thanh cuộn và scroll snap; hiển thị 2/3/4 thẻ theo chiều rộng bảng. Số lượng cặp tăng không tạo thêm hàng dọc. Có thể chọn hình, chuyển ngang hàng đích rồi ghép; vẫn hỗ trợ kéo thả và bàn phím. Đích được xáo trộn riêng mỗi lượt và sửa các vị trí trùng đáp án nguồn (với ít nhất hai cặp), không thay ID/answer key. Seed ổn định qua tương tác, đổi URL và pause; “Chơi lại” tạo seed mới. Hai hàng điều hướng độc lập nên không suy ra đáp án từ cột. Chưa kiểm thử tương tác trình duyệt cho lần cập nhật này.

> Giao diện đếm và ghép cặp: dùng `PlayBoard` với CSS chung được scope bằng `.play-board` cho nền và bảng tiêu đề, không dùng biểu tượng SVG ở tiêu đề, SVG cục bộ `counting-picnic.svg` / `matching-garden.svg`, khay thẻ viền bo tròn và hướng dẫn theo bước. COUNTING dùng thẻ cùng kiểu có khung/kẹp cho mọi hình (không đánh dấu hình đích), các nút số lớn có phản hồi đúng/sai. MATCHING dùng hai khay nguồn/đích màu kem/tím, trạng thái đang chọn/thả/sai và nhãn cùng số cặp chỉ xuất hiện sau khi ghép đúng. Layout dựa theo chiều rộng bảng để dùng trong Preview hẹp hoặc màn hình lớn; ghost kéo nằm ngoài container của nền để giữ tọa độ con trỏ. Dùng phông hệ thống Segoe UI/Tahoma/Arial, không tải phông từ bên ngoài. `readableGameText` chỉ khôi phục lỗi mã hóa UTF-8/Windows-1252 khi giải mã hợp lệ và giảm dấu hiệu lỗi, tối đa hai lần; áp dụng ở phần chữ hiển thị, không đổi nội dung gốc, ID hoặc đáp án. Giữ controller, schema, asset resolver và chấm đáp án hiện có. Chưa kiểm tra thao tác thực tế trên trình duyệt/thiết bị cho lần chỉnh giao diện này.

> COUNTING v2 hiển thị cả item đích và item gây nhiễu, nhắc màu cần đếm và kiểm tra lựa chọn theo đáp án đã validate. Không đánh dấu riêng item đích; v1 vẫn đếm toàn bộ. Xem [COUNTING_V2.md](./COUNTING_V2.md).

> Cập nhật: CLASSIFICATION v2 dùng `correctGroupIds`; một lần đặt vào bất kỳ nhóm được chấp nhận nào là đúng, vẫn tính mỗi item một lần. v1 với một `correctGroupId` tiếp tục được hỗ trợ. Xem [CLASSIFICATION_V2.md](./CLASSIFICATION_V2.md).

> Giao diện phân loại: bảng chơi có nền SVG trang trí cục bộ `public/game-scenes/classification-meadow.svg`; khay thẻ hình có viền/kẹp màu ở trên, các nhóm có khung ảnh lớn và vùng chứa hình đúng ở dưới. Hai khay nguồn/nhóm dùng một hàng ngang không xuống dòng, có nút trước/sau độc lập, chỉ báo khoảng hình và hỗ trợ cuộn/phím mũi tên. Số thẻ nhìn thấy thay đổi theo chiều rộng bảng, tối đa 4 thẻ nguồn và 3 nhóm. Các hình đã đúng trong mỗi nhóm cũng nằm trên một hàng cuộn ngang. Khay cập nhật phạm vi hiển thị khi hình đã được phân loại và khi đổi kích thước. Nhóm không có assetId hiển thị thẻ số/label, không tự thay bằng ảnh môi trường giả. Ảnh Library vẫn dùng URL/revision và error handler cũ; nền trang trí không tham gia đáp án. Kéo thả, chọn–thả, bàn phím, nhiều đáp án đúng, reset và completion giữ nguyên controller hiện có. Chưa kiểm thử trình duyệt/thiết bị cho lần chỉnh giao diện này; người dùng tự kiểm tra.

## Phạm vi và cách chạy

Đã tích hợp schema thực tế Bước 4A từ `@lumikids/shared`: COUNTING dùng items/choices/correctChoiceId; MATCHING dùng sourceItems/targetItems/pairs; CLASSIFICATION dùng items/correctGroupId/groups. Không thêm field vào schema hoặc thay đổi đáp án mẫu. Interaction dùng nguyên contract SELECT_CHOICE / MATCH_DROP / CLASSIFY_DROP.

Trang chạy thử: **http://localhost:3000/admin/game-preview**, có link từ `/account` cho tài khoản có READ_GAME_ASSETS (hiện chỉ Admin). Bước 4C đã tách host sang reusable GamePreview, resolve/renew ảnh tự động và giữ policy không lưu đánh giá; xem [GAME_PREVIEW.md](./GAME_PREVIEW.md). Chưa có luồng chơi của trẻ/PlaySession; không mở quyền asset cho Teacher.

```powershell
# Repository root, nếu Backend đã chạy thì chỉ cần mở Frontend.
pnpm --filter web dev

# Nếu cần Backend/Auth và môi trường S3 đã cấu hình, mở terminal khác:
pnpm --filter api start:dev
```

Hoặc dùng `pnpm dev` từ root để chạy cả hai, tránh mở server trùng cổng 3000/4000. Web dev/build/typecheck tự build shared trước khi dùng package exports. Web đã thêm dependency `@lumikids/shared: workspace:*`; pnpm lock được cập nhật, không cài thư viện kéo thả/UI/framework mới. Nếu thay schema shared trong lúc web dev đang chạy, build lại shared để cập nhật dist.

## Kiến trúc

```text
GameContent JSON → gameContentSchema
  → GameRuntime → GameRun/controller
    → gameRegistry[gameType]
      → CountingGame | MatchingGame | ClassificationGame
        → GameAction (click hoặc pointer drop)
          → evaluator riêng từng GameType
          → state + progress + CompletionRule
          → GameInteraction callback → GameCompletion callback nếu vừa hoàn thành
```

- **GameRuntime** validate phòng thủ và tạo một lượt mới khi nội dung thay đổi. JSON khác nhưng nội dung đã chuẩn hóa giống nhau giữ lượt hiện tại; caller có thể đổi React key để bắt đầu lại có chủ đích.
- **GameRun** giữ controller trong một instance ổn định, render instruction/progress/feedback và reset. Đổi asset URL hoặc callback không reset tiến độ. Đổi nội dung thực sự remount lượt; reset remount renderer để xóa cả lựa chọn và gesture tạm.
- **Registry** là object exhaustive theo GameType, mỗi entry có label và render function. Wrapper thu hẹp content/state trước khi chuyển cho component riêng. Khi thêm GameType, compiler yêu cầu cập nhật registry, state và evaluator; không có plugin framework hay component if/else lớn.
- **Model thuần** có createInitialState, evaluator từng game, applyGameAction, getGameProgress, checkCompletion. Identity/timestamp được truyền vào transition để kiểm thử deterministic; không phụ thuộc React/DOM/network.
- **Controller** tạo UUID/thời điểm, giữ snapshot, commit state đồng bộ **trước callbacks**. Snapshot, placements/matches và event được freeze để caller không sửa ngược trạng thái. Callbacks không chạy trong React updater/effect, không bị phát lại chỉ vì rerender. setCallbacks cập nhật consumer mà không tạo lượt mới.

## API component

```tsx
import { GameRuntime } from '@/features/game-runtime';
import type { GameContent, GameInteraction } from '@lumikids/shared';

// content: GameContent đã validate.
// assetUrls: map UUID assetId → URL đã resolve; caller quản lý việc cấp/renew URL.
<GameRuntime
  content={content}
  assetUrls={assetUrls}
  mode="PREVIEW"
  onInteraction={(event: GameInteraction) => { /* nhận một event, không tự lưu DB */ }}
  onComplete={(completion) => { /* { gameType, attemptCount, completed: true } */ }}
  onReset={() => { /* tùy chọn: xóa log/chia lượt ở component cha */ }}
  onAssetError={(assetId) => { /* tùy chọn: caller xin URL mới */ }}
/>
```

`mode` nhận PREVIEW (mặc định) hoặc PLAY, hiện chỉ đổi nhãn hiển thị; không mở luồng xác thực trẻ, lưu phiên hoặc tính điểm. Runtime không fetch MinIO/API, không upload, không dùng S3 credentials. Dữ liệu GameContent sai có trạng thái lỗi, không phát event.

## State, action và completion

State chung có attemptCount, completed, lastInteraction. Phần riêng:

| GameType | State | Kiểm tra |
|---|---|---|
| COUNTING | selectedChoiceId | So choice ID với correctChoiceId, không so text hiển thị |
| MATCHING | matches `{ sourceId, targetId }[]` | Đối chiếu pairs; source/target đã ghép đúng bị khóa |
| CLASSIFICATION | placements `{ itemId, groupId }[]` | Đối chiếu correctGroupId; item đã đúng bị khóa |

Mỗi thao tác hợp lệ về reference tạo một event CORRECT hoặc INCORRECT và tăng attemptIndex. Thao tác sai không thêm placement/match, giữ nguyên những item đúng trước đó. Tap chọn source, bắt đầu kéo, di chuyển, thả ngoài đích, hủy gesture, ID không tồn tại hoặc thao tác item đã khóa không phải một đáp án hợp lệ để xử lý nên không tạo event.

COUNTING hoàn thành theo CORRECT_CHOICE. MATCHING/CLASSIFICATION cần tất cả đối tượng riêng biệt đúng theo ALL_PAIRS_CORRECT/ALL_ITEMS_CLASSIFIED_CORRECTLY. Progress được tính từ quan hệ đúng duy nhất đối chiếu content, không tăng bằng số event CORRECT; dữ liệu trùng không làm đầy tiến độ.

Khi completed=true, controller bỏ qua các thao tác tiếp theo; onComplete chỉ gọi một lần **mỗi lượt**. Reset xóa feedback/placements/matches/selection/attempt count, mở lượt mới và cho phép một completion mới. Không phát event RESET vì contract 4A chưa có action này. EventId mới cho thao tác mới, attemptIndex bắt đầu lại 1 sau reset; component cha cần phân biệt lượt qua onReset. Không có duration, score, level hoặc assessment.

Callback nhận event trước completion. Nếu callback interaction ném lỗi, state vẫn được commit và completion vẫn được xử lý bằng finally; lỗi không bị nuốt. Nếu callback chủ động reset ngay, completion thuộc lượt cũ bị hủy. Callback ứng dụng thực tế nên tự xử lý lỗi I/O, không để lỗi consumer làm gián đoạn UI.

## CLASSIFICATION: sai → đúng → hoàn thành

Với mẫu 6 bóng/2 giỏ:

1. Thả red-ball-1 vào blue-basket: event CLASSIFY_DROP / INCORRECT / attemptIndex=1. Progress 0/6; quả bóng vẫn ở vùng nguồn.
2. Thả lại red-ball-1 vào red-basket: event mới CORRECT / attemptIndex=2, eventId khác. Bóng chuyển vào giỏ đỏ, progress 1/6.
3. Thử thao tác red-ball-1 đã đúng: bị khóa, không event mới, không cộng tiến độ.
4. Phân loại đúng 5 bóng còn lại: tổng 7 event, progress 6/6, onComplete gọi đúng 1 lần.
5. Thao tác tiếp khi hoàn thành: không event/completion mới. Chơi lại: 0/6, event log của host được xóa, có thể hoàn thành lượt tiếp theo.

Số item/group được đọc từ JSON, không hardcode 6/2; tests có cả 5 item/3 group.

## Pointer, touch và accessibility

Repository không có dnd-kit. Thay vì thêm dependency, hook dùng [Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events), pointer capture và `touch-action: none` chỉ trên source draggable. Vùng khác vẫn cuộn trang bình thường. Có ngưỡng di chuyển 8 CSS px để phân biệt tap/drag, một primary pointer tại một thời điểm, hover đích và ghost nhãn. `pointerup` hit-test đích trong đúng renderer scope; không thả nhầm sang một runtime khác. Ghost không chặn pointer hit-test.

pointercancel/lost capture/Escape hủy gesture, không phát đáp án giả. Click tổng hợp sau drag được chặn để một lần thả không tạo thêm lựa chọn/tương tác. Source gốc ở nguyên chỗ và mờ trong lúc kéo; thả sai xóa ghost, khôi phục source; thả đúng chuyển theo state mới.

Không bắt buộc kéo: chọn source bằng tap/click hoặc Tab + Enter/phím cách, sau đó chọn target/group. Escape bỏ chọn. Các vùng nguồn/đích rộng tối thiểu khoảng 144 px ở layout mặc định; đáp án đếm tối thiểu 80 px. Có focus outline, text + ký hiệu đúng/sai, aria-pressed cho selection, live feedback và native progress. Không chỉ dựa vào màu.

Chưa có auto-scroll khi giữ kéo sát mép viewport; với nhiệm vụ dài/đích ngoài màn hình, dùng chọn source → cuộn ở vùng ngoài source → chọn đích. Chưa tự động chuyển focus đến item kế tiếp sau khi item đúng bị khóa. Hai điểm này cần cải thiện và kiểm chứng trên thiết bị thật nếu Bước 4C yêu cầu trải nghiệm kéo thả liên tục cho bài dài.

## Assets và trang chơi thử

Renderer chỉ nhận `assetUrls` map, không hardcode endpoint MinIO. Ảnh dùng native img để giữ nguyên presigned URL, không qua Next Image proxy; referrerPolicy=no-referrer, không draggable theo native HTML5. URL thiếu/sai scheme hoặc ảnh tải lỗi hiển thị label/fallback. Khi caller cung cấp URL mới, ảnh được thử lại mà tiến độ không đổi. Nhóm classification không có assetId vẫn hiển thị label bình thường.

Trang `/admin/game-preview` là **host** ngoài runtime:

- Trong development, chọn một trong ba JSON mẫu Bước 4A với ảnh minh họa cục bộ. Editor chung nhận JSON khác để validate/chạy qua Library. JSON lỗi hiện thông báo và đóng bản chơi trước để tránh nhầm nội dung.
- UUID minh họa của 4A được map rõ ràng tới 9 SVG cục bộ trong public/game-demo. Không seed giả vào GameAsset Library, không ghi object lên MinIO.
- JSON có assetId thật được GamePreview Bước 4C tự resolve bằng GET `/api/v1/game-assets/:id/url`. URL được renew trước expiry, có error/retry và không sửa đáp án; UUID mẫu không tồn tại trong Library phải được thay đúng trước khi dùng luồng này.
- GamePreview quản lý paused khi thiếu/lỗi ảnh và giữ tiến độ qua renew. Runtime chỉ nhận URL, revisions và paused props, không tự truy cập credential/Library.
- Debug tối đa 100 event trong bộ nhớ, chỉ hiện trong details của development; production ẩn. Reset xóa log/trạng thái hoàn thành, không có network event ingestion/database persistence.

Parent adapter resolve/renew/cache/dedupe đã có ở Bước 4C. Quyền phiên chơi hợp lệ vẫn cần được thiết kế riêng; trang Preview hiện chỉ tận dụng quyền asset có sẵn, không thay thế phân quyền game session tương lai.

## Tests và kết quả kiểm tra

```powershell
pnpm --filter web test:game-runtime
pnpm --filter web test:game-assets
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
# Hoặc chạy cả hai bộ test Frontend:
pnpm --filter web test
```

23 test engine/controller đạt: đúng/sai ba GameType, reference, id-based answers, không đếm trùng, reset, completion một lần, event contract/index/UUID, reentrant dispatch, callback đổi/lỗi, state immutability, content snapshot. 30 test GameAsset API/validation hiện có vẫn đạt. Lint, typecheck và production build đạt, có route `/admin/game-preview`. Test runner Node có sẵn, không thêm framework React/browser.

Browser automation host không khả dụng trong phiên triển khai nên chưa kiểm thử tương tác trình duyệt/tablet hoặc screenshot. Unit tests không mount React, không thay thế kiểm thử pointer capture/click tổng hợp/touch, focus hay responsive trên thiết bị thật. Không login/upload/PATCH/ghi event vào DB để chạy tests; không thay credentials, migration hoặc MinIO policy.

## Hướng dẫn kiểm thử thủ công

1. Đăng nhập Admin, từ `/account` mở **Chơi thử ba loại trò chơi**, hoặc vào `/admin/game-preview`.
2. COUNTING: chọn 3 → phản hồi chưa đúng; chọn 4 → hoàn thành, onComplete=1. Các lựa chọn khóa đến khi Chơi lại. Kiểm tra event sourceId là choice ID, không phải text số.
3. MATCHING: chọn/kéo mèo vào bóng chó → sai, source giữ nguyên. Ghép mèo vào bóng mèo → đúng, khóa cặp. Ghép chó đúng → 2/2, onComplete=1. Thử click/kéo lại cặp đã khóa, không thêm event.
4. CLASSIFICATION: chạy chuỗi sai → đúng → 6/6 ở trên, xem event JSON và attemptIndex. Mỗi lần thả sai thêm đúng một event; bỏ tay ngoài nhóm không thêm event. Không có event cho mọi pixel kéo.
5. Reset lúc đang dở và sau hoàn thành: tiến độ/feedback/selection/drag đều về đầu; hoàn thành lại cho đúng một callback của lượt mới.
6. Thử chọn source rồi target bằng click, Tab/Enter/phím cách; Escape bỏ chọn. Test thả sau khi con trỏ rời source, pointer cancel, chuột/phím xen kẽ và không có click thứ hai sau drag.
7. Thử tablet portrait/landscape và touch thật. Chỉ source chặn native scroll; có thể cuộn vùng ngoài source rồi chọn đích khi cần. Task dài cần fallback chọn–cuộn–chọn do chưa có auto-scroll.
8. Dùng JSON khác: thêm nhóm thứ ba hoặc bớt item, bảo đảm schema hợp lệ, runtime theo đúng số lượng. JSON sai/reference thiếu/version không hỗ trợ phải hiện lỗi, không crash.
9. Với JSON assetId thật, nạp ảnh Library; thử mạng ảnh lỗi hoặc URL hết hạn, fallback phải rõ ràng. Nạp URL mới không reset progress. Không đổi hostname/query URL đã ký.
10. Kiểm tra không có request lưu InteractionEvent, PlaySession, SessionPerformance hoặc scoring khi chơi/chơi lại. Refresh trang làm mất lượt/log, đúng phạm vi in-memory hiện tại.

## Các điểm cần chốt cho Bước 4C

Chưa có đặc tả riêng 4C; dưới đây là các đầu việc tích hợp cần quyết định, không tự triển khai ở 4B:

- Nguồn GameContent đã duyệt và quy trình tải nội dung thực tế; không mặc định thêm AI hoặc Teacher Prompt UI.
- Quyền đọc ảnh trong phiên chơi hợp lệ và adapter resolve/renew URL tự động; không dùng quyền quản trị asset cho trẻ.
- Nếu có lưu event: envelope lần chạy/reset, idempotency, batch/retry/offline, thứ tự attemptIndex, server kiểm chứng result/reference/completion; không tin đáp án hoặc completed từ client. GameContent hiện chứa answer key và runtime client có thể bị chỉnh sửa, chưa có cơ chế chống gian lận/assessment authority.
- Chính sách resume/reload và content revision; snapshot in-memory hiện mất khi refresh, không phải ActivityVersion persistence.
- Tablet/browser QA thật, edge auto-scroll, quản lý focus sau thao tác, hướng dẫn/audio nếu cần. Chưa coi pure tests là chứng nhận hỗ trợ mọi thiết bị.
- Giữ scoring/level/evaluation và thời gian chơi ngoài runtime hiện tại cho đến khi có yêu cầu nghiệp vụ riêng.

## File tạo/sửa

- `apps/web/src/features/game-runtime/model/`: types, engine, controller, counting/matching/classification evaluators.
- `features/game-runtime/components/`: ba renderer, GamePicture, pointer pairing hook/parts, RuntimePreview host và props types.
- `features/game-runtime/game-runtime.tsx`, `registry.tsx`, `index.ts`, `demo-content.ts`.
- `apps/web/src/app/admin/game-preview/page.tsx`; link ở `src/app/account/page.tsx`.
- `apps/web/public/game-demo/*.svg`: 9 ảnh minh họa tự viết.
- `apps/web/tests/game-runtime.test.mjs`: tests engine/controller.
- `apps/web/src/app/globals.css`: styles game.
- `apps/web/package.json`, `apps/web/tsconfig.json`, `pnpm-lock.yaml`: workspace dependency, scripts và TS extension imports cho Node tests.
- `docs/GAME_RUNTIME.md`, `docs/SETUP.md`.

Các path `features/` và `src/` trong danh sách thuộc `apps/web/src/` và `apps/web/` tương ứng. Không sửa schema shared, Backend, Auth, database hoặc infrastructure trong bước này.
