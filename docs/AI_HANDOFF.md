# LumiKids — AI HANDOFF cho Claude Code

Ngày audit: **12/11/2026**, cập nhật **13/11/2026** sau khi triển khai gameplay (trẻ chơi + ghi log). Asia/Bangkok, branch `dev`.
Trạng thái Git hiện tại: mọi công việc đã commit (`136acc2` kho trò chơi, `d7999de` gameplay) và push lên `origin/dev`.
**VERIFIED/CODE** = đã đối chiếu implementation; **VERIFIED/RUN** = có kết quả công cụ, ghi thời điểm; không đồng nghĩa production-ready.
**INFERRED** = nhận định từ code cần kiểm chứng; **UNKNOWN** = thiếu bằng chứng hoặc môi trường không cho phép xác minh.

## A. PROJECT OVERVIEW

- Mục tiêu dài hạn: thiết kế hoạt động cho trẻ mầm non 3–6 tuổi, thu thập tương tác, đánh giá và cá nhân hóa năng lực nhận thức.
- Phạm vi thực tế đã có: Auth → quản lý ảnh/metadata → AI sinh GameContent → validate → Preview → người lớn duyệt/chọn chỉ số → lưu kho chung → **trẻ chơi trò đã lưu, hệ thống ghi PlaySession/InteractionEvent**.
- Admin quản lý học liệu và toàn kho; Teacher tạo/lưu/dùng kho chung; Guardian hiện chỉ có quyền đọc tài khoản mình.
- CHILD có role, hồ sơ Child (bảng riêng, 1–1 với User) và màn hình `/child/games`; chơi mọi trò ACTIVE vì **chưa có giao bài (ActivityAssignment)**. Chưa có đánh giá năng lực.
- Ba loại trò: COUNTING, MATCHING, CLASSIFICATION. Skill = **Chuẩn**; AssessmentCriterion = **Chỉ số**; ActivityVersion = **phiên bản trò chơi**.

## B. ARCHITECTURE

| Thành phần | Implementation xác nhận từ code |
|---|---|
| Monorepo | pnpm 10.34.9, Turbo 2.11; workspaces `apps/*`, `packages/*`; Python chạy riêng |
| Web | Next.js 16.4.5/React 19.3, Tailwind 4, client-side Auth/authoring/runtime; `/` chuyển tới `/login` |
| API | NestJS 12 ESM, Express, Prisma 7.10/adapter-pg, CASL, JWT, Argon2id |
| AI | FastAPI/Pydantic, SDK google-genai 3.0; HTTP gateway, không query DB/upload ảnh |
| Contracts | Zod 4 trong shared; ai-client là HTTP client/contracts TS viết tay, không có bằng chứng pipeline OpenAPI codegen |
| Infra | Compose có PostgreSQL 16 và MinIO + persistent named volumes; không có Redis, worker hay pgvector extension |

```text
Web → Nest /api/v1 → GameAssetService/PostgreSQL (metadata ACTIVE)
                   → ai-client → FastAPI /v1/game-generation → Gemini Structured Output
                   ← schema + business validation + fresh asset check
Web ← GameContent + preview proof → scoped read-url → MinIO (presigned GET)
Web → game-library → PostgreSQL Activity/ActivityVersion/criteria → scoped saved-game images
Web (CHILD) → /gameplay/games (ACTIVE) → scoped image URLs → /gameplay/sessions → events batch
           → server replay bằng engine shared → PlaySession + InteractionEvent (PostgreSQL)
```

- Backend đăng ký Auth, Users, GameAsset, GameGeneration, Curriculum, LearningContent, Gameplay; xem `apps/api/src/app.module.ts`.
- CRUD thực tế dùng Controller/Service/Repository; generation là orchestration service + pure selection/validation functions.
- `gameplay` theo Clean Architecture: `domain/` (replay thuần), `application/` (service + port repository), `infrastructure/` (Prisma), `presentation/` (controller).
- Engine trò chơi thuần (`createInitialState`, `applyGameAction`, ...) nằm ở `packages/shared/src/game-runtime`, Web và API dùng chung; controller/renderer vẫn ở Web.
- Runtime dùng registry/dispatcher + pure engine/controller, renderer riêng; pairing dùng pointer/touch/custom hooks, không có dnd-kit dependency.
- JWT/role/permission guards toàn cục; permission không suy ra chỉ từ role. Resource ownership phải kiểm tra ở service.
- Evaluation-profile, BullMQ, RAG, 3D landing, shadcn, Dexie trong README/AGENTS là định hướng, chưa phải stack đã cài/triển khai.

## C. IMPLEMENTED FEATURES

