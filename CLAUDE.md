# LumiKids — chỉ dẫn cho Claude Code

## Bắt đầu
- Đọc [docs/AI_HANDOFF.md](docs/AI_HANDOFF.md), [docs/AGENTS.md](docs/AGENTS.md) và AGENTS.md áp dụng cho thư mục sắp sửa.
- Repository/Git là nguồn sự thật; README và roadmap có nhiều chức năng chưa triển khai.
- Kiểm tra `git status`, `git diff` và file untracked trước khi sửa. Không xóa/ghi đè công việc có sẵn.
- Cập nhật 13/11/2026: kho trò chơi, curriculum, CHILD Auth và gameplay (trẻ chơi + ghi log) đã commit trên nhánh `dev` (`136acc2`, `d7999de`).
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
- Kho chung Admin/Teacher; owner quản lý trò của mình, Admin quản lý toàn kho; phiên bản nội dung không sửa tại chỗ.
- Child là thực thể riêng (không kế thừa User), liên kết 1–1 với User ROLE_CHILD qua `Child.userId`; PlaySession gắn Child, không gắn User. Tài khoản CHILD thiếu hồ sơ Child nhận 409 `CHILD_PROFILE_MISSING`.
- CHILD chơi qua `/api/v1/gameplay/*` (PLAY_GAMES, SUBMIT_OWN_INTERACTIONS, READ_OWN_PLAY_SESSIONS); tạm thời chơi mọi trò có Activity ACTIVE vì chưa có ActivityAssignment. Không cấp kho authoring/Library/generation cho CHILD.
- Teacher không có READ_GAME_ASSETS/MANAGE_GAME_ASSETS; ảnh preview/kho/trò chơi của trẻ dùng scope riêng, bucket private.
- Runtime PREVIEW không lưu kết quả. Mode PLAY ghi event theo batch có thứ tự; server phát lại event bằng engine shared để tự tính result/attemptIndex/hoàn thành, từ chối kết quả lệch; eventId chống trùng. Client không tự ghi kết quả.
- SessionPerformance, đánh giá chỉ số/chuẩn và worker/queue chưa triển khai.

## Giới hạn thao tác AI
- Không tự cài thư viện, đổi schema/specification, chạy migration/seed/reset, xóa dữ liệu hoặc thay quyền ngoài phạm vi đã được cho phép.
- Không tự gọi Gemini/generation thật; quyền gọi thử phải được người dùng cho phép cụ thể. Các phép thử trước không cấp quyền lâu dài.
- Không in/copy secrets, password/hash, token, presigned URL hoặc giá trị env vào tài liệu/log/frontend. Không ghi đè env thật.
- Không đổi Auth/refresh, shared schema hoặc Runtime/Preview để lách lỗi thiếu học liệu/metadata.
- Không khẳng định test pass từ tên file hoặc báo cáo cũ; ghi rõ VERIFIED/CODE, VERIFIED/RUN, INFERRED, UNKNOWN.
- Không suy ra DB trống hoặc mất dữ liệu chỉ vì Docker/dịch vụ local đang tắt.
