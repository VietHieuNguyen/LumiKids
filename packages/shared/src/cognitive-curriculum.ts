import type { Skill } from "./game-library.js";

/** Approved project scope: standards 15–17, indices 42–52; no standard 18. */
export const cognitiveCurriculum: Skill[] = [
  {
    skillCode: "15",
    name: "Số, đếm và đo lường",
    description:
      "Trẻ em thực hiện các kỹ năng liên quan đến số, đếm, đo và biểu thị kết quả.",
    criterions: [
      {
        criterionCode: "42",
        skillCode: "15",
        description: "Tách, gộp số lượng trong phạm vi 10.",
      },
      {
        criterionCode: "43",
        skillCode: "15",
        description: "So sánh, thêm, bớt số lượng trong phạm vi 10.",
      },
      {
        criterionCode: "44",
        skillCode: "15",
        description:
          "Đo độ dài, dung tích của đối tượng bằng đơn vị đo ước lệ.",
      },
    ],
  },
  {
    skillCode: "16",
    name: "Hình dạng, quy tắc, không gian và thời gian",
    description:
      "Trẻ em xác định hình dạng, quy tắc sắp xếp, định hướng trong không gian và thời gian.",
    criterions: [
      {
        criterionCode: "45",
        skillCode: "16",
        description:
          "Xác định một số hình phẳng và hình khối đơn giản trong cuộc sống xung quanh.",
      },
      {
        criterionCode: "46",
        skillCode: "16",
        description: "Sắp xếp theo quy tắc.",
      },
      {
        criterionCode: "47",
        skillCode: "16",
        description: "Xác định vị trí trong không gian theo vật chuẩn.",
      },
      {
        criterionCode: "48",
        skillCode: "16",
        description:
          "Phân biệt hôm qua, hôm nay, ngày mai và gọi tên các ngày trong tuần theo thứ tự.",
      },
      {
        criterionCode: "49",
        skillCode: "16",
        description: "Xác định giờ đúng trên đồng hồ.",
      },
    ],
  },
  {
    skillCode: "17",
    name: "Khám phá khoa học",
    description: "Trẻ em nhận biết và thực hiện khám phá khoa học.",
    criterions: [
      {
        criterionCode: "50",
        skillCode: "17",
        description:
          "Nhận biết một số đặc điểm nổi bật và sự thay đổi của môi trường tự nhiên.",
      },
      {
        criterionCode: "51",
        skillCode: "17",
        description: "Phân loại một số sự vật thành nhóm theo đặc điểm chung.",
      },
      {
        criterionCode: "52",
        skillCode: "17",
        description:
          "Giải thích mối quan hệ giữa đặc điểm của một số loài động vật, thực vật với môi trường sống.",
      },
    ],
  },
];
