# GameAsset Backend

> Quy tắc metadata generation hiện tại và hướng dẫn copy sang ChatGPT Web: [ASSET_METADATA.md](./ASSET_METADATA.md). Bao gồm ảnh bóng, cặp trưởng thành–con non, phong cách và bộ học liệu.

## Phạm vi và kiến trúc

Module lưu ảnh dùng chung cho COUNTING, MATCHING, CLASSIFICATION và các loại game sau này. Không gắn asset vào GameType, không có GameContent/AI/ActivityVersion/PlaySession/UI upload trong bước này. MinIO giữ private.

Luồng upload:

```text
JWT Guard → Permissions Guard → FileInterceptor (memory, limits)
  → GameAssetController → Zod metadata validation → GameAssetService
  → kiểm tra magic numbers → UUID objectKey
  → StorageService: HeadBucket + PutObject
  → GameAssetRepository: Prisma create
  → response envelope
```

Controller định tuyến và nhận multipart; Service kiểm tra quyền/nghiệp vụ và điều phối; Repository chỉ truy vấn bảng GameAsset. StorageService dùng AWS S3 SDK v3, không biết GameType hay Prisma. Không truy vấn trực tiếp bảng của Users Module; `createdBy` lấy từ principal đã được Auth xác thực, FK liên kết `User.userId`.

PostgreSQL và S3 không chung transaction. Nếu PUT thành công nhưng insert metadata lỗi, Service gọi DeleteObject đúng key vừa tạo. Nếu cleanup lỗi, log key để vận hành đối soát, trả 503 đã ẩn chi tiết lỗi. Crash giữa PUT và insert hoặc timeout với kết quả không xác định vẫn có thể cần đối soát thủ công; chưa có job thu gom orphan. Không chạy cleanup hàng loạt.

## Model và index

`GameAsset`: UUID `id`, name, unique objectKey, originalFileName, detected mimeType, actual sizeBytes, objectType, tags, JSONB attributes, ACTIVE/INACTIVE, nullable createdBy, createdAt/updatedAt.

- UUID sinh objectKey `game-assets/<uuid>.png|jpg|webp`; không lấy key từ tên file. PUT dùng `If-None-Match: *` để tránh ghi đè. Không có API đổi file/objectKey.
- `objectType` là mã mở rộng, tối đa 40 ký tự, uppercase/digit/underscore: BALL, ANIMAL, FRUIT, BASKET, SHAPE... Không cần migration mỗi khi thêm loại.
- tags tối đa 30 mục, mỗi mục 50 ký tự, trim/lowercase/deduplicate; lọc phải khớp **tất cả** tags yêu cầu.
- attributes là JSON object tối đa 16 KiB, độ sâu tối đa 5, tối đa 100 phần tử mỗi object/array; từ chối prototype keys. PATCH attributes thay **toàn bộ object**, không deep merge. Muốn xóa metadata dùng `{}` hoặc `[]` cho tags.
- Unique objectKey bảo vệ key; index `(status, objectType, createdAt, id)` phục vụ chọn asset theo trạng thái/loại; GIN tags phục vụ `hasEvery`; index createdBy phục vụ FK. Không tạo B-tree name cho tìm kiếm substring. Chưa thêm index JSON tổng quát khi chưa có số liệu truy vấn.
- Danh sách dùng pagination có giới hạn và thứ tự createdAt/id ổn định; count/items đọc trong cùng snapshot RepeatableRead. Offset pagination có thể dịch trang giữa hai request khi có upload mới.
- Không lưu URL ký vào DB. Deactivate chỉ đổi trạng thái. FK `ON DELETE SET NULL` giữ asset khi tài khoản người upload bị xóa; module này không cung cấp xóa tài khoản.

## Quyền truy cập

