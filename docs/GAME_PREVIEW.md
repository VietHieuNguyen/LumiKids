# Game Preview Mode — Bước 4C

> Cập nhật Bước 6B: trang tạo AI `/teacher/games/create` dùng lại GamePreview với reader có phạm vi theo nội dung vừa sinh. Teacher xem ảnh qua API scoped đã được cho phép; không cấp READ_GAME_ASSETS hoặc mở Library. Route mẫu `/admin/game-preview` bên dưới vẫn giữ quyền đọc Library cũ. Xem [GAME_CREATION_UI.md](./GAME_CREATION_UI.md).

## Route và quyền truy cập

Giữ route đã có từ Bước 4B: **http://localhost:3000/admin/game-preview**. Từ `/account`, tài khoản có `READ_GAME_ASSETS` thấy nút **Xem thử trò chơi**. Trang chỉ cần quyền đọc; link quản lý thư viện vẫn cần `MANAGE_GAME_ASSETS`. Không tạo một trang Teacher/engine thứ hai.

**Teacher hiện chưa có READ_GAME_ASSETS**, đúng yêu cầu trước đó chỉ cấp quyền asset cho Admin. Bước này không thay Backend, seed, role/permission hoặc database. Teacher chưa thể dùng Preview ảnh Library và nhận màn hình thiếu quyền; Backend vẫn kiểm tra permission từng GET URL.

Đề xuất tối thiểu nếu bạn muốn mở cho giáo viên sau này: phê duyệt cấp riêng `READ_GAME_ASSETS` cho ROLE_TEACHER, giữ nguyên `MANAGE_GAME_ASSETS` chỉ cho Admin. API hiện có đã tách hai quyền này, nên không cần mở upload/PATCH cho Teacher. **Đề xuất chưa được áp dụng**; không tự nới quyền hoặc mở bucket public. Route được giữ để tương thích link cũ; component GamePreview không phụ thuộc namespace admin.

## Chạy ứng dụng

Tại repository root, dùng hai terminal PowerShell:

```powershell
# Terminal 1, nếu Backend chưa chạy
pnpm --filter api start:dev
```

```powershell
# Terminal 2
pnpm --filter web dev
```

Hoặc `pnpm dev` chạy cả hai; tránh chạy thêm server trùng cổng 3000/4000. Environment Auth/PostgreSQL/S3 dùng cấu hình đã có theo [GAME_ASSETS.md](./GAME_ASSETS.md); frontend tiếp tục dùng `NEXT_PUBLIC_API_URL`, không thêm secret/env mới.

## GamePreview tái sử dụng

```text
GameContent object (unknown)
  → schema v1: cấu trúc + business consistency
  → lấy các assetId duy nhất
  → assetReader.getReadUrl(id)
  → assetId → URL + expiry + revision trong bộ nhớ
  → GameRuntime mode=PREVIEW
  → feedback/progress/completion/reset + callbacks trong bộ nhớ
```

Public component nằm ở `apps/web/src/features/game-preview/game-preview.tsx`, export qua `@/features/game-preview`:

```tsx
"use client";

import { GamePreview } from '@/features/game-preview';
import type { PreviewAssetReader } from '@/features/game-preview';

function PreviewPanel({
  gameContent,
  assetClient,
}: {
  gameContent: unknown;
  assetClient: PreviewAssetReader;
}) {
  return (
    <GamePreview
      content={gameContent}
      assetReader={assetClient}
      backHref="/account"
      backLabel="Tài khoản"
      onInteraction={(event) => { /* optional consumer callback */ }}
      onComplete={(summary) => { /* optional consumer callback */ }}
      onReset={() => { /* optional consumer callback */ }}
    />
  );
}
```

Host là Client Component, tạo GameAssetsApi theo access token từ Auth hiện có rồi truyền instance đó làm assetClient; không truyền một class/function qua RSC boundary từ Server Component. Backend/AI payload tương lai chỉ cần cung cấp object GameContent vào `content`; không phụ thuộc ba mẫu và không có Gemini call trong component.

