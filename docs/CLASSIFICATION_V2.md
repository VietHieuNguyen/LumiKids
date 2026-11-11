# Phân loại nhiều đáp án và mức độ do giáo viên gán

## Hành vi

- Generation mới dùng CLASSIFICATION schemaVersion 2. Mỗi item có `correctGroupIds` là danh sách 1–10 ID nhóm khác nhau, tất cả phải tồn tại trong `groups`.
- Trẻ chỉ cần đặt mỗi item **một lần vào bất kỳ nhóm được chấp nhận nào**. Chọn đúng nhóm thay thế vẫn là CORRECT; không phải kéo cùng item vào mọi nhóm. Tiến độ tính theo item duy nhất, completion vẫn một lần mỗi lượt và reset theo Runtime hiện có.
- Nhóm không bắt buộc có item đúng: có thể là lựa chọn nhiễu. Không ép bài phân loại thành ghép một-một.
- JSON v1 với `correctGroupId` tiếp tục được đọc/chơi theo quy tắc cũ. MATCHING tiếp tục sinh v1; COUNTING mới đã có v2 đếm theo màu, xem [COUNTING_V2.md](./COUNTING_V2.md). Không chuyển đổi ngầm nội dung v1.
- Sau generation, giáo viên gán Dễ / Trung bình / Khó trong Creator. Mức độ là metadata của draft, không gọi Gemini, đổi nội dung/đáp án, reset tiến độ hoặc suy luận năng lực trẻ. Tạo lại thành công mở draft mới chưa gán mức; lỗi giữ draft và mức cũ. Hiện chưa có persistence nên tải lại/rời trang mất cả draft và mức độ.
- Creator có mục “Duyệt các nhóm được chấp nhận” để giáo viên kiểm tra danh sách đáp án trước khi dùng. Đây không phải màn hình chỉnh sửa đáp án hoặc Publish.

## Chuẩn bị metadata ảnh

Trong `/admin/game-assets`, dùng tên tiếng Việt, objectType cụ thể, tags tên gọi phù hợp. Không cần tag GameType. Phần “Đặc điểm hình ảnh” có ví dụ JSON và mã môi trường.

Ba trường môi trường được hợp nhất khi kiểm chứng:

- `habitat`: một chuỗi, tương thích dữ liệu đã có.
- `habitats`: mảng môi trường được xác nhận cho ảnh.
- `specificHabitats`: mảng môi trường cụ thể, tương thích dữ liệu đã có.

Hai trường mảng nhận 1–12 chuỗi, mỗi chuỗi 1–40 ký tự, nhập trong chế độ JSON. Chỉ những mảng này được gửi sang AI; không gửi metadata lồng nhau, URL, objectKey hoặc credentials. Tên trường phân biệt chữ hoa/thường. Mảng sai dạng/ngoài giới hạn không được project vào candidate; giao diện báo thông tin không được gửi.

Mã hỗ trợ: LAND, WATER, AIR, SAVANNA, GRASSLAND, FOREST, TREE, SEA, RIVER, LAKE, FARM, DESERT, ARCTIC, ANTARCTIC. Label tiếng Việt tương ứng được nhận diện. SAVANNA/GRASSLAND/FOREST/TREE/FARM/DESERT suy ra LAND; SEA/RIVER/LAKE suy ra WATER. Chiều ngược lại không được suy ra. TREE không tự suy ra FOREST, SEA không tự suy ra RIVER, và SAVANNA không tự suy ra GRASSLAND: khai báo cả hai nếu học liệu chấp nhận cả hai. ARCTIC/ANTARCTIC là hai vùng địa lý riêng, không tự suy ra LAND/WATER. Tên loài “gấu Bắc cực” không tự thêm một nhóm Bắc cực vào prompt.

Ví dụ cho học liệu minh họa **sau khi người quản trị xác nhận đúng với ảnh/loài và mục tiêu bài học**:

| Ảnh / objectType | Thuộc tính |
|---|---|
| Sư tử / LION | `{"animalType":"LION","habitat":"LAND","specificHabitats":["SAVANNA","GRASSLAND"]}` |
| Gà / CHICKEN | `{"animalType":"CHICKEN","habitats":["LAND","FARM"]}` |
| Chim / BIRD | `{"animalType":"BIRD","habitats":["AIR","TREE","LAND"]}` |
| Khỉ / MONKEY | `{"animalType":"MONKEY","habitats":["FOREST","TREE"]}` |
| Cá minh họa chấp nhận sông/biển / FISH | `{"animalType":"FISH","habitats":["RIVER","SEA"]}` |
| Cá voi biển / WHALE | `{"animalType":"WHALE","habitats":["SEA"]}` |
| Cá heo biển / DOLPHIN | `{"animalType":"DOLPHIN","habitats":["SEA"]}` |
| Cá mập biển / SHARK | `{"animalType":"SHARK","habitats":["SEA"]}` |

