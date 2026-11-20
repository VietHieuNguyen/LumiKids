# LumiKids — chỉ dẫn cho Claude Code

## Bắt đầu
- Đọc [docs/AI_HANDOFF.md](docs/AI_HANDOFF.md), [docs/AGENTS.md](docs/AGENTS.md) và AGENTS.md áp dụng cho thư mục sắp sửa.
- Repository/Git là nguồn sự thật; README và roadmap có nhiều chức năng chưa triển khai.
- Kiểm tra `git status`, `git diff` và file untracked trước khi sửa. Không xóa/ghi đè công việc có sẵn.
- Cập nhật 13/11/2026: kho trò chơi, curriculum, CHILD Auth và gameplay (trẻ chơi + ghi log) đã commit trên nhánh `dev` (`136acc2`, `d7999de`).
- Cập nhật 16/11/2026: lớp học, Child tách khỏi User và đăng nhập bằng mã đã commit trên `feat/classroom` (`aa720d9`, `b57e80b`, `eec6565`); GĐ 2 (giao bài, nhóm, xin chơi lại) và giao diện mới theo phong cách landing đang làm, chưa commit. Theo dõi ở [docs/CLASSROOM_PLAN.md](docs/CLASSROOM_PLAN.md), chi tiết đăng nhập trẻ ở [docs/CHILD_AUTH.md](docs/CHILD_AUTH.md).
- Môi trường local có thể được khôi phục từ gói bàn giao (DB dump + volume MinIO); không reset/seed lại để "làm sạch".

## Mục tiêu và stack thực tế
- Nền tảng giáo dục mầm non, trọng tâm nhận thức: giáo viên tạo trò từ prompt + học liệu, duyệt, chơi thử và lưu kho chung; trẻ chơi trò đã lưu và hệ thống ghi PlaySession/InteractionEvent làm dữ liệu cho đánh giá sau này.
- Monorepo pnpm Workspaces + Turborepo; Windows/PowerShell, Node >=22.12, pnpm 10.34.9.
- `apps/web`: Next.js 16, React 19, TypeScript, Tailwind 4; renderer trò chơi và UI soạn/quản lý.
- `apps/api`: NestJS 12 ESM + Express, Prisma 7/adapter-pg, CASL, JWT; nghiệp vụ và phân quyền.
- `services/ai`: Python FastAPI/Pydantic, Google GenAI SDK chính thức; chạy riêng, không thuộc pnpm workspace.
- `packages/shared`: Zod/types GameContent, interaction, kho, contracts gameplay và engine trò chơi thuần (`src/game-runtime`, dùng chung Web + API); `packages/ai-client`: HTTP client/contracts TS viết trong repo.
- `infra/docker-compose.yml`: PostgreSQL 16 và MinIO. Chưa có Redis/BullMQ/pgvector chạy trong kiến trúc hiện tại.

## Lệnh từ repository root
Các lệnh dưới đã đối chiếu scripts/entry point; phân biệt kết quả chạy trước đây và audit hiện tại tại handoff mục H.

```powershell
pnpm --filter api start:dev
pnpm --filter web dev
services/ai/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir services/ai --host 127.0.0.1 --port 8000 --reload --log-level info
pnpm build
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm --filter api lint
pnpm --filter web lint
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter web test
pnpm --filter @lumikids/shared test
pnpm --filter @lumikids/ai-client test
services/ai/.venv/Scripts/python.exe -B -m pytest services/ai -p no:cacheprovider
```

- `pnpm dev` chạy API/Web qua Turbo, không tự chạy FastAPI hoặc Docker. Tránh server trùng cổng 3000/4000/8000.
- Không chạy Web production build vào `.next` khi Web dev đang dùng thư mục đó.
- Integration DB: `pnpm --filter api test:integration`, cần TEST_DATABASE_URL riêng, local, tên kết thúc `_test`; có ghi/xóa fixture.
- Migration/seed không phải lệnh kiểm tra vô hại. Chỉ chạy khi người dùng cho phép; full seed đổi mật khẩu/thu hồi session tài khoản test.

