# Class Diagram — Quan hệ UML và từ điển thực thể

> **Mục đích:** Tài liệu văn bản dành cho AI Agent đọc thay cho việc tự suy luận các đường nối từ hai ảnh class diagram. Tài liệu bám theo **ký hiệu vẽ trên ảnh** và dùng file DOCX “Từ điển dữ liệu sơ bộ” để diễn giải ý nghĩa thực thể. **Không tự thay đổi bội số, loại quan hệ hoặc hướng hình thoi để phù hợp với suy đoán nghiệp vụ.**

## 1. Quy ước đọc quan hệ — quan trọng

- Ký hiệu `A (1) ----(association: nhãn)---- (0..*) B`: đường nối thường; bội số `1` nằm **ở đầu A**, `0..*` nằm **ở đầu B**. Có nghĩa một `B` liên hệ với một `A`, còn một `A` có thể liên hệ với từ 0 đến nhiều `B`.
- `A (?) ◆----(composition)---- (?) B`: **hình thoi đen `◆` đặt ngay cạnh A**; `A` là phía **whole/owner**, `B` là phía **part**.
- `A (?) ◇----(aggregation)---- (?) B`: **hình thoi rỗng `◇` đặt ngay cạnh A**; `A` là phía whole/aggregate, `B` là phía part.
- `Subclass ----(generalization)----▷ Superclass`: **đầu tam giác rỗng `▷` chỉ vào superclass** (lớp cha), không phải chiều ngược lại.
- `A - - -(dependency: nhãn)- - -> B`: mũi tên phụ thuộc nét đứt chỉ về `B`; **không đồng nghĩa** với association hoặc khóa ngoại.
- Dấu `(?)` = **ảnh không ghi bội số ở đầu nối đó**. Không tự diễn giải thành `(1)` hay `(0..*)`. `0..*` nghĩa là từ 0 đến nhiều, `1..*` nghĩa là ít nhất một.
- **Chỉ mục 2** dưới đây là các **quan hệ thực sự có đường nối trên ảnh**. Các quan hệ được gợi ý bởi thuộc tính nhưng **không có đường nối** được tách riêng trong mục 4.
- Với composition và aggregation, vị trí của `◆` / `◇` trong văn bản là **hướng xác định của quan hệ**, không phải trang trí.

## 2. Toàn bộ quan hệ THỰC SỰ ĐƯỢC VẼ trên hai ảnh (20 quan hệ)

### 2.1. Generalization / kế thừa (2)

```text
[G01] Teacher  ----(generalization)----▷ User <<abstract>>
      // Teacher kế thừa User; tam giác rỗng trỏ vào User.

[G02] Guardian ----(generalization)----▷ User <<abstract>>
      // Guardian kế thừa User; tam giác rỗng trỏ vào User.
```

### 2.2. Association / liên kết thường (9)

```text
[A01] Teacher (1) ----(association: has)---- (0..*) LessonPlan
      // Một Teacher có 0..* LessonPlan; mỗi LessonPlan liên kết 1 Teacher.

[A02] Teacher (1) ----(association: creates)---- (0..*) ActivityAssignment
      // Một Teacher tạo 0..* ActivityAssignment; mỗi Assignment do 1 Teacher tạo.

[A03] Guardian (1) ----(association: is responsible for)---- (1..*) Child
      // Theo đúng ảnh: một Guardian phụ trách 1..* Child; đầu Guardian ghi 1.

[A04] ActivityAssignment (1) ----(association: has)---- (0..*) ActivityRecipient
      // Một Assignment có 0..* Recipient; mỗi Recipient thuộc 1 Assignment.

[A05] ActivityRecipient (0..*) ----(association: is assigned to)---- (1) Child
      // Một Child có 0..* Recipient; mỗi Recipient gắn với 1 Child.

[A06] Child (1) ----(association: participates in)---- (0..*) PlaySession
      // Một Child có 0..* PlaySession; mỗi PlaySession gắn với 1 Child.

[A07] ActivityVersion (1) ----(association: used by)---- (0..*) PlaySession
      // Một ActivityVersion được dùng trong 0..* PlaySession;
      // mỗi PlaySession dùng 1 ActivityVersion.

[A08] Skill (1) ----(association: has)---- (0..*) SkillState
      // Đảo vị trí hai đầu để dễ đọc; trên ảnh bội số 1 nằm ở Skill,
      // 0..* nằm ở SkillState.

[A09] ActivityVersion (0..*) ----(association: has criteria)---- (1) AssessmentCriterion
      
```

### 2.3. Aggregation / hình thoi RỖNG (2)

