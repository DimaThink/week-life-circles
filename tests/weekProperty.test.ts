import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/config';
import { dayNoteWeek, weekNoteWeek } from '../src/weekFiles';
import { buildWeekNote, renderDayTemplate, type DateFormatter } from '../src/templates';
import { planCircleMigration, type MigrationNote } from '../src/circleMigration';
import { readPropertyValues } from '../src/circleProperty';

const fmt: DateFormatter = () => 'D';
const d = new Date(2026, 5, 4);
const squares = [{ key: 'work.png', name: 'Work', color: '#111' }];

describe('week property values', () => {
  it('a week note: WW.YY from the file name, SS-EE.YY for a multi-week header', () => {
    expect(weekNoteWeek('06.28.md', '---\ncircle: work\n---\n06.28 x')).toBe('06.28');
    expect(weekNoteWeek('03.28.md', '---\ncircle: [a, b, c]\n---\n03-05.28 01.06.2026')).toBe('03-05.28');
    expect(weekNoteWeek('03.28.md', '12-15.06 holiday')).toBe('03.28'); // a date range, not this year's span
    expect(weekNoteWeek('07.100.md', '')).toBe('07.100');
    expect(weekNoteWeek('notes.md', '')).toBeNull();
  });
  it('a day note: the personal week the day falls in', () => {
    expect(dayNoteWeek({ yy: 28, doy: 1 })).toBe('01.28');
    expect(dayNoteWeek({ yy: 28, doy: 15 })).toBe('03.28');
    expect(dayNoteWeek({ yy: 28, doy: 366 })).toBe('52.28');
  });
});

describe('new notes', () => {
  const week = (weekProperty: boolean) => buildWeekNote({
    ww: '06', yy: '28', square: 'work.png', photoNames: [], formatDate: fmt,
    settings: { ...DEFAULT_SETTINGS, weekProperty, weekTemplate: '{{date}}' },
    dates: { weekStart: d, weekEnd: d, today: d },
  });
  it('a week note gets week: "WW.YY" (quoted, so YAML keeps the zero), before the circle', () => {
    expect(week(true)).toBe('---\nweek: "06.28"\ncircle: work\n---\nD');
    expect(readPropertyValues(week(true), 'week')).toEqual(['06.28']);
  });
  it('off: no week property', () => {
    expect(week(false)).toBe('---\ncircle: work\n---\nD');
  });
  it('a day note gets the week it is given; none without one', () => {
    const base = { templateRaw: '# {{date}}', day: d, today: d, square: 'work.png', settings: DEFAULT_SETTINGS, formatDate: fmt };
    expect(renderDayTemplate({ ...base, week: '23.28' })).toBe('---\nweek: "23.28"\ncircle: work\n---\n# D');
    expect(renderDayTemplate(base)).toBe('---\ncircle: work\n---\n# D');
  });
  it('is on by default and for upgraded settings; a saved choice is kept', () => {
    expect(DEFAULT_SETTINGS.weekProperty).toBe(true);
    expect(normalizeSettings({ startAge: 0 }).weekProperty).toBe(true);
    expect(normalizeSettings({ weekProperty: false }).weekProperty).toBe(false);
  });
});

describe('migration adds the week property', () => {
  const weekOf = (n: MigrationNote) => weekNoteWeek(n.path.split('/').pop() ?? '', n.text);
  const notes: MigrationNote[] = [
    { path: 'W/28/06.28.md', kind: 'week', text: '06.28 <span class="sq sq-work"></span> x' },
    { path: 'W/28/07.28.md', kind: 'week', text: '---\ncircle: work\n---\n07.28 x' },
    { path: 'W/28/08.28.md', kind: 'week', text: '---\ncircle: work\nweek: "08.28"\n---\n08.28 x' },
    { path: 'W/28/09.28.md', kind: 'week', text: '09.28 ![[photo.jpg|14]] x' },
  ];
  it('to notes without it, with or without a marker; a note with an unknown marker gets only the week', () => {
    const plan = planCircleMigration(notes, squares, ['circle'], weekOf);
    expect(plan.items).toEqual([
      { path: 'W/28/06.28.md', kind: 'week', values: ['work'], markerLine: 0, week: '06.28' },
      { path: 'W/28/07.28.md', kind: 'week', values: [], markerLine: -1, week: '07.28' },
      { path: 'W/28/09.28.md', kind: 'week', values: [], markerLine: -1, week: '09.28' },
    ]);
    expect(plan.counts).toEqual({ week: 1, day: 0, stripOnly: 0, hasProperty: 2, unknown: 1, weekProperty: 3 });
  });
  it('without weekOf (setting off) nothing about weeks is planned', () => {
    const plan = planCircleMigration(notes, squares, ['circle']);
    expect(plan.items.map(i => i.path)).toEqual(['W/28/06.28.md']);
    expect(plan.counts.weekProperty).toBe(0);
  });
});
