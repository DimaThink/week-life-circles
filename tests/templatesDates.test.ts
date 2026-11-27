import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_WEEK_TEMPLATE, freshInstallSettings, normalizeSettings } from '../src/config';
import { buildWeekNote, renderDayTemplate, weekNoteDates, type DateFormatter } from '../src/templates';
import { STARTER_PRESETS, STARTER_TEMPLATES, starterDayTemplate, starterWeekTemplate } from '../src/i18n/strings/templates';
import { migrate } from '../src/migrate';
import { body } from './noteBody';

const SETTINGS = DEFAULT_SETTINGS;
/** The note text after its frontmatter (which holds the circle property). */
const week = (o: Parameters<typeof buildWeekNote>[0]): string => body(buildWeekNote(o));
const dayNote = (o: Parameters<typeof renderDayTemplate>[0]): string => body(renderDayTemplate(o));

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const p2 = (n: number): string => String(n).padStart(2, '0');
/** A tiny stand-in for moment: YYYY MM DD ddd dddd. */
const fmt: DateFormatter = (d, f) => f.replace(/YYYY|MM|DD|dddd|ddd/g, tok => {
  switch (tok) {
    case 'YYYY': return String(d.getFullYear());
    case 'MM': return p2(d.getMonth() + 1);
    case 'DD': return p2(d.getDate());
    case 'dddd': return WDL[d.getDay()];
    default: return WD[d.getDay()];
  }
});

const day = (y: number, m: number, d: number): Date => new Date(y, m - 1, d);

describe('week note dates', () => {
  // A week from Wed 18.11.2026 to Tue 24.11.2026, written on Fri 27.11.2026.
  const dates = { weekStart: day(2026, 11, 18), weekEnd: day(2026, 11, 24), today: day(2026, 11, 27) };
  const base = { ww: '07', yy: '28', square: 'work.png', photoNames: [] as string[], settings: SETTINGS, dates, formatDate: fmt };

  it('a week note starts with the circle property', () => {
    expect(buildWeekNote({ ...base, templateRaw: '{{date}}' })).toBe('---\nweek: "07.28"\ncircle: work\n---\n18.11.2026');
  });

  it('{{date}} is the first day of the week, {{today}} the creation date, {{weekEnd}} the last day', () => {
    expect(week({ ...base, templateRaw: '{{date}} | {{today}} | {{weekEnd}}' }))
      .toBe('18.11.2026 | 27.11.2026 | 24.11.2026');
  });

  it('the date format setting applies to every date', () => {
    const settings = { ...SETTINGS, dateFormat: 'YYYY-MM-DD' };
    expect(week({ ...base, settings, templateRaw: '{{date}} {{today}} {{weekEnd}}' }))
      .toBe('2026-11-18 2026-11-27 2026-11-24');
  });

  it('a date placeholder can carry its own format', () => {
    expect(week({ ...base, templateRaw: '{{date:YYYY}} {{today:DD/MM}} {{weekEnd:dddd}}' }))
      .toBe('2026 27/11 Tuesday');
  });

  it('{{days}} lists one line per day of the week', () => {
    const out = week({ ...base, templateRaw: '# Days\n\n{{days}}\nend' });
    expect(out).toBe([
      '# Days', '',
      '- Wed 18.11.2026 — ',
      '- Thu 19.11.2026 — ',
      '- Fri 20.11.2026 — ',
      '- Sat 21.11.2026 — ',
      '- Sun 22.11.2026 — ',
      '- Mon 23.11.2026 — ',
      '- Tue 24.11.2026 — ',
      'end',
    ].join('\n'));
  });

  it('{{days}} covers the extra day(s) of week 52', () => {
    const long = { weekStart: day(2026, 11, 18), weekEnd: day(2026, 11, 26), today: day(2026, 11, 27) };
    const lines = week({ ...base, dates: long, templateRaw: '{{days}}' }).split('\n');
    expect(lines).toHaveLength(9);
    expect(lines[8]).toBe('- Thu 26.11.2026 — ');
  });

  it('unknown placeholders stay as they are; `$` in values is literal', () => {
    const settings = { ...SETTINGS, dateFormat: '[$&]' };
    expect(week({ ...base, settings, templateRaw: '{{nope}} {{date}}' })).toBe('{{nope}} [$&]');
  });

  it('the default template has no leftover placeholders', () => {
    const out = week({ ...base, photoNames: ['07.28.jpg'] });
    expect(out).not.toMatch(/\{\{.*?\}\}/);
    expect(out).toContain('- Wed 18.11.2026 — ');
  });
});

