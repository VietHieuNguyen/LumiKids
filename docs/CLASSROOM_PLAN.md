# Kế hoạch: Lớp học → Giao trò → Đánh giá

> Cập nhật: 16/11/2026. Trạng thái: **GĐ 1 xong (1A–1E, chưa commit); tiếp theo GĐ 2 (giao trò)**. Nhánh: `feat/classroom` (chưa commit).
> Nguồn yêu cầu: [`system.md`](../system.md), [`Class_Diagram_Relationships_LumiKids.md`](../Class_Diagram_Relationships_LumiKids.md), [`docs/AGENTS.md`](./AGENTS.md).
> Đánh dấu `[x]` khi xong; ghi rõ VERIFIED/RUN (đã chạy) hoặc VERIFIED/CODE (mới đọc code) ở mục Nhật ký.

## 1. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| D1 | Lớp – giáo viên | Một lớp có nhiều giáo viên. Admin tạo lớp. |
| D2 | Lớp – trẻ | Mỗi trẻ thuộc **một lớp tại một thời điểm**; được **chuyển lớp giữa năm** → lưu lịch sử theo khoảng ngày. |
| D3 | Năm học, nhóm tuổi | Lớp gắn `SchoolYear` và `AgeGroup` (3–6 tuổi). |
| D4 | Quyền xem | Giáo viên chỉ xem phiên chơi **trong thời gian trẻ học lớp mình**. Trẻ chuyển đi: giáo viên lớp mới chỉ xem **hồ sơ phát triển** (có ở GĐ 4), không xem phiên chơi cũ. |
| D5 | Tài khoản trẻ | **Child tách khỏi User**: không email, không User ROLE_CHILD. Admin tạo trẻ → giáo viên đưa mã cho trẻ. |
| D6 | Mã đăng nhập | Mỗi trẻ một mã riêng. **Chỉ cấp mới, không xem lại** (lưu dạng băm, hiện đúng một lần). Cấp mới thì mã cũ hết hiệu lực. |
| D7 | Giao trò | Ở lớp, trẻ chỉ chơi trò được giao. Giao cho cả lớp, nhóm cố định hoặc một số trẻ. Hoàn thành = chơi xong mỗi trò ít nhất 1 lần. Sau hạn: trẻ xin chơi lại (giáo viên duyệt) hoặc giáo viên giao lại; **phiên sau hạn vẫn tính đánh giá**. |
| D8 | Chỉ số | Một phiên bản trò gắn **nhiều** chỉ số; **gắn chỉ số theo từng nhiệm vụ** lúc soạn. Trò cũ: mọi nhiệm vụ tính cho mọi chỉ số đã gắn. |
| D9 | Độ tuổi & ngưỡng | Chuẩn 15–17 / Chỉ số 42–52 áp dụng cho 3–6 tuổi. **Một bảng ngưỡng 40/60/85%** cho mọi tuổi, để ở cấu hình. |
| D10 | Phiên hợp lệ | Giữ quy tắc `system.md`: tối thiểu 5 nhiệm vụ được chấm mỗi phiên. Trò demo (Đếm, N = 1) ra LEVEL_0 là đúng. |
| D11 | Để sau | Phụ huynh, giáo án, nhận xét bằng AI (RAG/LLM), màn admin tạo tài khoản giáo viên. |

## 2. Lộ trình

| GĐ | Nội dung | Phụ thuộc | Trạng thái |
|---|---|---|---|
| **1** | Lớp học, tài khoản trẻ tách riêng, đăng nhập bằng mã, giáo viên xem lớp và lịch sử chơi | — | ✅ xong (đã push) |
| **2** | Giao trò, nhóm cố định, xin chơi lại; trẻ chỉ thấy trò được giao | GĐ 1 | ✅ xong (chưa commit) |
| 3 | Gắn chỉ số theo từng nhiệm vụ (GameContent + màn soạn trò) | — | ⬜ |
| 4 | Engine đánh giá + hồ sơ phát triển | GĐ 1, 3 | 🟡 4A điểm CriterionEvaluation xong (chưa commit) |
| sau | Phụ huynh, giáo án, nhận xét AI, quản lý tài khoản giáo viên | GĐ 4 | ⬜ |

## 3. Giai đoạn 1 — chi tiết

### 1A. Dữ liệu (migration — đã được phép 16/11/2026)

Bảng mới:
- [x] `SchoolYear`: tên (duy nhất), ngày bắt đầu, ngày kết thúc.
- [x] `AgeGroup`: danh mục 3–4, 4–5, 5–6 tuổi; chèn sẵn trong migration (không chạy seed).
- [x] `Classroom`: tên lớp, năm học, nhóm tuổi, trạng thái `ACTIVE`/`ARCHIVED`; tên lớp duy nhất trong một năm học.
- [x] `ClassroomTeacher`: (lớp, giáo viên = User có ROLE_TEACHER), ngày thêm.
- [x] `ClassroomEnrollment`: (lớp, trẻ, `startedAt`, `endedAt` null = đang học). Ràng buộc DB: mỗi trẻ chỉ một lượt đang mở (partial unique index viết SQL tay trong migration).
- [x] `ChildAuthSession` và `ChildRefreshToken`: phiên đăng nhập của trẻ, cấu trúc giống `AuthSession`/`RefreshToken` nhưng gắn `childId`.