| Chức năng | Luồng/file chịu trách nhiệm | Trạng thái và giới hạn |
|---|---|---|
| Authentication | `apps/api/src/modules/auth/auth.service.ts`, `auth.controller.ts`, `password.service.ts`, `auth-sessions.repository.ts`; Web `src/components/auth-provider.tsx`, `src/lib/auth-api.ts` | **Implemented/CODE**: login, JWT access, refresh cookie HttpOnly, rotation/replay revocation, logout; mật khẩu Argon2id, không nhận bcrypt để login |
| Authorization | `apps/api/src/common/security/ability.ts`, `modules/auth/guards/`, `modules/users/users.service.ts` | **Implemented/CODE**: permissions từ DB, CASL account ownership; có role guard cho endpoint admin; không dùng role thay toàn bộ permissions |
| CHILD Auth + hồ sơ | `modules/auth/child-permissions.ts`, `seed-child-development.ts`, migration CHILD + `20261113000100_gameplay` | **Implemented/CODE**: Auth, bảng Child (childId, fullName, dob, gender, userId unique); seed tạo hồ sơ khi có `SEED_CHILD_DOB`/`SEED_CHILD_GENDER`. Chưa có quan hệ trẻ–lớp–giám hộ |
| GameAsset | `modules/game-assets/game-asset.controller.ts`, `.service.ts`, `.repository.ts`, `dto/game-asset.dto.ts`; Web `features/game-assets/` | **Implemented/CODE**: upload, metadata, tìm kiếm/phân trang, ACTIVE/INACTIVE và read URL; upload PNG/JPEG/WebP, giới hạn mặc định 5 MiB; không có auto xóa nền trong pipeline |
| MinIO | `apps/api/src/common/storage/storage.service.ts`, `storage.config.ts`, `infra/minio/game-assets-policy.json` | **Implemented/CODE**: S3 upload, HEAD object trước ký URL, private/no-store, cleanup object nếu ghi metadata lỗi; trạng thái bucket/quyền/storage live hiện UNKNOWN |
| GameContent | `packages/shared/src/game-content/*.schema.ts`, `common.ts`, `asset-references.ts` | **Implemented/CODE**: schema/refs/cross-field refinements; contract v1 và v2 cùng tồn tại, xem D |
| COUNTING | shared `counting.schema.ts`, `game-runtime/counting.ts`; Web `components/counting-game.tsx` | **Implemented/CODE**: đếm tổng hoặc tập theo màu/loại đối tượng, có distractors; không chỉ động vật |
| MATCHING | shared `matching.schema.ts`, `game-runtime/matching.ts`; Web `model/matching-layout.ts`, `components/matching-game.tsx` | **Implemented/CODE**: pairing one-to-one; shuffle presentation, không sửa answer key; ghép đúng ẩn source, hiển thị source ở ô target, reset khôi phục |
| CLASSIFICATION | shared `classification.schema.ts`, `game-runtime/classification.ts`; Web `components/classification-game.tsx` | **Implemented/CODE**: v1 một nhóm/v2 nhiều nhóm đúng; item chỉ cần đặt một lần vào một nhóm được chấp nhận; ảnh môi trường hiển thị trọn (`contain`, khung 16:10) |
| Runtime chung | shared `game-runtime/engine.ts`; Web `features/game-runtime/game-runtime.tsx`, `registry.tsx`, `model/controller.ts` | **Implemented/CODE**: đúng/sai/completion/reset, callback hoàn tất một lần/lượt; nút toàn màn hình (Fullscreen API, dự phòng phủ kín cửa sổ); PREVIEW chỉ memory |
| Gameplay (trẻ chơi + log) | API `modules/gameplay/`, `learning-content/playable-game.service.ts`; Web `features/gameplay/`, `app/child/games/` | **Implemented/CODE + VERIFIED/RUN unit/e2e**: danh sách/chi tiết trò ACTIVE cho trẻ, ảnh scoped, start/abandon session, batch event có thứ tự, server replay, outbox Web retry/resync. VERIFIED/RUN 13/11 trên DB dev: trẻ chơi thật tạo 2 phiên COMPLETED (10 và 5 event, attemptIndex liên tục) và 2 phiên ABANDONED |
| Preview | `features/game-preview/game-preview.tsx`, `asset-resolver.ts`, `use-preview-assets.ts` | **Implemented/CODE**: dedup URL, hết hạn/renew, lỗi ảnh/retry, chặn chơi khi ảnh chưa sẵn sàng; retry ảnh không sinh lại game |
| AI generation | `modules/game-generation/game-generation.controller.ts`, `.service.ts`; `packages/ai-client/src/index.ts`; `services/ai/app/` | **Implemented/CODE**, live provider hiện UNKNOWN: bounded retry, structured JSON, validation nhiều lớp; không bảo đảm mọi prompt thành công |
| Teacher creation | `apps/web/src/app/teacher/games/create/page.tsx`, `features/game-creation/{api,controller,game-creator,types}` | **Implemented/CODE**: prompt dialog, full-width Preview/fullscreen, loading/error, regenerate; thất bại giữ draft/lượt cũ, thành công reset kể cả JSON giống |
| Curriculum + kho | `modules/curriculum/`, `modules/learning-content/`; shared `game-library.ts`, `cognitive-curriculum.ts`; Web `features/game-library/` | **Implemented/CODE**, persistence đã có bằng chứng lượt trước: save reviewed content, nhiều chỉ số, độ khó, kho chung, filter/page/detail, archive/restore; chưa sửa/create version tiếp theo |

