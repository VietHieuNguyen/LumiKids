# Metadata học liệu dùng cho generation

Prompt để copy sang ChatGPT Web: [ASSET_METADATA_CHATGPT_PROMPT.txt](./ASSET_METADATA_CHATGPT_PROMPT.txt). Hướng dẫn này phản ánh mã hiện tại sau lần nâng cấp metadata, không phải đề xuất chưa triển khai.

Danh sách khóa chuyển tới AI lấy từ `AI_ASSET_ATTRIBUTE_KEYS` trong `packages/shared/src/game-content/asset-metadata.ts`; Web dùng cùng danh sách để cảnh báo trường không được gửi. Storage vẫn cho metadata JSON mở rộng, không đổi schema database.

Registry môi trường có thêm ARCTIC (Bắc cực), ANTARCTIC (Nam cực). Hai mã là vùng địa lý, không tự suy ra LAND/WATER và không thay thế cho nhau. Tên loài “gấu Bắc cực” không tự thêm một nhóm Bắc cực vào yêu cầu. Chim cánh cụt chung chung dùng LAND/SEA; chỉ thêm ANTARCTIC nếu đã xác định loài phù hợp, không gán ARCTIC. Ảnh môi trường cần `habitat` là mã cụ thể (FOREST/SEA/FARM…), không chỉ LAND/WATER và không chỉ `environmentType` vì trường đó không được gửi tới AI.

## Danh tính học liệu chung và tên gọi đồng nghĩa

Mọi loại học liệu dùng objectType cụ thể: MANGO, STRAWBERRY, JACKFRUIT, BOOK, CAR, PENCIL, CIRCLE… Không dùng chung FRUIT/TOY/SHAPE làm danh tính của nhiều đối tượng cần đếm riêng; đó là category. animalType chỉ bổ sung danh tính loài cho ảnh ANIMAL (hoặc ảnh cũ chưa khai category), không dùng thay objectType của trái cây/đồ vật.

`aliases` là mảng 1–12 chuỗi dài 1–40 ký tự, được whitelist gửi tới AI và dùng cùng nguồn dữ liệu cho nhận diện mục tiêu, composition và validation. Ví dụ ảnh tên “Quả dâu tây đỏ”, objectType STRAWBERRY, nên có aliases `["dâu tây", "quả dâu tây", "trái dâu tây", "strawberry"]`. Không nâng toàn bộ tags thành alias vì các tag màu/nhóm chung không chứng minh danh tính. Không cần sửa code để thêm loại học liệu mới có mã và alias rõ ràng.

COUNTING hỗ trợ đơn vị gọi như con/quả/trái/cái/chiếc/quyển/cuốn/tờ/viên/cây… và tên gọi có alias; có thể đếm một loại hoặc toàn bộ. Số lượng gắn màu được đối chiếu đúng loại–màu, tránh gom tất cả màu đỏ của các loại khác nhau vào cùng một số lượng. Phân biệt “quả cam” với “màu cam”. Mẫu chưa nhận diện hoặc alias trùng phải được làm rõ, không tự bịa học liệu. Giới hạn 20 hình tổng cộng, 2–6 đáp án và quyền/generation retry vẫn giữ nguyên.

## Ảnh sát thực tế có thể dùng cho nhiều bài

Ví dụ một bộ ba đã được quản trị viên xác nhận cặp:

| File | objectType | variant | lifeStage | matchKey | familyKey |
|---|---|---|---|---|---|
| lion-adult.png | LION | NORMAL | ADULT | LION_ADULT_POSE_01 | LION_FAMILY_01 |
| lion-adult-shadow.png | LION | SHADOW | ADULT | LION_ADULT_POSE_01 | bỏ trống |
| lion-young.png | LION | NORMAL | YOUNG | bỏ trống nếu chưa có cặp bóng | LION_FAMILY_01 |

Cả ba cùng `animalType: LION`, `visualStyle: REALISTIC`, `assetSet: ANIMALS_REALISTIC_01`. Hai ảnh thường có thể dùng cho đếm/phân loại mà không cần upload lại. Không thêm trường rỗng; bỏ trường chưa biết. matchKey chỉ xác nhận cặp hình ảnh, familyKey xác nhận quan hệ học liệu trưởng thành–con non, không chứng minh quan hệ huyết thống của hai cá thể trong ảnh.

Ví dụ attributes của ảnh trưởng thành (môi trường trong ví dụ cần được quản trị viên duyệt cho học liệu):

```json
{
  "category": "ANIMAL",
  "animalType": "LION",
  "variant": "NORMAL",
  "lifeStage": "ADULT",
  "visualStyle": "REALISTIC",
  "assetSet": "ANIMALS_REALISTIC_01",
  "matchKey": "LION_ADULT_POSE_01",
  "familyKey": "LION_FAMILY_01",
  "habitats": ["SAVANNA", "GRASSLAND"]
}
```

Màu của ảnh thật có thể không thuộc tám màu được đếm; không bắt buộc gán `color`. `visualStyle: REALISTIC` bao gồm ảnh chụp và tranh minh họa sát thực tế, không phải tuyên bố ảnh đó là ảnh chụp. Với bóng, phong cách là phong cách ảnh gốc.