Sửa bảng có sẵn:
- [x] `Child`: **bỏ `userId`**; thêm `loginCodeDigest` (duy nhất, có thể null), `loginCodeIssuedAt`, `status` (`ACTIVE`/`DISABLED`).
- [x] Quyền mới: `MANAGE_CLASSROOMS` (Admin), `READ_OWN_CLASSROOMS`, `RESET_CHILD_LOGIN_CODES` (Teacher, giới hạn lớp mình).

Dữ liệu hiện có (không xóa):
- [x] `PlaySession` giữ nguyên, vẫn gắn `childId`.
- [x] Tài khoản User ROLE_CHILD cũ (từ seed) **giữ nguyên, không xóa**, chỉ không còn liên kết với Child. Dọn dẹp để sau, khi bạn cho phép.

### 1B. Đăng nhập của trẻ (luồng riêng, không sửa luồng User)

- [x] Endpoint `POST /api/v1/auth/child/login` nhận mã; `refresh-token` và `logout` riêng cho trẻ.
- [x] JWT của trẻ có loại riêng (`typ: child`, `sub = childId`); guard tạo `ChildPrincipal`. Guard của User từ chối token trẻ và ngược lại.
- [x] Quyền của trẻ cố định: `PLAY_GAMES`, `SUBMIT_OWN_INTERACTIONS`, `READ_OWN_PLAY_SESSIONS`.
- [x] Mã: 8 ký tự từ bộ chữ dễ đọc (bỏ 0/O, 1/I/L); lưu HMAC-SHA256 với khóa bí mật cấu hình qua `registerAs` (không đọc env trực tiếp). `CHILD_LOGIN_CODE_SECRET` không bắt buộc; thiếu thì suy ra từ `JWT_ACCESS_SECRET`.
- [x] Giới hạn số lần thử bằng `@nestjs/throttler` (đã có sẵn trong `apps/api`): 60 lần/phút/IP, vì cả lớp đăng nhập chung một mạng.
- [x] Trẻ `DISABLED`, chưa có mã hoặc không có lớp đang học → không đăng nhập được.
- [x] Gameplay chuyển sang lấy trẻ từ `ChildPrincipal`; điều kiện CASL cho `PlaySession` đổi từ `userId` sang `childId`; lỗi `CHILD_PROFILE_MISSING` không còn dùng.

### 1C. API module `classrooms` (3 lớp Controller → Service → Repository)

Route: Admin dưới `/api/v1/admin/...` (`age-groups`, `school-years`, `teachers`, `classrooms`, `classrooms/:id/teachers`, `children`, `children/:id/transfer`) cần `MANAGE_CLASSROOMS`; giáo viên dưới `/api/v1/teacher/classrooms/...` cần `READ_OWN_CLASSROOMS` (cấp mã thêm `RESET_CHILD_LOGIN_CODES`). Contract Zod dùng chung ở `packages/shared/src/classroom.ts`.

Admin:
- [x] Năm học: tạo, sửa, danh sách. Nhóm tuổi: danh sách.
- [x] Lớp: tạo, sửa, lưu trữ, danh sách (lọc theo năm học), chi tiết. Không cho lưu trữ lớp còn trẻ đang học (chuyển trẻ đi trước).
- [x] Giáo viên trong lớp: thêm, gỡ (chọn từ User ROLE_TEACHER sẵn có).
- [x] Trẻ: tạo hồ sơ trẻ và xếp lớp ngay, sửa thông tin, khóa/mở.
- [x] Chuyển lớp: đóng lượt cũ và mở lượt mới trong **một transaction**.

Giáo viên:
- [x] Danh sách lớp mình dạy.
- [x] Danh sách trẻ đang học trong lớp.
- [x] Phiên chơi của một trẻ, **chỉ trong các khoảng thời gian trẻ học lớp mình** (D4).
- [x] Cấp mã mới cho trẻ đang học lớp mình; mã trả về đúng một lần.

Quy tắc chung:
- [x] Mọi kiểm tra "giáo viên có dạy lớp của trẻ không" làm ở backend.
- [x] Trẻ không thuộc lớp → 404 (không lộ sự tồn tại).

### 1D. Giao diện web

- [x] Admin `/admin/classrooms`: năm học, lớp, giáo viên, trẻ, chuyển lớp.
- [x] Giáo viên `/teacher/classrooms`: lớp → danh sách trẻ → chi tiết trẻ (lịch sử chơi thô: trò, thời gian, hoàn thành/bỏ dở, số lần thử) + nút "Cấp mã mới" (hộp hiển thị mã, in được thẻ).
- [x] `/login`: thêm lựa chọn "Bé đăng nhập bằng mã" (ô nhập chữ to).
- [x] Trang chơi của trẻ (`/child/games`) dùng phiên đăng nhập của trẻ.

### 1E. Kiểm thử và tài liệu

- [x] Unit test (Vitest): quyền xem theo khoảng thời gian học; chuyển lớp; một lớp đang học/trẻ; cấp mã mới làm mã cũ hết hiệu lực; token trẻ không dùng được ở route User.
- [x] Integration test trên DB `_test` riêng.
- [x] Web test (Node test runner) cho phần xử lý mã (`tests/classrooms.test.mjs`). Phân quyền giao diện chưa có test riêng.
- [x] Lint, typecheck, test: `api`, `web`, `@lumikids/shared`.
- [x] Cập nhật `CLAUDE.md` (invariant "Child liên kết 1–1 với User ROLE_CHILD" không còn đúng), `docs/CHILD_AUTH.md`, `docs/AUTH.md`, `docs/PRISMA.md`, `docs/AI_HANDOFF.md`.

### Rủi ro cần để ý

