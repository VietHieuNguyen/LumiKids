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