`GamePreview` validate trước khi tạo asset resolver. JSON sai shape/reference/đáp án/version có thông báo dễ hiểu và nút quay lại, không tạo runtime hoặc request ảnh. Trang nhập JSON xử lý cả lỗi cú pháp JSON; khi áp dụng dữ liệu sai, bản chơi trước được đóng để không nhầm với nội dung mới. Component không tự parse chuỗi JSON, mà nhận object đã parse từ host/API.

GameType, trạng thái chuẩn bị/đang chơi/hoàn thành, instruction, progress, nút Chơi lại và Quay lại được hiển thị qua Preview + Runtime hiện có. Không có engine preview riêng. `mode` luôn là PREVIEW, không có prop cho host chuyển nhầm sang chế độ khác.

## Asset resolution và URL hết hạn

`PreviewAssetReader` chỉ có một phương thức:

```ts
getReadUrl(assetId: string, force?: boolean): Promise<{
  url: string;
  expiresIn: number;
  expiresAt: string;
}>;
```

Adapter thật dùng **GET `/api/v1/game-assets/:id/url`** của GameAssetsApi. Không gọi MinIO SDK, không quản lý IAM/upload, không sửa hostname/path/query URL đã ký.

Resolver:

- Dùng `getGameContentAssetIds` từ shared để deduplicate, kể cả cùng ảnh được dùng cho nhiều item.
- Nạp theo batch tối đa 4 worker; cùng asset đang đọc được dùng chung promise. GameAssetsApi hiện có thêm cache/single-flight theo token, nên nhiều Preview có thể tái sử dụng cùng client.
- Theo dõi loading/error từng ảnh. 404 báo ảnh không tồn tại, 401 báo phiên hết hạn, 403 báo thiếu quyền, 409 báo INACTIVE không đọc được, lỗi mạng/storage có thông báo riêng đã ẩn driver details.
- Không chọn ảnh khác hoặc lấy ảnh mẫu để thay một asset Library bị thiếu. UUID mẫu không có thật được báo 404 nếu gửi qua Library.
- Dùng native img của Runtime để giữ nguyên signed URL, không Next Image proxy. Cặp URL/revision giúp retry ảnh kể cả khi Backend trả lại cùng URL trong cùng giây ký; không thêm query cache-buster làm hỏng signature.
- Tự xin URL mới trước expiry 30 giây; kiểm tra lại khi tab visible/focus sau thời gian browser tạm ngưng timer. Renew thông thường giữ nguyên game state và không khóa game khi ảnh hiện tại vẫn sẵn sàng.
- Nếu img tải lỗi, xin URL mới **một lần mỗi asset trong vòng đời resolver**. Lỗi tiếp theo hiện nút retry, tránh vòng lặp vô hạn. Retry thủ công mở lại budget; lỗi từ URL/revision cũ không làm mất URL mới.
- Khi resolver thiếu/lỗi ảnh, Runtime được paused, không phát tương tác; khi ảnh sẵn sàng thì tiếp tục. Ban đầu chưa có ảnh thì game được ẩn và hiện loading/error. Nếu đã chơi dở thì state được giữ, không remount controller chỉ vì renew/retry.
- stop/unmount hủy timer và bỏ qua kết quả cũ; GET đang gửi không abort vì API client dùng shared promise, nhưng không ghi lại state sau khi dừng. Không localStorage/sessionStorage/database URL cache.

Hook dùng useSyncExternalStore cho snapshot loading/ready/error; controller thời gian có clock injection chỉ để test offline. Không thêm TanStack Query hoặc thư viện state mới. AssetId/URL được resolve đúng theo payload, không tự đối chiếu tên ảnh hoặc metadata màu để đoán hình khác.

Khi bị lỗi quyền 401/403, quay lại tài khoản và xử lý phiên/quyền theo Auth; Preview không tự cấp quyền hoặc tạo session chơi. Reset chỉ xóa lượt chơi/event memory, không cấp lại quyền hay khắc phục một asset thực sự không tồn tại.

## JSON mẫu development và ảnh Library thật