- Bỏ `Child.userId` chạm vào đăng nhập và gameplay đang chạy → làm 1A và 1B cùng nhau, chạy lại toàn bộ test gameplay.
- Thiết bị dùng chung ở lớp: phiên trẻ cần hết hạn ngắn hơn phiên giáo viên và có nút "Đổi bạn".
- Quên gỡ phiên trẻ cũ khi cấp mã mới → khi cấp mã mới, thu hồi luôn các phiên đang mở của trẻ đó.

## 4. Các giai đoạn sau (phác thảo)

**GĐ 2 — Giao trò (đã làm 16/11/2026, xem nhật ký):**

- Quyết định thêm (16/11/2026): `opensAt` tùy chọn (mặc định lúc giao), `dueAt` tùy chọn; trẻ chỉ thấy bài sau `opensAt`. Duyệt xin chơi lại = mở lại đến hạn mới giáo viên chọn (mặc định +3 ngày), chơi không giới hạn lượt.
- Dữ liệu: quyền `ASSIGN_ACTIVITIES` (Teacher); `ClassGroup`/`ClassGroupMember`; `ActivityAssignment` (lớp, tiêu đề, lời nhắn, `opensAt`, `dueAt?`, kiểu người nhận + nhãn, ACTIVE/CANCELLED); `ActivityAssignmentItem` (1–10 phiên bản trò, có thứ tự); `ActivityRecipient` (ảnh chụp người nhận lúc giao, `extendedUntil`); `ReplayRequest` (tối đa một yêu cầu PENDING/người nhận, partial unique index). Migration `20261117000100_assignment_enums`, `20261117000200_assignments`.
- Hoàn thành **không lưu**: tính từ PlaySession COMPLETED bắt đầu từ `opensAt` trở đi, mỗi trò ít nhất một lần (kể cả sau hạn). Quy tắc cửa sổ thời gian ở shared `assignment-window.ts`.
- Cổng chơi duy nhất: `AssignmentsService.playableVersionIds(childId)` → `PlayableGameService` (list/detail) — trẻ chỉ mở trò thuộc bài đang mở của lớp hiện tại (hoặc được gia hạn).
- API giáo viên `/teacher/classrooms/:classId/{groups,assignments}`; API trẻ `GET /gameplay/assignments`, `POST /gameplay/assignments/:id/replay-requests`.
- Web: `/child/games` thành "Bài của con" (thẻ bài, ô trò theo loại, sao tiến độ, hạn tính theo ngày, nút "Xin cô chơi lại", đọc to khi máy có giọng tiếng Việt); giáo viên có tab Bài giao/Trẻ/Nhóm, trang giao bài mới và trang theo dõi bài (duyệt xin chơi lại, giao lại cho trẻ chọn, đổi/bỏ hạn, hủy bài). Toàn bộ màn người lớn dùng bảng màu và phông của landing/login (`StaffTopBar`).

**GĐ 4A — Điểm một phiên chơi (17/11/2026):**

- Quyết định: một ActivityVersion đánh giá **một** AssessmentCriterion (thay D8 “nhiều chỉ số”). `saveGameSchema.criterionCodes` dài đúng 1; màn lưu trò chọn một chỉ số. Hai trò cũ gắn 2 chỉ số: chấm theo chỉ số mã nhỏ nhất (`PlaySessionRepository.primaryCriterionCode`), không sửa dữ liệu. Bỏ Hint.
- Nhiệm vụ (item) lấy từ GameContent: COUNTING = 1 câu; MATCHING = mỗi cặp (lần thả sai tính cho `sourceId`); CLASSIFICATION = mỗi hình. F = đúng ngay lần đầu, R = sai rồi sửa đúng (một lần/nhiệm vụ). Engine hiện không khóa câu sai nên phiên COMPLETED luôn có F + R = N.
- Domain thuần `gameplay/domain/session-performance.ts`, `criterion-evaluation.ts`. Ghi `PlaySession.performance` + `CriterionEvaluation` (unique `sessionId`) trong cùng transaction chuyển COMPLETED. Phiên ABANDONED không chấm. Thời lượng = bắt đầu → hoàn thành (chưa có dữ liệu tạm dừng), không dùng tính điểm.
- Migration `20261117000300_criterion_evaluation` (thêm bảng/enum/cột, không đổi dữ liệu). Phiên COMPLETED trước migration được chấm bù bằng `pnpm --filter api db:backfill:evaluations` (chỉ thêm, chạy lại không trùng; phát lại event bằng engine trước khi chấm).
- Giáo viên: cột “Điểm chỉ số” ở lịch sử chơi của trẻ (điểm làm tròn 2 số khi hiển thị, F/R/N, nhãn “Chưa đủ 5 nhiệm vụ”).
- Để sau: LEVEL, summary (AI/RAG), CriterionState/SkillState/hồ sơ.

**GĐ 3 — Chỉ số theo nhiệm vụ:** mở rộng GameContent (phiên bản contract mới, không tạo contract song song); màn soạn trò chọn chỉ số cho từng nhiệm vụ; trò cũ mặc định theo D8.

**GĐ 4 — Đánh giá:** module `evaluation-profile` (Clean Architecture); `SessionPerformance` → `CriterionEvaluation` → `CriterionState` → `SkillState` → `ChildDevelopmentProfile` đúng công thức, ngưỡng, Evidence Window của `system.md`; lưu `ruleVersion`/`scopeVersion`; unit test theo ví dụ mục 4 của `system.md`; màn hồ sơ cho giáo viên.

## 5. Nhật ký

