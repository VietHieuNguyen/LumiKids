# GameAsset Management UI

> Cập nhật trạng thái: mỗi thẻ có badge ACTIVE/INACTIVE và nút ngừng sử dụng/kích hoạt lại ngay trên danh sách. Hai nút lọc trạng thái nổi bật giữ nguyên các bộ lọc đã áp dụng và đưa về trang 1 khi chuyển. Thao tác dùng hộp xác nhận và API PATCH status hiện có, chặn gửi trùng; thành công tải lại danh sách và tổng số, tự điều chỉnh trang nếu trang cuối rỗng. Mở từ thẻ thì đóng về danh sách, mở từ chi tiết thì quay lại chi tiết mới nhất. INACTIVE giữ file/metadata, bị loại khỏi generation và không được cấp URL preview mới; không hứa tiếp tục chơi bằng ảnh inactive. Không thay quyền hoặc tự đổi dữ liệu của học liệu hiện có trong lần sửa UI.

## Truy cập và điều kiện chạy

Route thực tế: **http://localhost:3000/admin/game-assets**. Sau khi đăng nhập, tài khoản có đủ quyền sẽ thấy nút **Mở thư viện hình ảnh** tại `/account`.

Repository đã có đủ 6 API GameAsset của Bước 2, response envelope, pagination và presigned GET. Giao diện dùng các API đó, không có mock trong code production. Tuy nhiên, code Backend tồn tại không có nghĩa database/MinIO trên máy đã được cấu hình đầy đủ. Trước khi sử dụng:

