# Seed Auth cho development

Script: `apps/api/src/modules/auth/seed-development.ts`, lệnh `pnpm --filter api db:seed:dev`.

Chỉ chạy có chủ đích trên PostgreSQL local, database `lumikids_db`, không chạy ở NODE_ENV=production. Script không tự chạy khi install/start hoặc migrate. Password lấy từ môi trường tiến trình, được hash Argon2id trước khi mở transaction; không lưu các hash bcrypt được cung cấp vào hệ thống Argon2id.

## Tài khoản và quyền

| Email | Role | Permission |
|---|---|---|
| admin@lumikids.local | ROLE_ADMIN | READ_OWN_ACCOUNT, MANAGE_USERS, GENERATE_GAME_CONTENT |
| teacher1@lumikids.local | ROLE_TEACHER | READ_OWN_ACCOUNT, GENERATE_GAME_CONTENT |
| guardian1@lumikids.local | ROLE_GUARDIAN | READ_OWN_ACCOUNT |

Các tài khoản được đặt ACTIVE. Không có ROLE_CHILD. Permission GENERATE_GAME_CONTENT ánh xạ tới subject CASL `GameContentGeneration`; các endpoint NestJS sinh trò chơi sau này có thể dùng `@Permissions('GENERATE_GAME_CONTENT')`. Chưa triển khai endpoint hoặc gọi AI Service trong bước seed này.

## Trạng thái hiện tại

Đã seed 3 tài khoản ACTIVE, 3 role, 3 permission và 6 quan hệ RolePermission theo bảng trên. Đã verify mật khẩu test bằng Argon2id, nạp principal qua UsersService và kiểm tra quyền bằng CASL từ dữ liệu database.

Migration `20261109000200_add_game_generation_permission` chỉ có `ALTER TYPE PermissionCode ADD VALUE 'GENERATE_GAME_CONTENT'`, đã áp dụng ngày 09/11/2026 sau xác nhận. Script seed đầy đủ đã chạy thành công và cấp quyền mới cho Admin/Teacher; Guardian không có quyền sinh trò chơi. Prisma xác nhận database schema up to date.

## Chạy lại

Cung cấp các biến môi trường tiến trình, không bắt buộc tạo file:

```powershell
$env:SEED_ADMIN_PASSWORD = 'MAT_KHAU_TEST_ADMIN'
$env:SEED_TEACHER_PASSWORD = 'MAT_KHAU_TEST_GIAO_VIEN'
$env:SEED_GUARDIAN_PASSWORD = 'MAT_KHAU_TEST_GIAM_HO'

try {
    npx --yes pnpm@10.34.9 --filter api db:seed:dev
}
finally {
    Remove-Item Env:\SEED_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\SEED_TEACHER_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\SEED_GUARDIAN_PASSWORD -ErrorAction SilentlyContinue
}
```

Đây là placeholder, thay bằng mật khẩu test muốn dùng. Script không in mật khẩu/hash. Upsert theo email/code và khóa ghép nên không nhân bản dữ liệu khi chạy lại. Nếu email test đã tồn tại, script cập nhật passwordHash và ACTIVE, giữ thông tin profile, bảo đảm role tương ứng và thu hồi các refresh session cũ. Không xóa user hay quyền ngoài danh sách seed; việc cấp quyền là cộng thêm, không phải reset toàn bộ RBAC.

Tất cả ghi dữ liệu nằm trong một transaction. Không có seed tự động cho database test hoặc production.