| Thao tác | Quyền | Cấp mặc định sau migration |
|---|---|---|
| Upload, PATCH metadata/status | MANAGE_GAME_ASSETS | ROLE_ADMIN |
| List/detail/presigned GET ACTIVE | READ_GAME_ASSETS | ROLE_ADMIN |
| List/detail/URL INACTIVE để quản trị | READ_GAME_ASSETS + MANAGE_GAME_ASSETS | ROLE_ADMIN |

ROLE_TEACHER và ROLE_GUARDIAN không được cấp quyền asset theo yêu cầu chỉ dành cho Admin. Không suy ra quyền từ tên role, không dùng MANAGE_USERS thay quyền asset. JWT Guard vẫn đọc quyền hiện tại trong DB mỗi request; chưa có permission thì 403 cho đến khi migration được áp dụng. Migration chỉ cấp thêm quyền cho role đã có, không tạo user/password mới. Dev seed đã được cập nhật cho các lần seed được cho phép trong tương lai; **không cần chạy lại seed tài khoản** để nhận quyền.

Reader gặp asset INACTIVE nhận 409; manager vẫn được xem phục vụ quản trị. URL đã cấp còn hiệu lực đến hết TTL kể cả khi asset chuyển INACTIVE. File không bị xóa nên không phá nội dung game đã publish. Khi có PlaySession, cần bổ sung policy xác thực phiên chơi và asset được tham chiếu trong phiên đó; không mở endpoint anonymous hoặc cấp quyền quản lý cho trẻ. Logic hiện tại chưa cung cấp quyền đọc cho PlaySession chưa tồn tại.

## Application credentials MinIO

