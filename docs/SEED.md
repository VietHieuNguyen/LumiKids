# Seed Auth cho development

> Cập nhật ROLE_CHILD và seed riêng: xem [CHILD_AUTH.md](./CHILD_AUTH.md). `db:seed:child` chỉ tạo/cập nhật `child1@lumikids.local`; full seed bên dưới cần thêm SEED_CHILD_PASSWORD và có bốn tài khoản.

Script: `apps/api/src/modules/auth/seed-development.ts`, lệnh `pnpm --filter api db:seed:dev`.

Chỉ chạy có chủ đích trên PostgreSQL local, database `lumikids_db`, không chạy ở NODE_ENV=production. Script không tự chạy khi install/start hoặc migrate. Password lấy từ môi trường tiến trình, được hash Argon2id trước khi mở transaction; không lưu các hash bcrypt được cung cấp vào hệ thống Argon2id.

## Tài khoản và quyền

| Email | Role | Permission |
|---|---|---|
| admin@lumikids.local | ROLE_ADMIN | READ_OWN_ACCOUNT, MANAGE_USERS, GENERATE_GAME_CONTENT, READ_GAME_ASSETS, MANAGE_GAME_ASSETS, READ_GAMES, SAVE_GAMES, MANAGE_ALL_GAMES |
| teacher1@lumikids.local | ROLE_TEACHER | READ_OWN_ACCOUNT, GENERATE_GAME_CONTENT, READ_GAMES, SAVE_GAMES |
| guardian1@lumikids.local | ROLE_GUARDIAN | READ_OWN_ACCOUNT |
| child1@lumikids.local | ROLE_CHILD | READ_OWN_ACCOUNT, PLAY_GAMES, SUBMIT_OWN_INTERACTIONS, READ_OWN_PLAY_SESSIONS |

Các tài khoản được đặt ACTIVE. Permission GENERATE_GAME_CONTENT ánh xạ tới subject CASL `GameContentGeneration`. Quyền CHILD ánh xạ và kiểm tra ownership theo [CHILD_AUTH.md](./CHILD_AUTH.md). Seed không gọi AI.

## Trạng thái hiện tại

Ngày 12/11/2026 đã thêm ROLE_CHILD và một tài khoản ACTIVE bằng seed riêng, giữ nguyên ba tài khoản người lớn và grants của họ. Đã kiểm tra đăng nhập/refresh/logout thật, quyền đọc chính tài khoản và chặn API authoring. Trước đó ba tài khoản người lớn đã được seed ở giai đoạn Auth ban đầu; quyền kho/học liệu được bổ sung bằng các migration tương ứng.

Migration `20261109000200_add_game_generation_permission` chỉ có `ALTER TYPE PermissionCode ADD VALUE 'GENERATE_GAME_CONTENT'`, đã áp dụng ngày 09/11/2026 sau xác nhận. Script seed đầy đủ đã chạy thành công và cấp quyền mới cho Admin/Teacher; Guardian không có quyền sinh trò chơi. Prisma xác nhận database schema up to date.

## Chạy lại

Cung cấp các biến môi trường tiến trình, không bắt buộc tạo file:

```powershell
$env:SEED_ADMIN_PASSWORD = 'MAT_KHAU_TEST_ADMIN'
$env:SEED_TEACHER_PASSWORD = 'MAT_KHAU_TEST_GIAO_VIEN'
$env:SEED_GUARDIAN_PASSWORD = 'MAT_KHAU_TEST_GIAM_HO'
$env:SEED_CHILD_PASSWORD = 'MAT_KHAU_TEST_TRE'

try {
    pnpm --filter api db:seed:dev
}
finally {
    Remove-Item Env:\SEED_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\SEED_TEACHER_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\SEED_GUARDIAN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:\SEED_CHILD_PASSWORD -ErrorAction SilentlyContinue
}
```

Đây là placeholder, thay bằng mật khẩu test muốn dùng. Script không in mật khẩu/hash. Upsert theo email/code và khóa ghép nên không nhân bản dữ liệu khi chạy lại. Nếu email test đã tồn tại, script cập nhật passwordHash và ACTIVE, giữ thông tin profile, bảo đảm role tương ứng và thu hồi các refresh session cũ. Không xóa user hay quyền ngoài danh sách seed; việc cấp quyền là cộng thêm, không phải reset toàn bộ RBAC.

Tất cả ghi dữ liệu nằm trong một transaction. Không có seed tự động cho database test hoặc production.
