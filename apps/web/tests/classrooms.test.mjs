import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLoginCodeInput, isCompleteLoginCode, LOGIN_CODE_ALPHABET } from "../src/lib/child-login-code.ts";
import { ageInYears, formatDate, formatDateOnly, formatDuration } from "../src/features/classrooms/format.ts";

test("login code input: upper-cases, groups 4-4 and stops at 8 symbols", () => {
  assert.equal(formatLoginCodeInput("k7mq"), "K7MQ");
  assert.equal(formatLoginCodeInput("k7mq2"), "K7MQ-2");
  assert.equal(formatLoginCodeInput("k7mq2hxa"), "K7MQ-2HXA");
  assert.equal(formatLoginCodeInput("K7MQ-2HXA-ZZZ"), "K7MQ-2HXA");
});

test("login code input: drops spaces, dashes and look-alikes outside the alphabet", () => {
  assert.equal(formatLoginCodeInput(" k7 mq - 2h xa "), "K7MQ-2HXA");
  // I, L, O, 0 and 1 are never issued, so they are typos rather than guesses.
  assert.equal(formatLoginCodeInput("IL0O1K7MQ2HXA"), "K7MQ-2HXA");
  for (const character of "ILO01") assert.equal(LOGIN_CODE_ALPHABET.includes(character), false);
});

test("login code input: complete only with all 8 symbols", () => {
  assert.equal(isCompleteLoginCode("K7MQ-2HX"), false);
  assert.equal(isCompleteLoginCode("K7MQ-2HXA"), true);
});

test("dates: calendar dates are shown without a time-zone shift", () => {
  assert.equal(formatDateOnly("2021-05-01"), "01/05/2021");
  // 17:30 UTC on 30 Nov is already 1 Dec in Vietnam.
  assert.equal(formatDate("2026-11-30T17:30:00.000Z"), "01/12/2026");
});

test("age counts whole years, the day before a birthday included", () => {
  assert.equal(ageInYears("2021-05-01", "2026-04-30"), 4);
  assert.equal(ageInYears("2021-05-01", "2026-05-01"), 5);
  assert.equal(ageInYears("bad", "2026-05-01"), null);
});

test("duration of a play session", () => {
  assert.equal(formatDuration("2026-11-16T08:00:00.000Z", null), null);
  assert.equal(formatDuration("2026-11-16T08:00:00.000Z", "2026-11-16T08:00:42.000Z"), "42 giây");
  assert.equal(formatDuration("2026-11-16T08:00:00.000Z", "2026-11-16T08:08:05.000Z"), "8 phút 5 giây");
  assert.equal(formatDuration("2026-11-16T08:00:00.000Z", "2026-11-16T09:30:00.000Z"), "1 giờ 30 phút");
});

import { deadlineLabel, givenName, progressSentence } from "../src/features/gameplay/child-format.ts";
import { addDays, endOfLocalDay, startOfLocalDay, toLocalDateInput } from "../src/features/classrooms/format.ts";

test("child wording: given name, deadline in days, progress sentence", () => {
  assert.equal(givenName("Nguyễn Minh  An "), "An");
  assert.equal(givenName(""), "con");
  // Noon in Vietnam, mid-morning UTC: day boundaries agree in both zones.
  const now = new Date("2026-11-16T05:00:00.000Z");
  assert.equal(deadlineLabel(null, now), null);
  assert.deepEqual(deadlineLabel("2026-11-16T04:00:00.000Z", now), { text: "Đã hết giờ", urgent: true });
  assert.deepEqual(deadlineLabel("2026-11-16T07:00:00.000Z", now), { text: "Hạn chót hôm nay", urgent: true });
  assert.deepEqual(deadlineLabel("2026-11-17T05:00:00.000Z", now), { text: "Còn đến ngày mai", urgent: true });
  assert.deepEqual(deadlineLabel("2026-11-19T05:00:00.000Z", now), { text: "Còn 3 ngày", urgent: false });
  assert.equal(progressSentence(0, 3), "Có 3 trò đang chờ con.");
  assert.equal(progressSentence(1, 3), "Con xong 1 trên 3 trò rồi.");
  assert.equal(progressSentence(3, 3), "Con làm xong hết rồi!");
});

