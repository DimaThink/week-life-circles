import { describe, it, expect } from 'vitest';
import { isMonthStart, dayLabel } from '../src/months';
import { Calendar } from '../src/calendar';

const short = (d: Date) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];

describe('dayLabel / isMonthStart', () => {
  it('month name on the 1st, day number otherwise', () => {
    expect(dayLabel(new Date(2026, 4, 1), short)).toBe('May');
    expect(dayLabel(new Date(2026, 4, 2), short)).toBe('2');
    expect(dayLabel(new Date(2026, 4, 31), short)).toBe('31');
    expect(isMonthStart(new Date(2026, 4, 1))).toBe(true);
    expect(isMonthStart(new Date(2026, 4, 31))).toBe(false);
  });
  it('leap personal year: month starts land on that column’s own rows', () => {
    const cal = new Calendar({ birthYear: 2000, birthMonth: 1, birthDay: 1, startAge: 21, endAge: 100 });
    // personal year 24 = 2024 (leap): Mar 1 is day 61; personal year 25 = 2025: Mar 1 is day 60
    expect(isMonthStart(cal.personalToDate(24, 61))).toBe(true);
    expect(isMonthStart(cal.personalToDate(25, 60))).toBe(true);
    expect(isMonthStart(cal.personalToDate(24, 60))).toBe(false);
    expect(cal.personalYearDays(24)).toBe(366);
    expect(cal.personalYearDays(25)).toBe(365);
  });
  it('a mid-year birthday: every column gets exactly 12 month starts', () => {
    const cal = new Calendar({ birthYear: 2000, birthMonth: 7, birthDay: 15, startAge: 21, endAge: 100 });
    for (const yy of [23, 24, 25]) {
      let n = 0;
      for (let doy = 1; doy <= cal.personalYearDays(yy); doy++) if (isMonthStart(cal.personalToDate(yy, doy))) n++;
      expect(n).toBe(12);
    }
  });
});
