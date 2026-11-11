# Chạy bộ khung LumiKids

Tài liệu này mô tả phần đã khởi tạo. `Readme.md` và `STRUCTURE.md` giữ nguyên định hướng dài hạn. Prisma được cấu hình theo [PRISMA.md](./PRISMA.md); Auth đã có code và migration đã áp dụng vào database development sau xác nhận theo [AUTH.md](./AUTH.md). AI chưa triển khai.

## Môi trường

- Node.js >= 22.12.0.
- pnpm 10.34.9 (được ghim trong `package.json`).

Nếu máy chưa có lệnh `pnpm`, thay `pnpm` trong các lệnh bên dưới bằng `npx --yes pnpm@10.34.9`. Không cần cài pnpm toàn cục.

## Cài đặt và khởi chạy

Chạy từ thư mục gốc repository:

```sh
pnpm install
pnpm dev
```

- `pnpm install`: cài dependencies cho workspace gốc, `apps/api`, `apps/web` và `packages/shared`, sử dụng một `pnpm-lock.yaml` chung.
- `pnpm dev`: Turborepo chạy đồng thời NestJS ở cổng 4000 và Next.js ở cổng 3000. API nay cần `DATABASE_URL` hợp lệ và PostgreSQL sẵn sàng để khởi tạo Prisma.
- `pnpm --filter api start:dev`: chỉ chạy NestJS, tự biên dịch lại khi sửa mã.
- `pnpm --filter web dev`: chỉ chạy Next.js với chế độ phát triển.
- `pnpm dev:api` và `pnpm dev:web`: các lệnh viết gọn tương ứng tại workspace gốc.

API mặc định: `GET http://localhost:4000/api/v1` trả envelope JSON có data là `Hello World!`. Auth dùng prefix `/api/v1/auth`.

Web mặc định: `http://localhost:3000/` chuyển đến `/login`. Giao diện đăng nhập sử dụng tài khoản đã cấp; đăng nhập thành công chuyển đến `/account` để xem tên/email/vai trò và đăng xuất. Không có trang đăng ký hoặc chức năng AI trong giao diện hiện tại.

## Biến môi trường

Backend cần `DATABASE_URL`, `JWT_ACCESS_SECRET` (ngẫu nhiên, ít nhất 32 ký tự), `AUTH_ALLOWED_ORIGINS` trong môi trường local; `PORT` vẫn mặc định 4000. Giữ nguyên file môi trường đã có; người vận hành tự bổ sung cấu hình Auth theo `.env.example`, không commit secret. Nếu cần file mẫu, chỉ sao chép khi file đích chưa tồn tại và điền cấu hình trước khi khởi động. Ví dụ PowerShell:

```powershell
if (!(Test-Path apps/api/.env)) {
  Copy-Item apps/api/.env.example apps/api/.env
}
if (!(Test-Path apps/web/.env.local)) {
  Copy-Item apps/web/.env.example apps/web/.env.local
}
```

Backend dùng `@nestjs/config` và Zod để đọc, kiểm tra `PORT` (số nguyên từ 1 đến 65535, mặc định 4000). `.env.${NODE_ENV}` (mặc định `.env.development`) ưu tiên hơn `.env`; biến đã có trong môi trường tiến trình có ưu tiên cao nhất. Cấu hình được đặt tên trong `src/common/config/app.config.ts`, không đọc biến môi trường trong controller/service.

Frontend đọc `NEXT_PUBLIC_API_URL=http://localhost:4000` từ `apps/web/.env.local` để gọi Auth API với credentials và CSRF header. Access token giữ trong bộ nhớ, refresh token dùng cookie HttpOnly; có khôi phục phiên khi tải lại trang và làm mới token. Không ghi token vào localStorage. Cổng frontend được đặt trong scripts. Các file môi trường thật được Git bỏ qua, các file `.env.example` được giữ lại.

Chỉ chạy một bộ server tại một thời điểm. Nếu chạy `pnpm dev` ở thư mục gốc thì không chạy thêm `pnpm dev` trong apps/web, vì cả hai cùng dùng cổng 3000. Nếu muốn hai terminal riêng, dùng `pnpm --filter api start:dev` và `pnpm --filter web dev` từ root.

