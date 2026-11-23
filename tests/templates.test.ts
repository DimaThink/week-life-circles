import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/config';
import { buildWeekNote, renderDayTemplate, squareMarkup } from '../src/templates';

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
    ww: '04', yy: '25', square: 'work.png', dateStr: '30.04.2025',
    photoNames: ['04.25.jpg', 'clip.mp4'], settings: DEFAULT_SETTINGS,
  });
  it('first line', () => {
    expect(out.split('\n')[0]).toBe('04.25 <span class="sq sq-work"></span> 30.04.2025');
  });
  it('headers, photos, no leftover tokens', () => {
    expect(out).toContain('# What happened');
    expect(out).toContain('# Plans');
    expect(out).toContain('![[04.25.jpg|600]]\n![[clip.mp4]]');
    expect(out).not.toMatch(/\{\{.*?\}\}/);
  });
  it('empty photos', () => {
    const o = buildWeekNote({ ww: '04', yy: '25', square: 'work.png', dateStr: 'd', photoNames: [], settings: DEFAULT_SETTINGS });
    expect(o).not.toContain('{{photos}}');
  });
});

describe('renderDayTemplate', () => {
  const base = { dateStr: '2025-04-30', weekdayName: 'Wednesday', yesterdayStr: '2025-04-29', square: 'work.png', settings: DEFAULT_SETTINGS };
  it('built-in', () => {
    expect(renderDayTemplate({ ...base, templateRaw: null }))
      .toBe('# 2025-04-30 · Wednesday <span class="sq sq-work"></span>\n');
  });
  it('templater raw', () => {
    const raw = '<%* const x=1 -%>\n# <% date %> · <% dayUA %> <span class="sq sq-work"></span>\nyesterday: <% tp.date.now("YYYY-MM-DD", -1) %>';
    const out = renderDayTemplate({ ...base, templateRaw: raw, square: 'sample.png',
      settings: { ...DEFAULT_SETTINGS, squares: [{ key: 'sample.png', name: 'K', color: null }] } });
    expect(out).toBe('# 2025-04-30 · Wednesday ![[sample.png|14]]\nyesterday: 2025-04-29');
  });
});

describe('week template path', () => {
  const base = { ww: '07', yy: '28', square: 'work.png', dateStr: '18.11.2026', photoNames: ['07.28.jpg'] };
  it('a template note replaces the built-in week template, same placeholders', () => {
    const out = buildWeekNote({ ...base, settings: DEFAULT_SETTINGS, templateRaw: '{{ww}}.{{yy}} {{square}}\n{{photos}}\nend' });
    expect(out).toBe('07.28 <span class="sq sq-work"></span>\n![[07.28.jpg|600]]\nend');
  });
  it('no template note → the settings text', () => {
    const settings = { ...DEFAULT_SETTINGS, weekTemplate: 'W {{ww}}' };
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
  const o = { ww: '04', yy: '25', square: 'work.png', dateStr: 'd', photoNames: [] as string[], settings: DEFAULT_SETTINGS };
  it('week template: {{circle}} is the same as {{square}}', () => {
    const a = buildWeekNote({ ...o, templateRaw: 'x {{circle}} y' });
    const b = buildWeekNote({ ...o, templateRaw: 'x {{square}} y' });
    expect(a).toBe(b);
    expect(a).toContain('sq-work');
  });
  it('day template: {{circle}} is the same as {{square}}', () => {
    const base = { dateStr: 'd', weekdayName: 'Mon', yesterdayStr: 'y', square: 'work.png', settings: DEFAULT_SETTINGS };
    expect(renderDayTemplate({ ...base, templateRaw: '# {{circle}}' })).toBe(renderDayTemplate({ ...base, templateRaw: '# {{square}}' }));
    expect(renderDayTemplate({ ...base, templateRaw: '# {{circle}}' })).toContain('sq-work');
  });
  it('defaults use {{circle}}', () => {
    expect(DEFAULT_SETTINGS.weekTemplate).toContain('{{circle}}');
    expect(DEFAULT_SETTINGS.dayTemplate).toContain('{{circle}}');
  });
});
