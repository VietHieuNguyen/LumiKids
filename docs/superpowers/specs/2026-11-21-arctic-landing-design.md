# Landing Bắc Cực — thiết kế

## Mục đích

Admin chọn landing giữa **Thung lũng** (hiện có) và **Bắc Cực** (quả cầu biodiorama v8 của người dùng). Bắc Cực là hành trình cuộn quanh quả cầu với **bạn gấu từ thung lũng** làm nhân vật chính dẫn đường. Bé gặp động vật Bắc Cực, có thêm **puffin** (chim hải âu cổ rụt, sống ở Bắc Cực, thay chim cánh cụt vì chim cánh cụt sống ở Nam Cực), và trời ấm dần lên bên lửa trại.

**Mục tiêu**
- Có thêm một cảnh landing, chuyển qua lại bằng trang cài đặt admin sẵn có.
- Cảm giác "khám phá" giống thung lũng: cuộn trang thì camera bay, dừng ở từng điểm.

**Không làm**
- Trò "tìm 7 bạn" và đoạn đọc truyện ở nhà gỗ (chỉ thung lũng có).
- Âm thanh mới.
- Sửa câu chuyện thung lũng.

**Thất bại nếu**
- Thung lũng bị đổi hành vi hoặc chậm đi.
- Landing Bắc Cực nặng đến mức iPad tải lâu.
- Trẻ nhầm gấu linh vật thành "gấu Bắc Cực".

## Cách làm đã chọn: hành trình quanh quả cầu (cách 1)

Người dùng chọn cách 1, thay nhân vật chính bằng bạn gấu. Hai cách bị loại:
- **Làm đầy đủ như thung lũng:** tốn gấp đôi công sức và nhiều chữ phải duyệt.
- **Quả cầu chỉ tự xoay:** mất cảm giác khám phá.

## Thiết kế

**1. Chọn cảnh**
- Thêm `ARCTIC` vào `landingSceneSchema` trong shared. Việc đổi schema này nằm trong phạm vi được duyệt.
- Thêm mục `ARCTIC` (nhãn "Bắc Cực", poster) vào `LANDING_SCENES`.
- DB lưu chuỗi tự do nên không cần migration. API đã đọc giá trị qua schema, nên chỉ cần cập nhật test.
- `landing-page.tsx` đọc `settings.landingScene` và `import()` động `valley-scene` hoặc `arctic-scene`. Nhờ vậy cảnh không được chọn không bị tải.

**2. Giao diện stage chung**
- `ArcticStage` có cùng các hàm mà landing-page đang gọi trên `ValleyStage`: `load`, `warmUp`, `degrade`, `resize`, `render(p, t, px, py, animate)`, `friendAt`, `poke`, `hasCharacter`, `anchor`, `pixelRatio`, `dispose`.
- Kiểu `LandingStage` được rút ra từ chữ ký hiện có của `ValleyStage` và không đổi code thung lũng.

**3. Đường camera** (`arctic-path.ts`, dùng lại `scroll-math.ts`)
- Có 6 góc máy và các mốc câu chuyện riêng `ARCTIC_STORY`:
  1. **Toàn cảnh:** quả cầu tự xoay chậm, phần hero.
  2. **Gấu chào:** gấu đứng cạnh lều tuyết vẫy tay, phần lời dẫn "Cùng gấu khám phá Bắc Cực".
  3. **Gấu Bắc Cực mẹ con và cáo tuyết:** chạm để chào.
  4. **Puffin trên tảng băng, hải cẩu, hải mã.**
  5. **Lửa trại:** trời chuyển hoàng hôn, đèn lồng và lửa sáng ấm, gấu ngồi sưởi.
  6. **Tạm biệt:** camera lùi ra, cực quang mờ trên bầu trời.
- Phần overlay chung (hero, thẻ trò chơi, giáo viên, CTA) đọc mốc từ cấu hình cảnh thay cho `STORY` cố định. Thung lũng giữ nguyên các mốc cũ.

**4. Bạn gấu**
- Dùng lại `landing/bear.glb` (gấu nâu linh vật). Vẫy tay bằng chuyển động thủ tục như trên đỉnh thung lũng.
- Đội thêm khăn quàng đỏ (dựng bằng Blender) để rõ là "gấu đi du lịch", không phải gấu Bắc Cực.

**5. Puffin**
- Tìm trên Poly Pizza (CC0/CC-BY) qua Blender MCP. Nếu không có mẫu hợp phong cách, dựng low-poly pastel trong Blender.
- Đặt 3 con trên một tảng băng, nghiêng đầu nhẹ khi được chạm.
- Ghi nguồn và giấy phép trong `landing-assets.ts`.

**6. Ánh sáng** (Three.js, không bake)
- Đèn lồng và lửa trại là point light ấm, chập chờn nhẹ.
- Ánh sáng chung chuyển từ trưa pastel sang hoàng hôn ở mốc 5.
- Cực quang là một dải shader trong suốt ở mốc 6.
- Tôn trọng `prefers-reduced-motion` và chế độ `degrade()` như thung lũng.

**7. Tài nguyên**
- Từ bản sao `arctic_globe_v8.blend`, thêm puffin, khăn gấu và đèn, rồi xuất `public/models/landing/arctic.glb` với texture WebP. Mục tiêu ≤ 3 MB (hiện 6,1 MB).
- Chỉ commit các file landing đã tối ưu cùng poster `arctic-poster.webp`. Thư mục nguồn `public/models/artic/` của người dùng giữ nguyên, không commit.

**8. Lời chào khi chạm**
- Gấu: "Chào bé! Lạnh quá nhỉ!"
- Gấu Bắc Cực: "Chào bạn nhỏ!"
- Cáo tuyết: "Chíp chíp!"
- Hải cẩu: "Ồ ồ!"
- Puffin: "Xin chào!"
- Cá voi: "Phù!"

## Kiểm chứng

- Unit test cho đường camera: đơn điệu, các mốc dừng đứng yên, có góc dọc cho màn hình đứng.
- Test chọn cảnh: schema nhận `ARCTIC`, API trả về đúng giá trị.
- Ảnh chụp headless ở 1440×900, 1024×768 và 768×1024 tại từng mốc. WebGL cần chạy Chromium có GPU.
- Thung lũng vẫn chạy như cũ.

## Để người dựng tự quyết

- Tọa độ camera cụ thể (đo trong Blender).
- Màu hoàng hôn và cực quang.
- Số tam giác của puffin.
- Cách nén GLB: Blender export trước. Nếu vẫn > 3 MB, hỏi người dùng trước khi dùng `npx gltf-transform` để nén meshopt (công cụ chưa có trong repo).
