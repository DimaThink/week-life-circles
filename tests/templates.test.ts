import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config';
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
