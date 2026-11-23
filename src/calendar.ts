// Personal-year calendar math, ported from week-calendar-sync/main.js:168-232.
// Uses local Date like the original (runtime follows the device TZ).

export interface CalendarConfig {
  birthYear: number;
  birthMonth: number; // 1-12
  birthDay: number;
  startAge: number;
  endAge: number;
  /** Month/day each personal year starts on; omitted = the birthday. */
  anchorMonth?: number;
  anchorDay?: number;
}

const DAY_MS = 86400000;
export const WEEKS_PER_YEAR = 52;

export function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

/** "DD.MM.YYYY" */
export function formatDMY(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Week (1-52) of a 1-based day of the personal year; the last week absorbs the extra day(s). */
export function weekOfDoy(doy: number): number {
  return Math.min(Math.floor((doy - 1) / 7) + 1, WEEKS_PER_YEAR);
}

export function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export class Calendar {
  constructor(private readonly cfg: CalendarConfig) {}

  /** Month (1-12) and day the personal years start on: the anchor, else the birthday. */
  private anchor(): { month: number; day: number } {
    const { birthMonth, birthDay, anchorMonth, anchorDay } = this.cfg;
    return { month: anchorMonth ?? birthMonth, day: anchorDay ?? birthDay };
  }

  /** Start of personal year yy. */
  private yearStart(yy: number): Date {
    const { month, day } = this.anchor();
    return new Date(this.cfg.birthYear + yy, month - 1, day);
  }

  /** Calendar (y, m 1-12, d) -> personal { yy, doy }; null if before startAge. */
  dateToPersonal(y: number, m: number, d: number): { yy: number; doy: number } | null {
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    for (let yy = this.cfg.endAge; yy >= this.cfg.startAge; yy--) {
      const start = this.yearStart(yy);
      if (date >= start) {
        // round, not floor: across a DST switch two local midnights are 23 h or 25 h apart
        const doy = Math.round((date.getTime() - start.getTime()) / DAY_MS) + 1;
        return { yy, doy };
      }
    }
    return null;
  }

  personalToDate(yy: number, doy: number): Date {
    const d = this.yearStart(yy);
    d.setDate(d.getDate() + (doy - 1));
    return d;
  }

  /** Days in personal year yy: 365 or 366. */
  personalYearDays(yy: number): number {
    const start = this.yearStart(yy);
    const next = this.yearStart(yy + 1);
    return Math.round((next.getTime() - start.getTime()) / DAY_MS);
  }

  personalYearWeek(now: Date = new Date()): { yy: number; ww: number } {
    const p = this.dateToPersonal(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return p ? { yy: p.yy, ww: weekOfDoy(p.doy) } : { yy: this.cfg.startAge, ww: 1 };
  }

  /** "DD.MM.YYYY". Calendar arithmetic, not ms addition: DST-safe. */
  weekStartDate(yy: number, ww: number): string {
    return formatDMY(this.weekStartJsDate(yy, ww));
  }

  /** First day of week ww and the day after its last one (week 52 runs up to the next birthday). */
  weekRange(yy: number, ww: number): { since: Date; until: Date } {
    return {
      since: this.weekStartJsDate(yy, ww),
      until: ww >= WEEKS_PER_YEAR ? this.yearStart(yy + 1) : this.weekStartJsDate(yy, ww + 1),
    };
  }

  /** Local-midnight Date of week ww's start (ww may be 53 = next week boundary). DST-safe. */
  weekStartJsDate(yy: number, ww: number): Date {
    const { month, day } = this.anchor();
    return new Date(this.cfg.birthYear + yy, month - 1, day + (ww - 1) * 7);
  }
}
