# Rà soát học liệu ngày 11/11/2026

Đã đọc toàn bộ 143 bản ghi qua API Admin và xem ảnh của 121 học liệu ACTIVE. Đã cập nhật metadata thực tế cho 137 bản ghi: 118 ACTIVE và 19 INACTIVE; đọc lại xác nhận khớp nội dung cập nhật. Ba ảnh xoài/mít/dâu tây đã có metadata phù hợp, ba bản ghi INACTIVE không rõ nội dung được giữ nguyên. Tổng học liệu vẫn 143, trạng thái của mọi bản ghi giữ nguyên; không upload/xóa/thay file ảnh, không đổi objectType hoặc khóa ghép cặp.

## Nội dung đã cập nhật

- Thêm tên gọi đồng nghĩa `aliases` cho động vật, trái cây, rau củ, đồ dùng học tập, hình dạng và chữ số. Mảng đúng giới hạn 1–12 chuỗi, tối đa 40 ký tự/chuỗi. Các ảnh đang có aliases phù hợp không bị thay thế.
- Chuẩn hóa 11 ảnh môi trường: `habitat` mang mã cụ thể như FOREST/SEA/FARM/DESERT/ARCTIC thay cho LAND/WATER chung chung; bỏ `environmentType` trùng thông tin vì khóa này không được gửi đến AI. Ảnh “Trên cạn” có phong cảnh đồng cỏ được bổ sung `specificHabitats: ["GRASSLAND"]` để có thể minh họa nhóm đồng cỏ.
- Bổ sung/sửa môi trường cho 27 bản ghi động vật, gồm ảnh thường, bóng tương ứng và các bản cũ INACTIVE liên quan.
- Xóa phần tử rỗng trong mảng môi trường của bóng rùa cạn; bỏ WATER và tag water khỏi rùa cạn.
- Bổ sung `variant: NORMAL` cho học liệu thông thường còn thiếu, giữ SHADOW và matchKey đã khai báo. Không tự suy đoán tuổi, quan hệ trưởng thành–con non, phong cách hay màu chủ đạo cho ảnh nhiều màu.

| Học liệu | Môi trường được khai báo sau rà soát |
|---|---|
| Gấu Bắc cực | LAND, ARCTIC |
| Chim cánh cụt | LAND, WATER, SEA; không gán ARCTIC hoặc mặc định ANTARCTIC |
| Rùa cạn | LAND |
| Voi | LAND, SAVANNA, GRASSLAND, FOREST |
| Khỉ, sóc | LAND, TREE, FOREST |
| Vẹt trong bộ hiện tại | AIR, TREE, FOREST |
| Cáo, hươu | LAND, FOREST, GRASSLAND |
| Cá trong bộ hiện tại, minh họa cá vàng | WATER, RIVER, LAKE; không gán SEA |
| Vịt trắng trong bộ hiện tại | LAND, WATER, FARM, RIVER, LAKE |

Các giá trị trên phục vụ học liệu minh họa hiện có, không phải quy tắc sinh thái áp dụng cho mọi loài thuộc cùng nhóm. Không dùng khả năng bơi để mặc định mọi con vật thuộc nhóm “dưới biển”. Không dùng tên chim để mặc định mọi chim đều thuộc AIR.

## Điều chỉnh mã nguồn

Registry shared và hướng dẫn Admin/AI nhận thêm ARCTIC (Bắc cực), ANTARCTIC (Nam cực). Đây là vùng địa lý khác nhau, không tự suy rộng thành LAND/WATER. Parser bỏ tên loài “gấu Bắc cực” khi tìm các nhóm môi trường để tránh tự thêm một nhóm giáo viên không yêu cầu. Không đổi schema database hoặc contract GameContent.

Chuẩn hóa đáp án cũng chấp nhận ảnh môi trường cụ thể minh họa nhóm tổng quát được registry suy ra, ví dụ GRASSLAND → LAND, SEA → WATER. Không suy ngược ảnh LAND thành bằng chứng cho FOREST/GRASSLAND hoặc suy giữa hai vùng cực.

## Đối chiếu offline trên metadata đã lưu

Không gọi Gemini. Nội dung JSON minh họa được tạo cục bộ để chạy bộ chọn candidate và validator hiện có; kết quả này không chứng minh đầu ra Gemini thực tế luôn đúng.

Prompt trong ảnh đã có đủ bằng chứng metadata, chọn được candidate và JSON minh họa qua validation với các đáp án:

| Con vật | Nhóm đúng trong bốn nhóm yêu cầu |
|---|---|
| Sư tử | Đồng cỏ |
| Chim cánh cụt | Dưới biển |
| Gấu Bắc cực | Bắc cực |
| Cá mập | Dưới biển |
| Voi | Đồng cỏ hoặc khu rừng |

