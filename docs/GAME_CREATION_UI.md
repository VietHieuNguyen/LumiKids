# Teacher AI Game Creation & Preview — Bước 6B

> Cập nhật bố cục: Preview dùng toàn chiều ngang trang, bỏ cột prompt cố định. Nút Tạo trò chơi/Chỉnh mô tả mở native dialog có focus trap và đóng bằng Escape/nút đóng; form luôn được mount để giữ prompt, không hủy generation khi đóng. Generation thành công tự đóng dialog; thất bại giữ nội dung và tiến độ Preview. Nút Toàn màn hình dùng Fullscreen API cho vùng làm việc, không remount runtime; thoát bằng nút hoặc Escape. Lỗi generation vẫn có nút mở lại mô tả bên ngoài dialog. Auth/refresh/controller không thay đổi. Chưa kiểm thử thao tác trình duyệt cho bố cục này.


> COUNTING có thêm gợi ý “chỉ đếm bóng đỏ giữa các màu”, dùng schema v2 với quy tắc ALL/COLOR. Runtime hiển thị cả hình gây nhiễu; đáp án dựa vào tập item cần đếm, không phải tổng số hình. Xem [COUNTING_V2.md](./COUNTING_V2.md).

> Cập nhật: sau generation, giáo viên gán Dễ/Trung bình/Khó cho draft và xem các nhóm đúng của từng item. Đổi mức không gọi lại AI hoặc reset lượt. CLASSIFICATION v2 chấp nhận nhiều nhóm; xem [CLASSIFICATION_V2.md](./CLASSIFICATION_V2.md). Mức độ và draft chưa được lưu DB.

## Mở giao diện

Route: **http://localhost:3000/teacher/games/create**.

Đăng nhập bằng tài khoản có `GENERATE_GAME_CONTENT` (Admin/Teacher theo seed hiện có), sau đó chọn **Tạo trò chơi bằng AI** ở `/account`. Người chưa đăng nhập được đưa về `/login`; tài khoản thiếu permission thấy thông báo từ chối. Backend vẫn dùng JWT và permission guards, không dựa riêng vào kiểm tra giao diện.

Không sửa Login hoặc refresh token, không cấp READ_GAME_ASSETS/MANAGE_GAME_ASSETS cho Teacher. Link Library và trang Preview mẫu `/admin/game-preview` giữ chính sách cũ.

## Chạy local

Giữ PostgreSQL, MinIO và cấu hình Auth/S3 hiện có. Cấu hình Gemini key và internal token theo [GAME_GENERATION.md](./GAME_GENERATION.md); frontend chỉ cần `NEXT_PUBLIC_API_URL` trong `apps/web/.env.local`, không cần key mới.

Từ repository root, chạy các process còn thiếu trong terminal riêng:

```powershell
# AI Service: chỉ bind loopback, không gọi Gemini lúc khởi động
services/ai/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir services/ai --host 127.0.0.1 --port 8000 --reload --log-level info
```

```powershell
pnpm --filter api start:dev
```

```powershell
pnpm --filter web dev
```

Không chạy thêm server nếu đã có process chiếm cổng tương ứng. Không cần migration, seed hoặc dependencies mới cho Bước 6B.

## Luồng tạo và chơi thử

1. Chọn Đếm số lượng (COUNTING), Ghép cặp (MATCHING) hoặc Phân loại (CLASSIFICATION).
2. Nhập mô tả hoặc dùng gợi ý theo loại trò chơi. Prompt được trim và giới hạn 1–2000 ký tự, khớp Backend.
3. Bấm **Generate Game · Tạo trò chơi**. Lần bấm này chủ động gọi Gemini và có thể dùng quota thật nếu Backend đã cấu hình key.
4. Frontend POST `/api/v1/game-generation/generate`, nhận envelope `{success, data: {gameType, gameContent, generation}}`.
5. Kiểm tra response và GameContent bằng shared schema; nội dung sai hoặc khác GameType bị từ chối, không chuyển vào Runtime.
6. Truyền chính `gameContent` vừa nhận cho **GamePreview Bước 4C**, chạy **GameRuntime PREVIEW Bước 4B**. Không có engine/renderer mới.
7. GamePreview dùng reader có phạm vi để resolve URL, quản lý loading, thiếu ảnh, URL hết hạn, refresh và retry như trước.

