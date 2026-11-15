import type { CharacterId } from "./landing-assets";

export const LANDING_COPY = {
  nav: {
    links: [
      { label: "Khám phá", href: "#kham-pha", target: "explore" },
      { label: "Trò chơi", href: "#tro-choi", target: "games" },
      { label: "Dành cho giáo viên", href: "#giao-vien", target: "teacher" },
    ],
    login: "Đăng nhập",
    cta: "Khám phá trò chơi",
    ctaShort: "Trò chơi",
  },
  hero: {
    eyebrow: "Học qua chơi · Mầm non 3–6 tuổi",
    titleLines: ["Học qua chơi,", "khám phá mỗi ngày"],
    subtitle: "Biến chủ đề trên lớp thành những trò chơi tương tác cho bé.",
    cta: "Khám phá trò chơi",
    scrollHint: "Cuộn để khám phá",
  },
  /** Sound toggle (off by default). */
  sound: { on: "Bật âm thanh", off: "Tắt âm thanh", label: "Âm thanh" },
  /** What each animal "says" in a little bubble when it is tapped. */
  friends: { rabbit: "Xin chào!", bear: "Chào bé!", elephant: "Tu tu!", dog: "Gâu gâu!", duck: "Quạc quạc!" },
  guide: "Cùng khám phá thung lũng LumiKids",
  guideNote: "Mỗi khúc quanh là một hoạt động quan sát, so sánh và đếm. Chạm vào các bạn nhỏ để chào nhé!",
  encounter: {
    caption: "Gặp các bạn nhỏ của thung lũng",
  },
  teacher: {
    eyebrow: "Dành cho giáo viên",
    title: "Từ ý tưởng của cô đến trò chơi của bé",
    subtitle: "Chọn một chủ đề quen thuộc để tạo hoạt động phù hợp với lớp của bạn.",
    exampleLabel: "Ví dụ minh họa",
    examplePrompt: "Tạo trò ghép con vật với bóng cho trẻ 5–6 tuổi.",
    steps: [
      { title: "Nhập chủ đề", detail: "Mô tả bằng lời, chọn học liệu và độ khó." },
      { title: "Xem trước trò chơi", detail: "Chơi thử, chỉnh sửa và duyệt nội dung." },
      { title: "Bắt đầu hoạt động", detail: "Lưu vào kho chung để cả lớp cùng chơi." },
    ],
    cta: "Tạo trò chơi",
  },
  summit: {
    eyebrow: "Dành cho bé",
    title: "Mỗi ngày, một chuyến phiêu lưu nhỏ",
    body: "Bé chơi những trò cô đã duyệt, theo nhịp của riêng mình. Mỗi lượt chơi đều được lưu lại.",
    skills: ["Quan sát", "So sánh", "Đếm"],
  },
  farewell: {
    title: "Thung lũng luôn chờ bé quay lại",
    subtitle: "Cùng bé bắt đầu với những trò chơi đầu tiên.",
    cta: "Khám phá trò chơi",
    secondary: "Đăng nhập",
  },
  games: {
    eyebrow: "Kho trò chơi",
    title: "Khám phá trò chơi LumiKids",
    subtitle: "Bé quan sát, so sánh và đếm thông qua những tình huống quen thuộc.",
    cards: [
      { id: "shadow", title: "Ghép bóng", description: "Tìm hình bóng có đường viền trùng với con vật.", tag: "Quan sát" },
      { id: "count", title: "Đếm số lượng", description: "Quan sát nhóm đồ vật, đếm từng món và chọn số.", tag: "Đếm" },
      { id: "classify", title: "Phân loại", description: "Đưa đồ vật vào nhóm có đặc điểm chung.", tag: "So sánh" },
    ],
    cardCta: "Chơi cùng bé",
    note: "Mọi trò chơi đều được giáo viên duyệt trước khi đến tay trẻ.",
  },
  footer: {
    tagline: "Nền tảng trò chơi giáo dục mầm non — học qua chơi, có người lớn đồng hành.",
    links: [
      { label: "Đăng nhập", href: "/login" },
      { label: "Kho trò chơi", href: "/teacher/games" },
      { label: "Tạo trò chơi", href: "/teacher/games/create" },
    ],
    credits: "Mô hình 3D: thung lũng LumiKids Pastel; Thỏ và Gấu từ Sketchfab (xem giấy phép của tác giả); vịt của Liray 3D (Fab); Voi của Ozor, Chó con của kenchoo và Cỏ đuôi nến của SXuno — Sketchfab, CC BY 4.0, đã giảm lưới, làm mịn, đổi màu và thêm hoạt ảnh chờ.",
  },
} as const;

/** Landing game card → shared GameType, used to open the matching games after login. */
export const GAME_CARD_TYPES = { shadow: "MATCHING", count: "COUNTING", classify: "CLASSIFICATION" } as const satisfies Record<(typeof LANDING_COPY.games.cards)[number]["id"], string>;

export type HotspotContent = {
  pin: string;
  title: string;
  body: string;
  question: string;
  kind: "shadow" | "count";
};

export const HOTSPOTS: Record<CharacterId, HotspotContent> = {
  rabbit: {
    pin: "Gặp Thỏ",
    title: "Ghép con vật với chiếc bóng",
    body: "Quan sát đường viền rồi chọn chiếc bóng phù hợp với con vật.",
    question: "Bóng nào là của bạn mèo?",
    kind: "shadow",
  },
  bear: {
    pin: "Gặp Gấu",
    title: "Đếm quả trong giỏ",
    body: "Đếm từng quả, rồi chọn số tương ứng với số lượng trong giỏ.",
    question: "Trong giỏ có mấy quả táo?",
    kind: "count",
  },
};
