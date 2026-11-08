# SKILLS.md – Danh sách & Quy tắc sử dụng Agent Skills cho LumiKids

> File này tổng hợp các bộ **AI Agent Skills** sử dụng trong dự án **LumiKids**, phân rõ skill nào dùng cho việc gì (đặc biệt là ranh giới giữa **Landing Page 3D** và **Ứng dụng/Trò chơi 2D bên trong**).

---

## 1. Bộ 3 Skills cốt lõi  (Workflow & Design)

| Skill | Nguồn tham khảo | Vai trò trong dự án LumiKids |
|---|---|---|
| **`superpowers`** | `obra/superpowers` | Quy trình làm việc chuẩn cho AI: lập kế hoạch từng bước, viết test trước/song song (TDD cho tầng `domain/`), debug có hệ thống và tự kiểm tra trước khi hoàn thành. |
| **`ui-ux-promax`** | `nextlevelbuilder/ui-ux-pro-max-skill` | Xây dựng Design System (`MASTER.md`): chọn bảng màu thân thiện giáo dục mầm non, cặp font tiếng Việt dễ đọc, bố cục Bento/Dashboard cho giáo viên và phụ huynh. |
| **`taste-skills`** | `Leonxlnx/taste-skill` | Chống giao diện "AI-slop" (bố cục rập khuôn, màu tím neon sến). Kiểm soát khoảng trắng, micro-interactions tinh tế và giới hạn hiệu ứng WebGL/3D hợp lý. |

---

## 2. Các Skills nên bổ sung theo đúng Tech Stack & Landing Page 3D

### Nhóm A: 3D Landing Page & 2D Web App (`apps/web`)

1. **`threejs-r3f-landing` (React Three Fiber / Three.js / Spline)**
   - **Phạm vi áp dụng:** **CHỈ dùng duy nhất cho trang Landing Page giới thiệu (`/`)**.
   - **Nội dung skill:**
     - Sử dụng `@react-three/fiber` + `@react-three/drei` (hoặc cảnh Spline nhẹ) tạo điểm nhấn 3D ở Hero section (ví dụ: các khối đồ chơi hình học/mầm non 3D chất liệu pastel mềm mại/claymorphism tương tác nhẹ theo chuột hoặc cuộn trang).
     - **Bắt buộc `next/dynamic` (`ssr: false`)** để cô lập hoàn toàn thư viện 3D, không làm nặng bundle của các trang bên trong.
     - Tự động giảm chất lượng hoặc chuyển sang hình minh họa 2D tĩnh trên điện thoại yếu (`prefers-reduced-motion` / mobile fallback theo chuẩn `taste-skills`).

2. **`vercel-react-best-practices` (Next.js App Router & Performance)**
   - **Nguồn:** `vercel-labs/agent-skills`
   - **Vai trò:** Giữ chuẩn Server Components vs Client Components trong Next.js, tối ưu tốc độ tải trang, quản lý state và tách biệt hoàn toàn nhóm route `(marketing)` (có 3D) với nhóm route `(app)` và `(play)` (thuần 2D).

3. **`kid-friendly-2d-interaction` (Framer Motion + `@dnd-kit`)**
   - **Phạm vi áp dụng:** **Toàn bộ các trang bên trong ứng dụng** (soạn giáo án kéo thả của giáo viên + màn hình trò chơi của trẻ).
   - **Nội dung skill:**
     - **Tuyệt đối KHÔNG dùng 3D/WebGL** ở khu vực này để đảm bảo máy tính bảng/iPad ở trường mầm non chạy mượt 60fps và không gây rối mắt cho trẻ.
     - Dùng `@dnd-kit` hỗ trợ cả chuột và cảm ứng (touch sensor) cho các trò chơi kéo thả/ghép cặp.
     - Dùng `Framer Motion` cho chuyển động 2D mềm mại; vùng chạm (touch target) cho trẻ 3–6 tuổi tối thiểu `56x56px`, ít chữ, ưu tiên hình ảnh và âm thanh phản hồi.

---

### Nhóm B: Backend, Database & AI (`apps/api` & `services/ai`)

