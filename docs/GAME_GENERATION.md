# AI Game Generation Backend — Bước 6A

> Sửa nhận diện Matching (2026-11-11): từ “cặp” trong “ghép cặp”, “ghép từng/các/thành/theo cặp” là tên thao tác, không yêu cầu học liệu BACKPACK. Cụm “cặp sách” vẫn nhận diện học liệu bình thường. Alias đầy đủ được Library khai báo có thể thay tên built-in không có identity trong tập candidate khi khớp đúng cùng đoạn văn bản; không tự suy quan hệ loài. Nếu cùng một đoạn alias trỏ tới hai identity còn khả dụng thì trả PROMPT_AMBIGUOUS. Hai học liệu TORTOISE ACTIVE đã thêm aliases “rùa”, “con rùa”, giữ NORMAL/SHADOW và TORTOISE_POSE_01. Bản sao trước cập nhật và journal ở `tmp/shadow-tortoise-alias-before.json`, `tmp/shadow-tortoise-alias-applied.jsonl` (ignored). Prompt 5 loài trong ảnh đã chọn đủ cặp và validate offline; không gọi Gemini.


> Bộ chọn hiện lọc ảnh bóng theo yêu cầu, ưu tiên đủ đối tượng/cặp trong giới hạn candidate, kiểm tra matchKey/familyKey/lifeStage và visualStyle. Bài môi trường có đầy đủ bằng chứng được chuẩn hóa đáp án từ metadata trước khi validate. Xem [ASSET_METADATA.md](./ASSET_METADATA.md) và prompt metadata để copy sang ChatGPT Web được liên kết trong đó.

> COUNTING sinh mới dùng v2: đếm ALL, COLOR hoặc OBJECT_TYPE; kiểm tra tập item đích bằng metadata, số lượng từng loại và số lựa chọn theo yêu cầu. Xem [COUNTING_V2.md](./COUNTING_V2.md). MATCHING vẫn v1, CLASSIFICATION vẫn v2.

> Cập nhật mới: CLASSIFICATION sinh v2 với nhiều nhóm đúng; candidate hỗ trợ `habitats`/`specificHabitats` có giới hạn và kiểm chứng theo metadata. Phần mô tả v1/single-answer và scalar-only bên dưới là lịch sử triển khai. Xem [CLASSIFICATION_V2.md](./CLASSIFICATION_V2.md) cho contract và cách chuẩn bị ảnh hiện tại.

> Cập nhật Bước 6B: response generation bổ sung `generation.preview: {token, expiresAt}` để cấp URL giới hạn đúng asset trong nội dung vừa sinh cho chính tài khoản đó. API nội bộ Web → Nest `POST /api/v1/game-generation/preview-assets/:id/read-url` yêu cầu access JWT, GENERATE_GAME_CONTENT và proof. Không cấp quyền Library cho Teacher. Trang tạo/chơi thử đã có tại `/teacher/games/create`; xem [GAME_CREATION_UI.md](./GAME_CREATION_UI.md).

## Phạm vi và contract

`POST http://localhost:4000/api/v1/game-generation/generate` nhận JSON:

```json
{
  "gameType": "CLASSIFICATION",
  "prompt": "Tạo trò chơi phân loại 6 quả bóng gồm 3 quả đỏ và 3 quả xanh dương vào hai giỏ tương ứng."
}
```

Header: `Authorization: Bearer <access token Auth hiện có>` và `Content-Type: application/json`.
Chỉ chấp nhận `gameType` và `prompt`; prompt được trim, dài 1–2000 ký tự. Ba GameType được lấy từ Zod shared. HTTP body tiếp tục chịu giới hạn JSON mặc định 100 KiB của Express/Nest; không tăng giới hạn cho API hiện có.

Quyền bắt buộc: **GENERATE_GAME_CONTENT**. Seed trước đây đã cấp quyền này cho Admin và Teacher, Guardian không có. Role ADMIN đơn lẻ không bỏ qua permission. Không tạo permission/migration/seed mới. Endpoint giới hạn 4 request/phút/IP theo Throttler hiện có và một request đang xử lý/tài khoản trong một process; chưa có limiter phân tán.

