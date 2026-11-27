import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, DEFAULT_SQUARES, daySquareSet, encodeConfig, freshInstallSettings, markerSquares, normalizeSettings,
  parseConfigPayload, type SquareDef,
} from '../src/config';
import { renderDayTemplate, type DateFormatter } from '../src/templates';
import { defaultDaySquareKey } from '../src/modals/swatches';
import { planCircleMigration } from '../src/circleMigration';

const week: SquareDef[] = [
  { key: 'work.png', name: 'Work', color: '#111111' },
  { key: 'rest.png', name: 'Rest', color: '#222222' },
];
const day: SquareDef[] = [
  { key: 'gym.png', name: 'Gym', color: '#333333' },
  { key: 'rest.png', name: 'Rest day', color: '#444444' },
];

describe('day circle set: normalization', () => {
  it('fresh install: off, with a copy of the seven defaults', () => {
    const s = freshInstallSettings('en');
    expect(s.daySquaresEnabled).toBe(false);
    expect(s.daySquares).toEqual(DEFAULT_SQUARES);
    expect(s.daySquares).not.toBe(DEFAULT_SQUARES);
    expect(normalizeSettings({}).daySquares).toEqual(DEFAULT_SQUARES);
    expect(DEFAULT_SETTINGS.daySquaresEnabled).toBe(false);
  });
  it('legacy settings: off (days keep using the week circles), day set seeded from their own circles', () => {
    const s = normalizeSettings({ startAge: 20, squares: week });
    expect(s.daySquaresEnabled).toBe(false);
    expect(s.daySquares).toEqual(week);
    expect(s.daySquares).not.toBe(s.squares); // a copy, not the same list
    expect(s.daySquares[0]).not.toBe(s.squares[0]);
    expect(daySquareSet(s)).toBe(s.squares);
  });
  it('keeps a saved day set and switch, dropping malformed circles', () => {
    const s = normalizeSettings({ startAge: 20, squares: week, daySquaresEnabled: true, daySquares: [...day, { key: '' }] as SquareDef[] });
    expect(s.daySquaresEnabled).toBe(true);
    expect(s.daySquares).toEqual(day);
  });
  it('an empty saved day set stays empty; a wrong-typed switch falls back to off', () => {
    const s = normalizeSettings({ daySquares: [], daySquaresEnabled: 'yes' } as unknown as Partial<typeof DEFAULT_SETTINGS>);
    expect(s.daySquares).toEqual([]);
    expect(s.daySquaresEnabled).toBe(false);
  });
});

describe('which circle set applies', () => {
  const base = normalizeSettings({ squares: week, daySquares: day });
  it('days use the week circles while the day set is off', () => {
    expect(daySquareSet({ ...base, daySquaresEnabled: false })).toEqual(week);
  });
  it('days use the day set when it is on', () => {
    expect(daySquareSet({ ...base, daySquaresEnabled: true })).toEqual(day);
  });
  it('markers in notes are decorated with both sets (week first, no duplicate keys)', () => {
    expect(markerSquares({ ...base, daySquaresEnabled: true }).map(q => q.key)).toEqual(['work.png', 'rest.png', 'gym.png']);
    expect(markerSquares({ ...base, daySquaresEnabled: true }).find(q => q.key === 'rest.png')?.color).toBe('#222222');
    expect(markerSquares({ ...base, daySquaresEnabled: false })).toEqual(week);
  });
  it('the day dialog preselects the first circle of the set in use', () => {
    expect(defaultDaySquareKey({ ...base, daySquaresEnabled: true })).toBe('gym.png');
    expect(defaultDaySquareKey({ ...base, daySquaresEnabled: false })).toBe('work.png');
  });
});

describe('day notes with a day set', () => {
  const fmt: DateFormatter = d => d.toISOString().slice(0, 10);
  it('writes a day-only circle into the property', () => {
    const settings = normalizeSettings({ squares: week, daySquares: [{ key: 'gym.png', name: 'Gym', color: null, image: 'barbell.png' }], daySquaresEnabled: true });
    const out = renderDayTemplate({
      templateRaw: '{{circle}}', day: new Date(2026, 0, 2), today: new Date(2026, 0, 2), square: 'gym.png', settings, formatDate: fmt,
    });
    expect(out).toBe('---\ncircle: gym\n---\n');
  });
});

describe('circle migration with a day set', () => {
  it('matches week notes against week circles and day notes against day circles', () => {
    const notes = [
      { path: 'W/1.md', kind: 'week' as const, text: '`sq:work.png`' },
      { path: 'W/2.md', kind: 'week' as const, text: '`sq:gym.png`' },
      { path: 'D/2026-01-01.md', kind: 'day' as const, text: '`sq:gym.png`' },
      { path: 'D/2026-01-02.md', kind: 'day' as const, text: '`sq:work.png`' },
    ];
    const plan = planCircleMigration(notes, { week, day }, ['circle']);
    expect(plan.items.map(i => i.path)).toEqual(['W/1.md', 'D/2026-01-01.md']);
  });
});

describe('config export/import', () => {
  it('carries both circle sets and the switch', () => {
    const s = normalizeSettings({ squares: week, daySquares: day, daySquaresEnabled: true });
    const back = normalizeSettings(parseConfigPayload(encodeConfig(s)));
    expect(back.squares).toEqual(week);
    expect(back.daySquares).toEqual(day);
    expect(back.daySquaresEnabled).toBe(true);
  });
});
