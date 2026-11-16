BÁO CÁO CƠ CHẾ ĐÁNH GIÁ
VÀ KIẾN TRÚC AI HỖ TRỢ CÁ NHÂN HÓA
Tài liệu mô tả cơ chế tính kết quả qua trò chơi, nguyên tắc tổng hợp hồ sơ và chức năng AI. Các trọng số, ngưỡng LEVEL và điều kiện đủ bằng chứng là cấu hình thử nghiệm của hệ thống, chưa phải thang đo được Bộ GD&ĐT công nhận.
1. Phạm vi và nguyên tắc đánh giá
Hệ thống tự động đánh giá kết quả trẻ thể hiện trong các trò chơi nhận thức. Kết quả được dùng để theo dõi tiến trình học tập và gợi ý hoạt động, không thay thế đánh giá chuyên môn hoặc chẩn đoán phát triển.
Chuẩn	Chỉ số tính điểm trò chơi	Nội dung ngoài phạm vi trò chơi
Chuẩn 15	42, 43, 44	Không có chỉ số chủ động loại khỏi phạm vi.
Chuẩn 16	45, 46, 47, 48, 49	Không có chỉ số chủ động loại khỏi phạm vi.
Chuẩn 17	50; 51 (chỉ phần phân loại)	Chỉ số 51: chưa đo lường phần gọi tên nhóm. 
Chỉ số 52: không chấm tự động.
Chuẩn 18	Không tham gia	Chỉ số 53–54: giáo viên quan sát và nhận xét thực tế.

Mỗi kết quả thuộc phạm vi trò chơi bắt buộc có LEVEL_0–LEVEL_4; chỉ trả LEVEL_0 khi bằng chứng của chính phạm vi đó chưa đủ. Chỉ số/chuẩn đã loại khỏi phép tính không làm thay đổi mẫu số hoặc khiến kết quả bị coi là thiếu dữ liệu.
Ở hồ sơ trẻ, kết quả LEVEL luôn đi kèm phạm vi đo; những nội dung chưa đánh giá (gọi tên nhóm của Chỉ số 51, Chỉ số 52 và Chuẩn 18) được hiển thị dưới dạng ghi chú hoặc nhận xét giáo viên.
2. Dữ liệu đầu vào và trách nhiệm các thành phần
Luồng xử lý: 
ActivityVersion/GameContent → InteractionEvent → SessionPerformance → CriterionEvaluation → CriterionState → SkillState → ChildDevelopmentProfile.
Assessment Engine chịu trách nhiệm tính Score, LEVEL; RAG + LLM chỉ phân tích và diễn giải dựa trên kết quả, bằng chứng và tài liệu liên quan.
2.1. SessionPerformance (Value Object)
Thuộc tính	Ý nghĩa nghiệp vụ
totalItemCount	Tổng nhiệm vụ của toàn phiên chơi, kể cả nhiệm vụ không chấm điểm.
finalizedItemCount	Số nhiệm vụ của toàn phiên đã có kết quả cuối cùng.
attemptCount	Tổng số lần gửi đáp án/thao tác được tính là một lần thử.
hintCount	Tổng số lượt nhận gợi ý trong phiên.
completionDuration	Thời gian tương tác thực tế; không tính thời gian tạm dừng và không dùng trong Score/LEVEL.
criterionResults	Map từ mã chỉ số tới CriterionPerformance; tránh trộn số liệu khi một phiên đánh giá nhiều chỉ số.

Mỗi CriterionPerformance chứa: totalScoredItems (N), finalizedScoredItems, firstAttemptCorrectCount (F), retryCorrectCount (R), hintCorrectCount (H), attemptCount, hintCount. 
F/R/H loại trừ lẫn nhau: một nhiệm vụ chỉ được xếp vào tối đa một nhóm kết quả.
Các chỉ số dẫn xuất: số nhiệm vụ giải quyết đúng = F + R + H; số nhiệm vụ đã kết thúc nhưng chưa đúng = finalizedScoredItems − (F + R + H); số nhiệm vụ chấm điểm chưa kết thúc = N − finalizedScoredItems.
2.2. Kết quả đánh giá được lưu
Thành phần	Ý nghĩa
CriterionEvaluation	Một chỉ số trong một phiên chơi.
CriterionState	Trạng thái một chỉ số tổng hợp từ nhiều phiên.
SkillState	Trạng thái một chuẩn, chỉ tính các chỉ số thuộc phạm vi trò chơi.
ChildDevelopmentProfile	Hồ sơ hiển thị tiến trình theo thời gian.