Response HTTP 200 dùng envelope hiện có:

```json
{
  "success": true,
  "code": "OK",
  "message": "Request successful.",
  "data": {
    "gameType": "CLASSIFICATION",
    "gameContent": { "...": "GameContent v1 hợp lệ theo schema Bước 4A" },
    "generation": {
      "requestId": "UUID tương quan với logs",
      "model": "model lấy từ environment AI Service",
      "attempts": 1,
      "reviewRequired": true,
      "warnings": ["ADULT_REVIEW_REQUIRED", "FREE_TEXT_CONSTRAINTS_REQUIRE_REVIEW"],
      "validatedAt": "ISO timestamp"
    }
  }
}
```

Khối `gameContent` ở trên minh họa vị trí dữ liệu, không phải JSON trò chơi mẫu để chạy. Response thực tế chứa đầy đủ nội dung đã validate. Không trả candidate list, system prompt, credentials hay URL ảnh. Không tạo PlaySession, ActivityVersion, draft hoặc kết quả đánh giá. Mọi kết quả AI cần người lớn xem lại.

## Kiến trúc

```text
Client đã đăng nhập
  → NestJS GameGenerationController: guard + request validation + throttle
  → GameGenerationService
      → GameAssetService: metadata-only, kiểm tra GENERATE_GAME_CONTENT
          → GameAssetRepository: SELECT PostgreSQL, chỉ candidate ACTIVE
      → @lumikids/ai-client: HTTP + token nội bộ + timeout + contract validation
          → FastAPI /v1/game-generation
              → prompt template + Google GenAI SDK + Structured Output
      → Zod GameContent đầy đủ + business/metadata checks + asset whitelist
      → đọc lại asset, kiểm tra ACTIVE và metadata hiện tại
  → GameContent để truyền vào GamePreview hiện có
```

`services/ai` và `packages/ai-client` ban đầu chỉ có `.gitkeep`. Bước này hoàn thiện FastAPI gateway và client HTTP có runtime contracts; không thêm queue hoặc service thứ hai. Nest không giữ Gemini key và không gọi Gemini trực tiếp. Web không gọi FastAPI. Không đổi shared GameContent, renderer hoặc Preview.

`gameResponseSchema()` sinh schema theo GameType từ các `*ContentStructureSchema` shared bằng `z.toJSONSchema`. Adapter đổi `const` thành enum một giá trị, giới hạn mọi `assetId` bằng enum candidate, bỏ format/pattern/string length khỏi schema gửi provider. Những ràng buộc đó cùng các cross-field refinements vẫn được kiểm tra đầy đủ bằng **gameContentSchema** sau khi AI trả về. Không có bản định nghĩa GameContent Python độc lập.

FastAPI chỉ có transport models Pydantic. Nó parse JSON trực tiếp, kiểm tra generated JSON Schema, xử lý lỗi provider; business rules cuối cùng thuộc Nest. Client TS nhỏ được kiểm tra tương thích với Pydantic bằng test liên ngôn ngữ; chưa có pipeline sinh toàn bộ client từ OpenAPI. Có thể lấy OpenAPI của FastAPI để bổ sung generator khi có thêm endpoint, không ảnh hưởng GameContent.

## Cấu hình local

Yêu cầu Node/pnpm hiện có và Python **3.11 trở lên** (đã kiểm tra bằng Python 3.12). Dependencies Python nằm trong `.venv` riêng.

Từ repository root:

```powershell
pnpm install --frozen-lockfile
python -m venv services/ai/.venv
services/ai/.venv/Scripts/python.exe -m pip install -r services/ai/requirements-dev.txt
if (!(Test-Path services/ai/.env.development)) {
  Copy-Item services/ai/.env.example services/ai/.env.development
}
```

Nếu `.venv` đã tồn tại thì dùng lại, không cần tạo lại. Tự điền `services/ai/.env.development`:

