const MINUTE = 60_000;

/** Whether two appointments, each a start and a length in minutes, share any time. Touching ends do not overlap. */
export function overlaps(
  aStart: Date,
  aMinutes: number,
  bStart: Date,
  bMinutes: number,
): boolean {
  const aEnd = aStart.getTime() + aMinutes * MINUTE;
  const bEnd = bStart.getTime() + bMinutes * MINUTE;
  return aStart.getTime() < bEnd && bStart.getTime() < aEnd;
}
