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
