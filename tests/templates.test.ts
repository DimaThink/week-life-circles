import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/config';
import { buildWeekNote, renderDayTemplate, squareMarkup, type DateFormatter } from '../src/templates';

/** Inline markers only (the pre-1.10 output these template tests describe). */
const INLINE = { ...DEFAULT_SETTINGS, markerStyle: 'inline' as const };

// DD.MM.YYYY / YYYY-MM-DD / dddd only, enough for these tests
const p2 = (n: number): string => String(n).padStart(2, '0');
const formatDate: DateFormatter = (d, f) => f
  .replace('dddd', ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()])
  .replace('ddd', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()])
  .replace('YYYY', String(d.getFullYear())).replace('MM', p2(d.getMonth() + 1)).replace('DD', p2(d.getDate()));
const d0 = new Date(2025, 3, 30);
const dates = { weekStart: d0, weekEnd: new Date(2025, 4, 6), today: d0 };

describe('squareMarkup', () => {
  it('image square', () => {
    expect(squareMarkup('sample.png', [{ key: 'sample.png', name: 'Sample', color: null }])).toBe('![[sample.png|14]]');
  });
  it('colour square', () => {
    expect(squareMarkup('work.png', DEFAULT_SETTINGS.squares)).toBe('<span class="sq sq-work"></span>');
  });
});

describe('buildWeekNote', () => {
  const out = buildWeekNote({
    ww: '04', yy: '25', square: 'work.png', dates, formatDate,
    photoNames: ['04.25.jpg', 'clip.mp4'], settings: INLINE,
  });
  it('first line', () => {
    expect(out.split('\n')[0]).toBe('04.25 <span class="sq sq-work"></span> 30.04.2025 – 06.05.2025');
  });
  it('headers, photos, no leftover tokens', () => {
    expect(out).toContain('# What happened');
    expect(out).toContain('# Plans');
    expect(out).toContain('![[04.25.jpg|600]]\n![[clip.mp4]]');
    expect(out).not.toMatch(/\{\{.*?\}\}/);
  });
  it('empty photos', () => {
    const o = buildWeekNote({ ww: '04', yy: '25', square: 'work.png', dates, formatDate, photoNames: [], settings: INLINE });
    expect(o).not.toContain('{{photos}}');
  });
});

describe('renderDayTemplate', () => {
  const base = { day: d0, today: d0, formatDate, square: 'work.png', settings: INLINE };
  it('built-in', () => {
    expect(renderDayTemplate({ ...base, templateRaw: null }).split('\n')[0])
      .toBe('# 30.04.2025 · Wednesday <span class="sq sq-work"></span>');
  });
  it('template file: the same {{…}} placeholders', () => {
    const raw = '# {{date}} · {{weekday}} {{circle}}\nyesterday: {{yesterday:YYYY-MM-DD}}';
    const out = renderDayTemplate({ ...base, templateRaw: raw, square: 'sample.png',
      settings: { ...INLINE, squares: [{ key: 'sample.png', name: 'K', color: null }] } });
    expect(out).toBe('# 30.04.2025 · Wednesday ![[sample.png|14]]\nyesterday: 2025-04-29');
  });
});

describe('week template path', () => {
  const base = { ww: '07', yy: '28', square: 'work.png', dates, formatDate, photoNames: ['07.28.jpg'] };
  it('a template note replaces the built-in week template, same placeholders', () => {
    const out = buildWeekNote({ ...base, settings: INLINE, templateRaw: '{{ww}}.{{yy}} {{square}}\n{{photos}}\nend' });
    expect(out).toBe('07.28 <span class="sq sq-work"></span>\n![[07.28.jpg|600]]\nend');
  });
  it('no template note → the settings text', () => {
    const settings = { ...INLINE, weekTemplate: 'W {{ww}}' };
    expect(buildWeekNote({ ...base, settings, templateRaw: null })).toBe('W 07');
    expect(buildWeekNote({ ...base, settings })).toBe('W 07');
  });
  it('setting defaults to empty and survives normalization', () => {
    expect(DEFAULT_SETTINGS.weekTemplatePath).toBe('');
    expect(normalizeSettings({ weekTemplatePath: 'Templates/Week.md' }).weekTemplatePath).toBe('Templates/Week.md');
    expect(normalizeSettings({ weekTemplatePath: 5 as never }).weekTemplatePath).toBe('');
  });
});

describe('{{circle}} placeholder', () => {
  const o = { ww: '04', yy: '25', square: 'work.png', dates, formatDate, photoNames: [] as string[], settings: INLINE };
  it('week template: {{circle}} is the same as {{square}}', () => {
    const a = buildWeekNote({ ...o, templateRaw: 'x {{circle}} y' });
    const b = buildWeekNote({ ...o, templateRaw: 'x {{square}} y' });
    expect(a).toBe(b);
    expect(a).toContain('sq-work');
  });
  it('day template: {{circle}} is the same as {{square}}', () => {
    const base = { day: d0, today: d0, formatDate, square: 'work.png', settings: INLINE };
    expect(renderDayTemplate({ ...base, templateRaw: '# {{circle}}' })).toBe(renderDayTemplate({ ...base, templateRaw: '# {{square}}' }));
    expect(renderDayTemplate({ ...base, templateRaw: '# {{circle}}' })).toContain('sq-work');
  });
  it('defaults use {{circle}}', () => {
    expect(DEFAULT_SETTINGS.weekTemplate).toContain('{{circle}}');
    expect(DEFAULT_SETTINGS.dayTemplate).toContain('{{circle}}');
  });
});