Không phát hiện thuộc tính ACTIVE bị loại khỏi whitelist/không đúng dạng mảng. Có 31 cặp NORMAL–SHADOW có matchKey tương thích, mỗi nguồn có đúng một đích ACTIVE theo metadata. Đã kiểm tra ảnh tổng quan nhưng chưa chứng nhận đường viền từng cặp ở cấp pixel.

Các prompt đếm hỗn hợp trái cây/đồ dùng học tập, ghép năm cặp bóng và phân loại khỉ–cáo–sóc đã qua bước chọn candidate offline. Chưa chạy generation thật hay tương tác trình duyệt.

## Học liệu còn thiếu cho các trò đề xuất

- **Trưởng thành–con non:** chưa có cặp đầy đủ ADULT/YOUNG và familyKey được xác nhận. Cần bổ sung ảnh tương ứng; không gán tuổi chỉ vì nhân vật có khuôn mặt dễ thương.
- **Hình dạng–hình bóng:** các hình đen hiện tại là NORMAL để tiếp tục dùng cho đếm/phân loại màu. Chưa có cặp SHADOW với matchKey riêng được xác nhận; không đổi chúng thành bóng làm mất chức năng hiện có.
- **Số lượng–chữ số:** đã có ảnh chữ số 0–10. Chưa có các ảnh nhóm đồ vật có số lượng được xác nhận để làm cặp hình với chữ số; trường `number` hiện mô tả chữ số trên ảnh, không chứng minh số đồ vật.
- **Đồ vật–bộ phận còn thiếu:** chưa có bộ ảnh phần khuyết/miếng ghép và quan hệ tương ứng.
- **Phân loại Nam cực:** chưa có ảnh môi trường Nam cực riêng. Không dùng ảnh mang tên Bắc cực thay thế hoặc gán mọi chim cánh cụt vào Nam cực.
- **Hổ, cá sấu, hà mã:** các bản hiện có vẫn INACTIVE, nên generation không sử dụng. Không tự kích hoạt ảnh cũ.
- **Đếm bóng nhiều màu:** chưa có bóng đồ chơi ACTIVE. Có thể thử cùng cơ chế bằng hình tròn hoặc hình vuông nhiều màu đã có.

## Sao lưu và chi tiết thay đổi

- [Metadata trước cập nhật](../tmp/library-audit-before-20261111.json)
- [Kế hoạch và nội dung patch từng bản ghi](../tmp/library-metadata-plan-20261111.json)
- [Nhật ký cập nhật thành công](../tmp/library-metadata-applied-20261111.jsonl)
- [Metadata đọc lại sau cập nhật](../tmp/library-audit-after-20261111.json)

Các file nằm trong thư mục tmp được Git ignore, không chứa access token, cookie hoặc credentials. Đã đọc lại metadata trước mỗi PATCH; không có bản ghi nào bị bỏ qua do thay đổi giữa lúc rà soát. Sao lưu không phải migration hay seed; không chạy ghi đè toàn thư viện khi khôi phục.

## Nguồn đối chiếu sinh thái

- [Australian Antarctic Program – Penguins](https://www.antarctica.gov.au/about-antarctica/animals/penguins/): phân bố chim cánh cụt, không coi mọi loài đều sống ở Nam cực.
- [NOAA – Penguins](https://oceanservice.noaa.gov/facts/penguinsfly.html): chim cánh cụt kiếm ăn ở biển và nuôi con trên đất liền.
- [WWF – Polar bear](https://www.worldwildlife.org/species/polar-bear/): môi trường Bắc cực và băng biển.
- [San Diego Zoo – Turtle and tortoise](https://animals.sandiegozoo.org/animals/turtle-and-tortoise): phân biệt rùa cạn với rùa sống dưới nước.
- [San Diego Zoo – Elephant](https://animals.sandiegozoo.org/animals/elephant), [Monkey](https://animals.sandiegozoo.org/animals/monkey), [Macaw](https://animals.sandiegozoo.org/animals/macaw): môi trường voi, khỉ và vẹt.
- [Animal Diversity Web – Red fox](https://animaldiversity.org/accounts/Vulpes_vulpes/), [Chital](https://animaldiversity.org/accounts/Axis_axis/), [Red squirrel](https://animaldiversity.org/accounts/Sciurus_vulgaris/): nhóm rừng/cây/đồng cỏ phù hợp với các hình minh họa đang dùng; không định danh chính xác loài khoa học từ tranh.
- [University of Michigan BioKIDS – Goldfish](https://www.biokids.umich.edu/critters/Carassius_auratus/): môi trường nước ngọt.
- [RSPCA – Domestic ducks](https://science.rspca.org.uk/documents/1494935/9042554/RSPCA%2Bduck%2Breport_Watertight_March%2B2015.pdf/d6232ab7-da69-e74a-84b4-d392c31a182e?t=1553171220082): vịt nuôi và môi trường nước.
