// Day-file parsing helpers (ported from week-calendar-sync main.js:145-164).
import { contentStart, firstSquares, type Reader } from "./weekFiles";

export function parseDayFilename(name: string): { y: number; m: number; d: number } | null {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (!m) return null;
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
}

export async function readDayData<F extends { name: string }>(
  read: Reader<F>,
  file: F,
  squareKeys: string[],
): Promise<{ square: string | null }> {
  const lines = (await read(file)).split("\n");
  return { square: firstSquares(lines, contentStart(lines), squareKeys)[0] ?? null };
}
