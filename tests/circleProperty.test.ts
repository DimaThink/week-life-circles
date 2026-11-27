import { describe, it, expect } from 'vitest';
import type { SquareDef } from '../src/config';
import { DEFAULT_SETTINGS, normalizeSettings, freshInstallSettings } from '../src/config';
import {
  circlePropertyNames, circleValue, findCircleProperty, hasAnyProperty, readPropertyValues, resolveCircles,
  shapeOfProperty, withCircleProperty,
} from '../src/circleProperty';
import { planCircleMigration, stripInlineMarkers } from '../src/circleMigration';
import { readWeekData } from '../src/weekFiles';
import { readDayData } from '../src/dayFiles';
import { buildWeekNote, renderDayTemplate, templateProperty, type DateFormatter } from '../src/templates';
import { migrate } from '../src/migrate';

const squares: SquareDef[] = [
  { key: 'work.png', name: 'Work', color: '#111111' },
  { key: 'rest.png', name: 'Rest', color: '#222222' },
  { key: 'flag-uk.png', name: 'Trip abroad', color: null },
  { key: 'plain', name: 'No extension', color: '#333333' },
];
const keys = squares.map(q => q.key);
const reader = (content: string) => async (): Promise<string> => content;
const prop = { names: ['circle'], squares };

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
  const week = (templateRaw = '{{ww}}.{{yy}} {{circle}} {{date}}\nbody', circleProperty = 'circle', square = 'work.png') =>
    buildWeekNote({
      ww: '04', yy: '25', square, dates, formatDate: fmt, photoNames: [], templateRaw,
      settings: { ...DEFAULT_SETTINGS, circleProperty },
    });
  const day = (templateRaw: string, circleProperty = 'circle') => renderDayTemplate({
    templateRaw, day: d0, today: d0, square: 'work.png', formatDate: fmt,
    settings: { ...DEFAULT_SETTINGS, circleProperty },
  });
  it('frontmatter only; {{circle}} renders empty', () => {
    expect(week()).toBe('---\ncircle: work\n---\n04.25 30.04.2025\nbody');
  });
  it('a template that has frontmatter keeps it and gains the property', () => {
    expect(week('---\ntags: week\n---\n{{ww}} {{circle}}')).toBe('---\ntags: week\ncircle: work\n---\n04');
  });
  it('uses the configured property name when the template names none', () => {
    expect(week('x', 'kind', 'rest.png')).toBe('---\nkind: rest\n---\nx');
  });
  it('{{square}} writes the `square` property, {{circle}} the `circle` one, whatever is configured', () => {
    expect(week('{{ww}} {{square}} {{date}}', 'kind')).toBe('---\nsquare: work\n---\n04 30.04.2025');
    expect(week('{{ww}} {{circle}}', 'kind')).toBe('---\ncircle: work\n---\n04');
    expect(day('# {{date}} {{square}}')).toBe('---\nsquare: work\n---\n# 30.04.2025');
    expect(day('{{square}} # {{date}}', 'kind')).toBe('---\nsquare: work\n---\n# 30.04.2025');
  });
  it('day notes get the property too', () => {
    expect(day('# {{date}} {{circle}}')).toBe('---\ncircle: work\n---\n# 30.04.2025');
    expect(day('# {{date}}', 'kind')).toBe('---\nkind: work\n---\n# 30.04.2025');
  });
  it('what is written reads back as the chosen circle', async () => {
    const r = await readWeekData(reader(week()), { name: '04.25.md' }, DEFAULT_SETTINGS.squares.map(q => q.key),
      { names: ['circle'], squares: DEFAULT_SETTINGS.squares });
    expect(r.squares).toEqual(['work.png']);
  });
});

describe('templateProperty', () => {
  it('{{square}} -> square, {{circle}} -> circle, neither -> the configured name', () => {
    expect(templateProperty('{{ww}} {{square}}', 'circle')).toBe('square');
    expect(templateProperty('{{ww}} {{circle}}', 'square')).toBe('circle');
    expect(templateProperty('{{ww}} {{date}}', 'circle')).toBe('circle');
    expect(templateProperty('{{ww}} {{date}}', 'week type')).toBe('week type');
    expect(templateProperty('', 'kind')).toBe('kind');
  });
  it('a placeholder beats a custom name; {{square}} wins when both are present', () => {
    expect(templateProperty('{{circle}}', 'kind')).toBe('circle');
    expect(templateProperty('{{square}}', 'kind')).toBe('square');
    expect(templateProperty('{{circle}} {{square}}', 'kind')).toBe('square');
  });
  it('a lookalike is not a placeholder', () => {
    expect(templateProperty('{{squares}} {circle} {{ circle }}', 'kind')).toBe('kind');
  });
});