- Web routes: `/account`, `/admin/game-assets`, `/admin/game-preview`, `/teacher/games`, `/admin/games`, `/<teacher|admin>/games/create`, `/<teacher|admin>/games/[versionId]`, `/child/games`, `/child/games/[versionId]` (mở sẵn chế độ phủ kín cửa sổ).
- Nút prompt mở native dialog; đổi độ khó/chỉ số không gọi AI. Form lưu nằm dưới bảng chơi; draft chưa lưu chỉ ở memory.
- UI trò ưu tiên hình ảnh/nút biểu tượng, vẫn có số và nhãn ARIA; các hàng thẻ cuộn ngang. Background hiện **một** file `/game-scenes/playroom-scene.webp`, không random ba ảnh.
- Quyền và account seed xem `docs/CHILD_AUTH.md`, `docs/SEED.md`; tài liệu bàn giao này không chép email đăng nhập, mật khẩu/hash hoặc token.

## D. IMPORTANT BUSINESS RULES

### 1. Asset metadata và truy hồi
- GameAsset có name, objectType, tags, attributes JSONB, status, objectKey; asset UUID khác local IDs của item/group/choice.
- Một asset có thể được lặp nhiều instance; không nhân bản file ảnh cho mỗi item.
- objectType mở rộng theo regex chữ hoa/số/gạch dưới, tối đa 40 ký tự; name tối đa 200, tags tối đa 30 × 50, attributes tối đa 16 KiB và depth 5.
- Tag `counting`/`matching`/`classification` không phải cờ cho phép loại trò; selection dựa metadata/intent/policy, không phân kho theo game type.
- Chỉ gửi AI projection `id`, `name`, `objectType`, `tags`, attributes whitelist; **không gửi bytes ảnh, URL, objectKey hoặc S3 credentials**.
- Whitelist chính xác trong `packages/shared/src/game-content/asset-metadata.ts`: color, shape, habitat, habitats, specificHabitats, animalType, aliases, matchKey, familyKey, variant, lifeStage, visualStyle, assetSet, category, material, size, number.
- `toCandidate`: tối đa 20 tags; arrays aliases/habitats/specificHabitats tối đa 12 phần tử × 40; scalar string tối đa 200, number finite/boolean. Metadata khác vẫn lưu được nhưng không vào AI.
- `number` là đặc điểm được mô tả, không tự quyết định đáp án đếm. Màu đếm lấy `attributes.color`, không suy ra từ pixels/tên/tag.
- Candidate selection: chuẩn hóa dấu tiếng Việt/đ, alias Việt–Anh + aliases metadata, parse intent/quantity → tối đa 32 search terms.
- Repository dùng SQL parameterized, ACTIVE-only, xếp relevance/diversity, tối đa 120 rows. Service score identity/metadata, chia bucket, reserve objects/colors/habitat hoặc cặp hoàn chỉnh, tối đa **40 candidates**.
- Đây là lexical/heuristic retrieval, không semantic/vector search. Alias mơ hồ, số lượng trái nhau hoặc thiếu asset/pair/habitat có thể bị chặn trước khi gọi AI.
- Policy loại SHADOW nếu không yêu cầu bóng; style được yêu cầu phải khai báo phù hợp. `animalType` chỉ thay identity cho ANIMAL hoặc legacy không category; học liệu khác dùng objectType.

