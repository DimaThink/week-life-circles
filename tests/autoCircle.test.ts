import { describe, it, expect } from 'vitest';
import type { SquareDef } from '../src/config';
import { DEFAULT_SETTINGS, normalizeSettings, freshInstallSettings } from '../src/config';
import { migrate } from '../src/migrate';
import { circleNoteKind, hasInlineMarker, planAutoCircles, planSignature } from '../src/autoCircle';
import { buildWeekNote, type DateFormatter } from '../src/templates';

const squares: SquareDef[] = [
  { key: 'work.png', name: 'Work', color: '#111111' },
  { key: 'rest.png', name: 'Rest', color: '#222222' },
  { key: 'flag-uk.png', name: 'Trip abroad', color: null },
  { key: 'gym', name: 'Gym', color: null, image: 'barbell.png' },
];
const plan = (text: string, kind: 'week' | 'day' = 'week', property = 'circle') =>
  planAutoCircles(text, kind, squares, property);

describe('circleNoteKind', () => {
  it('accepts only WW.YY.md in the week folder and YYYY-MM-DD.md in the day folder', () => {
    expect(circleNoteKind('Weeks/28/06.28.md', 'Weeks', 'Days')).toBe('week');
    expect(circleNoteKind('Weeks/06.100.md', 'Weeks', 'Days')).toBe('week');
    expect(circleNoteKind('Days/06.28/2026-06-04.md', 'Weeks', 'Days')).toBe('day');
    expect(circleNoteKind('Days/2026-06-04.md', 'Weeks', 'Days')).toBe('day');
    expect(circleNoteKind('Other/06.28.md', 'Weeks', 'Days')).toBeNull();
    expect(circleNoteKind('Weeks/notes.md', 'Weeks', 'Days')).toBeNull();
    expect(circleNoteKind('WeeksX/06.28.md', 'Weeks', 'Days')).toBeNull();
    expect(circleNoteKind('Weeks/2026-06-04.md', 'Weeks', 'Days')).toBeNull();
    expect(circleNoteKind('Days/06.28.md', 'Weeks', 'Days')).toBeNull();
  });
});

describe('hasInlineMarker', () => {
  const images = new Set(['flag-uk.png', 'barbell.png']);
  it('sees a span, a code marker and a circle image embed', () => {
    expect(hasInlineMarker('06.28 <span class="sq sq-work"></span> 04.06.2026')).toBe(true);
    expect(hasInlineMarker("x <span class='sq'></span>")).toBe(true);
    expect(hasInlineMarker('06.28 `sq:work.png` 04.06.2026')).toBe(true);
    expect(hasInlineMarker('06.28 ![[flag-uk.png]] x', images)).toBe(true);
    expect(hasInlineMarker('06.28 ![[Pics/barbell.png|20]] x', images)).toBe(true);
    expect(hasInlineMarker('06.28 ![[old-marker.png|14]] x')).toBe(true);
  });
  it('ignores ordinary text, photos and other spans', () => {
    expect(hasInlineMarker('06.28 04.06.2026')).toBe(false);
    expect(hasInlineMarker('![[holiday.jpg|600]]')).toBe(false);
    expect(hasInlineMarker('![[holiday.jpg]]')).toBe(false);
    expect(hasInlineMarker('<span class="square">x</span> <span class="sqx"></span>')).toBe(false);
    expect(hasInlineMarker('the word sq: here')).toBe(false);
  });
});