describe('property names and shape', () => {
  it('circlePropertyNames: the configured name first, then circle and square, without duplicates', () => {
    expect(circlePropertyNames('kind')).toEqual(['kind', 'circle', 'square']);
    expect(circlePropertyNames('circle')).toEqual(['circle', 'square']);
    expect(circlePropertyNames('square')).toEqual(['square', 'circle']);
    expect(circlePropertyNames('Circle')).toEqual(['Circle', 'square']);
    expect(circlePropertyNames('')).toEqual(['circle', 'square']);
  });
  it('shapeOfProperty: only `square` draws squares', () => {
    expect(shapeOfProperty('square')).toBe('square');
    expect(shapeOfProperty(' Square ')).toBe('square');
    expect(shapeOfProperty('circle')).toBe('circle');
    expect(shapeOfProperty('kind')).toBe('circle');
    expect(shapeOfProperty('squares')).toBe('circle');
  });
  it('findCircleProperty: the first name in order with a value that names a circle', () => {
    const names = circlePropertyNames('kind');
    const p = { names, squares };
    expect(findCircleProperty('---\nsquare: rest\ncircle: work\n---\nx', p)).toEqual({ keys: ['work.png'], name: 'circle' });
    expect(findCircleProperty('---\nsquare: rest\nkind: work\n---\nx', p)).toEqual({ keys: ['work.png'], name: 'kind' });
    expect(findCircleProperty('---\nsquare: [rest, work]\n---\nx', p)).toEqual({ keys: ['rest.png', 'work.png'], name: 'square' });
    // a name whose values name no circle is skipped
    expect(findCircleProperty('---\nkind: nope\nsquare: rest\n---\nx', p)).toEqual({ keys: ['rest.png'], name: 'square' });
    expect(findCircleProperty('---\nkind: nope\n---\nx', p)).toBeNull();
    expect(findCircleProperty('circle: work\nx', p)).toBeNull();
  });
  it('hasAnyProperty: any of the names, with any value (an empty one too)', () => {
    expect(hasAnyProperty('---\nsquare: nope\n---\nx', ['circle', 'square'])).toBe(true);
    expect(hasAnyProperty('---\ncircle:\n---\nx', ['circle'])).toBe(true);
    expect(hasAnyProperty('---\ntags: a\n---\nx', ['circle', 'square'])).toBe(false);
    expect(hasAnyProperty('circle: work', ['circle'])).toBe(false);
  });
});