### 2. Generate → Validate → Preview
- Endpoint `POST /api/v1/game-generation/generate`: JWT + GENERATE_GAME_CONTENT, prompt 1–2000 ký tự; guard rate 4/phút và in-flight theo user trong process.
- ai-client sinh JSON Schema từ **shared structure schemas**; bỏ một số constraint provider khó hỗ trợ, đổi const thành enum và hạn chế assetId bằng whitelist. Full refinements vẫn ở Nest.
- Python chỉ định nghĩa transport request/candidate, không có GameContent schema độc lập; dùng responseSchema của Nest cho Structured Output và jsonschema validation.
- SDK retry attempts=1; Nest tổng tối đa hai model calls/yêu cầu. Chỉ retry lỗi được phép (output invalid/timeout/transport/provider tạm thời); không retry quota/auth/config. Web không auto generation retry.
- Nest normalize đáp án/ảnh nhóm môi trường trong phạm vi candidate → validate shared schema + quantities/type/color/pairs/habitats → đọc lại asset hiện tại và validate metadata lần nữa.
- Thành công trả envelope data.gameContent + generation(requestId/model/attempts/reviewRequired/warnings/validatedAt/preview). Không tự lưu kết quả generation.
- Logs chỉ summary/diagnostic whitelist, không raw provider error/prompt/key/token; development log ở `.logs/game-generation.log` theo cwd API.
- `/health` FastAPI chỉ liveness, không chứng minh key/model/quota hoạt động. Thay env phải restart process tương ứng.

### 3. GameContent và ngữ nghĩa
- Shared canonical: COUNTING v1 đếm toàn bộ; v2 dùng countingRule ALL/COLOR/OBJECT_TYPE, countedItemIds phải đúng tập item được metadata chứng minh; OBJECT_TYPE có thể kèm màu.
- COUNTING: 1–20 displayed items, 2–6 lựa chọn số phân biệt (giá trị 0–20); correctChoiceId phải trỏ tới số lượng cần đếm. V2 không hỗ trợ target set rỗng.
- MATCHING v1: 1–20 source, số target tương ứng, pairs phủ toàn bộ hai phía đúng một lần; completionRule ALL_PAIRS_CORRECT.
- Bóng: source normal, target shadow, cùng nonempty matchKey; key biểu thị đúng hình/tư thế, không chỉ cùng loài. Dùng một matchKey tối đa một cặp/game.
- Trưởng thành/con non: lifeStage ADULT→YOUNG, cùng animalType + familyKey; không bắt hai ảnh có cùng matchKey. Style/assetSet đã khai báo phải tương thích theo policy.
- Identical có thể dùng cùng assetId hoặc matchKey. Generic matching không có quan hệ đủ rõ chỉ cảnh báo semantic; người lớn phải duyệt.
- CLASSIFICATION: 1–50 items, 2–10 groups; v1 correctGroupId, v2 correctGroupIds không rỗng/không trùng/tham chiếu hợp lệ. V2 cho phép nhóm không nhận item.
- Habitat lấy habitat/habitats/specificHabitats: terrestrial specifics suy ra LAND; SEA/RIVER/LAKE suy ra WATER; chiều ngược lại không đúng. ARCTIC khác ANTARCTIC, không tự suy ra LAND/WATER.
- Không coi cá nào cũng sống cả sông/biển; chỉ chấp nhận môi trường được khai báo. Một con khỉ có thể đúng cả FOREST/TREE nếu metadata chứng minh.
- normalizeHabitatAnswers bổ sung đủ nhóm đúng có bằng chứng, sửa/loại optional group image không phù hợp; không sửa mất unknown UUID để lách whitelist. Group asset phải là ENVIRONMENT/HABITAT phù hợp.
- UUID assetId khác IDs cục bộ; schemaVersion khác ActivityVersion.versionNumber; không thay contract v1 khi bổ sung v2.

### 4. Quyền, ảnh và kho
- Auth access token ở memory; refresh cookie HttpOnly, refresh token DB lưu verifier, rotation có khóa session và phát hiện replay; browser auth POST kiểm tra CSRF/origin.
- Admin có quyền asset/generation/kho; Teacher generation + đọc/lưu kho + own account; Guardian chỉ own account. CHILD có READ_OWN_ACCOUNT, PLAY_GAMES, SUBMIT_OWN_INTERACTIONS, READ_OWN_PLAY_SESSIONS.
- Quyền CHILD gửi/đọc session ánh xạ PlaySession với owner userId (lấy từ `Child.userId` trong DB); guard capability **không thay** service ownership. Phiên của trẻ khác trả 404.
- Preview ảnh Teacher: `POST /api/v1/game-generation/preview-assets/:id/read-url`, cần JWT/generation permission + previewToken đúng user/whitelist/audience/tokenUse, TTL một giờ; hết hạn 410/PREVIEW_ACCESS_EXPIRED.
- Proof có HMAC key dẫn xuất riêng từ Auth secret, không dùng thay access token; chỉ issue sau generation hợp lệ. Proof mới bind contentDigest, legacy không digest vẫn được nhận trong TTL.
- Kho ảnh: `GET /api/v1/game-library/:versionId/assets/:assetId/read-url` kiểm tra version được phép xem + asset trong content DB + ảnh ACTIVE; không cần proof generation cũ, không cấp Teacher quyền Library.
- Lưu cần READ_GAMES/SAVE_GAMES/GENERATE_GAME_CONTENT, reviewConfirmed=true, tên/độ khó và ≥1 chỉ số hợp lệ; proof + schema + tồn tại/ACTIVE được kiểm tra. Save không chạy lại toàn bộ semantic validation metadata mới.
- Save tạo Activity mới + ActivityVersion số 1; unique(createdBy,saveRequestId) + fingerprint chống trùng, retry cùng payload trả cùng trò, khác payload 409; nội dung version không có update API.
- ACTIVE kho chia sẻ mọi Teacher; ARCHIVED chỉ owner/Admin xem. Owner quản lý trò mình, MANAGE_ALL_GAMES cho Admin; đổi trạng thái Activity không sửa nội dung version.
- Chuẩn 15–17/Chỉ số 42–52, bỏ Chuẩn 18; Chỉ số 51 bỏ “gọi tên nhóm”. Nhiều chỉ số/game, độ khó do giáo viên chọn, không tự suy ra năng lực trẻ.