Hai cột trên màn hình lớn, chuyển thành bố cục dọc trên màn hình nhỏ. GameType/prompt bị khóa trong lúc generate, nút submit cũng khóa; controller còn chặn request trùng ngay trong cùng một tick. Không tự động retry generation ở frontend hoặc tự tạo lại khi trang mount/đổi GameType. API và AI Service giữ retry giới hạn từ Bước 6A.

Sau khi có bản xem thử, nút chuyển thành **Regenerate · Tạo lại** và dùng GameType/prompt đang nhập. Bản cũ vẫn chơi được khi chờ. Thành công mới thay bản cũ và tăng revision để reset game ngay cả khi AI trả JSON giống hệt lần trước. Thất bại giữ nguyên nội dung, ảnh và tiến độ cũ, kèm lỗi dễ hiểu. Nếu đã sửa prompt/type, giao diện báo bản đang xem là kết quả trước.

Nút **↻ Chơi lại** nằm trong GameRuntime hiện có: reset tiến độ, phản hồi, completion và các tương tác trong bộ nhớ, không gọi generation. Phản hồi đúng/sai, completion, kéo thả pointer/touch và thao tác chọn-thả bằng bàn phím tiếp tục dùng implementation Bước 4B. Không thêm nút Reset thứ hai trùng chức năng.

Controller/gateway và draft tách khỏi form để có thể nối Save Draft/Publish sau này. Hiện draft, proof và URL chỉ ở memory, không localStorage/IndexedDB. Trang thông báo rõ draft có thể mất khi tải lại/rời trang. Unmount/hết quyền/hay đổi tài khoản hủy request chờ ở trình duyệt và bỏ response cũ; việc đóng kết nối không bảo đảm model đang chạy trên server cũng bị hủy. Token refresh không tự xóa prompt/draft hoặc tự gọi lại Gemini.

## API đọc ảnh giới hạn đã được cho phép

Theo xác nhận của bạn ở Bước 6B, Teacher được xem ảnh **chỉ thuộc trò chơi đã sinh**, không có quyền đọc toàn Library. Backend bổ sung tích hợp nhỏ:

```text
GenerationService validate content + whitelist + ACTIVE
  → Controller cấp generation.preview = { token, expiresAt }
  → Frontend giữ proof trong state của draft
  → POST /api/v1/game-generation/preview-assets/:id/read-url
      Authorization: Bearer <Auth access token>
      body: { previewToken: <proof của draft> }
  → JWT/permission guard + verify proof + userId + assetId whitelist
  → GameAssetService kiểm tra asset tồn tại và ACTIVE
  → StorageService trả presigned URL hiện có
```

Proof ký HMAC với key dẫn xuất riêng từ secret Auth, có `tokenUse`, audience riêng, gắn userId và danh sách assetId duy nhất (tối đa 40, đúng candidate limit). Hạn cấp URL là **1 giờ** từ lúc generation thành công. Không có secret mới cần điền; proof không dùng thay access token được. Không có endpoint để client tự xin proof cho JSON tùy ý. Không lưu proof hay danh sách scope xuống DB.

Read endpoint vẫn bắt buộc Auth access JWT đang hợp lệ và `GENERATE_GAME_CONTENT` hiện tại. Không thể dùng proof của người khác, giả mạo assetId, đọc ảnh ngoài scope hoặc dùng proof để upload/sửa metadata. Ảnh bị xóa/INACTIVE sau generation sẽ bị chặn. Rate limit đọc URL riêng 180 request/phút/IP, generation vẫn 4/phút/IP.

Reader giới hạn asset phía frontend, deduplicate request, cache URL trong memory và refresh trước khi hết hạn. Dùng lại parser URL của GameAsset client và resolver của Preview; giữ nguyên URL/hostname/chữ ký, không public bucket và không đưa credentials S3 vào Web. Khi proof hết hạn, API trả **410 / PREVIEW_ACCESS_EXPIRED**; Preview thông báo cần tạo lại. Proof hết hạn ngăn cấp URL mới; URL S3 đã cấp vẫn có thời hạn riêng của storage. Frontend không tự gọi Gemini để làm mới proof.

