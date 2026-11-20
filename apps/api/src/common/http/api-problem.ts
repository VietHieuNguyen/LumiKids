import { HttpException } from '@nestjs/common';

/** Only static, reviewed public messages belong here; never pass SDK errors. */
const problems = {
  COUNTING_OBJECT_NOT_FOUND: [
    422,
    'Một học liệu trong danh sách chưa khớp tên. Hãy bổ sung aliases đúng cho ảnh ACTIVE hoặc dùng tên cụ thể trong thư viện.',
  ],
  COUNTING_OBJECT_AMBIGUOUS: [
    422,
    'Tên học liệu trùng giữa nhiều loại đối tượng. Hãy kiểm tra objectType và aliases hoặc dùng tên cụ thể hơn.',
  ],
  COUNTING_COMPOSITION_AMBIGUOUS: [
    422,
    'Số lượng từng loại đối tượng chưa rõ hoặc mâu thuẫn. Hãy nêu mỗi loại một số lượng cụ thể.',
  ],
  SHADOW_PAIRS_INSUFFICIENT: [
    422,
    'Chưa đủ cặp ảnh thường–hình bóng có cùng matchKey. Kiểm tra variant NORMAL/SHADOW, matchKey và trạng thái ACTIVE.',
  ],
  OFFSPRING_PAIRS_INSUFFICIENT: [
    422,
    'Chưa đủ cặp con trưởng thành–con non. Cần cùng animalType và familyKey, lifeStage lần lượt ADULT/YOUNG.',
  ],
  COUNTING_TARGET_AMBIGUOUS: [
    422,
    'Chưa xác định được đối tượng hoặc màu cần đếm. Hãy nêu rõ loại hình hoặc màu cần đếm giữa các hình khác.',
  ],
  PREVIEW_ACCESS_EXPIRED: [
    410,
    'Quyền đọc ảnh cho bản chơi thử đã hết hạn. Hãy tạo lại trò chơi.',
  ],
  AI_NOT_CONFIGURED: [
    503,
    'Chưa cấu hình AI Service hoặc Gemini API Key. Kiểm tra environment của API và AI Service.',
  ],
  AI_SERVICE_UNAVAILABLE: [
    503,
    'Không kết nối được AI Service. Kiểm tra service và thử lại.',
  ],
  AI_TIMEOUT: [504, 'AI xử lý quá thời gian cho phép. Vui lòng thử lại.'],
  AI_PROVIDER_AUTH_ERROR: [
    503,
    'Gemini từ chối API Key. Kiểm tra cấu hình của AI Service.',
  ],
  AI_QUOTA_EXCEEDED: [
    429,
    'Gemini đã đạt giới hạn quota hoặc tốc độ. Vui lòng thử lại sau.',
  ],
  AI_PROVIDER_ERROR: [502, 'Dịch vụ AI gặp lỗi. Vui lòng thử lại.'],
  AI_PROVIDER_CONFIG_ERROR: [
    503,
    'Cấu hình model hoặc kết nối nội bộ AI Service không hợp lệ.',
  ],
  AI_OUTPUT_INVALID: [
    502,
    'AI chưa tạo được GameContent hợp lệ sau số lần thử cho phép.',
  ],
  AI_OUTPUT_BLOCKED: [
    422,
    'AI không thể tạo nội dung cho yêu cầu này. Hãy điều chỉnh mô tả.',
  ],
  AI_OUTPUT_TRUNCATED: [
    502,
    'Nội dung AI vượt giới hạn output. Hãy giảm số lượng đối tượng.',
  ],
  AI_CONTRACT_INVALID: [
    502,
    'AI Service trả dữ liệu không đúng contract. Kiểm tra phiên bản và cấu hình.',
  ],
  ASSETS_INSUFFICIENT: [
    422,
    'Chưa đủ học liệu ACTIVE phù hợp. Bổ sung metadata/ảnh hoặc điều chỉnh yêu cầu.',
  ],
  ASSETS_CHANGED: [
    409,
    'Học liệu đã thay đổi hoặc ngừng sử dụng trong lúc tạo trò chơi. Hãy tạo lại.',
  ],
  PROMPT_AMBIGUOUS: [
    422,
    'Yêu cầu chưa đủ rõ. Dùng màu xanh dương hoặc xanh lá và mô tả đối tượng cụ thể.',
  ],
  PROMPT_OUT_OF_RANGE: [
    422,
    'Số lượng vượt giới hạn: COUNTING/MATCHING tối đa 20 hình, COUNTING có 2–6 đáp án; CLASSIFICATION tối đa 50 hình và 2–10 nhóm.',
  ],
  GENERATION_BUSY: [429, 'Bạn đang có một yêu cầu tạo trò chơi đang xử lý.'],
  CHILD_PROFILE_MISSING: [409, 'Tài khoản chưa có hồ sơ trẻ.'],
  PLAY_SESSION_REQUEST_CONFLICT: [
    409,
    'Yêu cầu bắt đầu này đã được dùng cho trò chơi khác.',
  ],
  PLAY_SESSION_CLOSED: [409, 'Lượt chơi đã kết thúc.'],
  PLAY_SESSION_BUSY: [
    409,
    'Lượt chơi đang được cập nhật. Hãy đồng bộ lại rồi gửi tiếp.',
  ],
  INTERACTION_OUT_OF_ORDER: [
    409,
    'Thao tác gửi chưa đúng thứ tự. Hãy đồng bộ lại lượt chơi.',
  ],
  INTERACTION_ID_CONFLICT: [409, 'Mã thao tác đã được dùng cho dữ liệu khác.'],
  INTERACTION_LIMIT: [409, 'Lượt chơi đã đạt số thao tác tối đa.'],
  INTERACTION_INVALID: [422, 'Thao tác không hợp lệ với trò chơi này.'],
  INTERACTION_RESULT_MISMATCH: [
    422,
    'Kết quả thao tác không khớp với đáp án của trò chơi.',
  ],
  SCHOOL_YEAR_NAME_TAKEN: [409, 'Tên năm học đã tồn tại.'],
  SCHOOL_YEAR_PERIOD_INVALID: [
    422,
    'Ngày kết thúc năm học phải sau ngày bắt đầu.',
  ],
  CLASSROOM_NAME_TAKEN: [409, 'Năm học này đã có lớp trùng tên.'],
  CLASSROOM_REFERENCE_INVALID: [422, 'Năm học hoặc nhóm tuổi không tồn tại.'],
  CLASSROOM_ARCHIVED: [409, 'Lớp đã lưu trữ, không thể thay đổi.'],
  CLASSROOM_NOT_EMPTY: [
    409,
    'Lớp còn trẻ đang học. Hãy chuyển trẻ sang lớp khác trước khi lưu trữ.',
  ],
  TEACHER_INVALID: [422, 'Người dùng này không phải giáo viên đang hoạt động.'],
  CHILD_ALREADY_IN_CLASS: [409, 'Trẻ đang học lớp này.'],
  CHILD_NOT_ENROLLED: [409, 'Trẻ hiện không học lớp này.'],
  CHILD_DISABLED: [409, 'Tài khoản của trẻ đang bị khóa.'],
  ACCOUNT_EMAIL_TAKEN: [409, 'Email này đã có tài khoản.'],
  GUARDIAN_NOT_VERIFIED: [
    409,
    'Tài khoản chưa xác minh email nên chưa khóa hoặc đặt lại mật khẩu được.',
  ],
  PASSWORD_CURRENT_INVALID: [422, 'Mật khẩu hiện tại không đúng.'],
  GROUP_NAME_TAKEN: [409, 'Lớp đã có nhóm trùng tên.'],
  GROUP_MEMBERS_INVALID: [
    422,
    'Có trẻ không còn học lớp này. Hãy tải lại danh sách.',
  ],
  ASSIGNMENT_GAMES_INVALID: [
    422,
    'Có trò chơi không còn trong kho hoặc đã lưu trữ. Hãy chọn lại trò.',
  ],
  ASSIGNMENT_NO_RECIPIENTS: [422, 'Chưa có trẻ nào nhận bài này.'],
  ASSIGNMENT_RECIPIENTS_INVALID: [
    422,
    'Có trẻ không còn học lớp này. Hãy tải lại danh sách.',
  ],
  ASSIGNMENT_PERIOD_INVALID: [
    422,
    'Hạn phải sau ngày mở bài và sau thời điểm hiện tại.',
  ],
  ASSIGNMENT_CANCELLED: [409, 'Bài giao đã bị hủy.'],
  REPLAY_NOT_NEEDED: [409, 'Bài vẫn đang mở, con vào chơi luôn nhé.'],
  REPLAY_ALREADY_DECIDED: [409, 'Yêu cầu chơi lại đã được xử lý.'],
  ACCOUNT_NOT_VERIFIED: [
    403,
    'Tài khoản chưa xác minh email. Hãy nhập mã xác minh đã gửi tới email.',
  ],
  VERIFICATION_INVALID: [422, 'Mã xác minh không đúng hoặc đã hết hạn.'],
  VERIFICATION_LOCKED: [
    429,
    'Đã nhập sai quá số lần cho phép. Hãy yêu cầu gửi mã mới.',
  ],
  VERIFICATION_TOO_SOON: [429, 'Vừa gửi mã. Vui lòng đợi một phút rồi thử lại.'],
  VERIFICATION_RATE_LIMITED: [
    429,
    'Email này đã nhận quá nhiều mã trong một giờ. Vui lòng thử lại sau.',
  ],
  GAME_AGE_GROUP_MISSING: [
    422,
    'Có trò chơi chưa được gắn nhóm tuổi. Người tạo trò hoặc quản trị cần chọn nhóm tuổi trong kho trước khi giao.',
  ],
  ASSIGNMENT_AGE_MISMATCH: [
    422,
    'Có trẻ không thuộc nhóm tuổi của trò chơi (tính theo tháng tuổi tại ngày mở bài). Hãy chọn trò khác hoặc bỏ trẻ đó.',
  ],
  AGE_GROUP_INVALID: [422, 'Nhóm tuổi không tồn tại.'],
  INVITE_INVALID: [
    404,
    'Lời mời không còn hiệu lực (sai mã, đã hết hạn, bị thu hồi hoặc đã dùng hết).',
  ],
  JOIN_REQUEST_PENDING: [409, 'Trẻ đã có yêu cầu đang chờ giáo viên lớp này duyệt.'],
  JOIN_REQUEST_DECIDED: [409, 'Yêu cầu tham gia đã được xử lý.'],
  CHILD_HAS_CLASS: [
    409,
    'Trẻ đang học một lớp khác. Hãy rời lớp đó trước khi xin vào lớp mới.',
  ],
  CONSENT_REQUIRED: [422, 'Cần đồng ý chia sẻ dữ liệu học tập với lớp.'],
  FAMILY_CHILD_NOT_FOUND: [404, 'Không tìm thấy hồ sơ trẻ của bạn.'],
  FAMILY_CHILD_CLASS_MANAGED: [
    409,
    'Trẻ đang học ở lớp; lượt giao bài do giáo viên quản lý. Rời lớp để tự chọn trò cho trẻ.',
  ],
  NOT_FAMILY_ENROLLMENT: [
    409,
    'Trẻ được nhà trường xếp lớp, phụ huynh không tự rời lớp được. Hãy liên hệ nhà trường.',
  ],
  LESSON_PLAN_NOT_FOUND: [404, 'Không tìm thấy giáo án.'],
  LESSON_PLAN_CONFLICT: [
    409,
    'Giáo án vừa được lưu ở nơi khác. Hãy tải lại để xem bản mới nhất trước khi sửa tiếp.',
  ],
  LESSON_PLAN_INCOMPLETE: [
    422,
    'Giáo án hoàn chỉnh cần đủ tên, mục tiêu, chuẩn bị, ít nhất một hoạt động và phần đánh giá.',
  ],
  LESSON_PLAN_GAME_INVALID: [
    422,
    'Có trò chơi gắn vào hoạt động không còn trong kho. Hãy chọn lại.',
  ],
  ENROLLMENT_CHANGED: [
    409,
    'Lớp của trẻ vừa được thay đổi. Hãy tải lại rồi thử lại.',
  ],
} as const;
export type GenerationProblemCode = keyof typeof problems;
export class ApiProblem extends HttpException {
  readonly publicCode: GenerationProblemCode;
  readonly publicMessage: string;
  constructor(code: GenerationProblemCode) {
    const [status, message] = problems[code];
    super(message, status);
    this.publicCode = code;
    this.publicMessage = message;
  }
}