### 5. Gameplay và ghi log
- Bảng: `Child` (1–1 User ROLE_CHILD), `PlaySession` (childId, versionId, status IN_PROGRESS/COMPLETED/ABANDONED, startRequestId, eventCount, startedAt/endedAt/lastEventAt), `InteractionEvent` (eventId PK, eventType, actionData JSONB, result, attemptIndex, schemaVersion, clientTimestamp, receivedAt).
- API `/api/v1/gameplay`: `GET games`, `GET games/:versionId`, `GET games/:versionId/assets/:assetId/read-url` (PLAY_GAMES); `POST sessions` (idempotent theo startRequestId); `POST sessions/:id/events` và `POST sessions/:id/abandon` (SUBMIT_OWN_INTERACTIONS); `GET sessions/:id` (READ_OWN_PLAY_SESSIONS).
- Trẻ nhận content không kèm thông tin giáo viên (creator, mô tả, chỉ số) nhưng vẫn có đáp án để runtime phản hồi tức thì; tính toàn vẹn dữ liệu do server replay bảo đảm.
- Mở phiên mới tự đóng (ABANDONED) các phiên IN_PROGRESS khác của cùng trẻ; trò bị archive giữa chừng vẫn nhận event cho phiên đang chạy (version bất biến).
- Event phải đúng thứ tự `attemptIndex` (lệch → 409 `INTERACTION_OUT_OF_ORDER`); kết quả client khác server → 422 `INTERACTION_RESULT_MISMATCH`; eventId đã có cùng nội dung → tính là trùng, khác nội dung → 409. Tối đa 50 event/batch, 500 event/phiên.
- Hoàn thành chỉ do server suy ra; không có endpoint "complete". `clientTimestamp` chỉ để tham khảo, `receivedAt` là thời gian chuẩn.
- Lỗi public dùng `ApiProblem` với code tĩnh (`CHILD_PROFILE_MISSING`, `PLAY_SESSION_CLOSED`, `PLAY_SESSION_BUSY`, ...).

## E. CURRENT PROGRESS

- **VERIFIED/CODE**: authoring + Preview + kho/curriculum + gameplay (trẻ chơi, ghi PlaySession/InteractionEvent) đã có.
- Git 13/11/2026: branch `dev` trùng `origin/dev`, working tree sạch. Commit mới nhất: `d7999de` gameplay; `136acc2` kho trò chơi/curriculum/CHILD Auth; `0800962` creator UI; `d269f7e` backend generation; `012dbba` Auth.
- Chín migration: init Auth; generation permission; asset permissions; GameAsset; library permissions; library tables/catalog; CHILD enums; CHILD grants; gameplay (Child/PlaySession/InteractionEvent). **VERIFIED/RUN 13/11**: cả chín đã áp dụng trên DB dev; `prisma migrate diff` DB ↔ schema rỗng.
- Dữ liệu dev 13/11: 143 GameAsset (121 ACTIVE), 2 trò đã lưu, 4 tài khoản test (admin/teacher/guardian/child1), 1 hồ sơ Child. Môi trường có thể được khôi phục từ gói bàn giao (pg_dump + volume MinIO).
- Đã chốt khi làm gameplay: Child là bảng riêng 1–1 với User; tạm cho trẻ chơi mọi trò ACTIVE; server replay quyết định kết quả; SessionPerformance để sau.
- Chưa có Teacher/Guardian profile tables, lớp học/giao bài (ActivityAssignment/ActivityRecipient), SessionPerformance, Evaluation/CDP, worker, RAG, Publish hay chỉnh version nội dung tiếp theo.
- Chưa chốt: cơ chế giao bài/cho phép chơi theo lớp, scoring/criterion mapping, workflow publication.

## F. NEXT TASKS