```text
[AG01] Classroom (?) ◇----(aggregation)---- (?) Teacher
       // HÌNH THOI RỖNG NẰM Ở CLASSROOM, KHÔNG NẰM Ở TEACHER.
       // Hai đầu không ghi bội số. Classroom có teachers: List<Teacher>.

[AG02] Classroom (?) ◇----(aggregation)---- (?) Child
       // HÌNH THOI RỖNG NẰM Ở CLASSROOM, KHÔNG NẰM Ở CHILD.
       // Hai đầu không ghi bội số. Classroom có childs: List<Child>.
```

### 2.4. Composition / hình thoi ĐEN (6)

```text
[C01] Activity (?) ◆----(composition)---- (?) ActivityVersion
      // HÌNH THOI ĐEN Ở ACTIVITY; Activity là whole/owner của ActivityVersion.
      // Hai đầu không ghi bội số; thuộc tính Activity.versions là List<ActivityVersion>.

[C02] PlaySession (?) ◆----(composition)---- (?) InteractionEvent
      // HÌNH THOI ĐEN Ở PLAYSESSION; PlaySession chứa InteractionEvent.
      // Hai đầu không ghi bội số; PlaySession.interactions là List<InteractionEvent>.

[C03] PlaySession (?) ◆----(composition)---- (?) CriterionEvaluation
      // HÌNH THOI ĐEN Ở PLAYSESSION; PlaySession chứa CriterionEvaluation.
      // Hai đầu không ghi bội số.

[C04] ChildDevelopmentProfile (?) ◆----(composition)---- (?) SkillState
      // HÌNH THOI ĐEN Ở CHILDDEVELOPMENTPROFILE;
      // đường đi nối từ cạnh phải Profile sang phía SkillState ở ảnh còn lại.
      // Hai đầu không ghi bội số.

[C05] SkillState (?) ◆----(composition)---- (?) CriterionState
      // HÌNH THOI ĐEN Ở SKILLSTATE; SkillState chứa CriterionState.
      // Hai đầu không ghi bội số; SkillState.criterionState là list<CriterionState>.

[C06] Skill (?) ◆----(composition)---- (?) AssessmentCriterion
      // HÌNH THOI ĐEN Ở SKILL; Skill chứa AssessmentCriterion.
      // Hai đầu không ghi bội số; Skill.criterions là List<AssessmentCriterion>.
```

### 2.5. Dependency / phụ thuộc NÉT ĐỨT (1)

```text
[D01] CriterionEvaluation - - -(dependency: contributes evidence)- - -> CriterionState
      // Mũi tên nét đứt CHỈ VÀO CriterionState.
      // Ý nghĩa: CriterionEvaluation đóng góp bằng chứng cho việc cập nhật
      // CriterionState; KHÔNG biểu diễn composition hay association trong ảnh.
```

**Tổng kiểm kê: 2 kế thừa + 9 association + 2 aggregation + 6 composition + 1 dependency = 20 quan hệ được vẽ.**

## 3. Từ điển 21 thực thể (đối chiếu DOCX và thuộc tính trên ảnh)

> Từ điển bên dưới giúp Agent hiểu vai trò của thực thể, **không tự tạo thêm đường nối UML**. Tên field và kiểu được giữ gần với sơ đồ; các mô tả là diễn giải ngắn từ DOCX.