Không mặc định mọi ảnh FISH là cả cá nước ngọt lẫn nước mặn hoặc mọi ảnh DOLPHIN thuộc cùng một loài. Quản trị viên chịu trách nhiệm xác nhận metadata; backend không nhận diện pixel hoặc cung cấp tri thức sinh học thay người duyệt.

Ảnh nhóm đích là tùy chọn. Nếu muốn có ảnh đồng cỏ/rừng/biển, upload ảnh với tên tiếng Việt, objectType `HABITAT`, tags tương ứng và `{"habitat":"GRASSLAND"}` / `{"habitat":"FOREST"}` / `{"habitat":"SEA"}`. Nếu không có ảnh nhóm, AI có thể dùng label. Metadata ảnh nhóm phải phù hợp label; không dùng ảnh môi trường khác thay thế.

## Prompt và kiểm chứng backend

Ví dụ sau khi đã có đủ ảnh/metadata ACTIVE:

> Tạo trò chơi phân loại 4 con vật: con sư tử, con gà, con chim, con cá heo vào 4 môi trường gồm trên cạn, đồng cỏ, bầu trời, dưới biển. Chấp nhận mọi nhóm phù hợp với metadata của từng con vật.

Sư tử có thể vào LAND hoặc GRASSLAND; chim có thể vào LAND hoặc AIR nếu đã khai báo. Không ép mỗi nhóm phải nhận đúng một con vật.

> Tạo trò chơi phân loại 3 con vật: con khỉ, con cá, con cá voi vào 4 nhóm gồm khu rừng, trên cây, sông, biển. Cho phép một con vật có nhiều nhóm đúng.

Với metadata ở bảng trên: khỉ nhận FOREST/TREE, cá nhận RIVER/SEA, cá voi chỉ nhận SEA. Không thêm RIVER cho cá voi chỉ vì đều thuộc WATER.

Backend dùng metadata được whitelist để kiểm tra **cả tập đáp án**: chặn nhóm sai và chặn AI bỏ sót nhóm hợp lệ trong các nhóm môi trường đã nhận diện. Thiếu bằng chứng môi trường thì từ chối thay vì tự đoán. Prompt có danh từ ngoài bộ alias vẫn cần metadata/từ khóa khớp; không phải semantic search tổng quát. `cá heo`, `cá voi`, `cá mập` được nhận diện theo cụm dài để không nhầm thành FISH hoặc ELEPHANT.

Alias cũng nhận `lạc đà` → CAMEL và `gấu bắc cực` → POLAR_BEAR; cụm dài này không bị rút thành BEAR. Mã objectType nhiều từ như POLAR_BEAR được đối chiếu theo các thành phần phân cách bằng dấu gạch dưới. Bài có 3 nhóm LAND/WATER/AIR vẫn hợp lệ khi không item nào thuộc WATER; nhóm đó là lựa chọn nhiễu, không tự thêm con vật dưới nước vào prompt. Nếu generation bị AI_OUTPUT_INVALID, log development có thêm `validationStage` (NEST/AI_GATEWAY) và danh sách mã `validationErrors` cố định, không log raw output hoặc dữ liệu người dùng.

Truy hồi và validation còn bổ sung từ vựng từ `name`, `objectType` và `animalType` của các candidate thực tế. Ví dụ `Con cá sấu` / CROCODILE sẽ khớp cụm “cá sấu” thay vì yêu cầu một ảnh FISH; `Chim cánh cụt` / PENGUIN không bị rút thành BIRD. Ưu tiên cụm dài nhất, giữ dấu tiếng Việt và loại ảnh ENVIRONMENT/HABITAT khỏi từ vựng đối tượng nguồn. Đây vẫn là đối chiếu metadata có giới hạn, không phải dịch thuật hoặc nhận diện ảnh tự động; với đối tượng mới nên đặt tên tiếng Việt đúng, cụ thể. Tags vẫn phục vụ truy hồi, không tự trở thành bằng chứng danh tính con vật.

Asset vẫn kiểm tra whitelist, tồn tại/ACTIVE và metadata sau model call. Preview proof bao gồm các ảnh thật trong nội dung, giữ nguyên thời hạn và quyền Teacher; không có endpoint cấp proof cho JSON tùy ý. Không đổi database schema, migration, seed, Auth hoặc chính sách Library.

## Chạy bản cập nhật

Restart AI Service, API và Web đang chạy. Scripts khởi động API/Web build lại shared; cần cả `@lumikids/shared` và `@lumikids/ai-client` mới trước khi Nest sử dụng v2. Không cần cài thêm thư viện hoặc chạy migration/seed. Không chạy Gemini thật, testcase hoặc kiểm thử thiết bị trong lần sửa này theo yêu cầu của người dùng.
