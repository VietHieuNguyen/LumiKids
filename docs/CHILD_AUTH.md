# Đăng nhập của trẻ (mã cá nhân)

> Cập nhật 16/11/2026 (nhánh `feat/classroom`). Thay cho mô hình cũ "User ROLE_CHILD + mật khẩu" (12–13/11). Kế hoạch và quyết định: [CLASSROOM_PLAN.md](./CLASSROOM_PLAN.md).

## Mô hình

- `Child` là thực thể **riêng**, không gắn `User`: không email, không mật khẩu, không `Child.userId`. `PlaySession.childId` trỏ thẳng tới `Child`.
- Admin tạo hồ sơ trẻ **kèm lớp** (`ClassroomEnrollment` đang mở). Mỗi trẻ có đúng một lớp đang học (partial unique index `ClassroomEnrollment_childId_open_key`).
- Giáo viên của lớp hiện tại cấp **mã đăng nhập** cho trẻ. Mã 8 kí tự từ bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, hiển thị `XXXX-XXXX`.
  - Chỉ lưu HMAC-SHA256 (`Child.loginCodeDigest`, unique) và thời điểm cấp (`loginCodeIssuedAt`). Mã chỉ trả về **một lần** (`Cache-Control: no-store`), không xem lại được.
  - Cấp mã mới làm mã cũ hết hiệu lực và thu hồi mọi `ChildAuthSession` đang mở của trẻ, trong cùng transaction.
  - Khóa HMAC: `CHILD_LOGIN_CODE_SECRET` (≥ 32 kí tự) nếu có, nếu không suy ra bằng HKDF từ `JWT_ACCESS_SECRET`. Đổi khóa làm mọi mã hiện có mất hiệu lực.
- Đăng nhập chỉ thành công khi trẻ `ACTIVE` **và** đang học một lớp `ACTIVE`. Mã sai, trẻ bị khóa hoặc không có lớp đều trả cùng 401 "Mã đăng nhập không đúng." (không dò được).

## Phiên và token

| Thành phần | Trẻ | Người lớn |
|---|---|---|
| Route | `POST /api/v1/auth/child/{login,refresh-token,logout}`, `GET /auth/child/me` | `/api/v1/auth/*` |
| Access JWT | `tokenUse: 'child_access'`, `sub = childId` | `tokenUse: 'access'`, `sub = userId` |
| Refresh cookie | `lumikids_child_refresh`, path `/api/v1/auth/child`, TTL `CHILD_REFRESH_TTL_SECONDS` (mặc định 43200 = 12 giờ) | cookie người lớn |
| Bảng | `ChildAuthSession`, `ChildRefreshToken` (xoay vòng, phát hiện replay như người lớn) | `AuthSession`, `RefreshToken` |

- Hai cookie khác tên và path: giáo viên và trẻ đăng nhập cùng một máy của lớp không đè nhau.
- Route trẻ đánh dấu `@ChildRoute()`; `JwtAuthGuard` trả 403 khi loại token không khớp route (token trẻ ở route người lớn và ngược lại). Mỗi request kiểm lại trẻ còn `ACTIVE` (`ChildAuthService.requireActiveChild`).
- Login/refresh/logout: giới hạn 60 yêu cầu/phút (cả lớp đăng nhập từ một IP), cần header CSRF và Origin hợp lệ như người lớn.

## Quyền

`ChildPrincipal` mang cố định `PLAY_GAMES`, `SUBMIT_OWN_INTERACTIONS`, `READ_OWN_PLAY_SESSIONS` (`child-permissions.ts`), không đọc từ RolePermission. CASL so `PlaySession.childId` với `childId` của principal; service luôn đọc phiên từ DB, không tin id do client gửi. Không cấp kho authoring/Library/generation/asset cho trẻ.

Người lớn: `MANAGE_CLASSROOMS` (Admin) cho `/api/v1/admin/*` lớp học; `READ_OWN_CLASSROOMS`, `RESET_CHILD_LOGIN_CODES` và `ASSIGN_ACTIVITIES` (giao bài, quản lý nhóm) (Teacher) cho `/api/v1/teacher/classrooms/*`. Giáo viên chỉ thấy lớp mình là thành viên (`ClassroomTeacher`), và chỉ thấy lượt chơi bắt đầu trong khoảng trẻ học lớp đó.

## Web

- `/login` có chế độ "Bé vào chơi" (ô nhập mã chữ to, tự định dạng). Link vào `/child/*` hoặc `?mode=child` mở thẳng chế độ này.
- `ChildAuthProvider` (chỉ dưới `app/child/layout.tsx`) giữ phiên trẻ trong bộ nhớ, khôi phục bằng refresh cookie của trẻ. `/child/games` là trang "Bài của con" (chỉ bài được giao, xin chơi lại khi hết hạn) và có nút "Thoát"; giao diện trẻ ở `app/child/child.css`.
- Giáo viên cấp mã ở `/teacher/classrooms/:classId` hoặc trang chi tiết trẻ; hộp mã có "In thẻ" (chỉ in tấm thẻ).

## Dữ liệu cũ

- Migration `20261116000200_classroom` bỏ `Child.userId`. Tài khoản `child1@lumikids.local` (ROLE_CHILD) còn trong DB nhưng **không chơi được nữa** (gameplay từ chối token người lớn). `seed-child-development.ts` đánh dấu LEGACY, chỉ còn tạo user ROLE_CHILD.
- Hồ sơ Child và PlaySession/InteractionEvent cũ được giữ nguyên. Hồ sơ chưa có lớp hiện ở khung "Trẻ chưa có lớp" trong trang chi tiết lớp của Admin (`GET /api/v1/admin/children/unassigned`); xếp vào lớp rồi giáo viên cấp mã. Lượt chơi cũ bắt đầu trước khi trẻ vào lớp nên giáo viên **không** thấy (đúng quy tắc theo khoảng học).
- Mã lỗi `CHILD_PROFILE_MISSING` còn trong `api-problem.ts` nhưng không còn được phát ra.

## Kiểm thử

- Unit: `child-login-code.spec.ts`, `ability.spec.ts`, `classrooms.service.spec.ts`, `gameplay.service.spec.ts`.
- E2E (Prisma mock): `test/child-auth.e2e-spec.ts`, `test/gameplay.e2e-spec.ts`, `test/classrooms.e2e-spec.ts`.
- Integration (DB `_test` riêng, `TEST_DATABASE_URL`): `test/classrooms.integration.ts` — chuyển lớp, lọc lượt chơi theo khoảng học, cấp mã thu hồi phiên.
- Giao bài: `assignments.service.spec.ts`, `test/assignments.integration.ts`, shared `tests/assignment.test.mjs`.
- Web: `tests/classrooms.test.mjs` (định dạng mã, ngày, tuổi, thời lượng, cách nói với trẻ, ngày giao bài).