| STT | Lớp | Vai trò nghiệp vụ | Thuộc tính ghi trong class diagram |
|---:|---|---|---|
| 1 | `User` *(abstract)* | Thông tin người dùng chung, lớp cha của giáo viên và phụ huynh/người giám hộ. | `userId: String`, `fullName: String`, `email: String`, `phone: String`, `address: String` |
| 2 | `Teacher` | Tổ chức hoạt động giáo dục, lớp học, giao bài và theo dõi phát triển trẻ. | `specialization: String` |
| 3 | `Guardian` | Người giám hộ theo dõi hồ sơ và kết quả học tập của trẻ. | `relationship: ENUM` |
| 4 | `Child` | Thông tin trẻ tham gia hoạt động và có lịch sử chơi. | `childId: String`, `dob: DateTime`, `fullName: String`, `gender: Gender` |
| 5 | `Classroom` | Quản lý một lớp, giáo viên, trẻ, năm học và nhóm tuổi. | `classId: String`, `className: String`, `schoolYear: SchoolYear`, `ageGroup: AgeGroup`, `teachers: List<Teacher>`, `childs: List<Child>` |
| 6 | `SchoolYear` | Danh mục năm học. | `schoolYearId: String`, `name: String` |
| 7 | `AgeGroup` | Danh mục nhóm tuổi, dùng phân loại lớp và chọn hoạt động phù hợp. | `ageGroupId: String`, `name: String` |
| 8 | `LessonPlan` | Giáo án chứa chủ đề và mục tiêu giáo dục. | `lessonPlanId: String`, `title: String`, `objectives: String` |
| 9 | `Activity` | Hoạt động/trò chơi giáo dục ở mức tổng quan, có các phiên bản. | `activityId: String`, `name: String`, `description: String`, `ageGroup: AgeGroup`, `versions: List<ActivityVersion>` |
| 10 | `ActivityVersion` | Phiên bản trò chơi cụ thể với nội dung, hướng dẫn, độ khó và điều kiện hoàn thành. | `versionId: String`, `versionNumber: Integer`, `instruction: String`, `difficulty: ENUM`, `content: GameContent`, `completionRule: ENUM` |
| 11 | `ActivityAssignment` | Đợt giao hoạt động do giáo viên tạo, có hạn và danh sách phiên bản. | `assignId: String`, `title: String`, `deadline: Date`, `activities: List<ActivityVersion>` |
| 12 | `ActivityRecipient` | Bản ghi một trẻ nhận một đợt giao hoạt động và trạng thái hoàn thành. | `activityRecipientId: String`, `completionStatus: ENUM` |
| 13 | `PlaySession` | Một lượt chơi của trẻ với phiên bản hoạt động, ghi tương tác và kết quả. | `sessionId: String`, `interactions: List<InteractionEvent>`, `performance: SessionPerformance` |
| 14 | `InteractionEvent` | Sự kiện thao tác trong lượt chơi, làm dữ liệu bằng chứng đánh giá. | `eventId: String`, `eventType: EventType`, `actionData: ActionData` |
| 15 | `SessionPerformance` | Số liệu tổng hợp một lượt chơi: lượt thử, đúng/sai, gợi ý và thời gian. | `playSessionId: String`, `attemptCount: Integer`, `correctCount: Integer`, `incorrectCount: Integer`, `firstAttemptCorrectCount: Integer`, `hintCount: Integer`, `completionDuration: Time` |
| 16 | `CriterionEvaluation` | Kết quả đánh giá một tiêu chí dựa trên bằng chứng của lượt chơi. | `criterionEvaluationId: String`, `level: ENUM`, `summary: String`, `criterionCode: String` |
| 17 | `CriterionState` | Trạng thái hiện tại của trẻ ở một tiêu chí, tổng hợp từ các lượt chơi. | `criterionStateId: String`, `criterionCode: String`, `level: ENUM`, `summary: String` |
| 18 | `SkillState` | Trạng thái hiện tại ở một kỹ năng/chuẩn phát triển, tổng hợp từ tiêu chí. | `skillStateId: String`, `skillCode: String`, `level: ENUM`, `summary: String`, `criterionState: list<CriterionState>` |
| 19 | `Skill` | Kỹ năng hoặc chuẩn phát triển, chứa các tiêu chí đánh giá. | `skillCode: String`, `name: String`, `description: String`, `criterions: List<AssessmentCriterion>` |
| 20 | `AssessmentCriterion` | Tiêu chí/chỉ số dùng để đánh giá phát triển nhận thức. | `criterionCode: String`, `description: String` |
| 21 | `ChildDevelopmentProfile` | Hồ sơ phát triển cá nhân: hoạt động, xu hướng tiến bộ và tổng kết. | `childId: String`, `profileId: String`, `activities: List<ActivityVersion>`, `progressTrend: Enum`, `summary: String` |

### Phương thức có thể đọc được trên hai ảnh

```text
User                     : login(); logout()
Teacher                  : createActivity(): Activity; viewStudentProfile(); getRecommendation()
Guardian                 : viewChildProfile()
Classroom                : addStudent(Child): Void
LessonPlan               : generateLessonPlan()
Activity                 : addVersion(version: ActivityVersion): void; getVersions(): List<ActivityVersion>
ActivityVersion          : play()
ActivityAssignment       : function()                  // placeholder trong ảnh
ActivityRecipient        : function()                  // placeholder trong ảnh
PlaySession              : calculatePerformance(): Performance
CriterionState           : applyEvaluation(evaluation): void
ChildDevelopmentProfile  : getSkillState(skill): SkillState
```

Các lớp còn lại không có phương thức hiển thị trong ảnh. `function()` là tên placeholder trên sơ đồ, **không phải nghiệp vụ cụ thể đã được xác định**.

## 4. Lưu ý
class diagram hiện tại đang là class diagram ở mức bussiness domain nhằm thể hiện và thiết kế cho người xem hiểu được nghiệp vụ của bài toán. Do đó khi triển khai xuống code thì có thể bổ sung thêm 1 vài trường thuộc tính để phục vụ tính toán cũng như là những phương thức cũng vậy. Chính vì vậy class diagram này chính là bản thiết kế nghiệp vụ để khi code chúng ta không đi sai hướng. Đồng thời được mở rộng thêm các trường hay thực thể để hỗ trợ bài toán khi rã code.

Lấy ví dụ như thuộc tính content trong ActivityVersion trên class diagram chỉ được note là GameContent. Tuy nhiên khi rã xuống code thì nó lại là interface,... gì gì đó để hỗ trợ về phần kỹ thuật cho bài toán 


