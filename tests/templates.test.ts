import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/config';
import { buildWeekNote, renderDayTemplate, type DateFormatter } from '../src/templates';
import { body } from './noteBody';

const SETTINGS = DEFAULT_SETTINGS;

// DD.MM.YYYY / YYYY-MM-DD / dddd only, enough for these tests
const p2 = (n: number): string => String(n).padStart(2, '0');
const formatDate: DateFormatter = (d, f) => f
  .replace('dddd', ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()])
  .replace('ddd', ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()])
  .replace('YYYY', String(d.getFullYear())).replace('MM', p2(d.getMonth() + 1)).replace('DD', p2(d.getDate()));
const d0 = new Date(2025, 3, 30);
const dates = { weekStart: d0, weekEnd: new Date(2025, 4, 6), today: d0 };

describe('buildWeekNote', () => {
  const out = buildWeekNote({
    ww: '04', yy: '25', square: 'work.png', dates, formatDate,
    photoNames: ['04.25.jpg', 'clip.mp4'], settings: SETTINGS,
  });
  it('starts with the circle property, then the header', () => {
    expect(out.startsWith('---\nweek: "04.25"\ncircle: work\n---\n')).toBe(true);
    expect(body(out).split('\n')[0]).toBe('30.04.2025 – 06.05.2025');
  });
  it('headers, photos, no leftover tokens', () => {
    expect(out).toContain('# What happened');
    expect(out).toContain('# Plans');
    expect(out).toContain('![[04.25.jpg|600]]\n![[clip.mp4]]');
    expect(out).not.toMatch(/\{\{.*?\}\}/);
  });
  it('empty photos', () => {
    const o = buildWeekNote({ ww: '04', yy: '25', square: 'work.png', dates, formatDate, photoNames: [], settings: SETTINGS });
    expect(o).not.toContain('{{photos}}');
  });
});

describe('renderDayTemplate', () => {
  const base = { day: d0, today: d0, formatDate, square: 'work.png', settings: SETTINGS };
  it('built-in', () => {
    const out = renderDayTemplate({ ...base, templateRaw: null });
    expect(out.startsWith('---\ncircle: work\n---\n')).toBe(true);
    expect(body(out).split('\n')[0]).toBe('# 30.04.2025 · Wednesday');
  });
  it('template file: the same {{…}} placeholders', () => {
    const raw = '# {{date}} · {{weekday}} {{circle}}\nyesterday: {{yesterday:YYYY-MM-DD}}';
    const out = renderDayTemplate({ ...base, templateRaw: raw, square: 'sample.png',
      settings: { ...SETTINGS, squares: [{ key: 'sample.png', name: 'K', color: null }] } });
    expect(out).toBe('---\ncircle: sample\n---\n# 30.04.2025 · Wednesday\nyesterday: 2025-04-29');
  });
});

describe('week template path', () => {
  const base = { ww: '07', yy: '28', square: 'work.png', dates, formatDate, photoNames: ['07.28.jpg'] };
  it('a template note replaces the built-in week template, same placeholders', () => {
    const out = buildWeekNote({ ...base, settings: SETTINGS, templateRaw: '{{ww}}.{{yy}} {{square}}\n{{photos}}\nend' });
    expect(out).toBe('---\nweek: "07.28"\nsquare: work\n---\n07.28\n![[07.28.jpg|600]]\nend');
  });
  it('no template note → the settings text', () => {
    const settings = { ...SETTINGS, weekTemplate: 'W {{ww}}' };
    expect(body(buildWeekNote({ ...base, settings, templateRaw: null }))).toBe('W 07');
    expect(buildWeekNote({ ...base, settings })).toBe('---\nweek: "07.28"\ncircle: work\n---\nW 07');
  });
  it('setting defaults to empty and survives normalization', () => {
    expect(DEFAULT_SETTINGS.weekTemplatePath).toBe('');
    expect(normalizeSettings({ weekTemplatePath: 'Templates/Week.md' }).weekTemplatePath).toBe('Templates/Week.md');
    expect(normalizeSettings({ weekTemplatePath: 5 as never }).weekTemplatePath).toBe('');
  });
});

describe('{{circle}} / {{square}} placeholders', () => {
  const o = { ww: '04', yy: '25', square: 'work.png', dates, formatDate, photoNames: [] as string[], settings: SETTINGS };
  const day = { day: d0, today: d0, formatDate, square: 'work.png', settings: SETTINGS };
  it('week template: both render as nothing; they only pick the property', () => {
    expect(buildWeekNote({ ...o, templateRaw: 'x {{circle}} y' })).toBe('---\nweek: "04.25"\ncircle: work\n---\nx y');
    expect(buildWeekNote({ ...o, templateRaw: 'x {{square}} y' })).toBe('---\nweek: "04.25"\nsquare: work\n---\nx y');
    expect(buildWeekNote({ ...o, templateRaw: '{{square}} x\ny {{square}}' })).toBe('---\nweek: "04.25"\nsquare: work\n---\nx\ny');
  });
  it('day template: the same', () => {
    expect(renderDayTemplate({ ...day, templateRaw: '# {{circle}}' })).toBe('---\ncircle: work\n---\n#');
    expect(renderDayTemplate({ ...day, templateRaw: '# {{date}} {{square}} x' })).toBe('---\nsquare: work\n---\n# 30.04.2025 x');
  });
  it('the default templates no longer carry a circle placeholder', () => {
    expect(DEFAULT_SETTINGS.weekTemplate).not.toMatch(/\{\{(circle|square)\}\}/);
    expect(DEFAULT_SETTINGS.dayTemplate).not.toMatch(/\{\{(circle|square)\}\}/);
  });
});