4. **`nestjs-pragmatic-architecture` (NestJS Modular & Clean Arch)**
   - **Vai trò:** Giữ cho AI viết đúng chuẩn kiến trúc đã chốt trong `AGENTS.md`:
     - Dùng **3-Layer** gọn nhẹ cho 4 module CRUD (`users`, `classrooms`, `curriculum`, `learning-content`).
     - Dùng **Clean Architecture** (tách `domain/` thuần TS) cho 2 module tính toán lõi (`gameplay`, `evaluation-profile`).
     - Quản lý biến môi trường `.env.development` đè lên `.env` qua Decorator (`@Inject(config.KEY)`).

5. **`prisma-postgres-best-practices` (Prisma ORM & PostgreSQL)**
   - **Nguồn:** `prisma/skills` & `supabase/agent-skills`
   - **Vai trò:** Tối ưu schema 21 thực thể, đánh index chuẩn, xử lý ghi lô sự kiện `InteractionEvent` chống trùng (`eventId`), và tránh lỗi truy vấn N+1 khi tải `ChildDevelopmentProfile`.

6. **`fastapi-gemini-rag` (Python FastAPI + Gemini Structured Output + Qdrant)**
   - **Vai trò:** Hướng dẫn AI viết service Python chuẩn async, dùng Pydantic v2 ép kết quả Gemini trả về đúng 100% JSON schema của `GameContent`, `LessonPlan`, và `summary`, kết hợp truy xuất RAG tài liệu Chương trình GDMN trên **Qdrant** (Hybrid Search + Payload Filtering theo `ageGroup`, `skillCode`, `criterionCode`).

---

### Nhóm C: Kiểm thử & Chịu tải (`infra/k6` & Testing)

7. **`webapp-testing-and-k6` (Unit Test + Playwright + k6 Load Test)**
   - **Vai trò:** Viết Unit Test Jest cho tầng `domain/` (tính điểm `SessionPerformance`, đánh giá `CriterionState` → `SkillState` → `ChildDevelopmentProfile`) và viết kịch bản bắn tải **k6** để chứng minh khả năng scale khi bảo vệ đồ án.

---

## 3. Quy tắc phân vùng giao diện (3D vs 2D) cho AI

Khi gọi các skill thiết kế (`ui-ux-promax`, `taste-skills`, `threejs-r3f-landing`), AI phải tuân thủ bảng phân vùng sau:

| Khu vực màn hình | Công nghệ hiển thị | Phong cách thiết kế (Style) |
|---|---|---|
| **1. Landing Page (`/`)** | **3D kết hợp 2D** (`@react-three/fiber` / `@react-three/drei` + Framer Motion) | Hiện đại, bắt mắt, khối 3D phong cách **Claymorphism / Soft Pastel Toy** xoay nhẹ ở Hero section; bố cục Bento Grid giới thiệu tính năng AI & cá nhân hóa. |
| **2. Cổng Giáo viên & Phụ huynh (`/teacher`, `/guardian`)** | **Thuần 2D** (Tailwind CSS + shadcn/ui + `@dnd-kit` + Recharts) | Sạch sẽ, rõ ràng, dễ nhìn số liệu (`SkillState`, `ChildDevelopmentProfile`), thao tác kéo thả giáo án mượt mà, không dùng hiệu ứng màu mè gây mỏi mắt. |
| **3. Màn hình Trò chơi của Trẻ (`/play`)** | **Thuần 2D tương tác** (HTML5/SVG + Framer Motion + `@dnd-kit`) | Tối giản chữ, hình minh họa 2D rõ nét, nút bấm lớn, phản hồi chạm tức thì (hiệu ứng nảy nhẹ), chạy mượt trên cả tablet cấu hình thấp. |

---

## 4. Lệnh cài nhanh các bộ Skills phổ biến (nếu dùng `skills` CLI)

```bash
# 1. Bộ UI/UX & Taste
npx skills add nextlevelbuilder/ui-ux-pro-max-skill
npx skills add Leonxlnx/taste-skill

# 2. Bộ Workflow & Engineering (Superpowers)
npx skills add obra/superpowers

# 3. Bộ Next.js, React & Database
npx skills add vercel-labs/agent-skills
npx skills add prisma/skills
npx skills add supabase/agent-skills
```
