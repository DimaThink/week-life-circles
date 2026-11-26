import { describe, it, expect } from 'vitest';
import type { SquareDef } from '../src/config';
import { DEFAULT_SETTINGS, normalizeSettings, freshInstallSettings } from '../src/config';
import { circleValue, readPropertyValues, resolveCircles, withCircleProperty } from '../src/circleProperty';
import { planCircleMigration } from '../src/circleMigration';
import { readWeekData } from '../src/weekFiles';
import { readDayData } from '../src/dayFiles';
import { buildWeekNote, renderDayTemplate, type DateFormatter } from '../src/templates';
import { migrate } from '../src/migrate';

const squares: SquareDef[] = [
  { key: 'work.png', name: 'Work', color: '#111111' },
  { key: 'rest.png', name: 'Rest', color: '#222222' },
  { key: 'flag-uk.png', name: 'Trip abroad', color: null },
  { key: 'plain', name: 'No extension', color: '#333333' },
];
const keys = squares.map(q => q.key);
const reader = (content: string) => async (): Promise<string> => content;
const prop = { name: 'circle', squares };

describe('circleValue', () => {
  it('is the key without its extension (the squareClass without sq-)', () => {
    expect(circleValue('work.png')).toBe('work');
    expect(circleValue('flag-uk.png')).toBe('flag-uk');
    expect(circleValue('plain')).toBe('plain');
  });
});

describe('readPropertyValues', () => {
  it('null without frontmatter or without the property', () => {
    expect(readPropertyValues('circle: work', 'circle')).toBeNull();
    expect(readPropertyValues('---\ntags: x\n---\nbody', 'circle')).toBeNull();
    expect(readPropertyValues('---\ncircle: work\nno closing line', 'circle')).toBeNull();
  });
  it('a plain string', () => {
    expect(readPropertyValues('---\ntags: x\ncircle: work\n---\n', 'circle')).toEqual(['work']);
  });
  it('quoted strings and a trailing comment', () => {
    expect(readPropertyValues('---\ncircle: "Trip abroad"\n---', 'circle')).toEqual(['Trip abroad']);
    expect(readPropertyValues("---\ncircle: 'it''s'\n---", 'circle')).toEqual(["it's"]);
    expect(readPropertyValues('---\ncircle: work # the usual\n---', 'circle')).toEqual(['work']);
  });
  it('an inline list', () => {
    expect(readPropertyValues('---\ncircle: [work, "rest", \'Trip abroad\']\n---', 'circle'))
      .toEqual(['work', 'rest', 'Trip abroad']);
  });
  it('a block list, indented or not, until the next key', () => {
    expect(readPropertyValues('---\ncircle:\n  - work\n  - "rest"\ntags: x\n---', 'circle')).toEqual(['work', 'rest']);
    expect(readPropertyValues('---\ncircle:\n- work\n- rest\n---', 'circle')).toEqual(['work', 'rest']);
  });
  it('an empty property is an empty list', () => {
    expect(readPropertyValues('---\ncircle:\ntags: x\n---', 'circle')).toEqual([]);
    expect(readPropertyValues('---\ncircle: []\n---', 'circle')).toEqual([]);
  });
  it('CRLF notes, and the property name matched exactly (not as a prefix)', () => {
    expect(readPropertyValues('---\r\ncircle: work\r\n---\r\n', 'circle')).toEqual(['work']);
    expect(readPropertyValues('---\ncircles: work\n---', 'circle')).toBeNull();
    expect(readPropertyValues('---\nnested:\n  circle: work\n---', 'circle')).toBeNull();
  });
  it('a custom property name', () => {
    expect(readPropertyValues('---\nweek type: rest\n---', 'week type')).toEqual(['rest']);
  });
});

describe('resolveCircles', () => {
  it('matches key, key base name or circle name, case-insensitively; drops unknown values', () => {
    expect(resolveCircles(['work', 'REST.PNG', 'trip ABROAD', 'nope', 'Plain'], squares))
      .toEqual(['work.png', 'rest.png', 'flag-uk.png', 'plain']);
  });
});

