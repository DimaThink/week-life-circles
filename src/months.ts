/** True on the first day of a calendar month (where the day view draws a separator). */
export function isMonthStart(d: Date): boolean {
  return d.getDate() === 1;
}

/** Day-view row label: the short month name on the 1st, otherwise the day of the month. */
export function dayLabel(d: Date, monthShort: (d: Date) => string): string {
  return isMonthStart(d) ? monthShort(d) : String(d.getDate());
}