```dotenv
GEMINI_API_KEY=<API key tự tạo trong Google AI Studio>
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_MS=20000
GEMINI_MAX_OUTPUT_TOKENS=8192
AI_SERVICE_TOKEN=<chuỗi ngẫu nhiên tối thiểu 32 ký tự>
```

Bổ sung vào **apps/api/.env.development** hiện có, giữ nguyên Auth/PostgreSQL/S3:

```dotenv
AI_SERVICE_URL=http://127.0.0.1:8000
AI_SERVICE_TOKEN=<cùng chuỗi AI_SERVICE_TOKEN ở AI Service>
AI_SERVICE_TIMEOUT_MS=25000
```

Không thêm GEMINI_API_KEY vào API/Web hoặc biến `NEXT_PUBLIC_*`. `.env*` thật và `.venv` đã được Git ignore; `.env.example` được giữ lại. Không có secret thật được tạo/ghi trong bước này. Environment tiến trình ưu tiên cao nhất; `.env.${NODE_ENV}` (mặc định development) ưu tiên hơn `.env`. FastAPI tìm file theo thư mục service, không phụ thuộc cwd.

Khi API chưa cấu hình URL/token, Auth và các module khác vẫn khởi động được; endpoint generation trả `AI_NOT_CONFIGURED`. Token/URL sai định dạng nếu được điền sẽ bị chặn bằng thông báo cấu hình đã làm sạch. Key Gemini thiếu được báo khi gọi generation, không gọi SDK khi khởi động. `/health` chỉ là liveness, không chứng minh key hợp lệ.

Chạy hai terminal từ repository root:

```powershell
# Terminal 1: chỉ bind loopback cho gateway nội bộ
services/ai/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir services/ai --host 127.0.0.1 --port 8000 --reload --log-level info
```

```powershell
# Terminal 2: PostgreSQL/MinIO và cấu hình cũ cần sẵn sàng
pnpm --filter api start:dev
```

Không chạy thêm server trùng cổng nếu server cũ còn hoạt động. Gateway không được publish trực tiếp ra internet; nếu tách máy/container, cấu hình URL mạng nội bộ và HTTPS phù hợp. Token nội bộ chỉ nằm ở hai backend. FastAPI không bật CORS cho Web.

