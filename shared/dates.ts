// Calendar months retain the original day where possible (Jan 31 -> Feb 28).
export function addMonths(anchor: Date, count: number): Date {
  const result = new Date(anchor);
  result.setUTCDate(1);
  result.setUTCMonth(anchor.getUTCMonth() + count);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(anchor.getUTCDate(), last));
  return result;
}