Ba JSON từ Bước 4A vẫn được dùng nguyên vẹn, có UUID minh họa chưa seed vào Library. Trong **pnpm dev**, phần **Mẫu phát triển · ảnh minh họa cục bộ** cho chọn COUNTING/MATCHING/CLASSIFICATION. Host truyền development reader rõ ràng, map đúng 9 SVG đã có ở Bước 4B. Có banner báo đang dùng ảnh mẫu; đây không phải mock API trong luồng Library và không tạo dữ liệu MinIO/PostgreSQL.

Mẫu và debug không hiển thị trong production. Production vẫn nhận JSON có assetId thật qua input chung; component GamePreview tự thân không import bất kỳ ảnh mẫu nào.

Để thử kết nối Backend:

1. Chọn mẫu để có JSON, mở vùng **Nhập GameContent JSON**.
2. Thay các UUID minh họa bằng assetId tương ứng thực sự có trong Library (đúng quả táo/con vật/bóng/giỏ). Giữ id item, pair/group/choice reference khi không thay nội dung game.
3. Bấm **Kiểm tra và xem thử**. Thao tác này luôn dùng reader Library thật, tự lấy URL; không phải chế độ ảnh mẫu.
4. Nếu có asset thiếu, xem lỗi và mã ảnh liên quan, sửa JSON đúng rồi thử lại. Không có automatic fallback sang một ảnh có tên gần giống.

Chưa seed ảnh mẫu để tránh thay đổi dữ liệu thật; nếu cần bộ ảnh Library mẫu, đó là tác vụ riêng cần được chỉ định.

## Chứng minh không lưu dữ liệu đánh giá

- Runtime Bước 4B được tái sử dụng nguyên logic đúng/sai/completion; core model không có network.
- Preview chỉ được cấp read-only port getReadUrl. Host chỉ dùng GET ảnh, React state và callbacks; không có method createPlaySession/saveInteraction/savePerformance/evaluate.
- InteractionEvent chỉ được giữ tối đa 100 mục khi debug development bật. Panel debug mặc định gọn trong details; production luôn ẩn kể cả caller bật showDebug.
- onComplete đổi nhãn trạng thái; onReset xóa trạng thái hoàn thành và event list của lượt hiện tại. Không fetch POST/PATCH để gửi kết quả, không tạo PlaySession, SessionPerformance hoặc CriterionEvaluation.
- Test đi qua GameAssetsApi mock transport, resolve asset, chơi CLASSIFICATION sai→đúng→hoàn thành→reset và assert toàn bộ request đều là GET `/game-assets/:id/url`. Không có endpoint persistence phát sinh.
- AuthProvider có thể POST refresh-token theo Auth hiện có khi mở trang; đây là khôi phục phiên đăng nhập, không phải PlaySession hoặc lưu kết quả của trẻ.

Callback là điểm mở rộng cho consumer trong tương lai; các host hiện tại không gắn callback ghi dữ liệu. Nếu bước sau muốn lưu dữ liệu, phải thiết kế luồng riêng và test lại policy PREVIEW thay vì tự động dùng persistence của chế độ chơi thật.

## Kiểm thử