describe('planAutoCircles', () => {
  it('a week note: one circle after the first token', () => {
    expect(plan('---\ncircle: work\n---\n06.28 04.06.2026\nbody')).toEqual(
      { line: 3, ch: 6, atEnd: false, keys: ['work.png'] });
  });

  it('a multi-week note: one circle per list item, in order', () => {
    const text = '---\ncircle:\n  - work\n  - rest\n  - Trip abroad\n---\n03-05.28 01.06.2026\n';
    expect(plan(text)).toEqual({ line: 6, ch: 9, atEnd: false, keys: ['work.png', 'rest.png', 'flag-uk.png'] });
    expect(plan('---\ncircle: [rest, work]\n---\n03-04.28 x')?.keys).toEqual(['rest.png', 'work.png']);
  });

  it('a day note: the first circle only; a heading gets it at the end', () => {
    expect(plan('---\ncircle: [work, rest]\n---\n2026-06-04 Thursday', 'day')).toEqual(
      { line: 3, ch: 11, atEnd: false, keys: ['work.png'] });
    expect(plan('---\ncircle: gym\n---\n# 04.06.2026 · Thursday  \ntext', 'day')).toEqual(
      { line: 3, ch: 23, atEnd: true, keys: ['gym'] });
    expect(plan('---\ncircle: gym\n---\n#', 'day')).toEqual({ line: 3, ch: 1, atEnd: true, keys: ['gym'] });
  });

  it('matches key, base name and circle name, case-insensitively', () => {
    expect(plan('---\ncircle: WORK.PNG\n---\na b')?.keys).toEqual(['work.png']);
    expect(plan('---\ncircle: Work\n---\na b')?.keys).toEqual(['work.png']);
    expect(plan('---\ncircle: "trip abroad"\n---\na b')?.keys).toEqual(['flag-uk.png']);
    expect(plan('---\nCircle: rest\n---\na b')?.keys).toEqual(['rest.png']);
  });

  it('unknown values draw nothing (known ones in a list still do), and nothing throws', () => {
    expect(plan('---\ncircle: nope\n---\na b')).toBeNull();
    expect(plan('---\ncircle: [nope, rest]\n---\na b')?.keys).toEqual(['rest.png']);
    expect(plan('---\ncircle:\n---\na b')).toBeNull();
    expect(plan('---\ncircle: []\n---\na b')).toBeNull();
    for (const bad of ['', '---', '---\ncircle: work', '---\n---', '\u0000', '---\ncircle: [work\n---\nx y']) {
      expect(() => plan(bad)).not.toThrow();
    }
  });

  it('needs the property in a closed frontmatter, and the configured property name', () => {
    expect(plan('circle: work\n06.28 x')).toBeNull();
    expect(plan('---\ncircle: work\n06.28 x')).toBeNull();
    expect(plan('---\ncircle: work\n---\n06.28 x', 'week', 'kind')).toBeNull();
    expect(plan('---\nkind: work\n---\n06.28 x', 'week', 'kind')?.keys).toEqual(['work.png']);
    expect(plan('---\ncircle: work\n---\n06.28 x', 'week', '')).toBeNull();
  });

  it('skips blank lines; a one-token line gets the circle at its end; CRLF works', () => {
    expect(plan('---\ncircle: work\n---\n\n\n06.28 x')).toMatchObject({ line: 5, ch: 6 });
    expect(plan('---\ncircle: work\n---\n06.28   ')).toEqual({ line: 3, ch: 5, atEnd: true, keys: ['work.png'] });
    expect(plan('---\r\ncircle: work\r\n---\r\n06.28 04.06.2026\r\n')).toEqual(
      { line: 3, ch: 6, atEnd: false, keys: ['work.png'] });
    expect(plan('---\ncircle: work\n---\n\n\n\n\n\n06.28 x')).toBeNull(); // header too far down
    expect(plan('---\ncircle: work\n---\n')).toBeNull();
  });

  it('never draws a second circle when the header already has an inline marker', () => {
    expect(plan('---\ncircle: work\n---\n06.28 <span class="sq sq-work"></span> 04.06.2026')).toBeNull();
    expect(plan('---\ncircle: work\n---\n06.28 `sq:work.png` x')).toBeNull();
    expect(plan('---\ncircle: rest\n---\n06.28 ![[flag-uk.png|14]] x')).toBeNull();
    expect(plan('---\ncircle: gym\n---\n# Day\n![[barbell.png]]', 'day')).toBeNull();
    // a photo is not a marker
    expect(plan('---\ncircle: work\n---\n06.28 x\n![[photo.jpg|600]]')?.keys).toEqual(['work.png']);
  });

  it('works on a note created with the property marker style', () => {
    const fmt: DateFormatter = (d, f) => (f === 'DD.MM.YYYY' ? '04.06.2026' : String(d.getTime()));
    const d = new Date(2026, 5, 4);
    const text = buildWeekNote({
      ww: '06', yy: '28', square: 'work.png', photoNames: [],
      settings: { ...DEFAULT_SETTINGS, markerStyle: 'property', weekTemplate: '{{ww}}.{{yy}} {{circle}} {{date}}\nbody' },
      dates: { weekStart: d, weekEnd: d, today: d }, formatDate: fmt,
    });
    expect(text.split('\n').slice(-2)).toEqual(['06.28 04.06.2026', 'body']);
    expect(plan(text)).toMatchObject({ ch: 6, atEnd: false, keys: ['work.png'] });
  });

  it('planSignature changes with the circles', () => {
    expect(planSignature(null)).toBe('');
    expect(planSignature(plan('---\ncircle: work\n---\na b'))).not.toBe(planSignature(plan('---\ncircle: rest\n---\na b')));
  });
});

describe('marker style default', () => {
  it('is property for new installs, legacy settings keep inline or their saved value', () => {
    expect(DEFAULT_SETTINGS.markerStyle).toBe('property');
    expect(normalizeSettings({}).markerStyle).toBe('property');
    expect(freshInstallSettings('en').markerStyle).toBe('property');
    expect(migrate(null).data.settings.markerStyle).toBe('property');
    expect(normalizeSettings({ startAge: 0 }).markerStyle).toBe('inline');
    expect(normalizeSettings({ startAge: 0, markerStyle: 'both' }).markerStyle).toBe('both');
    expect(normalizeSettings({ markerStyle: 'both' }).markerStyle).toBe('both');
  });
});
