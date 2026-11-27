import type { Settings } from './config';
import { circleValue, withCircleProperty } from './circleProperty';

// Extensions that embed as images (get the photoWidth display-width suffix); others embed bare
export const PHOTO_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp']);

/** `![[name|width]]` for an image (no width when it is 0), `![[name]]` for anything else. */
function photoEmbed(name: string, width: number): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return `![[${name}${width > 0 && PHOTO_IMAGE_EXTS.has(ext) ? `|${width}` : ''}]]`;
}

/** One embed line per photo (`|width` on images unless the width is 0). */
export function photoEmbeds(names: string[], width: number): string {
  return names.map(n => photoEmbed(n, width)).join('\n');
}

/** Formats a date with a moment.js format string (momentFmt in the plugin, a stub in tests). */
export type DateFormatter = (date: Date, format: string) => string;

/** The dates a week note is written with: first and last day of the week, and the creation day. */
export interface WeekNoteDates { weekStart: Date; weekEnd: Date; today: Date }

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Week dates from a calendar range (`until` = the day after the week), or, without a
 * calendar (no birth date yet), the seven days starting today.
 */
export function weekNoteDates(range: { since: Date; until: Date } | null, today: Date): WeekNoteDates {
  if (!range) return { weekStart: addDays(today, 0), weekEnd: addDays(today, 6), today };
  return { weekStart: range.since, weekEnd: addDays(range.until, -1), today };
}

/** `- <weekday short> <date> — ` for every real day from `first` to `last` (inclusive). */
function dayLines(first: Date, last: Date, fmt: DateFormatter, dateFormat: string): string {
  const out: string[] = [];
  for (let d = addDays(first, 0); d <= last && out.length < 31; d = addDays(d, 1)) {
    out.push(`- ${fmt(d, 'ddd')} ${fmt(d, dateFormat)} — `);
  }
  return out.join('\n');
}

/**
 * Fill `{{name}}` placeholders in one pass (so substituted text is never re-scanned).
 * Date placeholders take an optional format: `{{date:YYYY-MM-DD}}`. Unknown names stay as they are.
 */
function fill(
  text: string, values: Record<string, string>, dates: Record<string, Date>,
  fmt: DateFormatter, dateFormat: string, formats: Record<string, string> = {},
): string {
  const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
  return text.replace(/\{\{(\w+)(?::([^{}]+))?\}\}/g, (m, name: string, f: string | undefined) => {
    // `formats`: a default format of its own for a placeholder written without one
    if (has(dates, name)) return fmt(dates[name], f?.trim() || (has(formats, name) ? formats[name] : dateFormat));
    if (f === undefined && has(values, name)) return values[name];
    return m;
  });
}

/**
 * The property a new note gets its circle in: `{{square}}` in the template means `square`,
 * `{{circle}}` means `circle`, and a template with neither uses the configured property.
 */
export function templateProperty(template: string, configured: string): string {
  if (/\{\{square\}\}/.test(template)) return 'square';
  if (/\{\{circle\}\}/.test(template)) return 'circle';
  return configured;
}

/**
 * Drop `{{circle}}` / `{{square}}` from a template (the circle lives in the property): at the
 * end of a line with the spaces before it, elsewhere with one space after it, so no stray or
 * double space is left.
 */
function dropCirclePlaceholders(text: string): string {
  return text
    .replace(/[ \t]*\{\{(?:circle|square)\}\}[ \t]*$/gm, '')
    .replace(/\{\{(?:circle|square)\}\}[ \t]?/g, '');
}

/** The finished note with the circle in its frontmatter property. */
function withCircle(text: string, template: string, square: string, settings: Settings): string {
  return withCircleProperty(text, templateProperty(template, settings.circleProperty), [circleValue(square)]);
}

/** Text of a new week note: the template note's text if one is set and found, else the settings template. */
export function buildWeekNote(opts: {
  ww: string; yy: string; square: string; photoNames: string[]; settings: Settings;
  dates: WeekNoteDates; formatDate: DateFormatter;
  templateRaw?: string | null;
}): string {
  const { ww, yy, square, photoNames, settings, dates, formatDate } = opts;
  const template = opts.templateRaw ?? settings.weekTemplate;
  const photos = photoEmbeds(photoNames, settings.photoWidth);
  const days = dayLines(dates.weekStart, dates.weekEnd, formatDate, settings.dateFormat);
  const text = dropCirclePlaceholders(template)
    // a `{{photos}}` line of its own leaves no blank line behind when there are no photos
    .replace(/^\{\{photos\}\}\n/gm, () => (photos ? photos + '\n' : ''));
  return withCircle(fill(text,
    { ww, yy, photos, days },
    { date: dates.weekStart, today: dates.today, weekEnd: dates.weekEnd },
    formatDate, settings.dateFormat), template, square, settings);
}

/** Text of a new day note, from the day template file (when found) or the settings text; same placeholders. */
export function renderDayTemplate(opts: {
  templateRaw: string | null; day: Date; today: Date; square: string; settings: Settings;
  formatDate: DateFormatter;
}): string {
  const { templateRaw, day, today, square, settings, formatDate } = opts;
  const template = templateRaw ?? settings.dayTemplate;
  return withCircle(fill(dropCirclePlaceholders(template),
    { weekday: formatDate(day, 'dddd') },
    { date: day, today, yesterday: addDays(day, -1) },
    formatDate, settings.dateFormat), template, square, settings);
}
