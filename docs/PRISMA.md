# Prisma ORM cho LumiKids

## Phiên bản và phạm vi

Prisma CLI, Prisma Client và `@prisma/adapter-pg` được ghim cùng phiên bản stable **7.10.1**, tương thích với Node.js 22.20.0 đang dùng. Prisma 7 sử dụng PostgreSQL driver adapter. Không dùng bản RC 8 mà registry đang gắn nhãn `latest`.

Dependencies runtime mới: `@prisma/client`, `@prisma/adapter-pg`. Adapter phụ thuộc vào driver `pg`, nên ứng dụng không cần khai báo `pg` riêng khi không import trực tiếp. Dependencies phát triển mới: `prisma`, `dotenv` (chỉ dùng để nạp biến môi trường cho Prisma CLI). `@nestjs/config` và Zod đã có sẵn.

Phần cấu hình Prisma cơ bản đã hoàn tất. Schema hiện có các model Auth và migration Auth đã áp dụng vào database development sau xác nhận theo [AUTH.md](./AUTH.md). Seed development có chủ đích được mô tả trong [SEED.md](./SEED.md). Không có API kiểm tra database công khai.

## Cấu trúc

```text
apps/api/
├── prisma/schema.prisma
├── prisma.config.ts
├── src/
│   ├── common/config/database.config.ts
│   ├── generated/prisma/              # Prisma generate tạo; Git bỏ qua
│   └── prisma/
│       ├── prisma.module.ts
│       ├── prisma.service.ts
│       ├── prisma.service.spec.ts
│       └── check-connection.ts
└── test/app.e2e-spec.ts                # Mock Prisma, không kết nối DB
```

- `schema.prisma`: khai báo PostgreSQL và generator `prisma-client`; sinh TypeScript ESM, import tương đối có đuôi `.js` để tương thích NestJS hiện tại.
- `prisma.config.ts`: cấu hình Prisma CLI, đọc biến môi trường và đặt datasource URL bên ngoài schema theo Prisma 7.
- `database.config.ts`: cấu hình NestJS có namespace `database`, kiểm tra `DATABASE_URL` lúc khởi động. Lỗi không chứa giá trị đầu vào.
- `prisma.module.ts`: đăng ký và export `PrismaService`. Module nghiệp vụ sau này import `PrismaModule` để dùng client qua DI.
- `prisma.service.ts`: kế thừa generated `PrismaClient`, inject cấu hình có kiểu, tạo adapter PostgreSQL với timeout kết nối 5 giây; `$connect()` khi Nest khởi tạo và `$disconnect()` khi shutdown. `checkConnection()` chỉ chạy `SELECT 1` và được gọi ngay khi khởi tạo để kiểm chứng kết nối thật, vì adapter `pg` tạo pool theo cơ chế lazy.
- `check-connection.ts`: chương trình dòng lệnh tạo Nest app, khởi tạo lifecycle để PrismaService kiểm tra kết nối rồi đóng app; không gọi `listen()`, không mở endpoint HTTP.
- Các test cấu hình, lifecycle và HTTP đều chạy offline; `$connect`, `$disconnect` và truy vấn trong test được mock.

Luồng runtime: **NestJS service → PrismaService/Prisma Client → PrismaPg → driver pg → PostgreSQL**. Mỗi Nest app dùng một PrismaService mặc định dạng singleton, tái sử dụng connection pool.

## Biến môi trường

Giữ `DATABASE_URL` thật trong `apps/api/.env.development` đã có. Backend chạy trên Windows nên địa chỉ PostgreSQL local dùng cổng được Docker publish (`localhost:5433`), không dùng tên service Docker hay cổng container 5432. Không ghi connection string thật vào mã nguồn hoặc tài liệu.

Cả NestJS và Prisma CLI đều nạp theo thứ tự:

1. Biến môi trường tiến trình đã có.
2. `apps/api/.env.${NODE_ENV}` (mặc định `.env.development`).
3. `apps/api/.env`.

Đường dẫn được neo theo vị trí file cấu hình, không dựa vào working directory. Prisma CLI dùng `dotenv` với `quiet: true`; NestJS dùng ConfigModule hiện có. Không sửa hoặc tự tạo lại các file môi trường thật.

Generate/validate không cần credential và không kết nối PostgreSQL. URL có thể để trống khi chỉ chạy các bước này trong CI. Khởi động NestJS và các lệnh truy cập database yêu cầu URL hợp lệ.

## Lệnh từ thư mục gốc

```sh
pnpm install --frozen-lockfile
pnpm --filter api prisma:generate
pnpm --filter api prisma:validate
pnpm --filter api build
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:e2e
```

Build, start, typecheck, lint và test của API tự generate client trước khi chạy để hoạt động trên checkout mới. Không phụ thuộc postinstall của Prisma; workspace chủ động tắt build scripts của `prisma` và `@prisma/engines`. Prisma CLI có thể tải schema engine cần thiết khi được gọi.

**Các lệnh dưới đây kết nối database thật, chỉ chạy sau khi người dùng xác nhận:**

```sh
pnpm --filter api db:check
pnpm --filter api prisma:status
```

`db:check` build rồi khởi chạy `dist/prisma/check-connection.js`, chỉ thực hiện `SELECT 1`, đóng kết nối và trả exit code khác 0 nếu có lỗi. Công cụ này chỉ import Config/Prisma, không yêu cầu cấu hình JWT. `prisma:status` đọc trạng thái migration. Migration Auth đã áp dụng vào database development sau xác nhận; xem [AUTH.md](./AUTH.md). Hai lệnh không được chạy trong build, test hoặc bước install.

`pnpm dev` và các lệnh start API nay khởi tạo Prisma nên cũng kết nối database. Nếu database không sẵn sàng, API sẽ báo lỗi; không tự thay đổi Docker Compose hay URL để khắc phục.

## Đối chiếu với Spring Boot

| Prisma | Tương ứng gần nhất trong Spring | Khác biệt chính |
|---|---|---|
| `PrismaService` | Bean cung cấp truy cập dữ liệu, gần vai trò của `EntityManager` dùng qua DI | Kế thừa client có kiểu được generate; không tự tạo repository interface như Spring Data JPA và không có cơ chế dirty checking tự lưu đối tượng đã sửa. |
| Prisma Schema | Các khai báo mapping của JPA Entity | File DSL riêng dùng để sinh client TypeScript và mô tả schema; model không phải class entity có hành vi hoặc đối tượng được quản lý ở runtime. |
| Prisma Migrate | Flyway | Đều quản lý lịch sử migration SQL; Prisma có thể sinh migration từ thay đổi schema, còn Flyway thường chạy SQL migration do nhóm cung cấp. Migration Auth đã được áp dụng sau xác nhận theo AUTH.md. |

Tham khảo chính thức: [Prisma 7 và driver adapters](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Prisma Config](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [NestJS và Prisma](https://docs.nestjs.com/recipes/prisma).
