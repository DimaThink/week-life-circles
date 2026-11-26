import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_SQUARES, normalizeSettings } from '../src/config';
import { Calendar, formatDMY, pad2, weekOfDoy } from '../src/calendar';
import { squareMarkup, buildWeekNote } from '../src/templates';
import { firstSquares, weekNotePath, parseWeekFilename } from '../src/weekFiles';
import { migrate } from '../src/migrate';

/** Inline markers only (the pre-1.10 output these template tests describe). */
const INLINE = { ...DEFAULT_SETTINGS, markerStyle: 'inline' as const };

describe('normalizeSettings hardening', () => {
  it('drops null / non-object / keyless elements of a stored squares array', () => {
    const squares = [null, 7, 'x', {}, { key: '' }, { key: 5 }, { key: 'a.png', name: 'A', color: '#111111' }] as never;
    expect(normalizeSettings({ squares }).squares).toEqual([{ key: 'a.png', name: 'A', color: '#111111' }]);
  });
  it('repairs a square with a missing name or a non-string colour', () => {
    const squares = [{ key: 'flag.png' }, { key: 'b.png', name: 'B', color: 3 }] as never;
    expect(normalizeSettings({ squares }).squares).toEqual([
      { key: 'flag.png', name: 'flag.png', color: null },
      { key: 'b.png', name: 'B', color: null },
    ]);
  });
  it('keeps an intentionally empty squares list, defaults a non-array', () => {
    expect(normalizeSettings({ squares: [] }).squares).toEqual([]);
    expect(normalizeSettings({ squares: 'nope' as never }).squares).toEqual(DEFAULT_SQUARES);
  });
  it('keeps ages whole, non-negative and bounded', () => {
    expect(normalizeSettings({ startAge: -3, endAge: 40.9 })).toMatchObject({ startAge: 0, endAge: 40 });
    expect(normalizeSettings({ startAge: 21.7, endAge: 1e9 })).toMatchObject({ startAge: 21, endAge: 150 });
    expect(normalizeSettings({ startAge: 500, endAge: 2 })).toMatchObject({ startAge: 149, endAge: 150 });
  });
  it('rejects a page size below 1 and caps it', () => {
    expect(normalizeSettings({ immichPageSize: 0 }).immichPageSize).toBe(DEFAULT_SETTINGS.immichPageSize);
    expect(normalizeSettings({ immichPageSize: -5 }).immichPageSize).toBe(DEFAULT_SETTINGS.immichPageSize);
    expect(normalizeSettings({ immichPageSize: 99999 }).immichPageSize).toBe(1000);
  });
  it('accepts null / undefined input and returns a fresh object each time', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).not.toBe(normalizeSettings(undefined));
  });
  it('is idempotent on the defaults and on the migrated personal settings', () => {
    expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    const migrated = migrate({ cells: {}, customSquares: [] }).data.settings;
    expect(normalizeSettings(migrated)).toEqual(migrated);
  });
});

describe('squareMarkup', () => {
  it('does not treat inherited object keys as colour squares', () => {
    expect(squareMarkup('toString', DEFAULT_SQUARES)).toBe('![[toString|14]]');
    expect(squareMarkup('constructor', DEFAULT_SQUARES)).toBe('![[constructor|14]]');
  });
  it('keeps `$` patterns in substituted values literal and matches extensions case-insensitively', () => {
    const settings = { ...INLINE, weekTemplate: '{{date}}|{{photos}}' };
    const d = new Date(2026, 0, 1);
    const out = buildWeekNote({ ww: '01', yy: '28', square: 'work.png', photoNames: ['a.JPG', 'b.mp4'], settings,
      dates: { weekStart: d, weekEnd: d, today: d }, formatDate: () => "$&$1$'" });
    expect(out).toBe("$&$1$'|![[a.JPG|600]]\n![[b.mp4]]");
  });
});

describe('shared helpers', () => {
  it('pad2 / formatDMY', () => {
    expect(pad2(7)).toBe('07');
    expect(pad2('7')).toBe('07');
    expect(pad2('??')).toBe('??');
    expect(formatDMY(new Date(2026, 10, 8))).toBe('08.11.2026');
  });
  it('weekOfDoy: the 52nd week absorbs the extra days', () => {
    expect([1, 7, 8, 364, 365, 366].map(weekOfDoy)).toEqual([1, 1, 2, 52, 52, 52]);
  });
  it('personalYearWeek agrees with dateToPersonal + weekOfDoy for a mid-year and a Feb-29 birthday', () => {
    for (const [birthMonth, birthDay] of [[7, 15], [2, 29]]) {
      const cal = new Calendar({ birthYear: 1996, birthMonth, birthDay, startAge: 0, endAge: 100 });
      for (const now of [new Date(2024, 1, 28), new Date(2024, 1, 29), new Date(2025, 2, 1), new Date(2026, 6, 14), new Date(2026, 6, 15)]) {
        const p = cal.dateToPersonal(now.getFullYear(), now.getMonth() + 1, now.getDate());
        expect(cal.personalYearWeek(now)).toEqual({ yy: p!.yy, ww: weekOfDoy(p!.doy) });
      }
    }
  });
  it('personalYearWeek before the start age falls back to the first week', () => {
    const cal = new Calendar({ birthYear: 2000, birthMonth: 1, birthDay: 1, startAge: 21, endAge: 100 });
    expect(cal.personalYearWeek(new Date(2010, 0, 1))).toEqual({ yy: 21, ww: 1 });
  });
  it('weekNotePath is the inverse of parseWeekFilename', () => {
    const path = weekNotePath('Weeks', 28, 7);
    expect(path).toBe('Weeks/28/07.28.md');
    expect(weekNotePath('Weeks', '28', '07')).toBe(path);
    expect(parseWeekFilename(path.split('/').pop()!)).toEqual({ ww: 7, yy: 28 });
  });
  it('firstSquares takes the first line with squares, within 5 lines', () => {
    const keys = ['work.png', 'rest.png'];
    const sq = '<span class="sq sq-rest"></span>';
    expect(firstSquares(['', sq, '<span class="sq sq-work"></span>'], 0, keys)).toEqual(['rest.png']);
    expect(firstSquares(['', '', '', '', '', sq], 0, keys)).toEqual([]);
    expect(firstSquares([sq, 'x'], 1, keys)).toEqual([]);
  });
});
