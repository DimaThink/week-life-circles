import { describe, it, expect } from 'vitest';
import { squareClass, decorateSquares, SQ_IMG_CLASS, colorMap } from '../src/squares';
import type { SquareDef } from '../src/config';

const sample: SquareDef[] = [
  { key: 'work.png', name: 'Work', color: '#4A4A4A' },
  { key: 'sample.png', name: 'Sample', color: null },
];

describe('squareClass', () => {
  it('strips the extension', () => {
    expect(squareClass('work.png')).toBe('sq-work');
    expect(squareClass('custom-travel.jpg')).toBe('sq-custom-travel');
  });
});

class FakeEl {
  classes: Set<string>;
  props: Record<string, string> = {};
  constructor(cls: string[], private readonly attrs: Record<string, string> = {}) { this.classes = new Set(cls); }
  classList = { contains: (c: string) => this.classes.has(c), add: (c: string) => { this.classes.add(c); } };
  style = { removeProperty: (k: string) => { delete this.props[k]; } };
  setCssProps(p: Record<string, string>) { Object.assign(this.props, p); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
}

describe('decorateSquares', () => {
  const root = (spans: FakeEl[], imgs: FakeEl[]) => ({
    querySelectorAll: (sel: string) => (sel === 'span.sq' ? spans : imgs),
  }) as unknown as ParentNode;

  it('sets the colour as a custom property on colour spans', () => {
    const span = new FakeEl(['sq', 'sq-work']);
    decorateSquares(root([span], []), sample);
    expect(span.props['--wcg-sq-color']).toBe('#4A4A4A');
  });
  it('marks image squares only, by alt text', () => {
    const img = new FakeEl([], { alt: 'sample.png' });
    const other = new FakeEl([], { alt: 'work.png' });
    decorateSquares(root([], [img, other]), sample);
    expect(img.classes.has(SQ_IMG_CLASS)).toBe(true);
    expect(other.classes.has(SQ_IMG_CLASS)).toBe(false);
  });
  it('clears the colour of an unknown square', () => {
    const span = new FakeEl(['sq', 'sq-gone']);
    span.props['--wcg-sq-color'] = '#fff';
    decorateSquares(root([span], []), sample);
    expect(span.props['--wcg-sq-color']).toBeUndefined();
  });

  it('a class span of an image square gets its picture as background, not a colour', () => {
    const span = new FakeEl(['sq', 'sq-work']);
    span.props['--wcg-sq-color'] = '#4A4A4A';
    const squares = [{ key: 'work.png', name: 'W', color: null, image: 'work-2.png' }];
    decorateSquares(root([span], []), squares, n => (n === 'work-2.png' ? 'app://x/work-2.png?1' : null));
    expect(span.props['--wcg-sq-color']).toBeUndefined();
    expect(span.props['--wcg-sq-img']).toBe('url("app://x/work-2.png?1")');
  });
  it('turning it back into a colour drops the picture', () => {
    const span = new FakeEl(['sq', 'sq-work']);
    span.props['--wcg-sq-img'] = 'url("x")';
    decorateSquares(root([span], []), [{ key: 'work.png', name: 'W', color: '#123456' }]);
    expect(span.props['--wcg-sq-img']).toBeUndefined();
    expect(span.props['--wcg-sq-color']).toBe('#123456');
  });
});

describe('colorMap', () => {
  it('excludes image squares', () => {
    expect(colorMap(sample)).toEqual({ 'work.png': '#4A4A4A' });
  });
});