Score có thể để trống (null) khi LEVEL_0 do thiếu bằng chứng; không được hiểu LEVEL_0 là Score = 0%. Summary định lượng do engine tạo được lưu riêng với phần diễn giải do LLM sinh.
3. Công thức tính điểm và tổng hợp LEVEL
3.1. CriterionEvaluation - Kết quả một phiên chơi
ScoreCE = [(F + 0,5 × R + 0,25 × H) / N] × 100 (%)
Trong đó: F = số nhiệm vụ đúng lần đầu không gợi ý; R = số nhiệm vụ sai rồi tự sửa đúng không gợi ý; H = số nhiệm vụ đúng sau gợi ý; N = tổng nhiệm vụ chấm điểm của chỉ số trong phiên. Nhiệm vụ chưa giải quyết đúng đóng góp 0 điểm nhưng vẫn nằm trong N khi phiên được đánh giá hợp lệ.
LEVEL	Điều kiện
LEVEL_0	Không đủ bằng chứng hợp lệ để xác định mức.
LEVEL_1	0% ≤ Score < 40%.
LEVEL_2	40% ≤ Score < 60%.
LEVEL_3	60% ≤ Score < 85%.
LEVEL_4	85% ≤ Score ≤ 100%.

Điều kiện phiên hợp lệ (cấu hình thử nghiệm): phiên hoàn tất đúng quy tắc; có tối thiểu 5 nhiệm vụ được chấm cho chỉ số; dữ liệu event đầy đủ, hợp lệ; kết quả được máy chủ kiểm tra theo đúng phiên bản nội dung. Nếu không đạt, LEVEL_0 và ghi rõ nguyên nhân.
3.2. CriterionState - Tổng hợp nhiều CriterionEvaluation
ScoreCS = (ScoreCE₁ + ScoreCE₂ + … + ScoreCEₘ) / m
m là số CriterionEvaluation hợp lệ của cùng một chỉ số nằm trong Evidence Window. Không đưa phiên LEVEL_0 vào phép lấy trung bình như một điểm số 0. Mỗi phiên hợp lệ có trọng số bằng nhau ở phiên bản công thức hiện tại.
Điều kiện Evidence Window (cấu hình thử nghiệm): xét tối đa 30 ngày gần nhất; tối thiểu 3 phiên hợp lệ trên ít nhất 2 ngày; tối thiểu 2 bộ nội dung khác nhau, tổng cộng ít nhất 15 nhiệm vụ được chấm; chỉ tổng hợp các phiên có mức yêu cầu đủ tương đương. Nếu chưa đạt điều kiện, CriterionState trả LEVEL_0.
Sau khi có ScoreCS, áp dụng cùng bảng ngưỡng LEVEL ở mục 3.1. Giữ các phiên và nội dung nhiệm vụ làm bằng chứng để kiểm tra vì sao một chỉ số được xác định ở LEVEL đó.
3.3. SkillState - Tổng hợp các CriterionState thuộc một chuẩn
ScoreSS = (Σ ScoreCSⱼ) / k
k là số chỉ số thuộc phạm vi chấm tự động của chuẩn: k = 3 (Chuẩn 15), k = 5 (Chuẩn 16), k = 2 (Chuẩn 17). Chỉ số 52 và phần gọi tên nhóm ở Chỉ số 51 không được đưa vào mẫu số; Chuẩn 18 không tạo SkillState tự động từ trò chơi.
Quy tắc đủ bằng chứng đề xuất: các CriterionState nằm trong phạm vi của chuẩn đều phải có LEVEL_1–4; nếu một chỉ số thuộc phạm vi còn LEVEL_0 thì SkillState trả LEVEL_0. Các chỉ số đã loại khỏi phạm vi không ảnh hưởng điều kiện này. ScoreSS sau đó được quy đổi LEVEL theo bảng tại mục 3.1.
3.4. ChildDevelopmentProfile - Kết quả Nhận thức qua trò chơi
ScoreCDP = (ScoreSS15 + ScoreSS16 + ScoreSS17) / 3
Đây là điểm trung bình của 3 chuẩn đang được hệ thống trò chơi đánh giá. Mỗi chuẩn có trọng số ngang nhau; Chuẩn 18 do giáo viên nhận xét riêng, không tham gia phép tính. Nếu một trong ba SkillState chưa đủ bằng chứng theo quy tắc hiện tại, LEVEL Nhận thức qua trò chơi là LEVEL_0; nếu đủ, ScoreCDP được quy đổi LEVEL theo bảng ở mục 3.1.
Khi tổng hợp, dùng giá trị Score chưa làm tròn; chỉ làm tròn để hiển thị (khuyến nghị 2 chữ số thập phân). Kết quả cũ giữ phiên bản ruleVersion/scopeVersion để có thể truy vết khi quy tắc thay đổi.
4. Ví dụ xuyên suốt từ một phiên chơi đến hồ sơ
4.1. Tính CriterionEvaluation và CriterionState
Trẻ chơi một phiên thuộc Chỉ số 46 với N = 6, F = 4, R = 1, H = 1:  
ScoreCE = [(4 + 0,5 + 0,25)/6] × 100 = 79,17% → LEVEL_3.
Trong cửa sổ bằng chứng, trẻ có 3 phiên hợp lệ, với Score lần lượt 91,67%, 79,17% và 45,83%. Giả định các phiên đã được xác nhận đủ tương đương về yêu cầu để tổng hợp:
ScoreCS46 = (91,67 + 79,17 + 45,83) / 3 ≈ 72,22% → LEVEL_3
Số liệu theo từng dạng nhiệm vụ (ví dụ ABAB, AABB, ABC) vẫn được giữ để AI phân tích điểm mạnh và khó khăn cụ thể; Score chung không thay thế việc xem lại bằng chứng chi tiết.
4.2. Tổng hợp SkillState và hồ sơ
Chuẩn	Các Score của chỉ số thuộc phạm vi	Score chuẩn	LEVEL
15	88; 80; 80	82,67%	LEVEL_3
16	95; 72,22; 55; 80; 85	77,44%	LEVEL_3
17	75 (chỉ số 50); 90 (chỉ số 51, phần phân loại)	82,50%	LEVEL_3