1. **P0 tiếp nhận:** đọc CLAUDE/AGENTS, kiểm tra `git status`; khôi phục môi trường từ gói bàn giao nếu có, không reset hoặc seed full.
2. ~~User↔Child, endpoint trẻ, gameplay Clean Architecture, UI trẻ~~ — **đã xong 13/11** (xem mục C, D.5).
3. **P1:** integration test với DB `_test` cho gameplay (retry cùng batch, hai request song song cùng attemptIndex, rollback giữa batch).
4. **P1:** giao bài (ActivityAssignment/ActivityRecipient), lớp học, Guardian–Child; khi có giao bài, siết `PlayableGameService` để trẻ chỉ chơi trò được giao (một chỗ duy nhất).
5. **P2 đề xuất, chưa là yêu cầu được duyệt:** SessionPerformance (tính lại được từ InteractionEvent) → đánh giá chỉ số/chuẩn → profile; cần đặc tả scoring/criterion mapping và worker/queue trước khi triển khai.
7. **P2 đề xuất:** harden proof compatibility, save-time metadata drift, retrieval/prompt regression corpus, observability và kiểm tra storage/restore; không hứa mọi prompt sinh được game.
8. RAG/vector, chatbot nhiều lượt, AI image generation, auto xóa nền, offline queue và mobile app chưa triển khai; cần xác nhận phạm vi/dependencies trước khi làm.

## G. IMPORTANT FILE MAP

| Đường dẫn chính xác | Trách nhiệm/điểm đọc tiếp |
|---|---|
| `apps/api/src/main.ts`, `apps/api/src/app.module.ts` | bootstrap, đăng ký module; đừng bỏ GameAsset/GameGeneration khi thêm module |
| `apps/api/src/common/http/configure-http.ts`, `api-response.ts`, `api-problem.ts` | API prefix, CORS/validation, envelope và lỗi public |
| `apps/api/src/modules/game-assets/game-asset.controller.ts`, `game-asset.service.ts`, `game-asset.repository.ts` | upload/metadata/status, quyền và retrieval SQL |
| `apps/api/src/modules/game-assets/dto/game-asset.dto.ts` | constraints metadata/query, thông báo validation an toàn |
| `apps/api/src/modules/game-generation/game-generation.controller.ts`, `game-generation.service.ts` | endpoint, orchestration/retry, fresh validation, proof response |
| `apps/api/src/modules/game-generation/asset-selection.ts`, `asset-policy.ts` | aliases/intent/quantity, giới hạn candidates, style/pair policy |
| `apps/api/src/modules/game-generation/game-validation.ts`, `counting-validation.ts`, `habitat-validation.ts` | schema + semantic checks và normalize có phạm vi |
| `apps/api/src/modules/game-generation/game-preview-access.service.ts`, `content-digest.ts` | signed scope, TTL/user binding, content fingerprint |
| `packages/ai-client/src/index.ts` | transport contract, generated provider schema, bounded HTTP/error classification |
| `services/ai/app/main.py`, `gateway.py`, `prompts.py`, `contracts.py`, `config.py` | internal auth, SDK call/error, system rules, transport DTO và env |
| `packages/shared/src/index.ts`, `game-content/game-content.schema.ts` | public canonical exports, union schema/version dispatcher |
| `packages/shared/src/game-content/asset-metadata.ts`, `habitats.ts`, `interaction.schema.ts` | whitelist, habitat ontology, runtime interaction contract |
| `apps/web/src/features/game-creation/api.ts`, `controller.ts`, `game-creator.tsx` | request/proof reader, memory lifecycle/cancel, prompt/Preview/Save layout |
| `apps/web/src/features/game-preview/game-preview.tsx`, `asset-resolver.ts`, `use-preview-assets.ts` | canonical boundary, URL/error/retry/cache lifecycle |
| `packages/shared/src/game-runtime/engine.ts`, `apps/web/src/features/game-runtime/registry.tsx`, `model/controller.ts` | pure state transitions (dùng chung Web + API), game dispatch, callbacks/reset |
| `apps/api/src/modules/gameplay/domain/session-replay.ts`, `application/gameplay.service.ts`, `infrastructure/prisma-play-session.repository.ts`, `presentation/gameplay.controller.ts` | replay/ordering/dedup, ownership + start/submit/abandon, transaction + optimistic concurrency, HTTP |
| `apps/api/src/modules/learning-content/playable-game.service.ts`, `packages/shared/src/gameplay.ts` | projection trò cho trẻ + ảnh scoped; contracts Zod gameplay |
| `apps/web/src/features/gameplay/event-outbox.ts`, `child-play-page.tsx`, `api.ts` | hàng đợi event có thứ tự/retry/resync, trang chơi, client API |
| `apps/web/src/features/game-runtime/components/matching-card-rail.tsx`, `matching-game.tsx`, `classification-game.tsx`, `counting-game.tsx` | horizontal picture interactions/renderers |
| `apps/web/src/app/globals.css`, `features/game-runtime/model/backgrounds.ts` | styles/overrides và background; SVG/icon sizing phải rõ ràng |
| `apps/api/src/modules/learning-content/game-library.controller.ts`, `game-library.service.ts`, `game-library.repository.ts` | save/idempotency, ownership, list/detail/status/scoped URLs |
| `apps/api/src/modules/curriculum/curriculum.service.ts`, `packages/shared/src/cognitive-curriculum.ts`, `game-library.ts` | catalog validation, approved 3 standards/11 indices, shared save/list DTO |
| `apps/web/src/features/game-library/save-game-panel.tsx`, `library-page.tsx`, `game-detail-page.tsx`, `api.ts` | review/criteria selection, shared library UI and saved Preview |
| `apps/api/src/common/security/ability.ts`, `modules/auth/child-permissions.ts`, `seed-child-development.ts` | capability/ownership, least-privilege child grants, targeted local seed |
| `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, `apps/api/prisma.config.ts` | actual data model/history, generated client/env loading |
| `docs/ASSET_METADATA.md`, `ASSET_METADATA_CHATGPT_PROMPT.txt`, `GAME_GENERATION.md`, `GAME_LIBRARY.md`, `CHILD_AUTH.md` | hướng dẫn chuyên biệt; không thay source làm bằng chứng trạng thái live |

## H. DEVELOPMENT & VERIFICATION

### Khởi động và kiểm tra
Runtime xác nhận bằng lệnh read-only audit: pnpm 10.34.9, Node 22.20.0, Python 3.12.5; metadata venv có FastAPI 0.162.2, google-genai 3.0.0, pytest 9.2.0, uvicorn 0.54.0.
Các lệnh đối chiếu package scripts/entry points (không chạy build/test/start lại trong audit):
```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
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
- Chỉ start infra khi người dùng muốn khởi động môi trường; không chạy trùng server. `pnpm dev` chỉ chạy các pnpm apps, không FastAPI/Docker.
- Python dùng requirements.txt/requirements-dev.txt, không có pyproject.toml/uv lock. Dependencies mới/install cần xin phép; không tự đổi version đang pin.
- `pnpm --filter api test:integration` cần TEST_DATABASE_URL local riêng tên `_test`; test ghi/xóa fixtures, không fallback DB development hoặc tự migration.
- `pnpm --filter api exec prisma migrate status` read-only nhưng hiện thất bại; generate/validate khác với migrate deploy. Không chạy seed/deploy/reset không có phép.
- API/Web scripts có thể build shared/generate client hoặc ghi dist/.next; Web production build không chạy đồng thời Web dev. Full seed đổi mật khẩu/session người lớn, không dùng làm health check.

