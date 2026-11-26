// Day-file parsing helpers.
import { contentStart, firstSquares, type Reader } from "./weekFiles";
import { propertyCircles, type CircleProperty } from "./circleProperty";

export function parseDayFilename(name: string): { y: number; m: number; d: number } | null {
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (!m) return null;
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
}

export async function readDayData<F extends { name: string }>(
  read: Reader<F>,
  file: F,
  squareKeys: string[],
  prop?: CircleProperty,
): Promise<{ square: string | null }> {
  const text = await read(file);
  const fromProperty = prop ? propertyCircles(text, prop) : null;
  if (fromProperty) return { square: fromProperty[0] };
  const lines = text.split(/\r?\n/);
  return { square: firstSquares(lines, contentStart(lines), squareKeys)[0] ?? null };
}