ScoreCDP = (82,666… + 77,444… + 82,5) / 3 ≈ 80,87% → LEVEL_3
Hồ sơ ghi rõ: kết quả trên là mức Nhận thức qua trò chơi; Chỉ số 51 chưa đánh giá khả năng gọi tên nhóm; Chỉ số 52 chưa chấm tự động; Chuẩn 18 hiển thị nhận xét quan sát thực tế của giáo viên. Những ghi chú này không làm thay đổi LEVEL của phạm vi đã tính.
5. Kiến trúc AI được sử dụng: Assessment Engine + Hybrid RAG + LLM
Assessment Engine là nguồn xác định duy nhất đối với Score, LEVEL và quy tắc tổng hợp. RAG không chấm lại và LLM không được ghi đè các giá trị này. AI phục vụ phân tích có căn cứ, giải thích kết quả và cá nhân hóa hoạt động tiếp theo.

5.1. Trách nhiệm từng thành phần
Thành phần	Nhiệm vụ chính
Assessment Engine	Tổng hợp số liệu, kiểm tra bằng chứng, tính Score/LEVEL cho CriterionEvaluation, CriterionState, SkillState và CDP.
Evidence Builder	Truy vấn dữ liệu trẻ được phép truy cập; kết hợp kết quả đánh giá, lịch sử phiên và metadata nhiệm vụ thành gói bằng chứng cho AI.
RAG Retriever	Tìm tài liệu chuẩn, rubric, hướng dẫn sư phạm và thông tin hoạt động đã duyệt theo metadata, từ khóa và ngữ nghĩa.
LLM	Viết nhận xét dễ hiểu; phân tích dạng nhiệm vụ làm tốt/chưa tốt; giải thích lý do đề xuất hoạt động từ bằng chứng và nguồn truy xuất.
Output Validator	Kiểm tra JSON, bằng chứng/nguồn thực tế. Tuổi, quyền và những nội dung không được phép kết luận.

