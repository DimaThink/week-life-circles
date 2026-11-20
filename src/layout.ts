import type { CellShape } from './config';

/** Cell diameter / side at full size, in px (CSS `--wcg-cell` default). */
export const BASE_CELL = 42;
/** Width of the frozen week-number column, in px (CSS `--wcg-label-w`). */
export const LABEL_W = 42;
/** Year columns per swipe page on a narrow view: one decade. */
export const PAGE_COLUMNS = 10;
/** Gap between squares in square mode, in px (the CSS uses the same literal 4px). */
export const SQUARE_GAP = 4;

/**
 * Horizontal distance between neighbouring column starts for a given cell size.
 * Circles sit in a hex packing whose centre spacing is 49/42 of the diameter, so
 * columns are that × √3/2 apart; squares are a plain grid with a fixed gap.
 */
export function columnPitch(cell: number, shape: CellShape): number {
  return shape === 'square' ? cell + SQUARE_GAP : cell * (49 / 42) * Math.sqrt(3) / 2;
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
  const cell = shape === 'square' ? pitch - SQUARE_GAP : pitch / ((49 / 42) * Math.sqrt(3) / 2);
  return cell > 0 ? cell : null;
}

/** A paging snap point: the first visible year column, and every decade start (21, 31, …). */
export function isPageStart(yy: number, firstYY: number): boolean {
  return yy === firstYY || yy % 10 === 1;
}
