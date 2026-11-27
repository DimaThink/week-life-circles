// Week-file parsing helpers.

import { pad2, weekOfDoy } from "./calendar";
import { squareClass } from "./squares";
import { propertyCircles, type CircleProperty } from "./circleProperty";

export type Reader<F> = (file: F) => Promise<string>;

/** Vault path of a week note: `<folder>/YY/WW.YY.md` (inverse of parseWeekFilename). */
export function weekNotePath(weekFolder: string, yy: number | string, ww: number | string): string {
  return `${weekFolder}/${pad2(yy)}/${pad2(ww)}.${pad2(yy)}.md`;
}

export function parseWeekFilename(name: string): { ww: number; yy: number } | null {
  const m = name.match(/^(\d{2})\.(\d{2,3})\.md$/); // personal years 100+ have three digits
  if (!m) return null;
  return { ww: parseInt(m[1], 10), yy: parseInt(m[2], 10) };
}

export function extractSquares(text: string, squareKeys: string[]): string[] {
  // HTML span: <span class="sq sq-work"></span>
  const htmlFmt = [...text.matchAll(/class="sq sq-([^"\s]+)"/g)]
    .map((m) => squareKeys.find((k) => squareClass(k) === "sq-" + m[1]) ?? null)
    .filter((k): k is string => k !== null);
  if (htmlFmt.length > 0) return htmlFmt;
  // Backtick notation: `sq:work.png`
  const sqFmt = [...text.matchAll(/`sq:([^`]+)`/g)].map((m) => m[1]);
  if (sqFmt.length > 0) return sqFmt;
  // Legacy: ![[work.png|14]]
  return [...text.matchAll(/!\[\[([^\]|]+\.(?:png|jpg))(?:\|[^\]]+)?\]\]/g)].map((m) => m[1]);
}

/** Index of first content line after optional frontmatter. */
export function contentStart(lines: string[]): number {
  if (lines[0] === "---") {
    const end = lines.findIndex((l, i) => i > 0 && l === "---");
    if (end !== -1) return end + 1;
  }
  return 0;
}

/** Squares of the first line that has any, within 5 lines of `start`. */
export function firstSquares(lines: string[], start: number, squareKeys: string[]): string[] {
  for (let i = start; i < Math.min(start + 5, lines.length); i++) {
    const sq = extractSquares(lines[i], squareKeys);
    if (sq.length > 0) return sq;
  }
  return [];
}

/** The weeks a multi-week note covers, from a `03-05.28` in its first lines (its own year only). */
export function headerSpan(lines: string[], start: number, ownYY: number | undefined): { startWW: number; endWW: number } | null {
  const header = lines.slice(start, start + 3).join("\n");
  const m = header.match(/\b(\d{1,2})(?:-\d{1,2})*-(\d{1,2})\.(\d{2,3})\b/);
  // A span's year must be the file's own year; otherwise it's a DD-DD.MM date range.
  if (!m || parseInt(m[3], 10) !== ownYY) return null;
  return { startWW: parseInt(m[1], 10), endWW: parseInt(m[2], 10) };
}

/** Name of the property that shows which personal week a note belongs to. */
export const WEEK_PROPERTY = "week";

/**
 * The `week` property of a week note: `WW.YY` from its file name, or `SS-EE.YY` for a
 * note covering several weeks. Null when the file name is not a week note's.
 */
export function weekNoteWeek(fileName: string, text: string): string | null {
  const p = parseWeekFilename(fileName);
  if (!p) return null;
  const lines = text.split(/\r?\n/);
  const span = headerSpan(lines, contentStart(lines), p.yy);
  return span ? `${pad2(span.startWW)}-${pad2(span.endWW)}.${pad2(p.yy)}` : `${pad2(p.ww)}.${pad2(p.yy)}`;
}

/** The `week` property of a day note: the personal week the day falls in (`WW.YY`). */
export function dayNoteWeek(personal: { yy: number; doy: number }): string {
  return `${pad2(weekOfDoy(personal.doy))}.${pad2(personal.yy)}`;
}

export async function readWeekData<F extends { name: string }>(
  read: Reader<F>,
  file: F,
  squareKeys: string[],
  prop?: CircleProperty,
): Promise<{ squares: string[]; startWW: number | null; endWW: number | null }> {
  const content = await read(file);
  const lines = content.split(/\r?\n/);
  const start = contentStart(lines);
  // The circle property (one value per week the note covers) wins over inline markers.
  const squares = (prop && propertyCircles(content, prop)) || firstSquares(lines, start, squareKeys);

  const span = headerSpan(lines, start, parseWeekFilename(file.name)?.yy);
  return { squares, startWW: span?.startWW ?? null, endWW: span?.endWW ?? null };
}
