import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_SQUARES, normalizeSettings, type Settings } from '../src/config';
import { buildWeekNote, renderDayTemplate, type DateFormatter } from '../src/templates';
import { migrate } from '../src/migrate';
import { planCircleMigration } from '../src/circleMigration';
import { body } from './noteBody';

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

/** An old Templater day template: the plugin no longer interprets Templater tags. */
const TEMPLATER_DAY = [
  '<%* const d = tp.date.now() -%>',
  '# <% date %> · <% dayUA %> <span class="sq sq-work"></span>',
  'Yesterday: [[<% tp.date.now("YYYY-MM-DD", -1) %>]]',
  '{{date}} {{weekday}}',
].join('\n');

describe('template files with Templater tags', () => {
  const base = { day: day(2026, 11, 18), today: day(2026, 11, 27), formatDate: fmt, square: 'rest.png' };

  it('Templater tags stay as they are, {{date}} uses the date format', () => {
    const out = renderDayTemplate({ ...base, settings: DEFAULT_SETTINGS, templateRaw: TEMPLATER_DAY });
    expect(out.startsWith('---\ncircle: rest\n---\n')).toBe(true);
    expect(body(out)).toBe([
      '<%* const d = tp.date.now() -%>',
      '# <% date %> · <% dayUA %> <span class="sq sq-work"></span>',
      'Yesterday: [[<% tp.date.now("YYYY-MM-DD", -1) %>]]',
      '18.11.2026 Wednesday',
    ].join('\n'));
  });
  it('legacy settings do not change how a template file is read', () => {
    const legacy = normalizeSettings({ startAge: 20 });
    expect(body(renderDayTemplate({ ...base, settings: legacy, templateRaw: TEMPLATER_DAY })))
      .toBe(body(renderDayTemplate({ ...base, settings: DEFAULT_SETTINGS, templateRaw: TEMPLATER_DAY })));
    const dates = { weekStart: day(2026, 11, 18), weekEnd: day(2026, 11, 24), today: day(2026, 11, 27) };
    expect(body(buildWeekNote({ ww: '07', yy: '28', square: 'work.png', photoNames: [], dates, formatDate: fmt,
      settings: legacy, templateRaw: '{{date}}' }))).toBe('18.11.2026');
  });
});

describe('data of the old week-calendar-sync plugin', () => {
  const old = { cells: {}, customSquares: [{ key: 'custom-x.png', name: 'X', color: '#111' }] };
  const s = migrate(old).data.settings;

  it('keeps the old behaviour', () => {
    expect(s.dayLayout).toBe('week');
    expect(s.attachmentLocation).toBe('folder');
    expect(s.attachmentFolder).toBe('Week life calendar/Attachments/{{yy}}');
    expect(s.squares.map(q => q.key)).toContain('custom-x.png');
    expect('markerStyle' in s).toBe(false);
    expect('legacyTemplates' in s).toBe(false);
  });
  it('the day set is a copy of its merged circles', () => {
    expect(s.daySquares).toEqual(s.squares);
    expect(s.daySquares).not.toBe(s.squares);
    expect(s.daySquares.map(q => q.key)).toContain('custom-x.png');
    expect(s.daySquares.length).toBe(DEFAULT_SQUARES.length + 1);
  });
  it('stored templates get the {{date}} rewrite', () => {
    expect(s.weekTemplate).not.toMatch(/\{\{date\}\}/);
    expect(s.weekTemplate).toContain('{{today}}');
    expect(s.dayTemplate).not.toMatch(/\{\{date\}\}/);
    expect(s.dayTemplate).toContain('{{date:YYYY-MM-DD}}');
  });
  it('is stable when normalized again', () => {
    expect(normalizeSettings(s)).toEqual(s);
  });
});

describe('the one-time {{date}} rewrite with mixed plugin versions', () => {
  it('rewrites a template that has not been rewritten yet', () => {
    const s = normalizeSettings({ startAge: 1, weekTemplate: 'a {{date}}', dayTemplate: 'b {{date}}' });
    expect(s.weekTemplate).toBe('a {{today}}');
    expect(s.dayTemplate).toBe('b {{date:YYYY-MM-DD}}');
  });
  it('skips templates already containing {{today}} or {{date:', () => {
    // data.json re-saved by an older version: dateFormat dropped, templates already rewritten
    const s = normalizeSettings({
      startAge: 1, weekTemplate: '{{today}} {{date}}', dayTemplate: '{{date:YYYY-MM-DD}} {{date}}',
    });
    expect(s.weekTemplate).toBe('{{today}} {{date}}');
    expect(s.dayTemplate).toBe('{{date:YYYY-MM-DD}} {{date}}');
    const t = normalizeSettings({ startAge: 1, weekTemplate: '{{date:DD}} {{date}}', dayTemplate: '{{today}} {{date}}' });
    expect(t.weekTemplate).toBe('{{date:DD}} {{date}}');
    expect(t.dayTemplate).toBe('{{today}} {{date}}');
  });
});

describe('empty {{circle}} placeholders', () => {
  it('drops the space before an empty {{circle}} at the end of a line', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, dayTemplate: '# {{date}} · {{weekday}} {{circle}}\nnext {{circle}}  \nx' };
    const out = renderDayTemplate({ day: day(2026, 11, 18), today: day(2026, 11, 18), formatDate: fmt, square: 'rest.png', settings, templateRaw: null });
    expect(out).toBe('---\ncircle: rest\n---\n# 18.11.2026 · Wednesday\nnext\nx');
  });
  it('still drops one space after {{circle}} in the middle of a line', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, weekTemplate: '{{ww}}.{{yy}} {{circle}} {{date}}' };
    const dates = { weekStart: day(2026, 11, 18), weekEnd: day(2026, 11, 24), today: day(2026, 11, 18) };
    expect(buildWeekNote({ ww: '07', yy: '28', square: 'work.png', photoNames: [], dates, formatDate: fmt, settings }))
      .toBe('---\ncircle: work\n---\n07.28 18.11.2026');
  });
});

describe('circle migration with an unknown span marker', () => {
  it('skips a note whose span markers are not all known circles', () => {
    const plan = planCircleMigration([{
      path: 'W/01/01.01.md', kind: 'week',
      text: '01-03.31 <span class="sq sq-work"></span><span class="sq sq-gone"></span><span class="sq sq-rest"></span>',
    }], DEFAULT_SQUARES, ['circle']);
    expect(plan.items).toEqual([]);
    expect(plan.counts.unknown).toBe(1);
  });
  it('still plans a note whose span markers are all known', () => {
    const plan = planCircleMigration([{
      path: 'W/01/01.01.md', kind: 'week',
      text: '01-02.31 <span class="sq sq-work"></span><span class="sq sq-rest"></span>',
    }], DEFAULT_SQUARES, ['circle']);
    expect(plan.items).toEqual([{ path: 'W/01/01.01.md', kind: 'week', values: ['work', 'rest'], markerLine: 0 }]);
  });
});