Model cấu hình qua environment để đổi khi tài khoản/model không còn khả dụng. Không tự thay model lúc lỗi hoặc gọi thêm model khác. SDK chính thức được pin trong `requirements.txt`; tài liệu tham chiếu: [Google GenAI Python SDK](https://github.com/googleapis/python-genai), [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output).

Mẫu cấu hình đã được cập nhật từ `gemini-2.5-flash` sang `gemini-3.5-flash-lite` khi xử lý lỗi provider 404. Google đánh dấu 2.5 Flash deprecated, giới hạn cho project từng dùng và nêu 3.5 Flash Lite làm model thay thế; xem [deprecations](https://ai.google.dev/gemini-api/docs/deprecations). API liệt kê model chỉ xác nhận danh mục trả về, không chứng minh mọi lời gọi generateContent chắc chắn thành công cho project. Không tự generate để thử model; cần người dùng chủ động cho phép sử dụng quota.

Gateway không gửi `temperature`, `top_p`, `top_k` hoặc `candidate_count`; Gemini 3.5 Flash Lite yêu cầu bỏ các sampling parameters deprecated theo [migration guide](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.6#migrate-to-gemini-3-5-flash-lite). Giữ mặc định thinking của model và Structured Output như cũ. Việc bỏ temperature cũng tương thích với model cũ còn được cấu hình riêng.

Adapter JSON Schema gửi provider cũng bỏ `minItems`, `maxItems`, `minimum`, `maximum` để giảm số trạng thái constrained decoding, đặc biệt với mảng item chứa mảng nhóm đúng của CLASSIFICATION v2. Đây là điều chỉnh tương thích theo [giới hạn Structured Output](https://ai.google.dev/gemini-api/docs/structured-output#simplifying-complex-schemas), không phải nới contract: Nest vẫn validate mọi giới hạn bằng shared schema đầy đủ, cùng whitelist asset và giới hạn output/body hiện có. HTTP 400 không kèm chẩn đoán cụ thể chưa đủ chứng minh schema là nguyên nhân; không tự gọi thêm generation để xác nhận khi chưa được phép.

Trong development, summary generation còn được ghi vào `apps/api/.logs/game-generation.log` (khi chạy API bằng scripts pnpm hiện có). File chỉ chứa requestId, GameType, thời gian xử lý, status, attempts/retries và diagnostic đã whitelist; không chứa prompt, userId, key, token, candidate hoặc raw provider error. Thư mục được Git ignore. `PROVIDER_PRECONDITION_FAILED` phân biệt Google FAILED_PRECONDITION với từ chối request chung; `REGION_UNSUPPORTED` nhận diện lỗi vùng đã biết. Không diễn giải một 400 chung thành sai key hoặc lỗi JSON Schema khi chưa có bằng chứng.

## Chuẩn bị asset và cách lựa chọn

Dùng Library Admin hiện có để upload ảnh và metadata; endpoint generation không upload/seed hoặc thay đổi status. Ví dụ cho bài phân loại 6 bóng:

| Vai trò ảnh | objectType | attributes | tags gợi ý |
|---|---|---|---|
| Bóng đỏ | BALL | `{"color":"RED","shape":"CIRCLE"}` | ball, red |
| Bóng xanh dương | BALL | `{"color":"BLUE","shape":"CIRCLE"}` | ball, blue |
| Giỏ đỏ nếu prompt yêu cầu hình giỏ | BASKET | `{"color":"RED"}` | basket, red |
| Giỏ xanh dương nếu prompt yêu cầu hình giỏ | BASKET | `{"color":"BLUE"}` | basket, blue |

Một ảnh bóng đỏ có thể được tham chiếu bởi ba item có `id` khác nhau; không tạo ba object MinIO. Group `assetId` vẫn optional theo Bước 4A. Nếu không có ảnh giỏ, mô tả “hai nhóm” thay vì yêu cầu hình giỏ.

Với MATCHING hình bóng, nên dùng `objectType=CAT`/`CAT_SHADOW`, cùng `animalType=CAT`, `matchKey=cat`, `variant=NORMAL`/`SHADOW`; tương tự DOG. MatchKey phải giống nhau cho cặp đúng. Metadata thiếu không được coi là bằng chứng nội dung chắc chắn đúng.

Lựa chọn asset hiện là tìm kiếm metadata, **chưa phải semantic search**:

1. Tách Unicode tokens, bỏ stopwords, chuẩn hóa dấu tiếng Việt cho truy vấn.
2. Mở rộng một số alias Việt/Anh cho object/color/shape/habitat phổ biến. Phân biệt dấu trong nhận diện concept để “cho trẻ” không bị hiểu thành “chó”, “đồ vật” không thành “đỏ”; “hình bóng” không thành BALL.
3. Tìm trên `name`, `objectType`, `tags`, `attributes` trong PostgreSQL bằng SQL parameterized, chỉ ACTIVE; không cần extension/migration.
4. Lấy tối đa 120 dòng, ưu tiên đa dạng loại/màu/hình/variant, rồi rank và chọn tối đa 40 candidate. Không load toàn Library ra Nest.
5. Gửi id/name/objectType/tags và whitelist scalar metadata (`color`, `shape`, `habitat`, `animalType`, `matchKey`, `variant`, `category`, `material`, `size`, `number`). Không gửi objectKey, presigned URL, creator hay credentials.
6. Kiểm tra coverage cho các object/color đã nhận diện, số lượng giới hạn và nhu cầu hình bóng. Thiếu tài nguyên trả 422 trước khi gọi model.

Các từ khóa mới vẫn tìm được qua metadata, không bắt buộc nằm trong alias. Tuy nhiên synonyms mới, yêu cầu quan hệ phức tạp, phủ định hoặc metadata không nhất quán có thể cần chỉnh prompt/metadata. Alias object hiện có BALL/APPLE/CAT/DOG/FISH/BIRD/LION/PIG/ELEPHANT/TIGER/RABBIT/BEAR/MONKEY/COW/HORSE/CHICKEN/DUCK/TURTLE/BASKET, không phải danh sách objectType được phép trong hệ thống. Danh sách object alias dùng chung cho mở rộng truy vấn, kiểm tra đủ tài nguyên và validation kết quả AI; thêm một alias không cần cập nhật allowlist riêng ở validator. Search có giới hạn nên Library rất lớn có thể cần cải tiến ranking/phân trang truy hồi. Không tự tuyên bố hiểu đầy đủ mọi prompt tiếng Việt.

**Tên đối tượng và tag loại trò chơi:** `counting`, `matching`, `classification` là tags mô tả tùy chọn, không phải quyền hoặc điều kiện bắt buộc để ảnh được dùng trong GameType tương ứng. Truy hồi cần khớp đối tượng trong prompt. Ví dụ metadata `name=LION`, `objectType=LION`, `tags=["lion"]` khớp “sư tử” qua alias; một ảnh ACTIVE được dùng lại cho 5 item COUNTING với ID riêng. Thêm `counting` vào ảnh PIG không làm ảnh đó phù hợp với prompt đếm sư tử. Các từ “chọn đáp án đúng từ … lựa chọn” được bỏ khỏi từ khóa truy hồi để giảm nhiễu.

Với đối tượng chưa có alias Việt/Anh, đặt tên tiếng Việt (ví dụ `name=Tàu vũ trụ`, `objectType=SPACECRAFT`) hoặc bổ sung tag tiếng Việt (`"tàu vũ trụ"`) để khớp prompt. Không phải sửa code/migration để cho phép objectType mới. Chỉ có metadata tiếng Anh và tag `counting` thì hệ thống chưa tự dịch mọi danh từ tiếng Việt sang tiếng Anh. MATCHING vẫn cần đủ cặp/metadata quan hệ; CLASSIFICATION cần đủ đối tượng và đặc điểm phân nhóm phù hợp. Tag GameType không thay thế những kiểm tra này.

“Xanh” được xác định theo metadata nếu chỉ có BLUE hoặc GREEN trong candidate; nếu cả hai hoặc chưa xác định được thì trả `PROMPT_AMBIGUOUS`. Nên dùng “xanh dương”/“xanh lá”. Số lượng số học được kiểm tra cho các mẫu tường minh như “6 quả … gồm 3 quả đỏ và 3 quả xanh dương”, cùng số nhóm/giỏ. Những ràng buộc tự nhiên khác vẫn cần người lớn xem lại (`FREE_TEXT_CONSTRAINTS_REQUIRE_REVIEW`).

## Validation và lỗi

- Full shared Zod validation: version, strict fields, IDs unique, reference tồn tại, cardinality và CompletionRule.
- COUNTING: `correctChoiceId` thuộc choices, value bằng số instance; không so label hiển thị.
- MATCHING: one-to-one đầy đủ; đối chiếu `matchKey`/`animalType` nếu có, kiểm tra vai trò shadow khi được yêu cầu.
- CLASSIFICATION: group refs hợp lệ, không group rỗng, đối chiếu màu/hình/môi trường từ metadata với group label hoặc group asset. RED vào BLUE bị chặn; label group trái metadata ảnh giỏ cũng bị chặn.
- Mọi assetId phải thuộc candidate ban đầu; sau generation đọc lại PostgreSQL để phát hiện asset mất/INACTIVE hoặc metadata thay đổi gây mâu thuẫn. Không đổi status. Đây là kiểm tra tại thời điểm trả kết quả, không khóa asset vô thời hạn.
- Thiếu bằng chứng semantic có warnings, luôn `reviewRequired=true`; backend không kiểm chứng pixel ảnh hoặc mọi quan hệ trong lời văn.
- CLASSIFICATION v2 thuần môi trường có thể chuẩn hóa đáp án từ metadata đầy đủ và sửa ảnh minh họa nhóm bị AI chọn sai: chỉ dùng ảnh ENVIRONMENT/HABITAT phù hợp trong candidate whitelist, ưu tiên mã cụ thể; không có thì giữ nhãn và bỏ assetId tùy chọn. Không đổi ảnh item hay ID/nhãn nhóm. Cảnh báo `METADATA_ANSWERS_NORMALIZED` và `GROUP_IMAGES_NORMALIZED` được hiển thị trong Creator. Nhãn mơ hồ, ID ngoài whitelist hoặc thiếu bằng chứng item vẫn bị từ chối; kiểm tra metadata cuối cùng chỉ validate, không tự sửa. Không tăng số lần gọi model.

Mỗi generation tối đa **hai lần gọi model** (một lần thử lại). Nest sở hữu retry; ai-client và SDK không tự nhân retry. Chỉ retry timeout/kết nối/provider tạm thời hoặc JSON/schema/business output sai có thể sửa. Lần sửa nhận mã lỗi đã làm sạch, không nhận raw provider output. Không retry quota/rate limit Gemini, credentials, cấu hình, safety hoặc output bị cắt vì token limit. Sau timeout xử lý/đóng connection theo SDK; không có queue nền.

| Code public | HTTP | Xử lý |
|---|---:|---|
| ASSETS_INSUFFICIENT | 422 | Bổ sung ảnh ACTIVE và metadata hoặc đổi prompt |
| PROMPT_AMBIGUOUS / PROMPT_OUT_OF_RANGE | 422 | Làm rõ màu hoặc giảm số lượng |
| ASSETS_CHANGED | 409 | Tài nguyên thay đổi trong lúc model chạy; tạo lại |
| AI_NOT_CONFIGURED / AI_PROVIDER_CONFIG_ERROR | 503 | Kiểm tra URL, token, key, model và phiên bản SDK |
| AI_PROVIDER_AUTH_ERROR | 503 | Kiểm tra API key/quyền provider |
| AI_QUOTA_EXCEEDED | 429 | Kiểm tra quota hoặc thử lại sau |
| AI_TIMEOUT | 504 | Thử lại hoặc giảm độ phức tạp |
| AI_SERVICE_UNAVAILABLE | 503 | Khởi động/kiểm tra mạng AI Service |
| AI_OUTPUT_INVALID / AI_CONTRACT_INVALID | 502 | Không trả JSON lỗi cho Runtime |
| AI_OUTPUT_BLOCKED | 422 | Điều chỉnh prompt |
| AI_OUTPUT_TRUNCATED | 502 | Giảm số item hoặc điều chỉnh output token limit |
| GENERATION_BUSY / TOO_MANY_REQUESTS | 429 | Đợi request trước/giới hạn tốc độ |

ApiExceptionFilter chỉ cho phép mã/message public tĩnh của ApiProblem; lỗi 5xx khác tiếp tục được che như trước. Không đưa exception SDK hoặc validation body vào response/log. Logs generation gồm requestId, GameType, duration, status, attempts/retries; không log prompt, JWT, candidate payload hay credentials.

Khi provider từ chối request, summary log Nest còn có `providerStatus` và `category` đã whitelist (không phải raw provider message). `INVALID_API_KEY` chỉ ra key bị từ chối; `MODEL_OR_ENDPOINT_UNAVAILABLE` chỉ ra HTTP 404 từ provider; `STRUCTURED_OUTPUT_SCHEMA_REJECTED` chỉ ra schema output bị từ chối; `API_NOT_ENABLED`/`BILLING_CONFIGURATION` chỉ ra cấu hình Google project; `INTERNAL_TOKEN_REJECTED` là lỗi token giữa Nest và FastAPI. `PROVIDER_REQUEST_REJECTED` là trường hợp chưa phân loại được. Các trường này chỉ phục vụ log backend, không trả ra giao diện. Cần restart cả API và AI Service khi cập nhật client contract để thấy chẩn đoán mới.

## Kiểm thử và dùng cho Bước 6B

Offline từ root (không dùng Gemini key/quota và không kết nối DB):

```powershell
pnpm --filter @lumikids/ai-client test
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api build
services/ai/.venv/Scripts/python.exe -m pytest -q services/ai
```

Test Python dùng Node để lấy schema thực tế: chạy build workspace trước nếu chạy riêng:

```powershell
pnpm --filter @lumikids/shared build
pnpm --filter @lumikids/ai-client build
```

Unit/HTTP tests mock database, storage, AI transport hoặc SDK, bao gồm cả transport timeout và provider lỗi. Không có test tự động dùng API key thật, migration, reset hay seed. Không import code khởi động server khi test.

Kết quả kiểm tra khi triển khai: 115 API unit tests, 47 HTTP/E2E tests, 11 AI-client tests và 24 Python tests đạt; build/typecheck/Oxlint đạt. Truy vấn candidate và projection metadata cũng đã được kiểm tra trên PostgreSQL hiện cấu hình trong transaction `READ ONLY`; không thực hiện ghi dữ liệu. Chưa gọi Gemini thật.

Sau khi bạn tự cấu hình key và **chủ động sử dụng quota**, dùng Postman đăng nhập qua Auth lấy access token rồi gửi endpoint trên. Ba prompt gợi ý (cần asset phù hợp):

- COUNTING: “Tạo trò chơi đếm 4 quả bóng đỏ, có 3 lựa chọn đáp án.”
- MATCHING: “Ghép con mèo và con chó với hình bóng tương ứng.”
- CLASSIFICATION: prompt 6 bóng/2 giỏ ở đầu tài liệu, hoặc đổi giỏ thành nhóm nếu chưa có hình giỏ.

Quan sát GameContent, attempt/warnings, đổi metadata để kiểm tra phản hồi thiếu học liệu. Không gửi yêu cầu thật trong script CI. Bước triển khai này chưa xác nhận chất lượng generation/quota với Gemini thật.

Bước 6B chỉ cần gọi endpoint này bằng API client có access token, lấy **data.gameContent** và truyền vào `GamePreview content={...}` từ Bước 4C. Preview tiếp tục resolve/renew presigned URLs bằng GameAsset Backend, không dùng URL từ AI. `generation.reviewRequired` và warnings giúp giao diện nhắc người lớn xem lại. Chưa làm Teacher Prompt UI ở Bước 6A.

**Quyền ở Bước 6B:** Theo xác nhận riêng của bạn, Teacher xem ảnh của nội dung vừa được sinh qua API scoped, gắn userId và asset whitelist, có thời hạn 1 giờ. Teacher vẫn không có READ_GAME_ASSETS; API Library/URL Library vẫn 403. Xem GAME_CREATION_UI.md để biết contract và tests; không mở bucket public.

## Các file tạo/sửa

- Tạo `apps/api/src/modules/game-generation/`: controller, service, module, DTO pipe, asset-selection, game-validation và unit tests.
- Tạo `apps/api/src/common/config/ai.config.ts`, `common/http/api-problem.ts`, `modules/game-assets/dto/generation-asset.ts`, `test/game-generation.e2e-spec.ts`.
- Sửa `apps/api/src/app.module.ts`, `common/http/api-response.ts`, `modules/game-assets/game-asset.repository.ts`, `game-asset.service.ts` để tích hợp tối thiểu, `apps/api/.env.example`, `apps/api/package.json`.
- Tạo `packages/ai-client/package.json`, `tsconfig.json`, `src/index.ts`, `tests/client.test.mjs`.
- Tạo `services/ai/app/{__init__,config,contracts,prompts,gateway,main}.py`, `.env.example`, `requirements.txt`, `requirements-dev.txt`, `pytest.ini`, `tests/test_generation.py`, `README.md`.
- Cập nhật `pnpm-lock.yaml`, `docs/SETUP.md`; tạo tài liệu này.

Không sửa migration, schema Prisma/shared, Runtime, Frontend hoặc Docker Compose. `.gitkeep` cũ được giữ nguyên.