test("assignment dates: whole local days and day arithmetic across months", () => {
  assert.equal(addDays("2026-11-29", 3), "2026-12-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  const end = new Date(endOfLocalDay("2026-11-20"));
  const start = new Date(startOfLocalDay("2026-11-21"));
  assert.equal(start.getTime() - end.getTime(), 1);
  assert.equal(toLocalDateInput(endOfLocalDay("2026-11-20")), "2026-11-20");
});

import { lastSeenLabel, percent, shortDay, trendLabel } from "../src/features/admin/format.ts";
import { attentionItems } from "../src/features/admin/attention.ts";
import { homeFor } from "../src/lib/home-for.ts";

test("admin wording: last seen, percentages, week trend, short day", () => {
  const now = new Date("2026-11-17T03:00:00.000Z");
  assert.equal(lastSeenLabel(null, now), "Chưa đăng nhập");
  assert.equal(lastSeenLabel("2026-11-17T01:00:00.000Z", now), "Hôm nay");
  assert.equal(lastSeenLabel("2026-11-16T01:00:00.000Z", now), "Hôm qua");
  assert.equal(lastSeenLabel("2026-11-01T03:00:00.000Z", now), "16 ngày trước");
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(1, 0), null);
  assert.deepEqual(trendLabel(5, 5), { text: "Như tuần trước", direction: "flat" });
  assert.deepEqual(trendLabel(5, 0), { text: "Mới có hoạt động", direction: "up" });
  assert.deepEqual(trendLabel(15, 10), { text: "+50% so với tuần trước", direction: "up" });
  assert.deepEqual(trendLabel(6, 10), { text: "−40% so với tuần trước", direction: "down" });
  assert.equal(shortDay("2026-11-17"), "T3 17/11");
  assert.equal(shortDay("2026-11-22"), "CN 22/11");
});

test("admin attention: blocking problems first, nothing when the school is ready", () => {
  const ref = (n) => ({ classId: `00000000-0000-4000-8000-00000000000${n}`, className: `Lớp ${n}` });
  const base = {
    schoolYear: { schoolYearId: ref(9).classId, name: "2026-2027", startDate: "2026-09-01", endDate: "2027-05-31", daysLeft: 195, hasNextYear: false },
    attention: {
      unassignedChildren: 0, childrenWithoutCode: 0, classesWithoutTeacher: [], classesWithoutChildren: [],
      classesWithoutOpenAssignment: [], dormantTeachers: [], archivedGamesInOpenAssignments: 0, pendingReplayRequests: 0,
    },
  };
  assert.deepEqual(attentionItems(base), []);
  const items = attentionItems({
    ...base,
    schoolYear: { ...base.schoolYear, daysLeft: 20 },
    attention: { ...base.attention, childrenWithoutCode: 4, classesWithoutTeacher: [ref(1)], pendingReplayRequests: 2 },
  });
  assert.deepEqual(items.map((item) => item.id), ["no-teacher", "year-ending", "no-code", "replays"]);
  assert.equal(items[0].href, `/admin/classrooms/${ref(1).classId}`);
  assert.equal(attentionItems({ ...base, schoolYear: null })[0].id, "no-year");
});

test("adults land on their working screen after login", () => {
  assert.equal(homeFor(["MANAGE_CLASSROOMS", "MANAGE_USERS"]), "/admin");
  assert.equal(homeFor(["READ_OWN_CLASSROOMS"]), "/teacher/classrooms");
  assert.equal(homeFor(["READ_OWN_ACCOUNT"]), "/account");
});

test("score: rounds to two decimals for display only, Vietnamese decimal comma", async () => {
  const { formatScore } = await import("../src/features/classrooms/format.ts");
  assert.equal(formatScore(75), "75%");
  assert.equal(formatScore((5.5 / 6) * 100), "91,67%");
  assert.equal(formatScore(0), "0%");
  assert.equal(formatScore(100), "100%");
  assert.equal(formatScore(null), "—");
});

test("level labels: one per LEVEL, no judgemental wording", async () => {
  const { criterionLevelLabels } = await import("../src/features/classrooms/format.ts");
  assert.deepEqual(Object.keys(criterionLevelLabels), ["LEVEL_0", "LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"]);
  for (const label of Object.values(criterionLevelLabels)) assert.doesNotMatch(label, /yếu|kém/i);
});

import { childMatches, openingAgeBand } from "../src/features/classrooms/classroom-workflow.ts";

test("roster search ignores Vietnamese diacritics and can show only children without a code", () => {
  const child = { fullName: "Đỗ  Ngọc Anh", loginCodeIssuedAt: null, status: "ACTIVE" };
  assert.equal(childMatches(child, "  do anh  ", "missing-code"), true);
  assert.equal(childMatches({ ...child, status: "DISABLED" }, "do", "missing-code"), false);
  assert.equal(childMatches(child, "anh nguyen", "all"), false);
});

test("assignment game age band uses the opening day and detects mixed or unsupported ages", () => {
  const children = [{ dob: "2021-11-26" }, { dob: "2021-07-01" }];
  assert.equal(openingAgeBand(children, "2026-11-25"), "mixed");
  assert.equal(openingAgeBand(children, "2026-11-26"), 5);
  assert.equal(openingAgeBand([{ dob: "2020-11-26" }], "2026-11-26"), "unsupported");
});
