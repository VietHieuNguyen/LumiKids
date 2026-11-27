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
