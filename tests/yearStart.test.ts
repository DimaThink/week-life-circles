import { describe, it, expect } from 'vitest';
import { Calendar } from '../src/calendar';
import { DEFAULT_SETTINGS, normalizeSettings, parseYearStartDate, resolveAnchor } from '../src/config';

const base = { birthDate: '1990-11-19', startAge: 0, endAge: 90 };
const st = (o: Record<string, unknown>) => normalizeSettings({ ...DEFAULT_SETTINGS, ...base, ...o });

describe('settings: year start', () => {
  it('defaults to birthday', () => {
    expect(DEFAULT_SETTINGS.yearStart).toBe('birthday');
    expect(normalizeSettings({}).yearStart).toBe('birthday');
  });
  it('keeps valid modes and drops junk', () => {
    expect(st({ yearStart: 'january' }).yearStart).toBe('january');
    expect(st({ yearStart: 'custom' }).yearStart).toBe('custom');
    expect(st({ yearStart: 'monday' }).yearStart).toBe('birthday');
    expect(st({ yearStart: 5 }).yearStart).toBe('birthday');
  });
  it('parses MM-DD', () => {
    expect(parseYearStartDate('09-01')).toEqual({ month: 9, day: 1 });
    expect(parseYearStartDate(' 12-31 ')).toEqual({ month: 12, day: 31 });
    for (const bad of ['', '9-1', '13-01', '00-10', '04-31', '02-29', '2026-09-01', 'x']) {
      expect(parseYearStartDate(bad)).toBeNull();
    }
  });
  it('resolves the anchor per mode', () => {
    expect(resolveAnchor(st({}))).toEqual({ month: 11, day: 19 });
    expect(resolveAnchor(st({ yearStart: 'january' }))).toEqual({ month: 1, day: 1 });
    expect(resolveAnchor(st({ yearStart: 'custom', yearStartDate: '09-01' }))).toEqual({ month: 9, day: 1 });
  });
  it('custom with a bad date falls back to the birthday', () => {
    expect(resolveAnchor(st({ yearStart: 'custom', yearStartDate: 'nope' }))).toEqual({ month: 11, day: 19 });
  });
  it('no valid birth date -> no anchor', () => {
    expect(resolveAnchor(st({ birthDate: '' }))).toBeNull();
    expect(resolveAnchor(st({ birthDate: '', yearStart: 'january' }))).toBeNull();
  });
});

describe('Calendar with an anchor', () => {
  const cfg = { birthYear: 1990, birthMonth: 11, birthDay: 19, startAge: 0, endAge: 90 };
  const jan = new Calendar({ ...cfg, anchorMonth: 1, anchorDay: 1 });
  const sep = new Calendar({ ...cfg, anchorMonth: 9, anchorDay: 1 });
  const birthday = new Calendar(cfg);

  it('without an anchor nothing changes (birthday)', () => {
    expect(birthday.personalToDate(30, 1)).toEqual(new Date(2020, 10, 19));
    expect(birthday.weekStartDate(30, 2)).toBe('26.11.2020');
  });
  it('Jan 1: year yy starts on 1 Jan of birthYear+yy', () => {
    expect(jan.personalToDate(30, 1)).toEqual(new Date(2020, 0, 1));
    expect(jan.weekStartDate(30, 2)).toBe('08.01.2020');
    expect(jan.personalYearDays(30)).toBe(366); // 2020 is a leap year
    expect(jan.personalYearDays(31)).toBe(365);
  });
  it('Jan 1: dates map to (yy, doy)', () => {
    expect(jan.dateToPersonal(2020, 1, 1)).toEqual({ yy: 30, doy: 1 });
    expect(jan.dateToPersonal(2020, 12, 31)).toEqual({ yy: 30, doy: 366 });
    expect(jan.dateToPersonal(2021, 1, 1)).toEqual({ yy: 31, doy: 1 });
  });
  it('Jan 1: last week runs to the next 1 Jan', () => {
    const r = jan.weekRange(30, 52);
    expect(r.since).toEqual(new Date(2020, 11, 23));
    expect(r.until).toEqual(new Date(2021, 0, 1));
  });
  it('custom 1 Sep: boundaries and round trip', () => {
    expect(sep.dateToPersonal(2020, 8, 31)).toEqual({ yy: 29, doy: 366 });
    expect(sep.dateToPersonal(2020, 9, 1)).toEqual({ yy: 30, doy: 1 });
    const d = sep.personalToDate(30, 100);
    expect(sep.dateToPersonal(d.getFullYear(), d.getMonth() + 1, d.getDate())).toEqual({ yy: 30, doy: 100 });
  });
  it('before the first shown year -> null', () => {
    expect(jan.dateToPersonal(1989, 12, 31)).toBeNull();
  });
});