## Quy tắc thực thi

- Mặc định loại SHADOW trước khi chọn ứng viên cho tất cả loại trò chơi. Chỉ giữ khi prompt yêu cầu rõ hình bóng. Ảnh cũ chưa có variant được xem là ảnh thường; nếu đó là bóng, quản trị viên cần khai báo SHADOW.
- Yêu cầu rõ ảnh thật/sát thực tế hoặc hoạt hình được lọc theo visualStyle đã khai báo. Nếu không yêu cầu phong cách, ảnh thường cũ thiếu visualStyle vẫn dùng được. Không tự đổi trạng thái hoặc bổ sung metadata cho ảnh có sẵn.
- Ghép bóng: mỗi cặp cần nguồn thường, đích bóng và cùng matchKey không rỗng. Nếu có animalType, visualStyle, assetSet ở cả hai ảnh thì chúng phải khớp. Cùng loài không đủ. Tối đa một cặp cho mỗi matchKey trong một lượt.
- Ghép trưởng thành–con non: nguồn ADULT, đích YOUNG, đều ảnh thường, cùng animalType và familyKey không rỗng. Nếu có visualStyle/assetSet ở cả hai thì phải khớp. Không bắt buộc cùng matchKey. Tối đa một cặp cho mỗi familyKey trong một lượt.
- Ghép hình giống nhau: cùng assetId hoặc matchKey; vẫn là hai item instance có local ID riêng.
- Ghép ngữ nghĩa khác vẫn cần người lớn duyệt khi thiếu bằng chứng. Các cặp khác loại (ví dụ đồ vật–chữ số) có thể thuộc bộ học liệu khác nhau; không ép assetSet giống nhau cho mọi cách ghép.
- Bộ chọn ưu tiên tên/mã/tags hơn metadata chung, dự trữ đối tượng/màu/ảnh nhóm được yêu cầu trước khi lấy các lựa chọn bổ sung. Bài bóng/trưởng thành–con non chọn cả cặp cùng lúc trong giới hạn 40 candidate; không chỉ giữ một nửa cặp. Truy hồi tối đa 120 dòng và không gọi DB trực tiếp từ generation module.
- Với CLASSIFICATION v2 thuần môi trường sống, nếu tất cả nhãn nhóm được xác định rõ và mọi item có ít nhất một nhóm đúng từ metadata, Nest chuẩn hóa toàn bộ correctGroupIds theo metadata. Ví dụ ảnh GRASSLAND có thể minh họa nhóm LAND theo quan hệ suy rộng; ảnh chỉ khai LAND không chứng minh nhóm GRASSLAND. Không đổi ảnh item, ID/nhãn nhóm hoặc tự đoán sinh thái. Phát cảnh báo METADATA_ANSWERS_NORMALIZED nếu có sửa đáp án. Nếu ảnh minh họa nhóm không đúng môi trường/không phải ENVIRONMENT/HABITAT, chọn ảnh môi trường phù hợp từ chính candidate whitelist, ưu tiên mã cụ thể khớp nhãn; không có ảnh thì bỏ assetId tùy chọn để hiện nhãn chữ. Phát GROUP_IMAGES_NORMALIZED khi sửa ảnh nhóm. Reference ngoài whitelist, nhãn mơ hồ hoặc item thiếu bằng chứng không được tự sửa. Vẫn validate đầy đủ và kiểm tra lại metadata ACTIVE sau model; lần kiểm tra cuối không tự sửa để phát hiện thay đổi metadata trong lúc generation.
- Không tăng số lần gọi model: tối đa hai; frontend không tự generation lại. Chưa có semantic search/vector hoặc cam kết mọi prompt đều tạo được. Ảnh, quan hệ, tiêu chí chưa khai báo và yêu cầu vượt contract vẫn có thể bị từ chối.

Hai lỗi mới có thông báo cụ thể trên UI: `SHADOW_PAIRS_INSUFFICIENT`, `OFFSPRING_PAIRS_INSUFFICIENT`. Bản Preview cũ vẫn được giữ nếu tạo lại thất bại.

## Prompt thử sau khi có đủ học liệu

```text
Tạo trò chơi ghép 3 cặp hình sư tử, hổ và khỉ với hình bóng tương ứng. Dùng ảnh sát thực tế.

Tạo trò chơi ghép 3 cặp con trưởng thành và con non của sư tử, hổ, lợn. Dùng ảnh sát thực tế.

Tạo trò chơi ghép 3 cặp hình giống nhau gồm sư tử, hổ, khỉ.

Tạo trò chơi đếm 5 con sư tử, chọn đáp án từ 4, 5 và 6. Dùng ảnh sát thực tế.
```

Khởi động lại API và AI Service để nạp logic/prompt mới. Build shared khi dùng package dist. Kiểm tra kiểu dữ liệu/lint có thể chạy offline; không gọi Gemini nếu chưa được người dùng cho phép. Không thay auth, quyền Library, preview proof, database hoặc nội dung GameContent contract.
