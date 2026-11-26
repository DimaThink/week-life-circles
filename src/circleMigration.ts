// Planning the one-off "add circle properties to existing notes" migration (pure).

import type { SquareDef } from './config';
import { circleValue, readPropertyValues } from './circleProperty';
import { contentStart, extractSquares } from './weekFiles';
import { squareClass } from './squares';

export interface MigrationNote { path: string; kind: 'week' | 'day'; text: string }
export interface MigrationItem { path: string; kind: 'week' | 'day'; values: string[] }
export interface MigrationPlan {
  items: MigrationItem[];
  /** week/day: notes that will get the property; hasProperty: already have it; unknown: a marker that is not a circle. */
  counts: { week: number; day: number; hasProperty: number; unknown: number };
}

/** Like firstSquares: the circles of the first line (within 5 of `start`) that has any, and that line. */
function markerLine(lines: string[], start: number, keys: string[]): { found: string[]; line: string } {
  for (let i = start; i < Math.min(start + 5, lines.length); i++) {
    const found = extractSquares(lines[i], keys);
    if (found.length > 0) return { found, line: lines[i] };
  }
  return { found: [], line: '' };
}

/**
 * A `class="sq sq-…"` span that matches no circle: extractSquares drops it, so the rest
 * would be planned one week too early. Count the raw spans against the recognised ones.
 */
function hasUnknownSpan(line: string, keys: string[]): boolean {
  const raw = [...line.matchAll(/class="sq sq-([^"\s]+)"/g)];
  return raw.some(m => !keys.some(k => squareClass(k) === 'sq-' + m[1]));
}

/**
 * Which notes get which property value: every note with an inline marker and no
 * `property` yet. A week note keeps all its circles in order (one per week it covers),
 * a day note its first. A note whose markers are not all known circles is left alone
 * (an old-style embed may be a photo, and dropping one would shift the weeks).
 */
export function planCircleMigration(
  notes: MigrationNote[], squares: SquareDef[] | Record<'week' | 'day', SquareDef[]>, property: string,
): MigrationPlan {
  // one list for both kinds, or week notes against the week circles and day notes against the day set
  const sets = Array.isArray(squares) ? { week: squares, day: squares } : squares;
  const keysOf = { week: sets.week.map(q => q.key), day: sets.day.map(q => q.key) };
  const knownOf = { week: new Set(keysOf.week), day: new Set(keysOf.day) };
  const plan: MigrationPlan = { items: [], counts: { week: 0, day: 0, hasProperty: 0, unknown: 0 } };
  for (const note of notes) {
    if (readPropertyValues(note.text, property) !== null) { plan.counts.hasProperty++; continue; }
    const lines = note.text.split(/\r?\n/);
    const keys = keysOf[note.kind], known = knownOf[note.kind];
    const { found, line } = markerLine(lines, contentStart(lines), keys);
    const inline = note.kind === 'day' ? found.slice(0, 1) : found;
    if (inline.length === 0) continue;
    if (!inline.every(k => known.has(k)) || hasUnknownSpan(line, keys)) { plan.counts.unknown++; continue; }
    plan.items.push({ path: note.path, kind: note.kind, values: inline.map(circleValue) });
    plan.counts[note.kind]++;
  }
  return plan;
}