### Biến môi trường — chỉ tên, không giá trị
- API: PORT, DATABASE_URL, JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE, JWT_ACCESS_TTL_SECONDS, AUTH_REFRESH_TTL_SECONDS, AUTH_ALLOWED_ORIGINS, AUTH_COOKIE_SECURE, AUTH_COOKIE_SAME_SITE, AUTH_RATE_LIMIT, AUTH_RATE_TTL_MS.
- Storage/API: S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE, S3_READ_URL_TTL_SECONDS, GAME_ASSET_MAX_SIZE_BYTES.
- AI bridge/API: AI_SERVICE_URL, AI_SERVICE_TOKEN, AI_SERVICE_TIMEOUT_MS. Web: NEXT_PUBLIC_API_URL.
- Python: GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_MS, GEMINI_MAX_OUTPUT_TOKENS, AI_SERVICE_TOKEN. Key Gemini chỉ ở service AI.
- Infra: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, MINIO_BUCKET, MINIO_API_PORT, MINIO_CONSOLE_PORT.
- Test/seed: TEST_DATABASE_URL, SEED_ADMIN_PASSWORD, SEED_TEACHER_PASSWORD, SEED_GUARDIAN_PASSWORD, SEED_CHILD_PASSWORD, SEED_CHILD_DOB, SEED_CHILD_GENDER; NODE_ENV chọn môi trường.
- Xem `.env.example` tương ứng, không mở/in env thật để viết handoff. Nest ưu tiên env theo môi trường trước base; Python BaseSettings nạp base rồi override theo môi trường; process env có ưu tiên.

