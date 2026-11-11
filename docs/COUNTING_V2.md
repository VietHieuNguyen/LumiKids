# COUNTING v2 — đếm toàn bộ, theo màu hoặc theo loại đối tượng

COUNTING sinh mới dùng schemaVersion 2; Runtime tiếp tục đọc v1 với quy tắc cũ (đếm mọi item). Không chuyển đổi hoặc đổi nghĩa JSON v1. CLASSIFICATION v2 và MATCHING v1 giữ nguyên.

## Contract

Giữ `items`, `choices`, `correctChoiceId`, `instruction`, `completionRule=CORRECT_CHOICE` như trước và bổ sung:

- `countingRule: {"type":"ALL"}`: đếm toàn bộ hình hiển thị.
- `countingRule: {"type":"COLOR","color":"RED"}`: chỉ đếm những item có metadata màu tương ứng. Màu hỗ trợ: RED, BLUE, GREEN, YELLOW, PURPLE, ORANGE, WHITE, BLACK.
- `countingRule: {"type":"OBJECT_TYPE","objectType":"PENGUIN"}`: chỉ đếm đúng loại đối tượng từ metadata `animalType`/`objectType`. Không đoán loài từ pixel. Có thể bổ sung `color` để giới hạn thêm màu; khi đó item đúng loại cần metadata màu phù hợp.
- `countedItemIds`: 1–20 local item ID duy nhất, phải tồn tại trong `items`. Với ALL, danh sách phải chứa mọi item; với COLOR, backend đối chiếu chính xác tất cả item có màu cần đếm, không cho bỏ sót hoặc thêm hình khác màu.
- Choice đúng có giá trị bằng `countedItemIds.length`. Tổng số item hiển thị vẫn 1–20, lựa chọn 2–6 số khác nhau từ 0–20. Chưa hỗ trợ bài có 0 item đích; 0 vẫn được dùng làm đáp án nhiễu.

Ví dụ cấu trúc minh họa (thay hai UUID bằng ảnh BALL ACTIVE thật):

```json
{
  "schemaVersion": 2,
  "gameType": "COUNTING",
  "instruction": "Có bao nhiêu quả bóng màu đỏ?",
  "items": [
    {"id":"red-1","assetId":"61aa17ec-2380-4f39-9229-045322b692d7","label":"Bóng đỏ"},
    {"id":"blue-1","assetId":"1e819292-dae8-4eb3-a24c-9a60974203d2","label":"Bóng xanh dương"},
    {"id":"red-2","assetId":"61aa17ec-2380-4f39-9229-045322b692d7","label":"Bóng đỏ"},
    {"id":"red-3","assetId":"61aa17ec-2380-4f39-9229-045322b692d7","label":"Bóng đỏ"},
    {"id":"blue-2","assetId":"1e819292-dae8-4eb3-a24c-9a60974203d2","label":"Bóng xanh dương"}
  ],
  "countingRule": {"type":"COLOR","color":"RED"},
  "countedItemIds": ["red-1","red-2","red-3"],
  "choices": [{"id":"two","value":2},{"id":"three","value":3},{"id":"five","value":5}],
  "correctChoiceId": "three",
  "completionRule": "CORRECT_CHOICE"
}
```

Shared kiểm tra cấu trúc, ID, reference, số lượng và đáp án. Metadata màu phải được Nest đọc từ GameAsset, không tin danh sách ID do model chọn. COLOR từ chối item thiếu màu có thể kiểm chứng, kể cả item gây nhiễu. Hình cùng assetId có thể lặp nhiều lần với local ID khác nhau; mỗi instance được tính riêng.

## Đếm một loại học liệu giữa nhiều loại

OBJECT_TYPE không giới hạn ở con vật: dùng objectType cụ thể cho trái cây, đồ chơi, sách, phương tiện, hình học… và aliases chứa tên gọi ngắn/đồng nghĩa. Với ANIMAL có thể dùng animalType theo cơ chế tương thích. Ví dụ tên ảnh “Quả dâu tây đỏ” vẫn khớp prompt “dâu tây” khi aliases có tên đó; không ép đổi tên ảnh hoặc gán animalType cho trái cây.

```text
Cho 2 quả xoài, 3 quả dâu tây, 4 quả mít. Hãy tạo cho tôi một trò chơi đếm số lượng. Yêu cầu chỉ đếm số lượng quả mít. Hãy cho 4 đáp án tùy chọn.
```

Tổng 9 hình, OBJECT_TYPE JACKFRUIT, countedItemIds chứa 4 item mít và 4 lựa chọn số phân biệt có đáp án đúng 4. Một file mỗi loại được tái sử dụng. Mỗi tên gọi cần khớp objectType/tên/aliases của ảnh ACTIVE. Backend không dùng từ khóa nhóm chung trong tags làm bằng chứng danh tính. Nếu alias trùng hoặc học liệu định lượng không nhận ra, báo COUNTING_OBJECT_AMBIGUOUS / COUNTING_OBJECT_NOT_FOUND thay vì tính tổng từ phần danh sách nhận ra rồi bỏ phần còn lại.

