/** Whole months between a birthday ("YYYY-MM-DD") and a moment, by calendar day (time zone of the date). */
export function ageInMonths(dob: string, at: Date): number {
  const [y, m, d] = dob.split("-").map(Number) as [number, number, number];
  let months = (at.getUTCFullYear() - y) * 12 + (at.getUTCMonth() + 1 - m);
  if (at.getUTCDate() < d) months -= 1;
  return months;
}

/** An age group spans [minAge, maxAge) years: e.g. "Lá" 5–6 accepts 60 ≤ months < 72 (R-01). */
export function ageGroupAccepts(
  group: { minAge: number; maxAge: number },
  months: number,
): boolean {
  return months >= group.minAge * 12 && months < group.maxAge * 12;
}

/** The moment as a Vietnam calendar date (UTC+7), for birthdays compared on Vietnamese school days. */
export function vietnamDate(at: Date): Date {
  const local = new Date(at.getTime() + 7 * 3600 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}