describe('withCircleProperty', () => {
  it('adds a frontmatter block when the note has none', () => {
    expect(withCircleProperty('# body\n', 'circle', ['work'])).toBe('---\ncircle: work\n---\n# body\n');
  });
  it('several circles become a block list', () => {
    expect(withCircleProperty('x', 'circle', ['work', 'rest'])).toBe('---\ncircle:\n  - work\n  - rest\n---\nx');
  });
  it('adds to existing frontmatter, replacing an earlier value of the property', () => {
    expect(withCircleProperty('---\ntags: a\n---\nx', 'circle', ['work'])).toBe('---\ntags: a\ncircle: work\n---\nx');
    expect(withCircleProperty('---\ncircle:\n  - a\n  - b\ntags: a\n---\nx', 'circle', ['rest']))
      .toBe('---\ntags: a\ncircle: rest\n---\nx');
  });
  it('quotes values YAML would not read back as the same string', () => {
    expect(withCircleProperty('x', 'circle', ['true'])).toBe('---\ncircle: "true"\n---\nx');
    expect(withCircleProperty('x', 'circle', ['a: b'])).toBe('---\ncircle: "a: b"\n---\nx');
  });
  it('round-trips through the reader', () => {
    const out = withCircleProperty('---\ntags: a\n---\nx', 'circle', ['work', 'flag-uk', '123']);
    expect(readPropertyValues(out, 'circle')).toEqual(['work', 'flag-uk', '123']);
  });
});

describe('reading the property into the grid', () => {
  it('week note: the property wins over inline markers', async () => {
    const text = '---\ncircle: rest\n---\n07.28 <span class="sq sq-work"></span>';
    expect((await readWeekData(reader(text), { name: '07.28.md' }, keys, prop)).squares).toEqual(['rest.png']);
  });
  it('week note covering several weeks: a list keeps its order; the span header still applies', async () => {
    const text = '---\ncircle: [work, Rest]\n---\n# 4-5.24';
    const r = await readWeekData(reader(text), { name: '04.24.md' }, keys, prop);
    expect(r.squares).toEqual(['work.png', 'rest.png']);
    expect([r.startWW, r.endWW]).toEqual([4, 5]);
  });
  it('falls back to inline markers when the property is missing or matches no circle', async () => {
    const inline = '07.28 <span class="sq sq-work"></span>';
    expect((await readWeekData(reader(inline), { name: '07.28.md' }, keys, prop)).squares).toEqual(['work.png']);
    const unknown = `---\ncircle: nope\n---\n${inline}`;
    expect((await readWeekData(reader(unknown), { name: '07.28.md' }, keys, prop)).squares).toEqual(['work.png']);
  });
  it('day note: the first circle of the property', async () => {
    const text = '---\ncircle:\n  - Trip abroad\n  - work\n---\n# day `sq:rest.png`';
    expect(await readDayData(reader(text), { name: '2026-04-30.md' }, keys, prop)).toEqual({ square: 'flag-uk.png' });
  });
  it('without property options the reader behaves as before', async () => {
    const text = '---\ncircle: rest\n---\n`sq:work.png`';
    expect((await readWeekData(reader(text), { name: '07.28.md' }, keys)).squares).toEqual(['work.png']);
  });
});

const p2 = (n: number): string => String(n).padStart(2, '0');
const fmt: DateFormatter = (d, f) => f.replace(/YYYY|MM|DD|dddd/g, tok =>
  tok === 'YYYY' ? String(d.getFullYear()) : tok === 'MM' ? p2(d.getMonth() + 1) : tok === 'DD' ? p2(d.getDate()) : 'Wednesday');
const d0 = new Date(2025, 3, 30);
const dates = { weekStart: d0, weekEnd: new Date(2025, 4, 6), today: d0 };

describe('writing the circle into new notes', () => {
  const week = (markerStyle: 'inline' | 'property' | 'both', templateRaw = '{{ww}}.{{yy}} {{circle}} {{date}}\nbody') =>
    buildWeekNote({
      ww: '04', yy: '25', square: 'work.png', dates, formatDate: fmt, photoNames: [], templateRaw,
      settings: { ...DEFAULT_SETTINGS, markerStyle, circleProperty: 'circle' },
    });
  it('inline: only the marker, as before', () => {
    expect(week('inline')).toBe('04.25 <span class="sq sq-work"></span> 30.04.2025\nbody');
  });
  it('property: frontmatter only; {{circle}} renders empty', () => {
    expect(week('property')).toBe('---\ncircle: work\n---\n04.25 30.04.2025\nbody');
  });
  it('both: frontmatter and the marker', () => {
    expect(week('both')).toBe('---\ncircle: work\n---\n04.25 <span class="sq sq-work"></span> 30.04.2025\nbody');
  });
  it('a template that has frontmatter keeps it and gains the property', () => {
    expect(week('property', '---\ntags: week\n---\n{{ww}} {{circle}}')).toBe('---\ntags: week\ncircle: work\n---\n04');
  });
  it('uses the configured property name', () => {
    const out = buildWeekNote({
      ww: '04', yy: '25', square: 'rest.png', dates, formatDate: fmt, photoNames: [], templateRaw: 'x',
      settings: { ...DEFAULT_SETTINGS, markerStyle: 'property', circleProperty: 'kind' },
    });
    expect(out).toBe('---\nkind: rest\n---\nx');
  });
  it('day notes follow the same style', () => {
    const settings = { ...DEFAULT_SETTINGS, markerStyle: 'property' as const };
    expect(renderDayTemplate({ templateRaw: '# {{date}} {{circle}}', day: d0, today: d0, square: 'work.png', settings, formatDate: fmt }))
      .toBe('---\ncircle: work\n---\n# 30.04.2025');
  });
  it('what is written reads back as the chosen circle', async () => {
    const r = await readWeekData(reader(week('property')), { name: '04.25.md' }, DEFAULT_SETTINGS.squares.map(q => q.key),
      { name: 'circle', squares: DEFAULT_SETTINGS.squares });
    expect(r.squares).toEqual(['work.png']);
  });
});

