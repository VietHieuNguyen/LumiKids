import {
  currentYear,
  daysBetween,
  fillDays,
  localDay,
  shiftDay,
} from './overview-calendar.js';

describe('overview calendar', () => {
  it('counts days in the school time zone, not UTC', () => {
    // 18:30 UTC on 16/11 is already 17/11 in Vietnam.
    expect(
      localDay(new Date('2026-11-16T18:30:00.000Z'), 'Asia/Ho_Chi_Minh'),
    ).toBe('2026-11-17');
    expect(shiftDay('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-11-17', '2027-05-31')).toBe(195);
  });

  it('fills missing days with zeros, oldest first', () => {
    const days = fillDays(
      [{ day: '2026-11-16', sessions: 4, completed: 3, children: 2 }],
      '2026-11-17',
      3,
    );
    expect(days.map((day) => [day.date, day.sessions])).toEqual([
      ['2026-11-15', 0],
      ['2026-11-16', 4],
      ['2026-11-17', 0],
    ]);
  });

  it('picks the school year containing today and says whether the next exists', () => {
    const y = (name: string, startDate: string, endDate: string) => ({
      schoolYearId: name,
      name,
      startDate,
      endDate,
    });
    const years = [
      y('25-26', '2025-09-01', '2026-05-31'),
      y('26-27', '2026-09-01', '2027-05-31'),
    ];
    expect(currentYear(years, '2026-11-17')).toMatchObject({
      name: '26-27',
      daysLeft: 195,
      hasNextYear: false,
    });
    // Summer break: the year that just ended, with the next one already created.
    expect(currentYear(years, '2026-07-01')).toMatchObject({
      name: '25-26',
      hasNextYear: true,
    });
    expect(currentYear([], '2026-07-01')).toBeNull();
  });
});