## Kiểm tra và build

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter api test:e2e
```

NestJS được tạo bằng Nest CLI 12, dùng ESM, Vitest và Oxlint theo template chính thức. Next.js 16 dùng App Router, TypeScript, Tailwind CSS 4 và ESLint. Font hệ thống được dùng để build không cần tải font từ Google.

Sau khi build, chạy bản production ở hai terminal:

```sh
pnpm --filter api start:prod
pnpm --filter web start
```

`packages/shared` có GameContent schema v1 cho COUNTING/MATCHING/CLASSIFICATION, inferred types, Interaction Contract và helper kiểm tra asset references thuần. Xem [GAME_CONTENT.md](./GAME_CONTENT.md) và ba JSON mẫu trong `packages/shared/examples/game-content/`. Chạy `pnpm --filter @lumikids/shared test` để build và kiểm tra schema/types offline. Frontend runtime Bước 4B đã dùng schema. Chưa có endpoint lưu GameContent hoặc migration mới cho nội dung trò chơi; AI generation chỉ trả nội dung để Preview.

Frontend đã có Game Runtime/Renderer Bước 4B dùng schema shared, xem [GAME_RUNTIME.md](./GAME_RUNTIME.md). Preview Bước 4C dùng chung `GamePreview`, tự resolve/renew URL ảnh Backend và hiển thị lỗi theo asset; xem [GAME_PREVIEW.md](./GAME_PREVIEW.md). Mở `/admin/game-preview` qua link Xem thử trò chơi ở `/account` khi có READ_GAME_ASSETS (hiện chỉ Admin, chưa cấp Teacher). JSON mẫu/ảnh minh họa và debug chỉ có trong development; JSON với assetId thật dùng Library. Web dev/build/typecheck tự build shared trước. Không lưu phiên/event/đánh giá vào database hoặc tính scoring. `pnpm --filter web test` chạy tests GameAsset, Runtime và Preview.

`services/ai` đã có FastAPI + Google GenAI SDK; `packages/ai-client` cung cấp HTTP client/contracts cho NestJS. Xem [GAME_GENERATION.md](./GAME_GENERATION.md) để cấu hình key, chạy local và kiểm thử offline. Teacher Prompt UI đã có ở Bước 6B; chưa gọi Gemini thật trong quá trình triển khai. PostgreSQL và cấu hình MinIO local nằm trong `infra/docker-compose.yml`; xem [MINIO.md](./MINIO.md). GameAsset Backend đã có code upload/metadata/presigned GET; cần application credentials S3 trong `apps/api/.env.development` theo [GAME_ASSETS.md](./GAME_ASSETS.md). Hai migration GameAsset đã được áp dụng theo yêu cầu cấp quyền; READ_GAME_ASSETS và MANAGE_GAME_ASSETS chỉ cấp cho ROLE_ADMIN. Giao diện quản trị tại `/admin/game-assets` hỗ trợ upload, tìm kiếm/phân trang, sửa metadata và đổi trạng thái; mở từ `/account` khi có đủ quyền đọc/quản lý asset. Xem [GAME_ASSETS_UI.md](./GAME_ASSETS_UI.md) để chạy và kiểm thử; agent chưa kiểm thử luồng browser với PostgreSQL/MinIO. Migration Auth đã áp dụng vào database development sau xác nhận; tài khoản test được seed theo yêu cầu riêng trong [SEED.md](./SEED.md). Chưa có module nghiệp vụ lớp/trẻ hoặc Redis. Xem [AUTH.md](./AUTH.md) để cấu hình Auth và thử bằng Postman.

Bước 6B đã có **AI Game Creator** tại `/teacher/games/create`, mở từ `/account` khi có GENERATE_GAME_CONTENT. Form gọi Nest generation và dùng lại GamePreview/Runtime; draft chỉ ở memory. Teacher được đọc URL cho asset trong nội dung Backend vừa sinh qua API scoped, theo xác nhận riêng, vẫn không có quyền Library. Xem [GAME_CREATION_UI.md](./GAME_CREATION_UI.md) để chạy và kiểm thử. Không có Save Draft/Publish hoặc lưu phiên/đánh giá; chưa tự gọi Gemini thật khi triển khai.