Compose thực tế dùng `cgr.dev/chainguard/minio:latest`; bước này **không đổi infrastructure**. Không giả định image có shell hoặc `mc`. Dùng MinIO Client `mc.exe` độc lập trên Windows (đặt trong PATH), hoặc tính năng Users/Access Keys của Console nếu bản đang chạy có hỗ trợ. Xem [MinIO Client policy](https://min.io/docs/minio/linux/reference/minio-mc-admin/mc-admin-policy.html) và [service account CLI](https://github.com/minio/mc/blob/master/cmd/admin-user-svcacct-add.go).

Đã chuẩn bị policy [game-assets-policy.json](../infra/minio/game-assets-policy.json):

- `s3:ListBucket` chỉ trên bucket `lumikids-game-assets` để HeadBucket kiểm tra sẵn sàng.
- `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` chỉ trên `lumikids-game-assets/game-assets/*`.
- Không có CreateBucket/DeleteBucket, ListAllMyBuckets, IAM admin hoặc public-policy permission. DeleteObject chỉ phục vụ cleanup nội bộ.

Chạy các lệnh dưới đây **thủ công** từ repository root nếu bạn chọn dedicated application user. Các lệnh này thay đổi IAM trong MinIO, chưa được agent thực thi. Điền secret khi được prompt, không dùng root cho application user:

```powershell
$rootUser = Read-Host 'MinIO root username (Console)'
$rootSecure = Read-Host 'MinIO root password' -AsSecureString
$rootPassword = [Net.NetworkCredential]::new('', $rootSecure).Password
$env:MC_HOST_lumikids = 'http://' + [Uri]::EscapeDataString($rootUser) + ':' + [Uri]::EscapeDataString($rootPassword) + '@localhost:9000'
try {
  mc admin policy create lumikids lumikids-game-assets-api infra/minio/game-assets-policy.json
  if ($LASTEXITCODE -ne 0) { throw 'Policy creation failed' }
  $appUser = Read-Host 'New dedicated application username/access key'
  $appSecure = Read-Host 'New dedicated application password/secret key' -AsSecureString
  $appPassword = [Net.NetworkCredential]::new('', $appSecure).Password
  mc admin user add lumikids $appUser $appPassword
  if ($LASTEXITCODE -ne 0) { throw 'Application user creation failed' }
  mc admin policy attach lumikids lumikids-game-assets-api --user $appUser
  if ($LASTEXITCODE -ne 0) { throw 'Policy attachment failed' }
  mc anonymous get lumikids/lumikids-game-assets
} finally {
  Remove-Item Env:MC_HOST_lumikids -ErrorAction SilentlyContinue
  $rootPassword = $null
  $appPassword = $null
}
```

Chọn username application mới, không chạy `user add` đè lên tài khoản đang có. Dùng `$appUser` làm S3_ACCESS_KEY và mật khẩu application vừa nhập làm S3_SECRET_KEY trong file local. Đây là credentials của dedicated application user, không phải root. Nếu muốn key có lifecycle riêng, tạo service account dưới user này qua `mc admin user svcacct add lumikids <application-user> --policy infra/minio/game-assets-policy.json` rồi điền cặp key kết quả vào Backend; parent user chỉ có policy giới hạn ở trên. Không lưu output sinh key vào repository hoặc Postman.

Kết quả `mc anonymous get` phải là private. Nếu bucket hiện public, tự gỡ policy bằng `mc anonymous set none lumikids/lumikids-game-assets` trước khi kiểm thử. Code Backend không thay bucket policy, không tạo bucket, không dùng root credentials. Việc bạn upload ảnh thử bằng Console không tự tạo metadata GameAsset; hãy upload lại qua API để có assetId.

## Environment Backend

Điền vào **apps/api/.env.development** đang có; chỉ bổ sung biến thiếu, không copy đè toàn bộ file. File này bị Git ignore. `infra/.env` chỉ dành cho Compose và không tự được NestJS đọc.

```dotenv
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=lumikids-game-assets
S3_ACCESS_KEY=<application-access-key>
S3_SECRET_KEY=<application-secret-key>
S3_FORCE_PATH_STYLE=true
S3_READ_URL_TTL_SECONDS=900
GAME_ASSET_MAX_SIZE_BYTES=5242880
```

`S3_ENDPOINT` là endpoint NestJS truy cập được. `S3_PUBLIC_ENDPOINT` là endpoint **trình duyệt** truy cập được, vẫn trỏ vào S3 API port 9000, không phải Console 9001. Biến này chỉ mô tả địa chỉ ký URL, không làm bucket public. Có thể bỏ biến này khi hai endpoint giống nhau; nếu đặt thì không được để chuỗi rỗng. Nest trong Docker có thể dùng `http://minio:9000` nội bộ và `http://localhost:9000` cho trình duyệt chạy trên chính máy Windows. Trình duyệt trên máy khác phải dùng DNS/host có thể truy cập và routing/TLS tương ứng.

Hai S3Client dùng cùng bucket/region/credentials, endpoint riêng cho thao tác và ký URL; không thay hostname sau khi ký. URL có signature/access key identifier theo SigV4, **không chứa secret key**. URL là bearer link, không log/chia sẻ tùy tiện; TTL mặc định 900 giây, cấu hình 60–3600 giây. MinIO vẫn private; AWS mô tả [presigned GET](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) như quyền đọc có thời hạn mà không cần mở bucket policy.

Config namespaced `storage` được validate bằng Zod lúc start, không đọc process.env trong service/controller. Thiếu S3 config làm Backend fail startup với thông báo đã ẩn values; Auth code không đổi. Không copy credentials MinIO root sang Backend. S3 SDK chỉ dùng credentials đã cấu hình, không fallback ngầm sang AWS profile.

## Migration và khởi động trên PowerShell

Hai migration đã áp dụng thành công sau yêu cầu cấp quyền chỉ cho Admin:

1. `20261110000100_add_asset_permissions`: thêm 2 enum PermissionCode. Tách riêng để enum được commit trước khi dùng trong insert PostgreSQL.
2. `20261110000200_create_game_asset`: transaction tạo enum status, bảng/index/FK/check constraints và cấp thêm quyền vào role Admin hiện có. Không sửa migration Auth cũ, không thay tài khoản/password và không đụng object MinIO.

Sau khi review SQL và quyết định áp dụng, bạn tự chạy từ repository root (PostgreSQL/MinIO phải sẵn sàng, environment đã điền):

```powershell
pnpm install --frozen-lockfile
pnpm --filter api prisma:validate
pnpm --filter api prisma:status
# Writes the pending schema and permission grants; execute only after review.
pnpm --filter api prisma:migrate:deploy
pnpm --filter api prisma:generate
pnpm --filter api start:dev
```

Không dùng migrate reset, db push hoặc chỉnh sửa các migration đã apply. Không cần shadow database. Generate/validate chỉ tạo client/kiểm tra schema, không ghi database. Backend không tự migrate, không tự seed IAM/bucket/asset ở startup. Storage kiểm tra bucket khi upload và kiểm tra object khi lấy URL, không bắt Auth phụ thuộc vào network MinIO lúc khởi động.

## API và ví dụ Postman

Import [LumiKids-GameAssets.postman_collection.json](./postman/LumiKids-GameAssets.postman_collection.json). Đặt `baseUrl=http://localhost:4000/api/v1`, email/password Admin và dùng request Login để lưu accessToken. Collection không có mật khẩu hoặc token thật. Login cần `X-CSRF-Protection: 1`; GameAsset dùng Bearer accessToken. Frontend CORS đã cho phép PATCH.

Tất cả API dùng response envelope hiện có:

```json
{"success":true,"code":"OK","message":"Request successful.","data":{}}
```

### 1. POST /api/v1/game-assets — upload

Authorization Bearer Admin; Body **form-data**, không tự đặt Content-Type boundary:

| Key | Type | Value ví dụ |
|---|---|---|
| file | File | chọn PNG/JPEG/WebP local |
| name | Text | Quả bóng màu đỏ |
| objectType | Text | BALL |
| tags | Text | `["ball","red","circle","toy"]` |
| attributes | Text | `{"color":"RED","shape":"CIRCLE"}` |

tags/attributes được gửi dưới dạng chuỗi JSON trong multipart; bỏ qua thì mặc định `[]`/`{}`. File bắt buộc, mặc định tối đa 5 MiB (5 × 1024 × 1024 bytes). Nhận đúng 1 file, tối đa 4 text fields. Magic numbers xác định PNG/JPEG/WebP thay vì tin MIME/extension; MIME và size lưu theo buffer thực. Đây là kiểm tra định dạng bằng chữ ký file, chưa có giải mã toàn ảnh, antivirus hoặc loại EXIF.

HTTP 201, ví dụ phần `data`:

```json
{
  "id":"61aa17ec-2380-4f39-9229-045322b692d7",
  "name":"Quả bóng màu đỏ",
  "objectKey":"game-assets/61aa17ec-2380-4f39-9229-045322b692d7.png",
  "originalFileName":"ball.png",
  "mimeType":"image/png",
  "sizeBytes":12345,
  "objectType":"BALL",
  "tags":["ball","red","circle","toy"],
  "attributes":{"color":"RED","shape":"CIRCLE"},
  "status":"ACTIVE",
  "createdBy":"f49baa68-d624-4cc3-a501-8e922d970732",
  "createdAt":"2026-11-10T00:00:00.000Z",
  "updatedAt":"2026-11-10T00:00:00.000Z"
}
```

Collection tự lưu `assetId`. Trong Console kiểm tra đúng objectKey dưới `game-assets/`; object thử đã upload trước đó được giữ nguyên. Trong Prisma Studio (`pnpm --filter api exec prisma studio`) xem bảng GameAsset hoặc chạy SELECT read-only theo id bằng PostgreSQL client để đối chiếu id, key, creator, size, mime. Không chỉnh trực tiếp file/metadata của asset đang dùng.

### 2. GET /api/v1/game-assets — danh sách

Postman Params: `page=1`, `pageSize=20`, `search=bóng`, `objectType=BALL`, `tags=["red"]`, `status=ACTIVE`, `attributes={"color":"RED"}`. Để Postman URL-encode JSON; các filter ngoài page/pageSize/status đều optional. pageSize tối đa 100, page tối đa 10000; mặc định chỉ ACTIVE. Không hỗ trợ status=ALL; manager có thể query INACTIVE riêng.

HTTP 200, data ví dụ:

```json
{"items":[{"id":"61aa17ec-2380-4f39-9229-045322b692d7","name":"Quả bóng màu đỏ","status":"ACTIVE"}],"pagination":{"page":1,"pageSize":20,"total":1,"totalPages":1}}
```

Mỗi item thực tế có đầy đủ metadata như response upload; ví dụ trên rút gọn. Trang trống có items `[]`, totalPages `0` nếu tổng = 0. Tìm ANIMAL có habitat WATER bằng objectType=ANIMAL và attributes `{"habitat":"WATER"}`; BASKET màu BLUE tương tự; FRUIT chỉ cần objectType.

### 3. GET /api/v1/game-assets/{{assetId}} — chi tiết

Bearer tài khoản có READ_GAME_ASSETS (hiện chỉ cấp cho Admin). HTTP 200, data là metadata đầy đủ như upload. UUID sai → 400; UUID đúng nhưng không tồn tại → 404. Tài khoản có quyền đọc nhưng không có quyền quản lý gặp INACTIVE → 409; Admin có đủ 2 quyền vẫn xem được.

### 4. PATCH /api/v1/game-assets/{{assetId}} — metadata

Bearer Admin, Body raw JSON:

```json
{"name":"Quả bóng xanh","tags":["ball","blue"],"attributes":{"color":"BLUE","shape":"CIRCLE"}}
```

HTTP 200 trả metadata mới, id/objectKey/mimeType/sizeBytes/createdAt giữ nguyên. Có thể PATCH riêng objectType. Không chấp nhận body rỗng, null field, id, objectKey, file info, status hoặc createdBy. Không upload/ghi đè/xóa file ở bước này.

### 5. PATCH /api/v1/game-assets/{{assetId}}/status

Bearer Admin, raw JSON `{"status":"INACTIVE"}` hoặc `{"status":"ACTIVE"}`. HTTP 200 trả metadata với status mới; không delete object. Kiểm thử INACTIVE: asset không xuất hiện trong list ACTIVE, Teacher lấy URL bị 403 vì không có quyền asset, Admin vẫn xem được, object vẫn tồn tại trong MinIO. Sau đó có thể kích hoạt lại bằng ACTIVE.

### 6. GET /api/v1/game-assets/{{assetId}}/url

Bearer Admin cho asset ACTIVE. HTTP 200, data:

```json
{"url":"http://localhost:9000/lumikids-game-assets/game-assets/<uuid>.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&...","expiresIn":900,"expiresAt":"2026-11-10T00:15:00.000Z"}
```

Mở nguyên URL trả về trong trình duyệt (không đổi host, port, path, query); ảnh phải hiển thị. Gửi GET vào object URL bỏ toàn bộ signature phải bị từ chối (thường 403). Chờ hết TTL rồi thử link cũ để kiểm tra hết hạn. Trình duyệt `<img>` không cần CORS S3; nếu sau này dùng fetch/canvas đọc pixel từ origin khác, cần cấu hình CORS bucket riêng, chưa thực hiện ở bước này.

### Lỗi và kiểm thử âm

| Trường hợp | HTTP / code |
|---|---|
| Không token/token hết hạn | 401 / UNAUTHORIZED |
| Không có permission; Teacher gọi bất kỳ API GameAsset nào | 403 / FORBIDDEN |
| Thiếu file, fake PNG/SVG, sai JSON, extra/immutable field, invalid UUID/query | 400 / BAD_REQUEST |
| File quá giới hạn | 413 / PAYLOAD_TOO_LARGE |
| Asset không tồn tại | 404 / NOT_FOUND |
| Reader truy cập asset INACTIVE | 409 / CONFLICT |
| Storage/bucket/object không khả dụng, upload/sign/DB insert thất bại | 503 / SERVICE_UNAVAILABLE |
| Lỗi DB ngoài dự kiến ở thao tác đọc/cập nhật | 500 / INTERNAL_SERVER_ERROR |

Lỗi 5xx dùng message chung theo exception filter, không trả stack/credentials/driver details. Thành công/thất bại đều `Cache-Control: no-store`. Không cần làm hỏng DB hoặc xóa bucket thật để kiểm thử failure: unit tests đã mock các nhánh này. Muốn chạy integration có ghi dữ liệu thật hoặc giả lập lỗi hạ tầng, cần kế hoạch và sự đồng ý riêng; chưa thực thi.

## Tìm kiếm JSON PostgreSQL: khả năng và giới hạn

V1 hỗ trợ equality trên tối đa 10 key **top-level** với value string/number/boolean; AND với objectType/tags/status/search. Prisma JSON path được parameterize, không ghép SQL từ input. So sánh string phân biệt hoa thường: RED khác red, WATER khác Water; nhóm phải thống nhất vocabulary khi khai báo asset. Nested JSON có thể lưu nhưng query API hiện chưa hỗ trợ deep path, array traversal, range hoặc synonym. Chưa có embedding/vector/nhận diện ảnh.

Thêm GIN attributes đại trà không đảm bảo tăng tốc `path + equals`; khi đủ dữ liệu/truy vấn thực tế, dùng EXPLAIN ANALYZE để chọn expression index cho key hay dùng như color/habitat, hoặc chuyển đặc điểm quan trọng thành cột. `contains` name chưa có trigram index nên có thể scan khi dữ liệu lớn. Không cam kết semantic search tự động từ metadata chưa được nhóm khai báo.

## Kiểm tra và trạng thái triển khai

```powershell
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api build
```

Các test GameAsset dùng mock Prisma/S3, HTTP tests dùng Auth guards thật và JWT fixture; không mở kết nối DB/MinIO. Tài khoản thật, application credentials, migration deploy, IAM policy, bucket private và upload/URL trình duyệt trên MinIO Chainguard cần người vận hành kiểm chứng thủ công theo hướng dẫn trên. Migration và quyền Admin đã áp dụng theo yêu cầu tiếp theo; chưa upload hoặc thay đổi dữ liệu asset thật.

## File thay đổi trong bước này

- `apps/api/prisma/schema.prisma`; 2 migration mới ở trên.
- `apps/api/src/modules/game-assets/`: module, controller, service, repository, DTO schemas/validation pipe và unit tests.
- `apps/api/src/common/storage/`: StorageModule/StorageService và tests.
- `apps/api/src/common/config/storage.config.ts` và test; `apps/api/.env.example`.
- `apps/api/src/app.module.ts`: import GameAssetModule.
- `apps/api/src/common/security/ability.ts`: ánh xạ hai permission mới sang GameAsset.
- `apps/api/src/common/http/configure-http.ts`: CORS PATCH; `api-response.ts`: code 413/503.
- `apps/api/src/modules/auth/seed-development.ts`: grants cho những lần seed sau, không chạy lại seed.
- `apps/api/test/`: fixtures/GameAsset HTTP tests; Auth/App HTTP tests bổ sung cấu hình S3 fixture.
- `apps/api/package.json`, `pnpm-lock.yaml`: SDK client-s3 và s3-request-presigner ghim version.
- `infra/minio/game-assets-policy.json`: policy mẫu, chưa apply.
- `docs/GAME_ASSETS.md`, `docs/MINIO.md`, `docs/SETUP.md`, Postman collection.

Không sửa Compose, không thêm environment thật, không thay secrets/root credentials và không thay frontend/shared packages.
