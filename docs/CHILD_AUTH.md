# Auth cho ROLE_CHILD

ROLE_CHILD là tài khoản đăng nhập của trẻ, chuẩn bị cho module gameplay. Dùng nguyên JWT access token, refresh cookie HttpOnly, PasswordService Argon2id và permission guards hiện có.

## Quyền

| Permission | CASL subject | Phạm vi |
|---|---|---|
| READ_OWN_ACCOUNT | Account | userId của principal |
| PLAY_GAMES | Gameplay | Quyền vào luồng chơi; gameplay service vẫn phải kiểm tra trò được phép chơi |
| SUBMIT_OWN_INTERACTIONS | PlaySession | userId của chủ phiên bằng principal.userId |
| READ_OWN_PLAY_SESSIONS | PlaySession | Chỉ các phiên thuộc tài khoản trẻ |

Role không tự suy ra permission; các quyền được cấp qua RolePermission trong DB. Không cấp READ_GAMES, SAVE_GAMES, GENERATE_GAME_CONTENT, READ_GAME_ASSETS, MANAGE_GAME_ASSETS hoặc quyền quản lý user cho CHILD. Kho Admin/Teacher chứa dữ liệu phục vụ soạn/duyệt, không phải API chơi dành cho trẻ.

Hai migration `20261112000300_child_auth_enums` và `20261112000400_child_auth_grants` bổ sung enum ROLE_CHILD, ba permission gameplay và grants cho role mới. Không sửa quyền các role người lớn hoặc các migration đã áp dụng. Không tạo Child profile với dob/gender giả.

## Tài khoản test

Email `child1@lumikids.local`, fullName `Trẻ test 1`, status ACTIVE, duy nhất role ROLE_CHILD. Mật khẩu được truyền qua biến môi trường `SEED_CHILD_PASSWORD`, không hardcode trong source và không in password/hash/token. Hash bcrypt `$2a$...` không được lưu nguyên vì Auth đang xác minh Argon2id; seed hash lại mật khẩu rõ bằng PasswordService hiện có.

Seed riêng, chỉ dành local `lumikids_db`, chặn NODE_ENV=production:

```powershell
$env:SEED_CHILD_PASSWORD = '<mat-khau-test-it-nhat-8-ky-tu>'
try { pnpm --filter api db:seed:child }
finally { Remove-Item Env:\SEED_CHILD_PASSWORD -ErrorAction SilentlyContinue }
```

Script riêng không chạy full seed, không đổi Admin/Teacher/Guardian. Email trùng với tài khoản không có duy nhất ROLE_CHILD sẽ bị từ chối. Chạy lại không nhân bản user; nếu mật khẩu/trạng thái không đổi, giữ passwordHash và session. Khi phải đổi mật khẩu hoặc kích hoạt lại, chỉ thu hồi refresh session của tài khoản trẻ đó.

Full development seed cũng biết tài khoản CHILD và cần thêm SEED_CHILD_PASSWORD khi được chủ động gọi. Không tự chạy seed khi start/migrate.

## Gameplay (13/11/2026)

Module `apps/api/src/modules/gameplay` (migration `20261113000100_gameplay`, đã áp dụng trên DB dev ngày 13/11/2026) thêm bảng Child (liên kết 1–1 `userId` → User ROLE_CHILD), PlaySession và InteractionEvent, API `/api/v1/gameplay/*` và màn hình `/child/games`. Trẻ chơi mọi trò có Activity ACTIVE (tạm thời, chưa có ActivityAssignment). Server phát lại event bằng engine trong `@lumikids/shared` để tự tính kết quả, thứ tự và hoàn thành; eventId chống trùng. Tài khoản CHILD chưa có hồ sơ Child nhận 409 `CHILD_PROFILE_MISSING`.

Seed child tạo/cập nhật hồ sơ Child khi truyền thêm `SEED_CHILD_DOB` (YYYY-MM-DD) và `SEED_CHILD_GENDER` (MALE/FEMALE) với dữ liệu thật; bỏ trống cả hai thì không tạo hồ sơ.

Controller tương lai dùng `@Permissions('PLAY_GAMES')` để vào luồng chơi. Endpoint đọc phiên dùng READ_OWN_PLAY_SESSIONS, endpoint ingest dùng SUBMIT_OWN_INTERACTIONS. Permission guard chỉ kiểm tra capability; **service phải đọc session từ DB và kiểm tra CASL với `subject('PlaySession', {userId: ownerUserId})`**, không tin userId/childId do client gửi. Khi có Child profile, ownerUserId được resolve từ quan hệ profile/account, không so nhầm childId với userId.

Gameplay cũng phải kiểm tra giao bài/quyền chơi của phiên bản, phiên đang hoạt động, schema event, eventId chống trùng và không cho client tự ghi kết quả đánh giá. Không cấp quyền rộng cho CHILD để dùng lại các API authoring chứa đáp án; xây scoped playable assets theo trò/phiên được phép chơi.

## Kiểm tra ngày 12/11/2026

Đã áp dụng hai migration CHILD, seed đúng một tài khoản như yêu cầu. Tám kiểm tra tập trung về CASL/ownership và mật khẩu đạt; Prisma validate, API typecheck/build/lint mục tiêu đạt. Đăng nhập, đọc `/auth/me` và tài khoản của chính trẻ, refresh và logout trả 200. Các API kho giáo viên, thư viện ảnh, lưu/sinh trò và quyền quản trị trả 403. Đối chiếu digest trước/sau xác nhận ba tài khoản người lớn (bao gồm passwordHash) và role grants không đổi. Không gọi Gemini hoặc thêm dữ liệu phiên chơi.