```text
Cho 2 con chim cánh cụt, 2 con gà mái, 3 con voi. Tạo trò chơi đếm số lượng con chim cánh cụt. Cho 3 đáp án tùy chọn.
```

Kết quả phải hiển thị 7 item (2 chim cánh cụt, 2 gà mái, 3 voi), dùng OBJECT_TYPE cho chim cánh cụt, countedItemIds chứa đúng 2 local ID tương ứng, có đúng 3 lựa chọn khác nhau và đáp án đúng bằng 2. Không bỏ các con vật khác. Creator có nút gợi ý cho bài này.

Chỉ cần một ảnh ACTIVE cho mỗi loại, tái sử dụng assetId để tạo các instance. Ví dụ chim cánh cụt dùng `objectType: PENGUIN`, `animalType: PENGUIN`; không gán chung BIRD nếu cần phân biệt với các chim khác. Gà mái dùng tên tiếng Việt rõ ràng và mã nhất quán trong Library (ví dụ CHICKEN hoặc HEN), voi dùng ELEPHANT. Ảnh thường dùng variant NORMAL; không cần gán màu cho bài chỉ đếm theo loài.

Parser tách câu hỏi mục tiêu khỏi danh sách hiển thị, đọc số lượng từng loại từ tên/mã và metadata đang có, đối chiếu composition và số lựa chọn. Từ chối nếu model trả ALL thay cho subset được yêu cầu, thay đối tượng đích, bỏ/sai số lượng các hình gây nhiễu, sai tập countedItemIds hoặc số đáp án. Các số ghi cho lựa chọn/tuổi không được coi là số lượng con vật. Cần prompt rõ số lượng; các mẫu ngôn ngữ chưa nhận ra vẫn có giới hạn và cần giáo viên duyệt. Số lượng mâu thuẫn cho cùng loại trả COUNTING_COMPOSITION_AMBIGUOUS.

## Chuẩn bị ảnh

- Ảnh bóng đỏ: name `Bóng đỏ`, objectType `BALL`, tags `bóng, ball, đỏ, red`, attributes `{"color":"RED","category":"TOY"}`.
- Ảnh bóng xanh dương: name `Bóng xanh dương`, objectType `BALL`, tags `bóng, ball, xanh dương, blue`, attributes `{"color":"BLUE","category":"TOY"}`.
- Chỉ cần một file mỗi màu; không cần upload lặp lại nhiều quả bóng. Tags/tên ảnh không thay thế trường `color` để xác định đáp án.
- Metadata ảnh được kiểm tra lại sau generation; nếu thay đổi làm sai tập item đếm thì trả ASSETS_CHANGED như cơ chế hiện có.

## Prompt

> Hiển thị 5 quả bóng gồm 3 quả bóng đỏ và 2 quả bóng xanh dương. Chỉ đếm số bóng đỏ và cho trẻ chọn đáp án đúng từ 3 lựa chọn.

Tổng hiển thị là 5, đáp án là 3. Creator có nút gợi ý riêng cho mẫu này.

> Tạo trò chơi chỉ đếm bóng đỏ giữa nhiều bóng khác màu, cho trẻ chọn đáp án đúng.

Model chọn số lượng trong giới hạn; backend yêu cầu có bóng đỏ và ít nhất một bóng khác màu. Nếu Library thiếu màu mục tiêu/màu gây nhiễu phù hợp, chặn trước model. Màu không rõ hoặc chưa hỗ trợ trả COUNTING_TARGET_AMBIGUOUS.

> Hiển thị 3 quả bóng đỏ và 2 quả bóng xanh dương. Hỏi trẻ có bao nhiêu quả bóng đỏ.

Vẫn đếm 3; parser phân biệt tổng hiển thị với số lượng theo màu ở các mẫu tường minh. Đây không phải bộ hiểu mọi ràng buộc ngôn ngữ tự nhiên; prompt phức tạp vẫn có cảnh báo và cần giáo viên duyệt. Với đếm tổng các màu, viết rõ “đếm tất cả” và dùng ALL.

## Runtime và giới hạn

Hiển thị tất cả item theo cùng một kiểu, kèm nhắc màu cần đếm. Không đánh dấu item đích, không hiện số lượng đích hoặc tách riêng các màu để tiết lộ đáp án. Numeric choices, interaction SELECT_CHOICE, completion một lần, reset, asset resolver và preview proof không thay đổi. Không lưu kết quả, không suy luận độ khó hoặc năng lực trẻ.

Schema gửi Gemini sinh từ structure schema v2; Python không định nghĩa lại GameContent. Giữ schema provider gọn, kiểm tra đầy đủ ở Nest. Không đổi Auth, quyền Library, DB, migration, seed hoặc secrets. Restart Web/API/AI Service để nạp schema và prompt mới. Không tự gọi Gemini thật hoặc chạy testcase trong lần triển khai này.