describe('settings: circleProperty', () => {
  it('fresh install: property "circle"', () => {
    expect(DEFAULT_SETTINGS.circleProperty).toBe('circle');
    expect(normalizeSettings({}).circleProperty).toBe('circle');
    expect(freshInstallSettings('uk').circleProperty).toBe('circle');
    expect(migrate(null).data.settings.circleProperty).toBe('circle');
  });
  it('settings saved by an older version get "circle" too', () => {
    expect(normalizeSettings({ startAge: 0, endAge: 90 }).circleProperty).toBe('circle');
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
    { path: 'W/28/11.28.md', kind: 'week' as const, text: '---\nsquare: work\n---\n11.28 x' },
  ];
  const names = circlePropertyNames('circle');
  const plan = planCircleMigration(notes, squares, names);

  it('plans values for notes without a property and strip-only items for notes that have one', () => {
    expect(plan.items).toEqual([
      { path: 'W/28/07.28.md', kind: 'week', values: ['work'], markerLine: 0 },
      { path: 'W/24/04.24.md', kind: 'week', values: ['work', 'rest'], markerLine: 1 },
      { path: 'W/28/08.28.md', kind: 'week', values: [], markerLine: 3 },
      { path: 'D/01.28/2026-04-30.md', kind: 'day', values: ['flag-uk'], markerLine: 3 },
      { path: 'D/01.28/2026-05-01.md', kind: 'day', values: [], markerLine: 3 },
    ]);
  });
  it('counts: hasProperty is only notes with a property and no marker', () => {
    expect(plan.counts).toEqual({ week: 2, day: 1, stripOnly: 2, hasProperty: 1, unknown: 1 });
  });
  it('any of the names counts as the property', () => {
    const only = planCircleMigration([notes[7]], squares, ['circle']);
    expect(only.counts.hasProperty).toBe(0);
    const s = planCircleMigration(
      [{ path: 'W/x.md', kind: 'week', text: '---\nsquare: rest\n---\n12.28 `sq:work.png`' }], squares, names);
    expect(s.items).toEqual([{ path: 'W/x.md', kind: 'week', values: [], markerLine: 3 }]);
    expect(s.counts.stripOnly).toBe(1);
  });
  it('is idempotent: applying the plan leaves nothing to do', () => {
    const after = notes.map(n => {
      const item = plan.items.find(i => i.path === n.path);
      if (!item) return n;
      const stripped = stripInlineMarkers(n.text, item.markerLine, squares);
      return { ...n, text: item.values.length ? withCircleProperty(stripped, 'circle', item.values) : stripped };
    });
    const again = planCircleMigration(after, squares, names);
    expect(again.items).toEqual([]);
    expect(again.counts).toEqual({ week: 0, day: 0, stripOnly: 0, hasProperty: 6, unknown: 1 });
    expect(after[1].text).toBe('---\ncircle:\n  - work\n  - rest\n---\n# 4-5.24');
    expect(after[2].text).toBe('---\ncircle: rest\n---\n08.28');
  });
});

describe('stripInlineMarkers', () => {
  it('removes a span in the middle with one of the spaces around it', () => {
    expect(stripInlineMarkers('06.28 <span class="sq sq-work"></span> 04.06.2026', 0, squares)).toBe('06.28 04.06.2026');
  });
  it('removes several spans and `sq:` code markers', () => {
    expect(stripInlineMarkers('06.28 <span class="sq sq-work"></span> <span class="sq sq-rest"></span> x', 0, squares))
      .toBe('06.28 x');
    expect(stripInlineMarkers('a <span class="sq sq-work"></span> b <span class="sq sq-rest"></span>', 0, squares)).toBe('a b');
    expect(stripInlineMarkers('# day `sq:rest.png` text', 0, squares)).toBe('# day text');
    expect(stripInlineMarkers('`sq:work.png` # day', 0, squares)).toBe('# day');
  });
  it('removes an embed of a circle picture, keeps a photo embed', () => {
    expect(stripInlineMarkers('# day ![[flag-uk.png|14]]', 0, squares)).toBe('# day');
    expect(stripInlineMarkers('# day ![[Pics/flag-uk.png]] x', 0, squares)).toBe('# day x');
    expect(stripInlineMarkers('# day ![[holiday.jpg|600]]', 0, squares)).toBe('# day ![[holiday.jpg|600]]');
    expect(stripInlineMarkers('# day ![[flag-uk.png|14]] ![[holiday.jpg|600]]', 0, squares))
      .toBe('# day ![[holiday.jpg|600]]');
    const gym: SquareDef[] = [{ key: 'gym', name: 'Gym', color: null, image: 'barbell.png' }];
    expect(stripInlineMarkers('x ![[barbell.png|20]] y', 0, gym)).toBe('x y');
  });
  it('removes a line that held only markers; other lines are untouched', () => {
    expect(stripInlineMarkers('# 4-5.24\n`sq:work.png` `sq:rest.png`\nbody', 1, squares)).toBe('# 4-5.24\nbody');
    expect(stripInlineMarkers('a <span class="sq sq-work"></span>\nb <span class="sq sq-work"></span>', 1, squares))
      .toBe('a <span class="sq sq-work"></span>\nb');
  });
  it('keeps CRLF line endings', () => {
    expect(stripInlineMarkers('---\r\ntags: a\r\n---\r\n06.28 `sq:work.png` x\r\nbody', 3, squares))
      .toBe('---\r\ntags: a\r\n---\r\n06.28 x\r\nbody');
  });
  it('a line without markers, or an index out of range, returns the text unchanged', () => {
    const text = '06.28 <span class="sq sq-work"></span>\nbody';
    expect(stripInlineMarkers(text, 1, squares)).toBe(text);
    expect(stripInlineMarkers(text, -1, squares)).toBe(text);
    expect(stripInlineMarkers(text, 2, squares)).toBe(text);
    expect(stripInlineMarkers(text, 99, squares)).toBe(text);
  });
});
