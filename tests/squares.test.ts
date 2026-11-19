import { describe, it, expect } from 'vitest';
import { squareClass, buildSquareCSS, colorMap } from '../src/squares';
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

describe('buildSquareCSS', () => {
  const css = buildSquareCSS(sample);
  it('has the base rule', () => expect(css).toContain('.sq{display:inline-block;'));
  it('emits colour rules', () => expect(css).toContain('.sq-work{background:#4A4A4A}'));
  it('emits image rules only for image squares', () => {
    expect(css).toContain('img[alt="sample.png"]{');
    expect(css).not.toContain('img[alt="work.png"]');
    expect(css).not.toContain('.sq-sample');
  });
});

describe('colorMap', () => {
  it('excludes image squares', () => {
    expect(colorMap(sample)).toEqual({ 'work.png': '#4A4A4A' });
  });
});