### Bằng chứng kiểm tra và giới hạn
- **VERIFIED—công cụ lượt Codex trước, 12/11**: 17 ca library/proof offline; 8 ca ability/password; API typecheck/build/lint mục tiêu và Web typecheck/lint mục tiêu đã đạt. Không coi là full suite rerun sau mọi sửa đổi.
- Lượt trước: real API kiểm tra role scopes, CHILD login/refresh/logout, Teacher vẫn bị chặn Library; transaction DB thật kiểm tra save/multiple criteria/retry/archive/restore và rollback, không giữ fixture game.
- Lượt trước: Edge headless với intercepted fixtures kiểm tra UI desktop/mobile/save và giữ tiến độ sau token refresh. Đây không phải Gemini live hay browser E2E với DB/storage thật.
- Các báo cáo ở `docs/GAME_LIBRARY.md`, `docs/CHILD_AUTH.md`; script/ảnh QA bổ sung trong `tmp/` bị ignore và có thể không đi cùng clone, không phải test suite chính thức.
- **VERIFIED/RUN 13/11 (sau gameplay)**: API typecheck/lint đạt, unit gameplay 14/14, e2e 58/58; Web typecheck/lint đạt, test runtime 23/23, outbox 5/5.
- **Lỗi có sẵn, không do gameplay (INFERRED từ file không bị sửa):** shared test 8 ca thông báo lỗi schema union v1/v2; API `game-asset.dto.spec.ts` 10 ca; Web `game-creation.test.mjs` 1 ca còn tìm tiêu đề "AI Game Creator" đã đổi tên.
- Generation thật với cấu hình hiện tại và Python suite: **UNKNOWN** (không chạy lại).

## I. KNOWN ISSUES & RISKS

- **VERIFIED—lượt trước, đã sửa:** cả Library/generation từng trả 404 vì hai module bị bỏ khỏi AppModule; hiện code đã đăng ký lại. Thông báo UI “không tìm thấy ảnh” khi đó không chứng minh ảnh bị xóa. Audit này không tái hiện thêm bug chức năng đang mở.
- **Môi trường:** nếu Docker/dịch vụ tắt hoặc `prisma migrate status` lỗi kết nối, không kết luận DB mất dữ liệu và không tự khắc phục bằng reset. Ngày 13/11 Docker, PostgreSQL và MinIO chạy bình thường.
- **VERIFIED/CODE:** in-flight/rate-limit state theo process; chưa có shared queue/lock cho nhiều API instances. Timeout Web/Nest/Python khác nhau và retry có thể tốn thêm quota.
- **VERIFIED/CODE:** legacy proof không bind digest vẫn được nhận trong TTL; saved content không snapshot file/metadata. Save chỉ check asset availability, không tái chạy toàn bộ semantic validation; cần quyết định xử lý metadata drift.
- **VERIFIED/CODE:** mutable/inactive/missing assets có thể khiến trò đã lưu không chơi được. Storage HEAD và lỗi ảnh vẫn phải được xử lý; presigned URL là bearer capability tới lúc hết hạn.
- **INFERRED:** CLASSIFICATION cho phép group không có assetId trong khi UI trẻ ẩn chữ; nhóm thiếu ảnh có thể khó nhận biết dù schema hợp lệ, cần kiểm tra UX cụ thể.
- **VERIFIED/CODE:** lexical/regex parsing phụ thuộc aliases, metadata quality và Vietnamese wording; không có vision/semantic grounding cho mọi câu hỏi. Metadata đúng cấu trúc chưa bảo đảm đúng sinh học/sư phạm.
- **UNKNOWN:** khả năng Gemini generateContent của project/model hiện tại, billing/quota/region/schema acceptance; tên model trong danh mục hoặc `/health` 200 không chứng minh generation hoạt động.
- **VERIFIED/CODE:** chưa có auto background removal, assessment/scoring/publish; không trình bày các ý tưởng trong README như chức năng hoàn chỉnh.
- **VERIFIED/CODE (gameplay):** content gửi trẻ chứa đáp án (để phản hồi tức thì); trẻ chơi mọi trò ACTIVE cho tới khi có giao bài; event chưa gửi kịp khi đóng tab có thể mất (gửi best-effort bằng `keepalive`); chưa có resume phiên sau khi tải lại trang (mở phiên mới).
- **VERIFIED/CODE (gameplay):** khi trò chơi ở chế độ phủ kín/toàn màn hình, khung báo lỗi ảnh và nút "Thử tải lại ảnh" nằm phía sau; phải thu nhỏ mới thấy.
- Rate-limit/ThrottlerGuard và optimistic concurrency hoạt động trên một process; nhiều API instance vẫn đúng dữ liệu nhờ ràng buộc DB nhưng giới hạn tốc độ là theo process.
- **UNKNOWN:** deployment/HTTPS, tablet/touch thực tế, load/concurrency nhiều node, backup/restore và production observability; không thấy ObserveModule được đăng ký.
