import type { AdminOverview } from "@lumikids/shared";

export type AttentionTone = "block" | "warn" | "info";
export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  title: string;
  detail: string;
  href: string | null;
  action: string;
}

const names = (list: { className: string }[]) => {
  const shown = list.slice(0, 3).map((item) => item.className).join(", ");
  return list.length > 3 ? `${shown} và ${list.length - 3} lớp khác` : shown;
};
const classHref = (list: { classId: string }[]) =>
  list.length === 1 ? `/admin/classrooms/${list[0]?.classId}` : "/admin/classrooms";

/**
 * What the admin must act on, most blocking first. "block" = children cannot play or a class cannot
 * run; "warn" = it runs but badly; "info" = someone else's queue, shown for awareness.
 */
export function attentionItems(overview: AdminOverview): AttentionItem[] {
  const { attention: a, schoolYear } = overview;
  const items: AttentionItem[] = [];
  if (!schoolYear)
    items.push({ id: "no-year", tone: "block", title: "Chưa có năm học", detail: "Tạo năm học trước, rồi mới tạo lớp và xếp trẻ.", href: "/admin/school-years", action: "Tạo năm học" });
  else if (!schoolYear.hasNextYear && schoolYear.daysLeft < 0)
    items.push({ id: "year-ended", tone: "block", title: `Năm học ${schoolYear.name} đã kết thúc`, detail: "Tạo năm học mới và chuyển lớp cho trẻ.", href: "/admin/school-years", action: "Tạo năm học" });
  else if (!schoolYear.hasNextYear && schoolYear.daysLeft <= 45)
    items.push({ id: "year-ending", tone: "warn", title: `Năm học ${schoolYear.name} còn ${schoolYear.daysLeft} ngày`, detail: "Chưa có năm học kế tiếp. Chuẩn bị lớp mới trước khi hết năm.", href: "/admin/school-years", action: "Tạo năm học" });
  if (a.classesWithoutTeacher.length)
    items.push({ id: "no-teacher", tone: "block", title: `${a.classesWithoutTeacher.length} lớp chưa có giáo viên`, detail: `${names(a.classesWithoutTeacher)}: không ai cấp mã hay giao bài được cho trẻ.`, href: classHref(a.classesWithoutTeacher), action: "Phân công" });
  if (a.unassignedChildren)
    items.push({ id: "unassigned", tone: "warn", title: `${a.unassignedChildren} trẻ chưa xếp lớp`, detail: "Mở danh sách hồ sơ để chọn trẻ và lớp tiếp nhận.", href: "/admin/children", action: "Xếp lớp" });
  if (a.classesWithoutOpenAssignment.length)
    items.push({ id: "no-assignment", tone: "warn", title: `${a.classesWithoutOpenAssignment.length} lớp không có bài đang mở`, detail: `${names(a.classesWithoutOpenAssignment)}: trẻ đăng nhập sẽ không có trò nào để chơi.`, href: classHref(a.classesWithoutOpenAssignment), action: "Xem lớp" });
  if (a.childrenWithoutCode)
    items.push({ id: "no-code", tone: "warn", title: `${a.childrenWithoutCode} trẻ chưa có mã đăng nhập`, detail: "Giáo viên của lớp cấp mã và in thẻ cho trẻ.", href: "/admin/classrooms", action: "Xem lớp" });
  if (a.dormantTeachers.length)
    items.push({ id: "dormant", tone: "warn", title: `${a.dormantTeachers.length} giáo viên 14 ngày chưa đăng nhập`, detail: `${a.dormantTeachers.slice(0, 3).map((t) => t.fullName).join(", ")} đang phụ trách lớp.`, href: "/admin/teachers", action: "Xem giáo viên" });
  if (a.archivedGamesInOpenAssignments)
    items.push({ id: "archived", tone: "warn", title: `${a.archivedGamesInOpenAssignments} trò trong bài đang mở đã bị lưu trữ`, detail: "Trẻ thấy trò này bị khóa. Khôi phục trò hoặc nhờ giáo viên giao bài khác.", href: "/admin/games", action: "Mở kho trò" });
  if (a.classesWithoutChildren.length)
    items.push({ id: "empty-class", tone: "warn", title: `${a.classesWithoutChildren.length} lớp chưa có trẻ`, detail: `${names(a.classesWithoutChildren)}.`, href: classHref(a.classesWithoutChildren), action: "Thêm trẻ" });
  if (a.pendingReplayRequests)
    items.push({ id: "replays", tone: "info", title: `${a.pendingReplayRequests} yêu cầu chơi lại đang chờ`, detail: "Giáo viên của lớp duyệt trong trang bài giao.", href: null, action: "" });
  const order: Record<AttentionTone, number> = { block: 0, warn: 1, info: 2 };
  return items.sort((x, y) => order[x.tone] - order[y.tone]);
}