| Ngày | Việc | Kết quả |
|---|---|---|
| 16/11/2026 | Chốt yêu cầu, viết kế hoạch | — |
| 16/11/2026 | 1A: migration `20261116000100_classroom_enums`, `20261116000200_classroom` | VERIFIED/RUN: áp dụng trên DB dev; trước/sau vẫn 1 Child, 5 PlaySession, 23 InteractionEvent; có 3 AgeGroup, 3 grant mới, partial unique index. Đã sao lưu DB trước khi chạy. |
| 16/11/2026 | 1B: đăng nhập bằng mã, guard tách token trẻ/người lớn, gameplay dùng `ChildPrincipal` | VERIFIED/RUN: API typecheck, lint đạt; unit 168/178 (10 lỗi có sẵn từ trước ở `game-asset.dto.spec.ts`, chạy trên code chưa sửa cũng lỗi); e2e 63/63 (gồm `child-auth.e2e-spec.ts` mới); smoke test API dev: mã sai → 401. |
| 16/11/2026 | 1C: module `classrooms` (admin + giáo viên), cấp mã (thu hồi mọi phiên của trẻ), contract shared | VERIFIED/RUN: API typecheck, lint đạt; unit 175/185 (10 lỗi có sẵn ở `game-asset.dto.spec.ts`); e2e 68/68 (gồm `classrooms.e2e-spec.ts`); route mới trả 401 khi chưa đăng nhập trên API dev. `@lumikids/shared` test 32/40: 8 lỗi có sẵn ở kiểm tra GameContent, gỡ thay đổi vẫn lỗi y hệt. Integration `test/classrooms.integration.ts` **chưa chạy** (chưa có DB `_test`). |
| 16/11/2026 | 1D: web — đăng nhập bằng mã (`/login`, chế độ “Bé vào chơi”), phiên trẻ riêng (`ChildAuthProvider` dưới `/child`), màn admin `/admin/classrooms[/:id]`, màn giáo viên `/teacher/classrooms[/:id[/children/:childId]]`, hộp cấp mã + in thẻ | VERIFIED/RUN: web typecheck, eslint sạch; `pnpm --filter web test` qua hết (6 test mới); các route mới trả 200 trên web dev. **Chưa** thử trọn luồng trên trình duyệt với dữ liệu thật (cần tài khoản admin/giáo viên và tạo lớp, trẻ trong DB dev). |
| 16/11/2026 | 1E: tài liệu (`CLAUDE.md`, `CHILD_AUTH.md` viết lại, `AUTH.md`, `PRISMA.md`, `AI_HANDOFF.md`); bổ sung **trẻ chưa có lớp** (`GET /admin/children/unassigned`, chuyển lớp cho trẻ chưa có lớp = xếp lớp, khung "Trẻ chưa có lớp" ở trang lớp của Admin) vì hồ sơ Child cũ không có lớp nên không đưa vào lớp được | VERIFIED/RUN: tạo DB `lumikids_test` trong container Postgres (đã bật lại container đang dừng), `prisma migrate deploy` 11 migration lên **DB test**, integration 7/7 (`auth-sessions` + `classrooms`, fixture tự tạo và dọn, DB test về 0 dòng). API typecheck/lint đạt; unit 176/186 (10 lỗi có sẵn `game-asset.dto.spec.ts`); e2e 68/68; web typecheck/lint/test đạt; shared 32/40 và ai-client 10/12 — lỗi có sẵn ở kiểm tra GameContent, không thuộc thay đổi này. |
| 16/11/2026 | Lưu ý | Web `/child/games` chưa có đăng nhập bằng mã (thuộc 1D) nên trẻ tạm thời chưa chơi được trên web. Chưa trẻ nào có mã: cần admin xếp trẻ vào lớp rồi giáo viên cấp mã (API đã có, giao diện ở 1D). |
| 16/11/2026 | GĐ 2 API: migration giao bài (đã sao lưu DB dev trước, chạy DB test trước), module nhóm + bài giao + xin chơi lại, cổng chơi theo bài giao | VERIFIED/RUN: API typecheck/lint đạt; unit 185/195 (10 lỗi có sẵn `game-asset.dto.spec.ts`); e2e 70/70; integration 10/10 trên `lumikids_test` (DB test về 0 dòng); shared 36/44 (4 test mới qua, 8 lỗi GameContent có sẵn). DB dev sau migrate: số Child/PlaySession/InteractionEvent không đổi, có grant ASSIGN_ACTIVITIES. |
| 16/11/2026 | GĐ 2 web + làm lại giao diện admin/giáo viên/trẻ theo phong cách landing | VERIFIED/RUN: web typecheck, eslint sạch; `pnpm --filter web test` qua hết (thêm 2 test cách nói với trẻ và ngày giao bài); route mới trả 200 trên web dev; giao diện trẻ chụp bằng Chromium headless với dữ liệu giả (trang tạm, đã xóa) ở 1280px và 390px. **Chưa** thử trọn luồng giáo viên giao bài → trẻ chơi trên trình duyệt với dữ liệu thật (DB dev chưa có lớp nào). |
| 17/11/2026 | Admin: dashboard `/admin` (việc cần xử lý, chỉ số, lượt chơi 14 ngày, các lớp), quản lý tài khoản giáo viên `/admin/teachers`, tự đổi mật khẩu ở `/account`, đăng nhập về trang theo vai trò. Không đổi schema, không migration | VERIFIED/RUN: API typecheck, lint đạt; unit 195/205 (10 lỗi có sẵn `game-asset.dto.spec.ts`; 10 test mới qua); e2e 73/73 (gồm `admin.e2e-spec.ts`); integration 12/12 trên `lumikids_test` (gồm truy vấn SQL theo ngày giờ Việt Nam; DB test chỉ còn `ROLE_CHILD` do migration tạo); shared 36/44 (8 lỗi GameContent có sẵn); web typecheck, eslint sạch, test qua hết (thêm 3 test); route mới API trả 401 khi chưa đăng nhập, web 200. Dashboard chụp bằng Chromium headless với dữ liệu giả (trang tạm đã xóa) ở 1280px và 390px. **Chưa** thử với tài khoản admin thật trên trình duyệt. |
| 17/11/2026 | GĐ 4A: SessionPerformance + điểm CriterionEvaluation (1 chỉ số/phiên bản), cột điểm ở lịch sử chơi của giáo viên, màn lưu trò chọn 1 chỉ số | VERIFIED/RUN: sao lưu DB dev (`pg_dump`, ngoài repo) rồi `prisma migrate deploy` 14 migration; Child/PlaySession/InteractionEvent/ActivityVersion trước = sau (2/5/22/2). Backfill 3 phiên COMPLETED (66,67%, 87,5% cờ N<5, 91,67%, khớp tính tay); chạy lại 0 pending; 2 phiên ABANDONED không chấm. API typecheck/lint đạt; unit 209/219 (10 lỗi có sẵn `game-asset.dto.spec.ts`); e2e 73/73; web typecheck/lint/test đạt; shared 36/44 (8 lỗi GameContent có sẵn). **Chưa** chạy integration DB `_test` và chưa thử trên trình duyệt. |
| 17/11/2026 | Màn kết quả: Admin chỉ đọc lớp (tab trẻ & giáo viên / bài đã giao), kết quả chơi của trẻ, chi tiết bài; cả dòng bảng lớp bấm được (danh sách lớp, dashboard). Cột “Điểm · mức · nhận xét” dùng chung Admin/Giáo viên; mức/nhận xét hiện chỗ chờ khi NULL. Không schema, không migration. Phụ huynh để sau | VERIFIED/RUN: API typecheck/lint đạt; unit 209/219 (10 lỗi có sẵn `game-asset.dto.spec.ts`); e2e 74/74 (thêm test Admin chỉ đọc, giáo viên bị 403); web typecheck/lint/test đạt; route API mới trả 401 khi chưa đăng nhập, route web mới 200 trên dev. **Chưa** thử bằng tài khoản thật trên trình duyệt. |
| 20/11/2026 | Theo audit `system.md`: phụ huynh (đăng ký + mã xác minh email, hồ sơ con, mã đăng nhập khi con chưa có lớp, chọn trò ở nhà đúng nhóm tuổi, mã mời lớp + đồng ý chia sẻ `consent-v1`, giáo viên duyệt/từ chối, rời lớp rút đồng ý); giáo án thủ công (4 mục, khối hoạt động sắp xếp kéo-thả/nút, gắn trò, DRAFT→COMPLETE, nhân bản, lọc, `revision` chống ghi đè); R-01 nhóm tuổi trò ↔ tháng tuổi trẻ lúc mở bài; nút gợi ý (1 lần/nhiệm vụ, `REQUEST_HINT`, ScoreCE v2 `ce-score-v2` = (F + 0,5R + 0,25H)/N); hạn 30 s/yêu cầu sinh trò + p50/p95 ở trang mức dùng AI; Admin sửa năm học; chuyên môn giáo viên. Migration `20261120000200_family_lesson_enums`, `20261120000300_family_lesson_plans` | VERIFIED/RUN: thử migration trên DB nháp `lumikids_migrate_check` (đã xóa), rồi `migrate deploy` lên DB dev, `migrate diff --exit-code` = 0. **Không** sao lưu được DB dev trước khi chạy (`docker exec` lỗi quyền OCI). API typecheck đạt, lint exit 0 (2 cảnh báo có sẵn), unit 222/232 (10 lỗi có sẵn `game-asset.dto.spec.ts`); shared 36/44 (8 lỗi GameContent có sẵn); web typecheck, eslint `src` sạch, `pnpm --filter web test` 127/127. Integration: 12 skipped (chưa đặt `TEST_DATABASE_URL` trong phiên này). e2e và trình duyệt **chưa** chạy. Không gọi Gemini. |
| 26/11/2026 | Thao tác hàng loạt đầu năm học (contract `packages/shared/src/classroom-batch.ts`, tối đa 100 mục/lượt, kết quả `completedIds` + `skipped[{id, reason}]`, xử lý từng mục và không dừng cả lô khi một mục lỗi): giáo viên **duyệt nhiều yêu cầu vào lớp** (`POST /teacher/classrooms/:classId/join-requests/approve-batch`; chỉ chọn được yêu cầu đúng nhóm tuổi, khác tuổi → `AGE_REVIEW` để xem riêng; consent vẫn do từng phụ huynh xác nhận khi gửi); giáo viên **cấp mã lần đầu cho nhiều trẻ** (`POST /teacher/classrooms/:classId/children/initial-login-codes`; chỉ ghi khi trẻ chưa có mã và vẫn đang học lớp của giáo viên, trong một câu `updateMany` — không thay mã có sẵn, không thu hồi phiên; mã hiện một lần kèm in thẻ); Admin **xếp lớp nhiều hồ sơ do trường quản lý** ở `/admin/children` (`POST /admin/children/enrollments/batch`; hồ sơ có phụ huynh → `FAMILY_PROFILE`, phải đi qua lời mời). Phụ huynh mở link mời thấy ngay lớp, tạo hồ sơ con ngay trong luồng nếu chưa có. Không migration cho phần này | VERIFIED/RUN: API typecheck đạt, lint exit 0 (cảnh báo có sẵn ở `token-usage.service.spec.ts`); unit 311/321 (10 lỗi có sẵn `game-asset.dto.spec.ts`; thêm `class-invites.service.spec.ts` và test xếp lớp hàng loạt); e2e 87/87; web typecheck, lint exit 0 (1 cảnh báo có sẵn ở landing), `pnpm --filter web test` qua hết; shared 56/64 (8 lỗi GameContent vẫn còn sau khi build lại `dist`). Integration (`placeSchoolChild`, `insertFirstClassCode` trong `test/classrooms.integration.ts`) và trình duyệt **chưa** chạy. |
| 26/11/2026 | Migration + test tồn đọng + luyện ở nhà khi đã có lớp | VERIFIED/RUN: `prisma migrate deploy` 4 migration (`20261121000100_pattern_game_type`, `20261124120000_quantity_game`, `20261125010000_comparison_change`, `20261126000100_play_session_assignment`) lên DB dev (người dùng cho phép, không sao lưu theo yêu cầu) và DB `lumikids_test`; `migrate status` khớp. Sửa test cũ: `game-asset.dto.spec.ts` kiểm thông báo theo trường, `tests/game-content.test.mjs` tìm lỗi trong nhánh `invalid_union` (v1/v2) → API unit 323/323, shared 64/64, ai-client 13/13. Quyết định người dùng: phụ huynh chọn trò ở nhà cả khi con có lớp; mặc định giáo viên/Admin **không** thấy phiên `context=HOME` ở màn lớp (phiên cũ NULL vẫn hiện). `ChildAssignment.source` để màn trẻ tách "Bài cô giao"/"Bố mẹ chọn" (bài ở nhà hết giờ không có nút xin cô). API typecheck/lint, web typecheck/lint/test đạt; e2e 87/87; integration 16/16 trên `lumikids_test`. **Chưa** thử trên trình duyệt. |
| 27/11/2026 | Làm lại các màn danh sách của Admin (lớp, trẻ, giáo viên, phụ huynh): trạng thái lọc/sắp xếp/trang lưu trên URL, cột sắp xếp được (`aria-sort`), bộ lọc có nhãn, “Xóa n bộ lọc”, chọn hàng loạt qua nhiều trang (“Chọn cả N … phù hợp”), thanh thao tác dính, thẻ trên điện thoại. **Phân trang phía server** cho trẻ và phụ huynh: `GET /admin/children?q&classId(uuid\|none)&managed&code&status&sort(name\|dob\|createdAt)&dir&page&pageSize≤100` → `{items,total,counts}`, `GET /admin/children/ids` (tối đa 1000, cờ `truncated`); `GET /admin/guardian-accounts?q&status&children(UNPLACED\|NONE)&sort&dir&page&pageSize` + `/ids`. Lớp và giáo viên (ít bản ghi) tải một lần, lọc/phân trang ở client. Thanh phân trang luôn hiện khi có dữ liệu (khoảng đang xem, nút số trang có dấu …, chọn 10/25/50/100 dòng, lưu `?page=&size=`); danh sách trẻ trong trang chi tiết lớp cũng phân trang. Trẻ: xếp/chuyển lớp hàng loạt có xem trước (`POST /admin/children/enrollments/batch` nay chuyển cả trẻ đang ở lớp khác, giữ lịch sử; `SAME_CLASS`), khóa/mở khóa hàng loạt (`POST /admin/children/status/batch`, `UNCHANGED`), thêm trẻ chọn lớp trong hộp thoại; lô lớn gửi tuần tự 100 mục/lượt. Sửa lỗ hổng có sẵn: chuyển lớp đơn lẻ không còn đưa hồ sơ gia đình chưa có lớp vào lớp mà không qua đồng ý (`CHILD_FAMILY_MANAGED`). Lớp: tìm, lọc nhóm tuổi/“chưa có giáo viên”, tab trạng thái, “Thêm lớp” thành hộp thoại, nút “Xếp trẻ”. Không migration | VERIFIED/RUN: API typecheck, lint exit 0 (2 cảnh báo có sẵn), unit 326/326, e2e 88/88, integration 17/17 trên `lumikids_test` (lọc/sắp/trang trẻ và phụ huynh chạy trên Postgres thật); shared 64/64; web typecheck, lint exit 0 (1 cảnh báo có sẵn), test qua hết (thêm 3 test helper danh sách). Chụp Edge headless với dữ liệu giả chặn ở tầng mạng (1440px và 390px, không cuộn ngang, không lỗi console): 4 màn danh sách, thanh chọn hàng loạt, hộp xếp lớp có xem trước. Giới hạn: tìm tên ở server phân biệt dấu (`contains` không dấu cần `unaccent` = đổi schema, chưa làm); lọc client (lớp, giáo viên) thì không phân biệt dấu. **Chưa** thử với tài khoản Admin thật. |
| 28/11/2026 | Khóa đăng nhập sau 5 lần sai mật khẩu, 15 phút (FR-1.1 AC-02): `User.failedLoginCount`, `User.lockedUntil`, migration `20261127000100_login_lockout`. Khi đang khóa, mật khẩu đúng cũng bị từ chối với thông báo như sai mật khẩu, vẫn chạy băm. Đăng nhập đúng xóa bộ đếm. Chưa có Admin mở khóa thủ công | VERIFIED/RUN: sao lưu DB dev bằng `pg_dump` 16 (`~/lumikids-backups/dev-20261128-000117.dump`, 42 bảng, ngoài repo) trước khi migrate; `migrate deploy` lên DB dev và `lumikids_test`; unit 330/330 (thêm `auth.service.spec.ts` 4 test); integration 17/17; e2e 88/88 (mock Prisma của `auth.e2e-spec.ts` thêm `user.update`); typecheck và lint sạch. Chưa commit. |
| 28/11/2026 | Nhận xét giáo viên (FR-3.1): bảng `TeacherAssessment` (nháp/phát hành, chỉ số 42–52 kiểm cả ở CHECK của DB, kỳ đánh giá, tối đa 2000 ký tự) và `TeacherAssessmentRevision` (giá trị cũ, người sửa, lý do, lưu trong cùng giao dịch với lần sửa). API `/teacher/classrooms/:classId/children/:childId/assessments` (danh sách, tạo, chi tiết kèm lịch sử, sửa, phát hành, xóa nháp). Chỉ giáo viên đang phụ trách lớp mà trẻ đang học mới truy cập được; còn lại 404. Sửa bản đã phát hành bắt buộc có lý do. Không đụng SkillState. Migration `20261128000100_teacher_assessments` | VERIFIED/RUN: sao lưu DB dev (`~/lumikids-backups/dev-20261128-000707.dump`) trước khi migrate; `migrate deploy` lên dev và `lumikids_test`; `migrate diff` dev so với schema: không drift; unit 339/339 (thêm 9 test quy tắc nhận xét); integration 20/20 (thêm 3 test: luồng nháp→phát hành→sửa có lịch sử, chỉ xóa nháp, CHECK của DB); e2e 89/89 (thêm test 401/400/201/403); typecheck, lint sạch; shared 64/64. **Chưa có giao diện web** cho nhận xét và chưa có xuất cho phụ huynh (FR-4.3). Chưa commit. |
| 28/11/2026 | Giao diện nhận xét giáo viên: panel "Nhận xét của giáo viên" trên hồ sơ trẻ của giáo viên (`child-assessments-panel.tsx`): thêm, sửa (nháp; đã phát hành cần lý do), phát hành, xóa nháp, xem lịch sử sửa. Chỉ hiện ở màn giáo viên, không hiện cho Admin (chỉ đọc). | VERIFIED/RUN: `pnpm --filter web typecheck` không lỗi; `pnpm --filter web lint` 0 lỗi (1 cảnh báo có sẵn ở `landing/arctic-scene.ts`, không do thay đổi này); `pnpm --filter web test` đạt (cả các gói con). VERIFIED/CODE: luồng form/nút đọc từ code. UNKNOWN: chưa mở trình duyệt kiểm tra giao diện (chưa chụp ảnh màn hình). Chưa commit. |
| 28/11/2026 | Ba việc tiếp theo: (1) Tên chỉ số 42–52 theo QĐ 4222 hiển thị trên giao diện giáo viên và phụ huynh. (2) FR-4.3: phụ huynh (đã liên kết với trẻ) xem nhận xét ĐÃ PHÁT HÀNH, qua `GET /family/children/:childId/teacher-notes`; nháp và lịch sử sửa không lộ ra. (3) FR-1.1 AC-02: Admin mở khóa đăng nhập cho giáo viên và phụ huynh (`POST /admin/{teacher,guardian}-accounts/:userId/unlock`), nút chỉ hiện khi đang bị khóa; trường `lockedUntil` thêm vào DTO tài khoản. | VERIFIED/RUN: API typecheck 0 lỗi; lint sạch; unit 340/340 (thêm test phụ huynh không thấy nháp); e2e 89/89; integration 20/20 trên `lumikids_test`; web typecheck 0 lỗi; lint 0 lỗi (cảnh báo có sẵn); web test đạt; shared test 0 lỗi. Không có migration mới. UNKNOWN: chưa kiểm tra giao diện bằng trình duyệt. Chưa push. |
| 29/11/2026 | Quyền riêng tư và hỗ trợ (FR-1.7 AC-02): (1) Dashboard và danh sách trẻ của Admin chỉ tính trẻ thuộc trường (`Child.origin = SCHOOL` hoặc đang học lớp) và lượt chơi không phải `HOME`. Trẻ tạo bởi phụ huynh (`origin = FAMILY`) không vào số liệu của Admin. (2) Hỗ trợ có thời hạn: phụ huynh cho phép 1–72 giờ (`SupportGrant`), thu hồi được; Admin xem hồ sơ và lượt chơi ở nhà chỉ khi quyền còn hiệu lực, mỗi lần xem ghi `AuditLog` (`SUPPORT_DATA_VIEWED`). Mở khóa tài khoản giáo viên/phụ huynh cũng ghi `AuditLog` (`ACCOUNT_LOCK_CLEARED`). | VERIFIED/RUN: unit API 346/346 (thêm 6 test hỗ trợ); e2e 89/89; typecheck và lint API sạch; web typecheck sạch, test đạt. **CHƯA áp dụng migration `20261129000100_privacy_support` lên DB dev/test** (cần bạn cho phép; đã sao lưu `~/lumikids-backups/dev-20261129-005205-privacy.dump`). Trước khi migrate, API sẽ lỗi khi truy vấn cột `origin`. UNKNOWN: integration test cho dashboard và hỗ trợ chưa chạy; giao diện chưa xem bằng trình duyệt. Chưa làm: ghi AuditLog cho cấp/khóa mã đăng nhập trẻ (FR-1.5 AC-04); dev mode. |
| 29/11/2026 | Đã áp dụng migration `20261129000100_privacy_support` lên DB dev và `lumikids_test` (có phép của người dùng). | VERIFIED/RUN: `migrate deploy` thành công trên cả hai; `migrate diff` không lệch schema; integration 20/20 trên `lumikids_test`. UNKNOWN: câu SQL dashboard mới (`admin-overview.repository.ts`) chưa được chạy trên DB thật; cần kiểm tra bằng cách mở `/admin` trên dev. |
| 29/11/2026 | Ghi AuditLog khi cấp mã đăng nhập trẻ (FR-1.5 AC-04): `CHILD_LOGIN_CODE_ISSUED` với kênh `CLASS_INITIAL` (cấp đầu năm), `CLASS` (giáo viên cấp lại) hoặc `GUARDIAN` (phụ huynh); không lưu mã. | VERIFIED/RUN: unit API 346/346, e2e 89/89, integration 21/21 (trên `lumikids_test`), typecheck và lint API exit 0. UNKNOWN: API dev (cổng 4000) chạy bản trước thay đổi này; cần khởi động lại để có audit khi cấp mã. Chưa kiểm tra giao diện bằng trình duyệt. |
| 29/11/2026 | Hỗ trợ kỹ thuật cho Admin: mục "Hỗ trợ kỹ thuật" trên sidebar; trang `/admin/support` liệt kê các trẻ đang được phép hỗ trợ (API `GET /admin/support/grants`, ghi `SUPPORT_GRANTS_LISTED`) và mở hồ sơ theo mã. Đường dẫn xem hồ sơ đổi thành `/admin/support/children/:childId`. | VERIFIED/RUN: API test unit 347/347 (có test danh sách), typecheck/lint API exit 0; route trả 200 với tài khoản Admin dev, trả 401 khi chưa đăng nhập. UNKNOWN: giao diện chưa xem bằng trình duyệt. |
| 29/11/2026 | Quy tắc lớp và cấp mã (người dùng xác nhận): chỉ Admin tạo lớp; lớp phải có ít nhất một giáo viên phụ trách (tạo lớp bắt buộc chọn, không gỡ giáo viên cuối cùng, `CLASSROOM_NEEDS_TEACHER`); hồ sơ trẻ tạo không cần lớp (`classId` tùy chọn); cấp mã ở lớp: Admin và giáo viên; cấp mã ở nhà: phụ huynh và Admin (phụ huynh chỉ khi trẻ chưa có lớp). Admin cấp mã qua `POST /admin/children/:childId/login-code`, ghi audit kênh `ADMIN`. | VERIFIED/RUN: unit API 350/350 (có 3 test quy tắc giáo viên), e2e 89/89, integration 21/21; web typecheck sạch, test 10/10 file. Kiểm tra API dev: tạo lớp thiếu giáo viên trả 400; Admin cấp mã cho trẻ ở nhà trả 201. UNKNOWN: form tạo lớp và nút cấp mã của Admin chưa xem bằng trình duyệt; CLAUDE.md chưa cập nhật (chờ bạn cho phép). |
| 29/11/2026 | Dev mode (`APP_MODE=dev`, mặc định `standard`): khi bật trên máy local, Admin xem dashboard, danh sách trẻ và hồ sơ hỗ trợ gồm cả dữ liệu ở nhà, không cần quyền hỗ trợ; mỗi lượt xem vẫn ghi AuditLog với `devMode: true`. Server từ chối khởi động nếu `NODE_ENV=production` hoặc `DATABASE_URL` không trỏ localhost. Thao tác hàng loạt (chuyển lớp, đổi trạng thái) vẫn giới hạn trong phạm vi trường. | VERIFIED/RUN: unit API 351/351 (có 5 test an toàn cấu hình, 1 test dev mode hỗ trợ), e2e 89/89, integration 21/21; `APP_MODE=dev NODE_ENV=production` thoát với lỗi (exit 1); instance dev trên cổng 4999 trả 200 cho dashboard, danh sách (3 trẻ) và hồ sơ trẻ ở nhà, có audit `devMode: true`. UNKNOWN: nhánh dev không có quyền hỗ trợ chỉ kiểm tra bằng unit test vì quyền cũ vẫn còn hạn; giao diện chưa có banner báo dev mode. |
| 29/11/2026 | Khóa đăng nhập của trẻ (FR-1.5, đã xác nhận): Admin khóa khi trẻ đang học lớp, bắt buộc lý do (3–500 ký tự); khóa chỉ chặn đăng nhập bằng mã và thu hồi mọi phiên đang chạy, không ẩn hồ sơ hay dữ liệu. Giáo viên của lớp thấy danh sách trẻ bị khóa và lý do. Mở khóa giữ lịch sử. Bảng mới `ChildLoginLock` (migration `20261129000200_child_login_lock`). Ghi AuditLog `CHILD_LOGIN_LOCKED` / `CHILD_LOGIN_UNLOCKED`. | VERIFIED/RUN: migration áp dụng lên dev và `lumikids_test`, `migrate diff` không lệch; unit API 361/361 (5 test khóa), e2e 89/89, integration 21/21; API dev: khóa trả 201, trạng thái đúng, mở khóa trả `loginLocked: false` (trẻ đã được mở lại). Ảnh panel Admin trên trang chi tiết trẻ đã kiểm tra. UNKNOWN: panel giáo viên chưa xem bằng trình duyệt vì chưa có trẻ bị khóa trong lớp của giáo viên; thông báo chỉ là danh sách trên trang lớp, chưa có email hay đánh dấu đã đọc. |
