# MinIO local infrastructure

## Cấu hình

Compose giữ nguyên PostgreSQL (host `127.0.0.1:5433`) và bổ sung MinIO với volume `minio_data`. S3 API: `http://localhost:9000`; Console: `http://localhost:9001`. Cả hai chỉ bind loopback cho development. Đổi `MINIO_API_PORT` / `MINIO_CONSOLE_PORT` trong `infra/.env` nếu máy có xung đột cổng; không đổi port container.

Trong `infra/.env`, tự thay `REPLACE_WITH_MINIO_ROOT_USER` và `REPLACE_WITH_MINIO_ROOT_PASSWORD` bằng credentials riêng (user ít nhất 3 ký tự, password ít nhất 8 ký tự). Các giá trị PostgreSQL đã có được giữ nguyên. Giữ `MINIO_BUCKET=lumikids-game-assets`. File `.env` bị Git ignore; `.env.example` chỉ chứa mẫu.

Compose hiện dùng `cgr.dev/chainguard/minio:latest` do người vận hành đổi sau lỗi registry của image ban đầu. Theo xác nhận của người vận hành, MinIO/Console/bucket đã hoạt động và có ảnh thử. Bước GameAsset giữ nguyên image/cấu hình hiện tại; chưa kiểm chứng lại runtime hoặc thay đổi infrastructure. Không giả định image Chainguard có shell hoặc MinIO Client `mc`.

## Khởi động

Mở Docker Desktop (Linux containers), điền credentials rồi chạy từ **repository root**:

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml config --quiet
docker compose --env-file infra/.env -f infra/docker-compose.yml pull minio
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d --no-deps minio
docker compose --env-file infra/.env -f infra/docker-compose.yml ps minio
Invoke-WebRequest http://localhost:9000/minio/health/live -UseBasicParsing
```

Lệnh `up` trên chỉ tác động MinIO. Không khai báo healthcheck container phụ thuộc vào công cụ chưa được kiểm chứng trong image. Health endpoint bên trên phải trả HTTP 200 trước khi khởi tạo bucket.

## Tạo bucket private, có thể chạy lại

Bucket hiện đã có; không cần tạo lại. Khi thiết lập máy mới, dùng Console nếu hỗ trợ, hoặc MinIO Client `mc.exe` độc lập trên Windows. Sau khi cấu hình alias `lumikids` bằng credentials root cục bộ (xem [GAME_ASSETS.md](./GAME_ASSETS.md#application-credentials-minio)), có thể tự chạy:

```powershell
mc mb --ignore-existing lumikids/lumikids-game-assets
mc anonymous set none lumikids/lumikids-game-assets
mc anonymous get lumikids/lumikids-game-assets
```

`mb --ignore-existing` giữ bucket/dữ liệu đã có; `anonymous set none` gỡ policy anonymous nếu bucket từng được mở public, không xóa object. Kiểm tra kết quả policy là `private`. Kiểm tra `$LASTEXITCODE` sau từng lệnh và dừng nếu khác 0. Không ghi root credentials vào source hoặc dùng root làm credentials Backend.

Đăng nhập Console bằng credentials trong `infra/.env` để xem bucket. Không bật anonymous access. Backend đọc ảnh bằng presigned GET có thời hạn theo [GAME_ASSETS.md](./GAME_ASSETS.md), giữ bucket private. Không cấp root credentials cho frontend.

## Dừng và lưu dữ liệu

```powershell
docker compose --env-file infra/.env -f infra/docker-compose.yml stop minio
docker compose --env-file infra/.env -f infra/docker-compose.yml start minio
```

Volume tồn tại qua restart/recreate container. Không chạy `docker compose down -v`: tùy chọn `-v` xóa cả volume PostgreSQL và MinIO trong project. Volume persistent chưa thay thế backup.

Code GameAsset Backend/S3 SDK đã được chuẩn bị ở Bước 2; migration/application credentials và thử upload thật thực hiện thủ công theo [GAME_ASSETS.md](./GAME_ASSETS.md). Chưa có giao diện upload học liệu.