5.2. Hai nguồn dữ liệu và quy trình RAG
Nguồn A - dữ liệu có cấu trúc: SessionPerformance, CriterionEvaluation, CriterionState, SkillState và InteractionEvent. Backend truy vấn bằng PostgreSQL/SQL; không cần embedding từng kết quả chơi.
Nguồn B - kho tri thức: Bộ chuẩn 5 tuổi, hướng dẫn sư phạm đã duyệt, rubric của nhóm và metadata ActivityVersion. Tài liệu được trích xuất, chia đoạn theo nội dung, gắn sourceId/criterionId/ageGroup/version/status và lập chỉ mục để truy xuất. Có thể bắt đầu với metadata + full-text search và bổ sung pgvector khi cần semantic search.
Luồng một yêu cầu: (1) kiểm tra quyền hồ sơ → (2) Evidence Builder tạo dữ liệu đúng phạm vi → (3) Retriever tìm tri thức liên quan → (4) LLM sinh phân tích dạng JSON → (5) Validator kiểm tra → (6) giáo viên/phụ huynh xem kết quả. Việc gọi LLM tách khỏi transaction ghi điểm.
5.3. AI tạo ra kết quả gì?
Kết quả phân tích AI gồm: tóm tắt thành tích quan sát được; dạng nhiệm vụ trẻ thực hiện tốt; nội dung cần luyện thêm; các activityVersionId đề xuất có thật kèm lý do; mã bằng chứng và tài liệu tham chiếu. Ghi chú giới hạn đo lường của Chỉ số 51, 52 và Chuẩn 18 được ứng dụng lấy từ cấu hình phạm vi, không phụ thuộc việc LLM có nhắc tới hay không.
Ví dụ: “Qua ba phiên, trẻ có kết quả tốt hơn ở dạng ABAB và AABB; phiên ABC có kết quả thấp hơn. Có thể ưu tiên trò chơi quy luật ABC đã được duyệt với nội dung mới.” AI không được suy đoán rằng trẻ mắc vấn đề phát triển hoặc khẳng định nguyên nhân nằm ngoài dữ liệu.
6. Nguyên tắc vận hành, kiểm thử và bảo vệ dữ liệu
Nguyên tắc	Yêu cầu triển khai
Tính xác định	Cùng dữ liệu và phiên bản quy tắc phải cho cùng Score/LEVEL; unit test đối chiếu dữ liệu tính tay, gồm các ngưỡng 40/60/85%.
Truy vết	Kết quả lưu ruleVersion, scopeVersion và tham chiếu bằng chứng; tài liệu RAG có nguồn, phiên bản và trạng thái duyệt.
Bảo vệ trẻ em	Không gửi thông tin định danh trực tiếp không cần thiết cho LLM; kiểm tra quyền trước khi xây dựng gói bằng chứng.
Không phụ thuộc AI	Dịch vụ AI lỗi/timeout không làm mất điểm hoặc LEVEL; Summary định lượng vẫn có thể hiển thị.
Kiểm soát nội dung	Chỉ đề xuất hoạt động tồn tại, đã duyệt và phù hợp độ tuổi/quyền; nhận xét chuyên môn mang tên giáo viên cần giáo viên xem xét trước phát hành.
Kiểm thử RAG	Đo mức liên quan tài liệu truy xuất, độ bám bằng chứng của Summary, tính hợp lệ hoạt động và độ trễ/chi phí lời gọi AI.

7. Kết luận thiết kế
Hệ thống sử dụng một chuỗi đánh giá định lượng có thể kiểm thử và truy vết: SessionPerformance cung cấp số liệu; CriterionEvaluation phản ánh một lần chơi; CriterionState tổng hợp nhiều phiên; SkillState tổng hợp những chỉ số thuộc phạm vi; ChildDevelopmentProfile trình bày kết quả và lịch sử. Các cấp trong phạm vi đánh giá đều trả LEVEL, với LEVEL_0 khi thiếu bằng chứng hợp lệ.
Hybrid RAG + LLM là tầng hỗ trợ phân tích và cá nhân hóa: truy xuất tri thức được duyệt, kết hợp bằng chứng thực tế để viết nhận xét và gợi ý hoạt động, không quyết định Score/LEVEL. Thiết kế phù hợp với Spring Boot, PostgreSQL; có thể triển khai retrieval cơ bản trước rồi mở rộng pgvector mà không thay đổi mô hình đánh giá cốt lõi.
Công thức và ngưỡng là bộ quy tắc thử nghiệm của nhóm. Trước khi áp dụng như kết luận giáo dục có giá trị chuyên môn, cần rà soát phạm vi nhiệm vụ, thử nghiệm với dữ liệu thực tế và có đánh giá của giáo viên.