## Quy ước và kiến trúc
- TS strict, không `any`; camelCase cho biến, PascalCase cho class/type, file backend kebab-case.
- Backend ESM import tương đối đuôi `.js`; Python snake_case, type hints. Giữ conventions thực tế của file hiện hữu.
- API tests dùng Vitest/`vi`, Web dùng Node test runner/TSX loader, Python dùng pytest; không gọi chúng là Jest tests.
- CRUD dùng Controller → Service → Repository/Prisma; cross-module qua exported service.
- `apps/api/src/modules/gameplay` theo Clean Architecture (domain/application/infrastructure/presentation) như docs/AGENTS.md; domain không import Prisma/Nest. Module evaluation-profile chưa có.
- Nest config dùng `registerAs` + inject typed config; không đọc env trực tiếp trong service/controller.
- Web → Nest → FastAPI → Gemini; Web không gọi FastAPI/Gemini trực tiếp. Python không sở hữu DB nghiệp vụ.

## Business invariants
- GameContent canonical ở shared; COUNTING/CLASSIFICATION hỗ trợ v1/v2, MATCHING v1. Không tạo contract song song.
- Asset ID UUID khác local item/group/choice ID; một ảnh được dùng nhiều instance.
- COUNTING trả đáp án số; v2 đếm đúng tập countedItemIds theo ALL/COLOR/OBJECT_TYPE, giữ hình gây nhiễu.
- MATCHING one-to-one đầy đủ; bóng dùng matchKey, trưởng thành/con non dùng familyKey + animalType + lifeStage.
- CLASSIFICATION v2 chấp nhận bất kỳ nhóm nào trong correctGroupIds; môi trường phải có bằng chứng metadata.
- Generation chỉ dùng asset ACTIVE/whitelist, kiểm tra lại metadata sau AI; tối đa hai lần gọi model/yêu cầu, không tự retry key/quota/config.
- Luôn cần người lớn duyệt. Skill = Chuẩn, AssessmentCriterion = Chỉ số, ActivityVersion = phiên bản trò chơi.
- Chỉ dùng Chuẩn 15–17/Chỉ số 42–52; Chỉ số 51 không có yêu cầu gọi tên nhóm. Độ khó do người lớn chọn.
- Kho chung Admin/Teacher; owner quản lý trò của mình, Admin quản lý toàn kho; phiên bản nội dung không sửa tại chỗ. Mỗi trò có một nhóm tuổi (`Activity.ageGroupId`); chỉ giao được cho trẻ có tháng tuổi trong [minAge×12, maxAge×12) tại ngày mở bài (R-01).
- Child là thực thể riêng, **không gắn User** (không email/mật khẩu, không `Child.userId`); PlaySession gắn Child. Trẻ đăng nhập bằng mã cá nhân do giáo viên lớp hiện tại cấp (chỉ lưu HMAC, hiện một lần, cấp mới thu hồi mã và phiên cũ); phiên riêng `ChildAuthSession`, cookie `lumikids_child_refresh`, JWT `tokenUse: child_access`. Route trẻ dùng `@ChildRoute()`; token sai loại nhận 403.
- Lớp: Admin tạo năm học/lớp (AgeGroup), nhiều giáo viên/lớp; mỗi trẻ đúng một lớp đang học, chuyển lớp giữ lịch sử `ClassroomEnrollment`. Giáo viên chỉ xem lớp mình và lượt chơi trong khoảng trẻ học lớp đó.
- Trẻ chơi qua `/api/v1/gameplay/*` (PLAY_GAMES, SUBMIT_OWN_INTERACTIONS, READ_OWN_PLAY_SESSIONS) và **chỉ** mở được trò thuộc bài giao (`ActivityAssignment`) đang mở của lớp hiện tại hoặc được gia hạn; cổng duy nhất `AssignmentsService.playableVersionIds`. Không cấp kho authoring/Library/generation cho trẻ.
- Giao bài (quyền `ASSIGN_ACTIVITIES`, Teacher): cả lớp / nhóm cố định / trẻ chọn, người nhận chụp lúc giao; `opensAt`, `dueAt` tùy chọn. Hoàn thành không lưu — tính từ PlaySession COMPLETED từ `opensAt`, mỗi trò ≥ 1 lần (tính cả sau hạn). Sau hạn: trẻ xin chơi lại → giáo viên duyệt kèm hạn mới (`extendedUntil`), hoặc giao lại cho trẻ chọn.
- Admin xem **chỉ đọc** mọi lớp: `/admin/classrooms/:classId` (tab trẻ & giáo viên / bài đã giao), kết quả chơi của trẻ `…/children/:childId`, chi tiết bài `…/assignments/:assignmentId` (API `/admin/classrooms/:classId/{children/:childId[/play-sessions],assignments[/:id]}`, `MANAGE_CLASSROOMS`). Cấp mã, giao/gia hạn/duyệt/hủy bài vẫn chỉ giáo viên. Phụ huynh (`/family`, `MANAGE_FAMILY`) tự đăng ký + xác minh email, quản lý hồ sơ con qua `GuardianChild`, cấp mã và chọn trò ở nhà (`source=GUARDIAN`, `classId` NULL) chỉ khi con **chưa có lớp**; xin vào lớp bằng mã mời + đồng ý chia sẻ, giáo viên duyệt; rời lớp rút đồng ý và giáo viên không còn thấy lượt chơi.
- Admin: dashboard `/admin` (`GET /admin/overview`, `MANAGE_CLASSROOMS`) chỉ đọc, tính lúc gọi theo ngày giờ Việt Nam, không lưu; quản lý giáo viên `/admin/teachers` (`MANAGE_USERS`): mật khẩu tạm hiện một lần, khóa/đặt lại mật khẩu thu hồi phiên. Người lớn tự đổi mật khẩu `POST /auth/password` (thu hồi mọi phiên). Đăng nhập chung `/login`, tự về trang theo quyền.
- Teacher không có READ_GAME_ASSETS/MANAGE_GAME_ASSETS; ảnh preview/kho/trò chơi của trẻ dùng scope riêng, bucket private.
- Runtime PREVIEW không lưu kết quả. Mode PLAY ghi event theo batch có thứ tự; server phát lại event bằng engine shared để tự tính result/attemptIndex/hoàn thành, từ chối kết quả lệch; eventId chống trùng. Client không tự ghi kết quả.
- Mỗi ActivityVersion đánh giá **đúng một** chỉ số (lưu trò chỉ nhận 1 `criterionCode`; trò cũ nhiều chỉ số chấm theo mã nhỏ nhất). Khi PlaySession COMPLETED, server tính SessionPerformance từ InteractionEvent (lưu `PlaySession.performance`) và ghi **một** `CriterionEvaluation`/phiên trong cùng transaction: ScoreCE = (F + 0,5R + 0,25H)/N × 100 (H = nhiệm vụ đúng sau khi xin gợi ý; mỗi nhiệm vụ một gợi ý, event `REQUEST_HINT` không có result), giữ số chưa làm tròn, `ruleVersion` `ce-score-v2` (bản cũ `ce-score-v1` giữ nguyên), cờ `minimumItemsMet` (N ≥ 5). Phiên bỏ dở không chấm. `level`/`summary` để NULL; giáo viên chỉ đọc điểm đã lưu.
- LEVEL, CriterionState, SkillState, hồ sơ phát triển, RAG/LLM và worker/queue chưa triển khai.

## Giới hạn thao tác AI
- Không tự cài thư viện, đổi schema/specification, chạy migration/seed/reset, xóa dữ liệu hoặc thay quyền ngoài phạm vi đã được cho phép.
- Không tự gọi Gemini/generation thật; quyền gọi thử phải được người dùng cho phép cụ thể. Các phép thử trước không cấp quyền lâu dài.
- Không in/copy secrets, password/hash, token, presigned URL hoặc giá trị env vào tài liệu/log/frontend. Không ghi đè env thật.
- Không đổi Auth/refresh, shared schema hoặc Runtime/Preview để lách lỗi thiếu học liệu/metadata.
- Không khẳng định test pass từ tên file hoặc báo cáo cũ; ghi rõ VERIFIED/CODE, VERIFIED/RUN, INFERRED, UNKNOWN.
- Không suy ra DB trống hoặc mất dữ liệu chỉ vì Docker/dịch vụ local đang tắt.