```powershell
pnpm --filter web test:game-preview
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

75 test frontend đạt: 22 Preview mới, 23 runtime/controller và 30 API/validation asset. Preview tests gồm React server-render cả ba renderer, loading/invalid JSON/paused controls/debug production, resolver TTL/concurrency/retry/stale response, lỗi quyền/404 và không gọi persistence. JSX test dùng TypeScript dependency sẵn có với loader nhỏ trong tests, không thêm React/browser framework hoặc dependency.

SSR tests không mount browser DOM; callback/completion/reset được kiểm tra qua controller Runtime dùng thật. Fake clock mô phỏng URL hết hạn mà không chờ 15 phút. Đây không phải kiểm thử touch hoặc E2E trình duyệt với PostgreSQL/MinIO thật. Browser access host hiện không khả dụng, nên chưa có browser screenshot/gesture QA trong bước này.

Manual:

1. **COUNTING:** chọn mẫu Đếm số lượng, chọn 3 → sai, chọn 4 → hoàn thành; reset về đầu. Không có event cho việc bấm nút chọn mẫu.
2. **MATCHING:** ghép mèo vào bóng chó → sai; sửa về bóng mèo, ghép chó đúng → hoàn thành 2/2. Item đúng khóa, không đếm trùng.
3. **CLASSIFICATION:** bóng đỏ vào giỏ xanh → sai; đưa lại giỏ đỏ → đúng; hoàn thành đủ 6/6. Kéo hoặc chọn item rồi chọn nhóm; reset xóa placements và feedback.
4. **JSON sai:** đổi version/answer/reference hoặc xóa dấu ngoặc, bấm kiểm tra; có thông báo, không crash, không gửi request lấy ảnh cho nội dung invalid.
5. **Library thật:** dùng UUID thật rồi áp dụng JSON; Network chỉ có GET URL theo assetId duy nhất. Thử UUID không tồn tại để kiểm tra thông báo 404; không thấy ảnh khác được thay vào.
6. **Expiry:** chơi dở, giữ tab đến gần TTL hoặc quay lại tab sau TTL; thấy request renew, progress không reset. Nếu renew lỗi, game paused; bật lại kết nối rồi retry, tiến độ vẫn giữ.
7. **Ảnh lỗi:** mô phỏng GET ảnh lỗi qua DevTools, kiểm tra một lần auto-refresh rồi lỗi/retry có giới hạn. Khôi phục URL/file để tiếp tục; không cần phá/xóa bucket hoặc DB thật.
8. **Quyền:** Teacher hiện bị chặn và không có link Preview. Không tự sửa role DB để test; các nhánh 401/403 đã mock-test.
9. **Production:** build/start, không thấy JSON mẫu hoặc panel event debug. Kiểm tra Network khi hoàn thành/reset không có API lưu đánh giá.

## Tái sử dụng ở Bước 6B

- `GamePreview` nhận GameContent object từ bất kỳ nguồn nào, bao gồm payload Backend sau AI Generation; không xây trang/runtime khác.
- Validator/type shared Bước 4A, `getGameContentAssetIds`, asset resolver/hook và read-only reader adapter.
- GameRuntime, registry, ba renderer, progress/reset/completion và callbacks in-memory của Bước 4B.
- UI loading/error theo ảnh, renew/retry và policy chặn PREVIEW persistence.

Bước 6B cần chốt hợp đồng Backend trả GameContent, quyền Teacher được phê duyệt, assetId thật đã duyệt và version hỗ trợ; không thêm Gemini, Teacher Prompt UI hoặc ActivityVersion persistence ở 4C. Từ Server Component chỉ truyền JSON sang Client host, khởi tạo API reader trong Client dựa trên Auth hiện có. Không gửi credentials S3 xuống browser.

## File tạo/sửa

- `apps/web/src/features/game-preview/game-preview.tsx`: reusable Preview và trạng thái UI/debug.
- `asset-resolver.ts`: read-only port, resolution lifecycle/cache/TTL/error; `use-preview-assets.ts`: React hook; `index.ts`: public exports (cùng thư mục).
- `apps/web/src/features/game-runtime/components/runtime-preview.tsx`: thu gọn thành host input/development, không giữ engine/asset loading riêng.
- `apps/web/src/features/game-runtime/game-runtime.tsx`: paused controls và asset revisions, giữ một controller/lượt.
- `components/types.ts`, `game-picture.tsx`, `counting-game.tsx`, `matching-game.tsx`, `classification-game.tsx` trong game-runtime: chuyển revision/error context xuống ảnh.
- `apps/web/src/app/admin/game-preview/page.tsx`, `src/app/account/page.tsx`: gate/link theo quyền đọc, không cấp quyền mới.
- `apps/web/tests/game-preview.test.mjs`, `register-tsx.mjs`, `tsx-test-loader.mjs`: tests và JSX test loader.
- `apps/web/package.json`: test scripts; không thêm dependency.
- `docs/GAME_PREVIEW.md`, `docs/GAME_RUNTIME.md`, `docs/SETUP.md`: hướng dẫn/trạng thái.

Không sửa Backend API/Auth, Prisma/migration, seed, shared schema, infrastructure, secrets hoặc MinIO policy. Chưa chạy thao tác ghi dữ liệu thật trong bước này.
