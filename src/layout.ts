import type { CellShape } from './config';

/** Cell diameter / side at full size, in px (CSS `--wcg-cell` default). */
export const BASE_CELL = 42;
/** Width of the frozen week-number column, in px (CSS `--wcg-label-w`). */
export const LABEL_W = 50;
/** Year columns per swipe page on a narrow view: one decade. */
export const PAGE_COLUMNS = 10;
/** Gap between squares in square mode, in px (the CSS uses the same literal 4px). */
export const SQUARE_GAP = 4;

/** Whether cells sit in a plain aligned grid (squares, dots) rather than the honeycomb. */
export function isAlignedShape(shape: CellShape): boolean {
  return shape !== 'circle';
}

/** The view the toolbar's shape button switches to next. */
export function nextCellShape(shape: CellShape): CellShape {
  return shape === 'circle' ? 'square' : shape === 'square' ? 'dots' : 'circle';
}

/**
 * Horizontal distance between neighbouring column starts for a given cell size.
 * Circles sit in a hex packing whose centre spacing is 49/42 of the diameter, so
 * columns are that × √3/2 apart; squares are a plain grid with a fixed gap.
 */
export function columnPitch(cell: number, shape: CellShape): number {
  return isAlignedShape(shape) ? cell + SQUARE_GAP : cell * (49 / 42) * Math.sqrt(3) / 2;
}

/**
 * Cell size that makes exactly PAGE_COLUMNS columns fill `available` px (the
 * scroller's width minus the label column), or null when no paging applies:
 * the view is hidden/unsized, or already wide enough for 10 full-size columns.
 */
export function pagedCellSize(available: number, shape: CellShape): number | null {
  if (!(available > 0)) return null;
  if (PAGE_COLUMNS * columnPitch(BASE_CELL, shape) <= available) return null;
  const pitch = available / PAGE_COLUMNS;
  const cell = isAlignedShape(shape) ? pitch - SQUARE_GAP : pitch / ((49 / 42) * Math.sqrt(3) / 2);
  return cell > 0 ? cell : null;
}

/** A paging snap point: the first visible year column, and every decade start (21, 31, …). */
export function isPageStart(yy: number, firstYY: number): boolean {
  return yy === firstYY || yy % 10 === 1;
}

/** Minimum sideways travel, in px, for a touch gesture to count as a page swipe. */
export const SWIPE_MIN = 30;

/**
 * Page step for a finished touch gesture: +1 = next decade (finger moved left),
 * -1 = previous, 0 = not a sideways swipe (too short, or mostly vertical).
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * scrollLeft of the page `step` pages away from the one nearest `scrollLeft`
 * (nearest, not "last one passed": the final page may be clamped a few px
 * short of its start). Clamped to the first/last page; null with no pages.
 */
export function pageTarget(pageLefts: number[], scrollLeft: number, step: number): number | null {
  if (pageLefts.length === 0) return null;
  let cur = 0;
  for (let i = 1; i < pageLefts.length; i++) {
    if (Math.abs(pageLefts[i] - scrollLeft) < Math.abs(pageLefts[cur] - scrollLeft)) cur = i;
  }
  const next = Math.min(Math.max(cur + step, 0), pageLefts.length - 1);
  return pageLefts[next];
}
