# public/models

| Thư mục | Nội dung | Git |
|---|---|---|
| `landing/` | Mô hình đã tối ưu cho trang landing (thung lũng, Bắc Cực, nhân vật). Web tải trực tiếp. | commit |
| `forest/`, `pond/`, `savana/` | Bộ cảnh nền của trò chơi (`game-runtime/environment`). | commit |
| `source/` | File gốc để chỉnh sửa và gói tải về. Không tải lên web. | bỏ qua (`.gitignore`) |

Quy ước tên: chữ thường, gạch nối, kèm tên tác giả với đồ tải về (`campfire-kenney.glb`). Bên trong các gói lớn của bên thứ ba giữ nguyên tên gốc vì FBX/OBJ tham chiếu texture theo tên.

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
  - `reference-ordinary-day-sketchfab.md` — ảnh tham khảo "Ordinary Day" (David Geraud, Sketchfab).
- `arctic/winter-mountains-craftpix/` — núi và đồi tuyết low-poly (CraftPix, xem `License.txt`).
- `quaternius-animals/` — 12 con vật Quaternius (CC0) có hoạt ảnh Idle/Walk/Eating…: alpaca, bull, cow, deer, donkey, fox, horse, horse-white, husky, shiba-inu, stag, wolf.
- `quaternius-nature-pack/` — Ultimate Nature Pack (Quaternius, CC0): cây, bụi, đá, cả bản phủ tuyết (`*_Snow_*`), dạng Blend/FBX/OBJ.
