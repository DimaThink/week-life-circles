// Week-file parsing helpers.

import { pad2 } from "./calendar";
import { squareClass } from "./squares";

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

export async function readWeekData<F extends { name: string }>(
  read: Reader<F>,
  file: F,
  squareKeys: string[],
): Promise<{ squares: string[]; startWW: number | null; endWW: number | null }> {
  const content = await read(file);
  const lines = content.split(/\r?\n/);
  const start = contentStart(lines);
  const squares = firstSquares(lines, start, squareKeys);

  let startWW: number | null = null;
  let endWW: number | null = null;
  const header = lines.slice(start, start + 3).join("\n");
  const spanM = header.match(/\b(\d{1,2})(?:-\d{1,2})*-(\d{1,2})\.(\d{2,3})\b/);
  // A span's year must be the file's own year; otherwise it's a DD-DD.MM date range.
  const ownYY = parseWeekFilename(file.name)?.yy;
  if (spanM && parseInt(spanM[3], 10) === ownYY) {
    startWW = parseInt(spanM[1], 10);
    endWW = parseInt(spanM[2], 10);
  }

  return { squares, startWW, endWW };
}