describe('settings: markerStyle and circleProperty', () => {
  it('fresh install: both, property "circle"', () => {
    expect(DEFAULT_SETTINGS.markerStyle).toBe('both');
    expect(DEFAULT_SETTINGS.circleProperty).toBe('circle');
    expect(normalizeSettings({}).markerStyle).toBe('both');
    expect(freshInstallSettings('uk').markerStyle).toBe('both');
    expect(migrate(null).data.settings.markerStyle).toBe('both');
  });
  it('settings saved by an older version keep inline markers only', () => {
    const s = normalizeSettings({ startAge: 0, endAge: 90 });
    expect(s.markerStyle).toBe('inline');
    expect(s.circleProperty).toBe('circle');
  });
  it('a saved choice is kept, an invalid one falls back', () => {
    expect(normalizeSettings({ startAge: 0, markerStyle: 'property' }).markerStyle).toBe('property');
    expect(normalizeSettings({ markerStyle: 'weird' } as never).markerStyle).toBe('both');
    expect(normalizeSettings({ startAge: 0, markerStyle: 'weird' } as never).markerStyle).toBe('inline');
  });
  it('the property name is trimmed; unusable names fall back to "circle"', () => {
    expect(normalizeSettings({ circleProperty: '  week type ' }).circleProperty).toBe('week type');
    expect(normalizeSettings({ circleProperty: 'kółko' }).circleProperty).toBe('kółko');
    for (const bad of ['', '   ', 'a: b', '- x', '#x', 'a\nb', '"q"']) {
      expect(normalizeSettings({ circleProperty: bad }).circleProperty).toBe('circle');
    }
  });
});

describe('planCircleMigration', () => {
  const notes = [
    { path: 'W/28/07.28.md', kind: 'week' as const, text: '07.28 <span class="sq sq-work"></span> 18.11.2026' },
    { path: 'W/24/04.24.md', kind: 'week' as const, text: '# 4-5.24\n`sq:work.png` `sq:rest.png`' },
    { path: 'W/28/08.28.md', kind: 'week' as const, text: '---\ncircle: rest\n---\n08.28 <span class="sq sq-work"></span>' },
    { path: 'W/28/09.28.md', kind: 'week' as const, text: '09.28 no marker' },
    { path: 'W/28/10.28.md', kind: 'week' as const, text: '10.28 ![[IMG_0001.jpg|600]]' },
    { path: 'D/01.28/2026-04-30.md', kind: 'day' as const, text: '---\ntags: d\n---\n# day ![[flag-uk.png|14]] ![[rest.png]]' },
    { path: 'D/01.28/2026-05-01.md', kind: 'day' as const, text: '---\ncircle:\n---\n# `sq:rest.png`' },
  ];
  const plan = planCircleMigration(notes, squares, 'circle');

  it('plans a value for every note with an inline marker but no property', () => {
    expect(plan.items).toEqual([
      { path: 'W/28/07.28.md', kind: 'week', values: ['work'] },
      { path: 'W/24/04.24.md', kind: 'week', values: ['work', 'rest'] },
      { path: 'D/01.28/2026-04-30.md', kind: 'day', values: ['flag-uk'] },
    ]);
  });
  it('counts what it leaves alone', () => {
    expect(plan.counts).toEqual({ week: 2, day: 1, hasProperty: 2, unknown: 1 });
  });
  it('is idempotent: applying the plan leaves nothing to do', () => {
    const after = notes.map(n => {
      const item = plan.items.find(i => i.path === n.path);
      return item ? { ...n, text: withCircleProperty(n.text, 'circle', item.values) } : n;
    });
    const again = planCircleMigration(after, squares, 'circle');
    expect(again.items).toEqual([]);
    expect(again.counts.hasProperty).toBe(5);
  });
});