Chính sách Library không thay đổi: Teacher vẫn bị 403 ở GET `/game-assets`, GET `/game-assets/:id/url` và upload/PATCH nếu không có permission tương ứng. Không sửa seed hoặc role permissions.

## Kiểm thử thủ công

Chỉ bấm Generate thật khi bạn chủ động muốn dùng quota Gemini. Cần upload ảnh ACTIVE phù hợp bằng Admin trước:

- COUNTING: ảnh APPLE, prompt “Tạo trò chơi đếm 5 quả táo, cho trẻ chọn đáp án đúng.” Chọn sai rồi đúng; kiểm tra hoàn thành và Chơi lại.
- MATCHING: CAT/DOG và ảnh SHADOW tương ứng, có `animalType`, `matchKey`, `variant` nhất quán. Thử ghép sai rồi hoàn tất các cặp.
- CLASSIFICATION: BALL màu RED/BLUE với metadata color rõ ràng. Dùng gợi ý “6 quả bóng gồm 3 quả đỏ và 3 quả xanh dương vào hai nhóm”. Kéo sai, kéo đúng, hoặc chọn item rồi chọn nhóm; đủ 6/6 mới hoàn thành. Không cần sáu file ảnh, hai asset có thể tái sử dụng.
- Bấm Tạo lại, quan sát loading và giữ bản cũ. Dừng AI Service để thử lỗi kết nối; bản cũ phải giữ được. Không đổi cấu hình key thật chỉ để thử lỗi.
- Tài khoản Guardian/thiếu permission bị từ chối. Teacher tạo và chơi thử được nhưng không mở Library.
- Khi URL ảnh được làm mới, tiến độ không mất; ảnh thiếu thì game tạm dừng với thông báo. Không có ảnh giả thay thế ảnh Backend.

## Tests offline

```powershell
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api build
```

`web/tests/game-creation.test.mjs` kiểm tra permission, SSR form, ba GameType, input, actual API contract bằng mocked fetch, lỗi response, deadline, chống bấm trùng, giữ draft sau lỗi, regenerate cùng JSON, token refresh, stale response sau unmount, scoped reader, completion/reset trên Runtime có sẵn và Network chỉ generation/resolve ảnh. Các bộ test Runtime/Preview cũ tiếp tục kiểm tra tương tác, completion một lần và URL hết hạn.

Backend có test ký/verify proof thật nhưng mock DB/storage/AI, cùng HTTP tests Teacher đọc đúng scope, Library vẫn 403, proof người khác/giả mạo/hết hạn, asset missing/INACTIVE và body validation. Không có test gọi Gemini thật hoặc ghi PlaySession. Kiểm tra SSR/pure functions không thay thế kiểm tra kéo thả trên tablet thật; cần chạy kiểm thử thủ công bên trên khi có thiết bị.

Kết quả kiểm tra khi triển khai: **92 Web tests**, **121 API unit tests**, **52 HTTP/E2E tests** đạt; Web/API build, typecheck và lint đạt. Không chạy generation thật hoặc kiểm thử trình duyệt/tablet trực tiếp trong lần triển khai này.

## File tạo/sửa

- Tạo `apps/web/src/app/teacher/games/create/page.tsx` và `src/features/game-creation/{types,api,controller,game-creator}.ts(x)`.
- Thêm link trong `apps/web/src/app/account/page.tsx`.
- Export parser URL hiện có từ `features/game-assets/api.ts`; thêm thông báo scope expired trong `features/game-preview/asset-resolver.ts`. Không sửa GamePreview hoặc Runtime/Renderer.
- Tạo `apps/web/tests/game-creation.test.mjs`, cập nhật `apps/web/package.json` để chạy cùng test suite.
- Tạo `apps/api/src/modules/game-generation/game-preview-access.service.ts` và unit tests; cập nhật controller/module, `GameAssetService`, static ApiProblem và HTTP tests generation để hỗ trợ đọc ảnh scoped đã được xác nhận.
- Cập nhật tài liệu GAME_GENERATION, GAME_PREVIEW, SETUP và thêm tài liệu này.

Không đổi Prisma, migration, seed, Login/refresh flow, bucket policy, MinIO credentials hoặc FastAPI. Không có Save Draft/Publish/PlaySession/Assessment hay request lưu InteractionEvent.
