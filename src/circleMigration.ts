// Planning the one-off "move circles into the note property" migration (pure).

import type { SquareDef } from './config';
import { circleValue, hasAnyProperty, readPropertyValues } from './circleProperty';
import { contentStart, extractSquares, WEEK_PROPERTY } from './weekFiles';
import { squareClass, squareImage } from './squares';

export interface MigrationNote { path: string; kind: 'week' | 'day'; text: string }
export interface MigrationItem {
  path: string;
  kind: 'week' | 'day';
  /** Property values to add; empty when the note already has the property. */
  values: string[];
  /** 0-based line of the note that holds the inline markers to remove; -1 = none. */
  markerLine: number;
  /** Value of the `week` property to add; null = leave it (present already, off, or unknown). */
  week: string | null;
}
export interface MigrationPlan {
  items: MigrationItem[];
  /**
   * week/day: notes that get the property (and lose their markers); stripOnly: notes that
   * already have the property and only lose their markers; hasProperty: notes with the
   * property and no marker (nothing to do); unknown: a marker that is not a circle (its
   * marker is left alone); weekProperty: notes that get the `week` property.
   */
  counts: { week: number; day: number; stripOnly: number; hasProperty: number; unknown: number; weekProperty: number };
}

/** Like firstSquares: the circles of the first line (within 5 of `start`) that has any, and that line. */
function markerLine(lines: string[], start: number, keys: string[]): { found: string[]; index: number } {
  for (let i = start; i < Math.min(start + 5, lines.length); i++) {
    const found = extractSquares(lines[i], keys);
    if (found.length > 0) return { found, index: i };
  }
  return { found: [], index: -1 };
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
 * Which notes change: every week/day note with an inline marker. One without any of the
 * circle `properties` gets the first of them (a week note keeps all its circles in order,
 * one per week it covers; a day note its first); every one loses the marker from its text.
 * A note whose markers are not all known circles is left alone (an old-style embed may be
 * a photo, and dropping one would shift the weeks).
 */
export function planCircleMigration(
  notes: MigrationNote[], squares: SquareDef[] | Record<'week' | 'day', SquareDef[]>, properties: string[],
  /** The `week` property value of a note (null = unknown); omitted = do not add the week property. */
  weekOf?: (note: MigrationNote) => string | null,
): MigrationPlan {
  // one list for both kinds, or week notes against the week circles and day notes against the day set
  const sets = Array.isArray(squares) ? { week: squares, day: squares } : squares;
  const keysOf = { week: sets.week.map(q => q.key), day: sets.day.map(q => q.key) };
  const knownOf = { week: new Set(keysOf.week), day: new Set(keysOf.day) };
  const plan: MigrationPlan = { items: [], counts: { week: 0, day: 0, stripOnly: 0, hasProperty: 0, unknown: 0, weekProperty: 0 } };
  for (const note of notes) {
    const week = weekOf && readPropertyValues(note.text, WEEK_PROPERTY) === null ? weekOf(note) : null;
    const has = hasAnyProperty(note.text, properties);
    const lines = note.text.split(/\r?\n/);
    const keys = keysOf[note.kind], known = knownOf[note.kind];
    const { found, index } = markerLine(lines, contentStart(lines), keys);
    let marker: { values: string[]; index: number } | null = null;
    if (found.length === 0) {
      if (has) plan.counts.hasProperty++;
    } else if (!found.every(k => known.has(k)) || hasUnknownSpan(lines[index], keys)) {
      plan.counts.unknown++;
    } else {
      const inline = note.kind === 'day' ? found.slice(0, 1) : found;
      marker = { values: has ? [] : inline.map(circleValue), index };
      if (has) plan.counts.stripOnly++; else plan.counts[note.kind]++;
    }
    if (!marker && !week) continue;
    if (week) plan.counts.weekProperty++;
    plan.items.push({ path: note.path, kind: note.kind, values: marker?.values ?? [], markerLine: marker?.index ?? -1, week });
  }
  return plan;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The note without the circle markers on line `index`: `<span class="sq …"></span>`,
 * `` `sq:…` `` and embeds of the circle pictures (`![[work.png|14]]`), with the space
 * they leave behind. A line that held nothing but markers is removed. Other text, and
 * embeds of anything that is not a circle, stay. Line endings follow the note.
 */
export function stripInlineMarkers(text: string, index: number, squares: SquareDef[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (index < 0 || index >= lines.length) return text;
  const names = [...new Set(squares.flatMap(q => [q.key, squareImage(q)]))].map(escapeRe);
  const embed = names.length
    ? new RegExp(`!\\[\\[(?:[^\\]|]*/)?(?:${names.join('|')})(?:\\|[^\\]]*)?\\]\\]`, 'g')
    : null;
  const before = lines[index];
  let line = before
    .replace(/<span\b[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?sq(?:\s[^"']*)?["'][^>]*>\s*<\/span>/gi, '\uE000')
    .replace(/`sq:[^`]+`/g, '\uE000');
  if (embed) line = line.replace(embed, '\uE000');
  if (line === before) return text;
  // drop each marker with one space next to it, so no double or trailing space is left
  line = line.replace(/[ \t]*\uE000([ \t]*\uE000)*[ \t]*/g, (m, _r, offset: number, all: string) =>
    offset === 0 || offset + m.length === all.length ? '' : ' ').trimEnd();
  if (line.trim() === '') lines.splice(index, 1); else lines[index] = line;
  return lines.join(eol);
}
