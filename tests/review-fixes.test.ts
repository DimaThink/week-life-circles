import { describe, it, expect, afterAll } from 'vitest';
import { Calendar } from '../src/calendar';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/config';
import { migrate } from '../src/migrate';
import { buildWeekNote, renderDayTemplate } from '../src/templates';
import { parseWeekFilename, readWeekData } from '../src/weekFiles';

describe('calendar across DST switches', () => {
  afterAll(() => { process.env.TZ = 'UTC'; });

  it.each(['Europe/Kyiv', 'America/New_York', 'Australia/Sydney', 'UTC'])(
    'personalToDate -> dateToPersonal round-trips for every day (%s)', (tz) => {
      process.env.TZ = tz;
      // sanity: the zone really applies (Kyiv is UTC+2 in January)
      if (tz === 'Europe/Kyiv') expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-120);
      for (const [birthMonth, birthDay] of [[1, 15], [4, 30], [7, 15], [11, 2]]) {
        const cal = new Calendar({ birthYear: 1990, birthMonth, birthDay, startAge: 0, endAge: 100 });
        for (const yy of [30, 35, 36]) {
          for (let doy = 1; doy <= cal.personalYearDays(yy); doy++) {
            const d = cal.personalToDate(yy, doy);
            expect(cal.dateToPersonal(d.getFullYear(), d.getMonth() + 1, d.getDate())).toEqual({ yy, doy });
          }
        }
      }
    });
});

describe('week note without photos', () => {
  it('leaves no extra blank line where the {{photos}} line was (matches the old plugin)', () => {
    const settings = migrate({ cells: {} }).data.settings;
    const note = (photoNames: string[]): string =>
      buildWeekNote({ ww: '07', yy: '28', square: 'work.png', dateStr: '18.11.2026', photoNames, settings });
    expect(note([])).toContain('# Photos\n\n\n# Days');
    expect(note(['07.28.jpg', '07_2.28.mp4'])).toContain('# Photos\n\n![[07.28.jpg|600]]\n![[07_2.28.mp4]]\n\n# Days');
  });
  it('still fills an inline {{photos}} token', () => {
    const settings = { ...DEFAULT_SETTINGS, weekTemplate: 'p: {{photos}}!' };
    expect(buildWeekNote({ ww: '01', yy: '28', square: 'work.png', dateStr: 'd', photoNames: [], settings })).toBe('p: !');
  });
});

describe('day template file', () => {
  const base = { dateStr: '2026-11-18', weekdayName: 'Wednesday', yesterdayStr: '2026-11-17', square: 'rest.png', settings: DEFAULT_SETTINGS };
  it('fills the documented {{placeholders}}', () => {
    expect(renderDayTemplate({ ...base, templateRaw: '# {{date}} {{weekday}} {{square}}' }))
      .toBe('# 2026-11-18 Wednesday <span class="sq sq-rest"></span>');
  });
  it('still fills the Templater tags of the original template', () => {
    const tpl = '<%* const x = 1 -%>\n# <% date %> · <% dayUA %> <span class="sq sq-work"></span>\n[[<% tp.date.now("YYYY-MM-DD", -1) %>]]';
    expect(renderDayTemplate({ ...base, templateRaw: tpl }))
      .toBe('# 2026-11-18 · Wednesday <span class="sq sq-rest"></span>\n[[2026-11-17]]');
  });
});

describe('migrate only adopts data of the old plugin', () => {
  it.each([[{}], [[]], [{ settings: null }], ['text'], [42]])('%j -> fresh defaults', (raw) => {
    const { data, migrated } = migrate(raw);
    expect(migrated).toBe(false);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.settings.birthDate).toBe('');
  });
  it('old data with only customSquares still migrates', () => {
    expect(migrate({ customSquares: [] }).migrated).toBe(true);
  });
});

describe('personal years 100+', () => {
  it('parses a three-digit year file name', () => {
    expect(parseWeekFilename('05.100.md')).toEqual({ ww: 5, yy: 100 });
    expect(parseWeekFilename('05.1000.md')).toBeNull();
  });
  it('reads a span header in a three-digit year', async () => {
    const sq = '<span class="sq sq-work"></span>';
    const r = await readWeekData(async () => `03-04.100 ${sq}${sq} 01.01.2098`, { name: '03.100.md' }, ['work.png']);
    expect(r).toMatchObject({ startWW: 3, endWW: 4 });
  });
});

describe('Immich URL', () => {
  it('is stored without trailing slashes or spaces', () => {
    expect(normalizeSettings({ immichUrl: ' https://immich.example.com// ' }).immichUrl).toBe('https://immich.example.com');
  });
});

describe('weekRange', () => {
  const cal = new Calendar({ birthYear: 2000, birthMonth: 1, birthDay: 1, startAge: 21, endAge: 100 });
  const ymd = (d: Date): string => d.toISOString().slice(0, 10);
  it('an ordinary week is 7 days', () => {
    const { since, until } = cal.weekRange(28, 1);
    expect([ymd(since), ymd(until)]).toEqual(['2028-01-01', '2028-01-08']);
  });
  it('week 52 runs up to the next birthday, in common and leap personal years', () => {
    expect(ymd(cal.weekRange(29, 52).until)).toBe('2030-01-01'); // 365-day year: 8 days
    expect(ymd(cal.weekRange(28, 52).until)).toBe('2029-01-01'); // 366-day year: 9 days
    expect(ymd(cal.weekRange(29, 52).since)).toBe('2029-12-24');
  });
  it('every day of a personal year falls inside the range of its own week', () => {
    for (let doy = 1; doy <= cal.personalYearDays(29); doy++) {
      const d = cal.personalToDate(29, doy);
      const { since, until } = cal.weekRange(29, Math.min(Math.floor((doy - 1) / 7) + 1, 52));
      expect(d >= since && d < until).toBe(true);
    }
  });
});