describe('weekNoteDates', () => {
  it('turns a week range (until = day after) into first/last day', () => {
    const r = weekNoteDates({ since: day(2026, 11, 18), until: day(2026, 11, 25) }, day(2026, 11, 27));
    expect(r.weekStart).toEqual(day(2026, 11, 18));
    expect(r.weekEnd).toEqual(day(2026, 11, 24));
    expect(r.today).toEqual(day(2026, 11, 27));
  });
  it('without a calendar, the week is the seven days from today', () => {
    const r = weekNoteDates(null, day(2026, 11, 27));
    expect(r.weekStart).toEqual(day(2026, 11, 27));
    expect(r.weekEnd).toEqual(day(2026, 12, 3));
  });
});

describe('day note dates', () => {
  const base = { day: day(2026, 11, 18), today: day(2026, 11, 20), square: 'work.png', settings: SETTINGS, formatDate: fmt };
  it('a day note starts with the circle property', () => {
    expect(renderDayTemplate({ ...base, templateRaw: '{{date}}' })).toBe('---\ncircle: work\n---\n18.11.2026');
  });
  it('{{date}} = the day, {{weekday}}, {{yesterday}} = the day before, {{today}} = creation date', () => {
    expect(dayNote({ ...base, templateRaw: '{{date}} {{weekday}} {{yesterday}} {{today}}' }))
      .toBe('18.11.2026 Wednesday 17.11.2026 20.11.2026');
  });
  it('a template file uses the same placeholders; Templater tags are left alone', () => {
    const raw = '<%* const x=1 -%>\n# {{date:YYYY-MM-DD}} <% date %> <span class="sq sq-work"></span> {{circle}}';
    const settings = { ...SETTINGS, squares: [{ key: 'k.png', name: 'K', color: null }] };
    expect(dayNote({ ...base, settings, square: 'k.png', templateRaw: raw }))
      .toBe('<%* const x=1 -%>\n# 2026-11-18 <% date %> <span class="sq sq-work"></span>');
  });
});

describe('dateFormat setting', () => {
  it('defaults to DD.MM.YYYY, trims, and falls back on junk', () => {
    expect(DEFAULT_SETTINGS.dateFormat).toBe('DD.MM.YYYY');
    expect(normalizeSettings({}).dateFormat).toBe('DD.MM.YYYY');
    expect(normalizeSettings({ dateFormat: ' YYYY-MM-DD ' }).dateFormat).toBe('YYYY-MM-DD');
    expect(normalizeSettings({ dateFormat: '  ' }).dateFormat).toBe('DD.MM.YYYY');
    expect(normalizeSettings({ dateFormat: 5 as never }).dateFormat).toBe('DD.MM.YYYY');
  });

  it('legacy settings: {{date}} in the week template becomes {{today}} (creation date, as before)', () => {
    const s = normalizeSettings({ startAge: 21, weekTemplate: '{{ww}} {{date}}\n{{date}}' } as never);
    expect(s.weekTemplate).toBe('{{ww}} {{today}}\n{{today}}');
    expect(s.dateFormat).toBe('DD.MM.YYYY');
  });

  it('legacy settings: {{date}} in the day template keeps the old YYYY-MM-DD output', () => {
    const s = normalizeSettings({ startAge: 21, dayTemplate: '# {{date}} · {{weekday}}' } as never);
    expect(s.dayTemplate).toBe('# {{date:YYYY-MM-DD}} · {{weekday}}');
  });

  it('the legacy rewrite happens once (dateFormat is saved afterwards)', () => {
    const once = normalizeSettings({ startAge: 21, weekTemplate: '{{date}}', dayTemplate: '{{date}}' } as never);
    expect(normalizeSettings(once)).toEqual(once);
    expect(normalizeSettings({ ...once, weekTemplate: '{{date}}' }).weekTemplate).toBe('{{date}}');
  });

  it('fresh / current settings are not rewritten', () => {
    expect(normalizeSettings({ weekTemplate: '{{date}}' }).weekTemplate).toBe('{{date}}');
    expect(normalizeSettings({ startAge: 1, dateFormat: 'DD.MM.YYYY', weekTemplate: '{{date}}' } as never).weekTemplate).toBe('{{date}}');
  });

  it('a legacy user who kept the old default template keeps the creation date and the fixed day list', () => {
    const s = normalizeSettings({ startAge: 21, weekTemplate: '{{ww}}.{{yy}} {{circle}} {{date}}\n- Mon — ' } as never);
    expect(s.weekTemplate).toBe('{{ww}}.{{yy}} {{circle}} {{today}}\n- Mon — ');
  });
});