1. PostgreSQL và MinIO đang chạy; bucket `lumikids-game-assets` private.
2. Các migration GameAsset đã được bạn review và tự áp dụng theo [GAME_ASSETS.md](./GAME_ASSETS.md#migration-và-khởi-động-trên-powershell).
3. Backend có application credentials S3 giới hạn bucket; endpoint ký URL truy cập được từ trình duyệt. Không dùng root credentials cho NestJS.
4. Tài khoản có cả `READ_GAME_ASSETS` và `MANAGE_GAME_ASSETS`. Migration Bước 2 cấp cả hai cho role Admin đã có; Teacher không được cấp quyền đọc hoặc quản lý GameAsset.
5. `apps/web/.env.local` hiện có `NEXT_PUBLIC_API_URL=http://localhost:4000`, giống giao diện đăng nhập. Không thêm secret vào NEXT_PUBLIC hoặc source Frontend.

Bước UI không chạy migration, seed, thay cấu hình thật hoặc thao tác dữ liệu PostgreSQL/MinIO. Không sửa Backend, Compose hoặc packages/shared. Nếu Backend báo 403, kiểm tra permission/migration; nếu 5xx, kiểm tra trạng thái Backend/storage theo tài liệu Bước 2. Không có API giả để che các cấu hình còn thiếu.

Từ repository root, mở hai terminal PowerShell:

```powershell
# Terminal 1: cần môi trường Backend đã cấu hình như Bước 2
pnpm --filter api start:dev
```

```powershell
# Terminal 2
pnpm --filter web dev
```

Hoặc `pnpm dev` tại root để chạy cả hai. Nếu đã chạy từng server thì dùng server hiện tại để tránh trùng cổng 3000/4000. Không cần cài thêm dependency cho UI.

## Cấu trúc Frontend và file thay đổi

| File/nhóm | Trách nhiệm |
|---|---|
| `apps/web/src/app/admin/game-assets/page.tsx` | Auth/permission gate, khởi tạo API client và hiển thị library |
| `apps/web/src/features/game-assets/types.ts` | Kiểu GameAsset, metadata, pagination, URL và editor |
| `features/game-assets/api.ts` | Gọi API, kiểm tra response, lỗi tiếng Việt, cache URL trong bộ nhớ |
| `features/game-assets/metadata.ts` | Validation, chuẩn hóa tags, FormData, filter và format |
| `components/asset-library.tsx` | Điều phối danh sách, modal, notification và phân trang |
| `components/asset-filters.tsx` | Form search/type/status/tags/page size |
| `components/asset-card.tsx` | Card thumbnail, tên, loại, status, tags |
| `components/asset-image.tsx` | Lấy/hiển thị/renew presigned URL và retry ảnh lỗi |
| `components/asset-form.tsx` | Upload hoặc sửa metadata; file preview và chặn submit trùng |
| `components/attribute-editor.tsx` | Bảng key-value và JSON nâng cao giữ dữ liệu có cấu trúc |
| `components/asset-detail.tsx` | Tải chi tiết mới nhất, ảnh, metadata, mã asset có thể copy |
| `components/asset-status-dialog.tsx` | Xác nhận và gọi PATCH ACTIVE/INACTIVE |
| `components/modal.tsx` | Native dialog với focus trap/Escape và nhãn accessible |
| `apps/web/src/components/auth-provider.tsx` | Thêm thao tác xóa session trong bộ nhớ khi người dùng chọn đăng nhập lại sau 401; giữ login/refresh/logout hiện có |
| `apps/web/src/app/account/page.tsx` | Link mở thư viện theo permission |
| `apps/web/src/app/globals.css` | Styles các component quản trị, focus, backdrop, responsive |
| `apps/web/tests/game-assets.test.mjs` | Tests dùng Node built-in, mock fetch, không kết nối hệ thống thật |
| `apps/web/package.json` | Thêm script `test:game-assets`, không thêm package |
| `docs/GAME_ASSETS_UI.md`, `docs/SETUP.md` | Hướng dẫn và trạng thái UI |

Các đường dẫn `features/` và `components/` trong bảng thuộc `apps/web/src/features/game-assets/`. `packages/shared` hiện chỉ export module rỗng nên chưa có type/schema GameAsset để tái sử dụng; UI định nghĩa kiểu khớp DTO/response Backend và kiểm tra response lúc nhận. Không import Prisma/generated code vào browser.

## API đã tích hợp

Tất cả request gửi vào `NEXT_PUBLIC_API_URL`, kèm Bearer access token trong bộ nhớ AuthProvider, `credentials: include` và `cache: no-store`.

| API thực tế | Từ giao diện |
|---|---|
| `POST /api/v1/game-assets` | Upload Asset |
| `GET /api/v1/game-assets` | Grid, search/filter, pagination |
| `GET /api/v1/game-assets/:id` | Xem chi tiết, tải lại chi tiết sau cập nhật |
| `PATCH /api/v1/game-assets/:id` | Lưu metadata |
| `PATCH /api/v1/game-assets/:id/status` | Xác nhận ngừng sử dụng/kích hoạt lại |
| `GET /api/v1/game-assets/:id/url` | Thumbnail và ảnh chi tiết |

Giao diện đọc `data.items` và `data.pagination` từ envelope thật của Backend. Không tải toàn bộ library để lọc/phân trang trên browser. Bộ lọc được áp dụng khi bấm **Áp dụng bộ lọc** hoặc Enter: tránh phát request cho từng ký tự, không cần debounce. Thay filter/page size đưa về trang 1; tags phân cách bằng dấu phẩy, normalize lowercase, Backend yêu cầu khớp tất cả tags. objectType có gợi ý BALL/ANIMAL/FRUIT/BASKET/SHAPE và cho phép mã hợp lệ khác. Mỗi trang 12/20/40 ảnh, mặc định 20. Request danh sách cũ được abort khi đổi filter hoặc rời trang; response cũ không ghi đè kết quả mới. Có loading skeleton, empty/error state, retry và success notification.

## Luồng upload và metadata

```text
Chọn File + metadata
  → kiểm tra MIME/5 MiB/metadata trên UI + preview blob URL
  → FormData (file, name, objectType, tags JSON, attributes JSON)
  → NestJS: xác thực/quyền + kiểm tra định dạng thật + upload MinIO
  → PostgreSQL lưu metadata
  → UI nhận assetId, đóng form, reset bộ lọc ACTIVE/trang 1 và tải lại library
```

Không tự đặt multipart Content-Type: browser tạo boundary. Không upload trực tiếp từ browser lên MinIO. UI kiểm tra loại file để hỗ trợ người dùng; Backend vẫn quyết định định dạng từ nội dung file. File preview được revoke bằng `URL.revokeObjectURL` khi đổi file/unmount. Ảnh không decode được có thông báo để chọn lại.

UI dùng giới hạn mặc định Bước 2 là **5 MiB = 5 × 1024 × 1024 bytes**. Nếu người vận hành đổi `GAME_ASSET_MAX_SIZE_BYTES` phía Backend, cần đồng bộ `MAX_FILE_BYTES` và nhãn trong form; hiện Backend chưa có API công bố giới hạn này. Backend trả 413 khi giới hạn thực tế khác/nhỏ hơn.

Attributes mặc định là bảng key-value chuỗi, có thêm/xóa dòng, kiểm tra key rỗng/trùng/tên dành riêng/độ dài. Chế độ JSON nâng cao cho number, boolean, array hoặc object; asset đã có metadata không phải chuỗi sẽ mở ở chế độ JSON để giữ nguyên kiểu dữ liệu. Không chuyển về bảng nếu làm mất cấu trúc. Tối đa 16 KiB và giới hạn độ sâu phù hợp Bước 2. Khi PATCH, attributes là toàn bộ object mới, không deep merge.

Form edit chỉ gửi name/objectType/tags/attributes. Không có input thay file/id/objectKey/file info/createdAt. Submit dùng cờ in-flight và disabled state để chặn click trùng; không tự retry mutation khi mạng lỗi. Khi thất bại thường, dữ liệu form và file chọn được giữ để thử lại. Lỗi 401/403 chặn tiếp thao tác quản trị và yêu cầu xử lý phiên/quyền trước khi tiếp tục.

Sau upload, UI về ACTIVE/trang 1 không có bộ lọc để asset mới có thể xuất hiện và được đánh dấu. Sau sửa metadata hoặc status, UI refresh cả list và detail; asset có thể rời kết quả list nếu không còn khớp filter. Đổi INACTIVE luôn có xác nhận, có thể hủy; không hard delete và không thay file. Có xác nhận cả khi kích hoạt lại.

## Ảnh private và Auth

`AssetImage` gọi API `/url`, dùng nguyên URL trả về trong native `<img>`. Không dùng Next Image Optimization để tránh proxy/cache hoặc cấu hình remote host với presigned URL. Không sửa host/path/query đã ký; không lưu URL vào database/localStorage/sessionStorage. `<img>` đặt `referrerPolicy=no-referrer`.

API client chia sẻ request ký đang chạy giữa thumbnail/detail và cache URL trong bộ nhớ, giới hạn 200 mục mỗi instance. Khi URL còn dưới 30 giây thì xin lại; component đang mở có timer renew và kiểm tra lại khi tab được hiển thị. Nếu tải ảnh lỗi, thử xin URL mới một lần, sau đó hiển thị nút **Tải lại ảnh** thay vì lặp vô hạn. Lỗi ký URL/MinIO không khả dụng có trạng thái riêng. URL quá hạn trong response bị từ chối. Secret S3 không được đưa sang Next.js; URL SigV4 vốn có access-key identifier/signature nhưng không chứa secret key.

UI chỉ mở cho tài khoản có **cả** MANAGE_GAME_ASSETS và READ_GAME_ASSETS, không mặc định cấp quyền chỉ vì role tên ADMIN. Khi chưa đăng nhập, chờ Auth restore rồi chuyển `/login`; khi thiếu quyền, hiện màn hình bị từ chối và link `/account`. Khi API trả 401, nút **Đăng nhập lại** xóa session trong bộ nhớ và dùng trang Login hiện có. 403 hiển thị thông báo thiếu quyền, không tự nâng quyền hay mở bucket. Auth refresh cookie HttpOnly và cơ chế giữ access token trong bộ nhớ vẫn như trước.

Permission gate Frontend phục vụ UX; Backend JWT/Permissions Guard vẫn xác thực từng request. URL đã phát hành có thể còn hoạt động đến hết TTL kể cả khi asset chuyển INACTIVE hoặc permission thay đổi; đây là tính chất của presigned URL. Cần môi trường HTTPS/DNS nhất quán để tránh mixed content. Khi dùng browser trên máy khác, localhost trong S3_PUBLIC_ENDPOINT không trỏ về máy server: cấu hình endpoint đúng tại Backend trước khi thử.

## Kiểm thử tự động

Frontend chưa có React component/browser test framework. Bổ sung test nhẹ bằng **Node built-in test runner** (Node >=22.12 theo repository), không cài framework mới:

```powershell
pnpm --filter web test:game-assets
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

Tests kiểm tra validation/file limit, tags/attributes, giữ metadata có cấu trúc, serialization FormData, filter/page, API list/detail/upload/PATCH/status, lỗi 401/403 và các lỗi khác, response validation, URL cache/single-flight/renew/expiry. Fetch được mock trong tests, không login/upload/PATCH vào Backend thật. Tests này không mount React component và không thay thế kiểm thử tương tác trên trình duyệt.

Kết quả triển khai: 29 tests đạt; lint, typecheck và production build đạt. Smoke check GET `/admin/game-assets` trên Next.js production server tạm trả HTTP 200 và trạng thái chờ kiểm tra đăng nhập, không có metadata asset trong HTML chưa xác thực. Server tạm ở cổng 3101 đã được dừng và giải phóng cổng sau kiểm tra; không khởi động Backend hoặc ghi dữ liệu thật.

## Checklist kiểm thử thủ công

Dùng tài khoản và asset test. Các bước upload/PATCH dưới đây **ghi dữ liệu thật khi bạn tự thực hiện**; agent chưa chạy chúng.

1. **Auth:** đăng nhập Admin, bấm link thư viện ở `/account`. Mở route trực tiếp khi chưa đăng nhập để kiểm tra redirect. Đăng nhập Teacher/Guardian: không thấy link quản trị; nhập route trực tiếp phải bị từ chối. Backend cũng phải từ chối thao tác không có permission.
2. **Upload validation:** thử thiếu file, file SVG/text, ảnh >5 MiB, tên trống, key thuộc tính rỗng/trùng. Không gửi POST khi validation không đạt. Chọn PNG/JPEG/WebP hợp lệ, kiểm tra preview/tên/dung lượng; đổi file và mở/đóng form nhiều lần.
3. **Upload thành công:** điền name/type/tags và color=RED, bấm upload liên tiếp: chỉ một POST. Thành công đóng form, có thông báo, về ACTIVE/trang 1 và thấy card mới. Không cần Console/Postman cho thao tác thường ngày.
4. **Upload thất bại:** mô phỏng mất mạng bằng DevTools cho request test; có lỗi dễ hiểu, bật lại mạng thấy dữ liệu form/file vẫn còn. Không dừng/xóa bucket hoặc làm hỏng DB chỉ để tạo failure.
5. **Tìm kiếm/lọc:** nhập một phần tên rồi Enter/Áp dụng; thử objectType, status và tags phân cách phẩy, kết hợp filter. Kiểm tra query trong Network dùng pagination Backend. Đổi filter khi đang ở trang 2 phải về trang 1. Thử kết quả trống, nút Đặt lại và Xóa bộ lọc.
6. **Pagination:** tạo đủ asset test nếu cần; chuyển Trước/Sau, đổi page size. Không tải toàn library; disabled ở trang đầu/cuối. Thử đổi filter nhanh, chỉ kết quả của request mới nhất được hiển thị.
7. **Chi tiết:** bấm Xem chi tiết, kiểm tra ảnh/name/type/tags/attributes/MIME/dung lượng/status/ngày/mã asset. Thử copy mã; nếu Clipboard API không được phép, có thể chọn mã để copy thủ công.
8. **Edit:** sửa name/tags/attributes rồi lưu; kiểm tra list/detail cập nhật và assetId giữ nguyên. Metadata dạng nested/number vẫn giữ đúng kiểu khi sửa tên. Không có cách thay file hoặc objectKey.
9. **Status:** chọn Ngừng sử dụng; hủy xác nhận phải không gửi PATCH. Xác nhận gửi INACTIVE, asset biến mất khỏi list ACTIVE và xuất hiện khi lọc INACTIVE. File không bị xóa; thử kích hoạt lại. Các link ảnh đã phát hành có thể còn hiệu lực đến TTL.
10. **Ảnh private:** DevTools thấy GET `/game-assets/:id/url` rồi tải URL nguyên vẹn. Không có credentials S3 trong frontend env hoặc POST upload thẳng MinIO. Giữ trang mở quá TTL để kiểm tra renew; thử lỗi ảnh và nút Tải lại ảnh. Kiểm tra HTTP/HTTPS/hostname phù hợp nếu không load được ảnh.
11. **Lỗi quyền/phiên:** khi API trả 401 phải hiện yêu cầu đăng nhập lại; khi 403 phải khóa thao tác và thông báo thiếu quyền. Các nhánh HTTP đã được mock-test, không cần sửa DB thật để tạo lỗi.
12. **Accessibility/responsive:** Tab qua bộ lọc/cards/modal, Escape đóng dialog khi không submit, focus nằm trong dialog; nút có nhãn. Thử desktop, tablet 768px và màn hình nhỏ 375px; không tràn ngang, metadata dài vẫn xuống dòng.

## Giới hạn kiểm chứng

Không chạy login, upload, PATCH hoặc migration với PostgreSQL/MinIO thật trong bước UI. Migration GameAsset đã áp dụng và kiểm tra hai quyền asset chỉ thuộc ROLE_ADMIN theo yêu cầu tiếp theo. Application credentials vẫn cần cấu hình đúng. Chưa chạy kiểm thử tương tác hoặc screenshot trên browser với tài khoản thật; layout responsive, modal/focus, Clipboard và vòng renew URL dài hạn cần xác nhận theo checklist trên. UI không có AI, GameContent, Game Engine, PlaySession, upload trực tiếp S3, hard delete hoặc thay file.
