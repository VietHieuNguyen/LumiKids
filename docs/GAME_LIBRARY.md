# Kho trò chơi chung — Admin và Teacher

## Nghiệp vụ và dữ liệu

Skill = **Chuẩn**; AssessmentCriterion = **Chỉ số**; ActivityVersion = **phiên bản trò chơi**.

Danh mục có Chuẩn 15–17, Chỉ số 42–52. Không có Chuẩn 18/Chỉ số 53–54. Chỉ số 51 là “Phân loại một số sự vật thành nhóm theo đặc điểm chung.”

Sau generation, giáo viên/Admin chơi thử, chọn độ khó, nhập tên, chọn nhiều chỉ số và xác nhận duyệt trước khi lưu. Tất cả giáo viên dùng kho chung. Người tạo quản lý trạng thái trò của mình; Admin quản lý mọi trò. Lưu trữ ẩn trò khỏi kho chung, có thể khôi phục; owner/Admin vẫn mở được.

Các bảng mới: Skill, AssessmentCriterion, Activity, ActivityVersion, ActivityVersionCriterion. Activity lưu tên, ghi chú, người tạo, trạng thái và khóa chống trùng. Mỗi lần lưu tạo Activity mới và phiên bản số 1. Version lưu GameContent JSONB theo schema shared v1/v2, instruction, gameType, difficulty, completionRule và nhiều chỉ số. Không có API sửa nội dung phiên bản tại chỗ; đổi trạng thái Activity không thay đổi content. Chưa thêm quan hệ nhóm tuổi vì module AgeGroup chưa triển khai.

Unique `(createdBy, saveRequestId)` cùng fingerprint nội dung giúp retry trả lại cùng trò đã lưu, kể cả proof hết hạn sau lần ghi thành công. Nội dung khác dùng lại khóa trả 409. Không lưu prompt gốc, token, key hoặc presigned URL vào các bảng mới.

Việc gắn chỉ số xác định mục tiêu do người lớn quyết định. Ba renderer hiện tại không tự bảo đảm đánh giá được mọi chỉ số. Chưa triển khai Assessment Engine, PlaySession, lưu kết quả trẻ hay Publish.

## Quyền và ảnh

- READ_GAMES: Admin/Teacher đọc danh mục, kho và ảnh thuộc trò được phép đọc.
- SAVE_GAMES: Admin/Teacher lưu trò đã duyệt; owner đổi trạng thái trò của mình.
- MANAGE_ALL_GAMES: chỉ Admin quản lý mọi trò.
- Guardian không có các quyền mới. READ_GAME_ASSETS/MANAGE_GAME_ASSETS vẫn chỉ Admin.

Lưu yêu cầu preview proof đúng user/audience/tokenUse/TTL/asset whitelist. Proof mới thêm contentDigest ràng buộc chính xác GameContent, độc lập thứ tự key JSON. Proof cũ chưa có digest vẫn dùng được trong TTL 1 giờ với scope cũ; schema và asset ACTIVE được kiểm tra khi lưu. Sau khi proof cũ hết hạn, mọi generation mới đều có digest. Không có endpoint cấp proof cho JSON tùy ý.

Khi lưu, đọc lại tồn tại/trạng thái ACTIVE của ảnh. Đáp án đã được generation kiểm tra và người lớn duyệt. Kho không đóng băng file ảnh: nếu ảnh ngừng sử dụng sau khi lưu, mở trò sẽ báo học liệu không khả dụng; không tự đổi đáp án hoặc gọi AI.

API ảnh đọc GameContent **từ DB**, kiểm tra quyền truy cập version và asset whitelist trước khi cấp presigned URL. Teacher không được truy cập ảnh ngoài trò hay dùng API Library. Bucket vẫn private.

## Routes và API

Routes: `/teacher/games`, `/admin/games`, `/<teacher|admin>/games/create`, `/<teacher|admin>/games/:versionId`. Kho có tìm kiếm, bộ lọc, phân trang, ảnh minh họa riêng tư, trạng thái tải/lỗi/rỗng. Trang chi tiết dùng lại GamePreview/Runtime; đọc ảnh không phụ thuộc proof 1 giờ của generation cũ. Bảng chơi đứng trước form lưu. Refresh token không tự generation hay xóa draft.

- GET `/api/v1/curriculum/skills`
- POST `/api/v1/game-library`: saveRequestId, name, description, difficulty, criterionCodes[], content, previewToken, reviewConfirmed=true.
- GET `/api/v1/game-library`: page/pageSize, search, gameType, difficulty, skillCode, criterionCode, mine=true/false, status=ACTIVE/ARCHIVED. Teacher đọc ARCHIVED luôn giới hạn owner.
- GET `/api/v1/game-library/:versionId`
- PATCH `/api/v1/game-library/:versionId/status`: status=ACTIVE/ARCHIVED.
- GET `/api/v1/game-library/:versionId/assets/:assetId/read-url`

Response dùng envelope hiện có. Shared Zod kiểm tra request/response; module curriculum và learning-content dùng Controller → Service → Repository. Cross-module qua exported services.

## Migration

Hai migration mới được chuẩn bị, không sửa migration đã áp dụng:

1. `20261112000100_game_library_permissions`: thêm ba giá trị PermissionCode, commit trước migration sau.
2. `20261112000200_game_library`: thêm năm bảng/enums/index/FK, ba Chuẩn/mười một Chỉ số và grants cho Admin/Teacher hiện có.

Không cần seed, không reset DB/MinIO, không đổi học liệu, mật khẩu hoặc Auth session. Seed source được cập nhật cho môi trường khởi tạo mới, không chạy vào DB hiện tại.

**Chỉ thực thi sau khi chủ dự án cho phép áp dụng migration:**

```powershell
pnpm --filter api exec prisma migrate deploy
```

Refresh phiên hoặc đăng nhập lại để giao diện nhận quyền mới. Restart API nếu không dùng watch. Không cần Gemini key mới hoặc dependencies mới.

## Kiểm tra

Shared build, Prisma validate, API/Web typecheck và lint mục tiêu. Có 17 ca offline cho lưu, retry/chống trùng, ownership, scope ảnh, proof nội dung và danh mục/duyệt. DB/storage mock, không gọi Gemini.

Ngày 12/11/2026, sau xác nhận của chủ dự án, đã áp dụng đúng hai migration trên vào database development hiện hữu; Prisma báo schema up to date. API thật xác nhận Admin/Teacher đọc kho và danh mục 3 Chuẩn/11 Chỉ số; Teacher vẫn bị 403 với GameAsset Library, Guardian bị 403 với kho/danh mục. Kiểm tra transaction DB thật đã lưu/đọc version và nhiều chỉ số, retry không trùng, lưu trữ/khôi phục, shared read; toàn bộ bản ghi kiểm tra được rollback, không giữ trò mẫu trong kho. Không gọi Gemini.

Headless Edge với API được chặn bằng fixtures đã kiểm tra bố cục desktop/mobile (390 px, không tràn ngang), tạo nội dung giả lập, chọn độ khó/nhiều chỉ số, bật nút lưu và thông báo lưu thành công. Đã xem ảnh render của kho và form lưu. Đây là kiểm tra UI với fixtures; không phải generation thật hay ghi thêm dữ liệu DB. Trò trong các ảnh QA là dữ liệu giả lập.

Trang chi tiết đã được kiểm tra mở/chơi bằng fixtures và giữ đáp án/tiến độ sau refresh access token; không remount bảng chơi trong lúc tải lại metadata cùng version.