describe('starter templates', () => {
  it('three presets in every language, plus a day template', () => {
    expect(STARTER_PRESETS).toEqual(['minimal', 'journal', 'reflection']);
    for (const lang of ['en', 'uk', 'pl'] as const) {
      for (const p of STARTER_PRESETS) {
        const w = starterWeekTemplate(p, lang);
        expect(w.startsWith('{{date}} – {{weekEnd}}\n')).toBe(true);
        expect(w).not.toMatch(/\{\{(circle|square)\}\}/);
        expect(w).toContain('{{photos}}');
      }
      expect(starterWeekTemplate('journal', lang)).toContain('{{days}}');
      expect(starterWeekTemplate('reflection', lang)).toContain('{{days}}');
      expect(starterWeekTemplate('minimal', lang)).not.toContain('{{days}}');
      // reflection = journal + the Pulse questions
      expect(starterWeekTemplate('reflection', lang).length).toBeGreaterThan(starterWeekTemplate('journal', lang).length);
      expect(starterDayTemplate(lang)).toContain('{{date}}');
      expect(starterDayTemplate(lang)).toContain('{{weekday}}');
      expect(starterDayTemplate(lang).startsWith('# {{date}} · {{weekday}}\n')).toBe(true);
      expect(starterDayTemplate(lang)).not.toMatch(/\{\{(circle|square)\}\}/);
    }
    // translated, not copies
    expect(STARTER_TEMPLATES.uk.journal).not.toBe(STARTER_TEMPLATES.en.journal);
    expect(STARTER_TEMPLATES.pl.journal).not.toBe(STARTER_TEMPLATES.en.journal);
  });

  it('the default week template is the English journal without the fixed Mon–Sun list', () => {
    expect(DEFAULT_WEEK_TEMPLATE).toBe(starterWeekTemplate('journal', 'en'));
    expect(DEFAULT_WEEK_TEMPLATE).not.toContain('- Mon — ');
    expect(DEFAULT_SETTINGS.dayTemplate).toBe(starterDayTemplate('en'));
  });

  it('a fresh install gets the journal and day templates in its language', () => {
    const s = freshInstallSettings('uk');
    expect(s.weekTemplate).toBe(starterWeekTemplate('journal', 'uk'));
    expect(s.dayTemplate).toBe(starterDayTemplate('uk'));
    expect(s.dateFormat).toBe('DD.MM.YYYY');
    expect(normalizeSettings(s)).toEqual(s);
  });

  it('migrate tells a fresh install apart from saved data', () => {
    expect(migrate(null).fresh).toBe(true);
    expect(migrate(undefined).fresh).toBe(true);
    expect(migrate({ settings: DEFAULT_SETTINGS }).fresh).toBe(false);
    expect(migrate({ cells: {} }).fresh).toBe(false);
  });
});
