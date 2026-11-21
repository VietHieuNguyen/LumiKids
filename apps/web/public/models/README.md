# public/models

| Thư mục | Nội dung | Git |
|---|---|---|
| `landing/` | Mô hình đã tối ưu cho trang landing (thung lũng, Bắc Cực, nhân vật). Web tải trực tiếp. | commit |
| `forest/`, `pond/`, `savana/` | Bộ cảnh nền của trò chơi (`game-runtime/environment`). | commit |
| `source/` | File gốc để chỉnh sửa và gói tải về. Không tải lên web. | bỏ qua (`.gitignore`) |

Quy ước tên: chữ thường, gạch nối, kèm tên tác giả với đồ tải về (`campfire-kenney.glb`). Bên trong các gói lớn của bên thứ ba giữ nguyên tên gốc vì FBX/OBJ tham chiếu texture theo tên.

## Cảnh landing

Admin đổi cảnh ở **/admin/settings → Cảnh trang chủ** (Thung lũng / Bắc Cực). Trang chủ chỉ tải file của cảnh đang chọn, chờ cài đặt về rồi mới dựng 3D; lỗi tải thì hiện poster.

| Cảnh | File | Code |
|---|---|---|
| Thung lũng | `landing/valley.glb` + nhân vật, `landing/poster.webp` | `features/landing/valley-scene.ts` |
| Bắc Cực | `landing/arctic.glb` (2,9 MB), `landing/arctic-poster.webp` | `features/landing/arctic-scene.ts`, đường camera `arctic-path.ts`, chữ trong `scene-config.ts` |

`arctic.glb` được xuất từ `source/arctic/globe-v8/arctic_landing.blend` (bản sao, file gốc v8 giữ nguyên); tọa độ dùng cho camera ghi ở `source/arctic/arctic-landing-notes.json`. So với quả cầu v8, bản landing thêm:
- bạn gấu của thung lũng (`ARC_Bear`, từ `source/bear.glb`) quàng khăn đỏ để không nhầm với gấu Bắc Cực;
- 3 chim puffin (`ARC_Puffin_*`, cao ~0,3): dựng lại trong Blender từ mẫu `source/arctic/downloads/Penguin.glb` (thân thấp lại, đầu to, mặt trắng, vòng cổ đen, mỏ tam giác xám–vàng–cam, chân cam);
- chó husky Quaternius (CC0, `source/quaternius-animals/husky.gltf`) có hoạt ảnh Idle, quay lưng về phía gấu;
- cá voi `SM_Orca_below_surface` có hai morph target `Tail_Up`/`Tail_Down`, three.js cho vẫy đuôi;
- hai điểm đèn `ARC_Light_Campfire`, `ARC_Light_Lantern`: three.js gắn đèn ấm vào đó, sáng dần ở mốc lửa trại.

Camera: quả cầu tự xoay để đưa từng điểm dừng ra trước mặt (như quả địa cầu để bàn), camera và đèn đứng yên phía trước (`arcticViewAt`). Mốc "Dành cho bé" lặn xuống nước nhìn đàn cá vàng và cá voi; khi camera dưới mặt nước có sương xanh.

Nguồn mô hình còn lại của quả cầu: xem `source/arctic/globe-v8/README_VI.md` và danh sách tải về bên dưới.

## source/

- `valley.glb`, `bear.glb`, … và `valley-kit/`, `duck-pack/` — nguồn của các file cùng tên trong `landing/`.
- `arctic/globe-v8/` — quả cầu Bắc Cực v8 (file `.blend`, GLB, trình xem HTML, `README_VI.md` ghi nguồn từng mô hình).
- `arctic/downloads/` — đồ tải từ Poly Pizza trước khi đưa vào quả cầu:
  - `campfire-kenney.glb` — Campfire, Kenney, https://poly.pizza/m/i6UFAevfcu
  - `firewood-log-voxeldev.glb` — Firewood Log, Voxel_dev, https://poly.pizza/m/9oGBUokNO5
  - `igloo-poly-google.glb` — Igloo, Poly by Google (CC BY), https://poly.pizza/m/4CNw6ZPb4x3
  - `kayak-poly-google.glb` — Kayak, Poly by Google, https://poly.pizza/m/8d-cgFdVEVN
  - `killer-whale-poly-google.glb` — Killer Whale, Poly by Google, https://poly.pizza/m/7pqZEQ9b_E-
  - `lantern-alex-safayan.glb` — Lantern, Alex Safayan, https://poly.pizza/m/3wYoxNf9RSJ
  - `arctic-globe-complete-v8-copy.glb` — bản trùng byte-với-byte của `globe-v8/arctic_globe_complete_v8.glb`, có thể xóa.
  - `Penguin.glb` — mẫu chim cánh cụt low-poly (obj2gltf) dùng làm gốc cho puffin. **Chưa rõ tác giả/giấy phép — cần bổ sung trước khi phát hành.**
  - `reference-ordinary-day-sketchfab.md` — ảnh tham khảo "Ordinary Day" (David Geraud, Sketchfab).
- `arctic/winter-mountains-craftpix/` — núi và đồi tuyết low-poly (CraftPix, xem `License.txt`).
- `quaternius-animals/` — 12 con vật Quaternius (CC0) có hoạt ảnh Idle/Walk/Eating…: alpaca, bull, cow, deer, donkey, fox, horse, horse-white, husky, shiba-inu, stag, wolf.
- `quaternius-nature-pack/` — Ultimate Nature Pack (Quaternius, CC0): cây, bụi, đá, cả bản phủ tuyết (`*_Snow_*`), dạng Blend/FBX/OBJ.
