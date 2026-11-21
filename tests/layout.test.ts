import { describe, it, expect } from 'vitest';
import { columnPitch, pagedCellSize, isPageStart, swipeStep, pageTarget, isAlignedShape, nextCellShape, BASE_CELL, PAGE_COLUMNS } from '../src/layout';

describe('columnPitch', () => {
  it('matches the CSS geometry at 42px', () => {
    // circle: hex column pitch = 49px · √3/2; square: cell + 4px gap
    expect(columnPitch(BASE_CELL, 'circle')).toBeCloseTo(49 * Math.sqrt(3) / 2, 9);
    expect(columnPitch(BASE_CELL, 'square')).toBe(46);
  });
});

describe('pagedCellSize', () => {
  it('returns null for non-positive width', () => {
    expect(pagedCellSize(0, 'circle')).toBeNull();
    expect(pagedCellSize(-42, 'square')).toBeNull();
    expect(pagedCellSize(Number.NaN, 'circle')).toBeNull();
  });
  it('returns null when 10 columns already fit at 42px (wide view)', () => {
    expect(pagedCellSize(1000, 'circle')).toBeNull();
    expect(pagedCellSize(PAGE_COLUMNS * columnPitch(BASE_CELL, 'circle'), 'circle')).toBeNull();
    expect(pagedCellSize(PAGE_COLUMNS * columnPitch(BASE_CELL, 'square'), 'square')).toBeNull();
  });
  it('pages just below the threshold', () => {
    const edge = PAGE_COLUMNS * columnPitch(BASE_CELL, 'circle');
    expect(pagedCellSize(edge - 1, 'circle')).not.toBeNull();
  });
  it('sizes cells so exactly 10 columns fill a phone width', () => {
    for (const shape of ['circle', 'square'] as const) {
      const cell = pagedCellSize(345, shape)!;
      expect(cell).toBeLessThan(BASE_CELL);
      expect(cell).toBeGreaterThan(0);
      expect(columnPitch(cell, shape) * PAGE_COLUMNS).toBeCloseTo(345, 5);
    }
  });
  it('about 34px circles on a ~390px phone', () => {
    const cell = pagedCellSize(390 - 42, 'circle')!;
    expect(cell).toBeGreaterThan(33);
    expect(cell).toBeLessThan(35);
  });
  it('returns null when the width is too small for any square at all', () => {
    // 10 squares need at least 10 × the 4px gap
    expect(pagedCellSize(30, 'square')).toBeNull();
  });
});

describe('isPageStart', () => {
  it('first column and decade starts', () => {
    expect(isPageStart(25, 25)).toBe(true);
    expect(isPageStart(26, 25)).toBe(false);
    expect(isPageStart(31, 25)).toBe(true);
    expect(isPageStart(21, 21)).toBe(true);
    expect(isPageStart(30, 21)).toBe(false);
  });
  it('a start age on a decade boundary-1 (e.g. 20) gives 20, then 21, 31, …', () => {
    expect(isPageStart(20, 20)).toBe(true);
    expect(isPageStart(21, 20)).toBe(true);
    expect(isPageStart(41, 20)).toBe(true);
  });
});

describe('swipeStep', () => {
  it('left swipe = next decade, right swipe = previous', () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
  });
  it('ignores taps, short drags and mostly-vertical scrolls', () => {
    expect(swipeStep(0, 0)).toBe(0);
    expect(swipeStep(-20, 0)).toBe(0);
    expect(swipeStep(-60, 200)).toBe(0);
    expect(swipeStep(-60, 50)).toBe(0); // 60 is not > 50 × 1.2
  });
});

describe('pageTarget', () => {
  const lefts = [0, 348, 696, 1044]; // decade pages
  it('moves exactly one page, never skipping', () => {
    expect(pageTarget(lefts, 0, 1)).toBe(348);
    expect(pageTarget(lefts, 348, 1)).toBe(696);
    expect(pageTarget(lefts, 696, -1)).toBe(348);
  });
  it('a clamped last page still counts as the last page', () => {
    expect(pageTarget(lefts, 1040, -1)).toBe(696);
    expect(pageTarget(lefts, 1040, 1)).toBe(1044);
  });
  it('mid-way between pages picks the nearer one as current', () => {
    expect(pageTarget(lefts, 300, 1)).toBe(696);
    expect(pageTarget(lefts, 100, 1)).toBe(348);
  });
  it('clamps at both ends; null without pages', () => {
    expect(pageTarget(lefts, 0, -1)).toBe(0);
    expect(pageTarget(lefts, 1044, 1)).toBe(1044);
    expect(pageTarget([], 0, 1)).toBeNull();
  });
});

describe('dot grid (circles in aligned columns)', () => {
  it('uses the square geometry: no honeycomb stagger', () => {
    expect(isAlignedShape('dots')).toBe(true);
    expect(isAlignedShape('square')).toBe(true);
    expect(isAlignedShape('circle')).toBe(false);
    expect(columnPitch(BASE_CELL, 'dots')).toBe(columnPitch(BASE_CELL, 'square'));
    expect(pagedCellSize(345, 'dots')).toBe(pagedCellSize(345, 'square'));
  });
});

describe('nextCellShape', () => {
  it('cycles honeycomb → squares → dot grid → honeycomb', () => {
    expect(nextCellShape('circle')).toBe('square');
    expect(nextCellShape('square')).toBe('dots');
    expect(nextCellShape('dots')).toBe('circle');
  });
});
