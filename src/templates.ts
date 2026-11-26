import type { Settings, SquareDef } from './config';
import { daySquareSet } from './config';
import { squareClass } from './squares';
import { circleValue, withCircleProperty } from './circleProperty';

// Extensions that embed as images (get the photoWidth display-width suffix); others embed bare
export const PHOTO_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp']);

/**
 * How a note references a square. Colour squares, and image squares converted
 * from colour (their picture isn't named after the key), are a class span; a
 * plain image square is an embed of its own file. Both read back by key.
 */
export function squareMarkup(square: string, squares: SquareDef[]): string {
  const q = squares.find(t => t.key === square);
  return q && (q.color || (q.image && q.image !== q.key))
    ? `<span class="sq ${squareClass(square)}"></span>`
    : `![[${square}|14]]`;
}

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
 * Apply the marker style to a template: `property` drops `{{circle}}` (at the end of a line
 * with the spaces before it, elsewhere with one space after it, so no stray or double space
 * is left); `inline` keeps it.
 */
function circleTemplate(text: string, settings: Settings): string {
  if (settings.markerStyle !== 'property') return text;
  return text
    .replace(/[ \t]*\{\{(?:circle|square)\}\}[ \t]*$/gm, '')
    .replace(/\{\{(?:circle|square)\}\}[ \t]?/g, '');
}

/**
 * The Templater tags of the original personal day template, as plugin versions before 1.10
 * filled them in a day template FILE (legacyTemplates): the first script block is dropped,
 * `<% date %>` / `<% dayUA %>` / a `-1` tag become the day, its weekday and the day before
 * (YYYY-MM-DD), and the literal work-circle span becomes the chosen circle.
 */
function legacyTemplater(text: string, day: Date, sq: string, fmt: DateFormatter): string {
  const ymd = (d: Date): string => fmt(d, 'YYYY-MM-DD');
  return text
    .replace(/<%\*[\s\S]*?-?%>\n?/, '')
    .replace(/<%\s*date\s*%>/g, () => ymd(day))
    .replace(/<%\s*dayUA\s*%>/g, () => fmt(day, 'dddd'))
    .replace(/<%[^%]*?-1[^%]*?%>/g, () => ymd(addDays(day, -1)))
    .replace(/<span class="sq sq-work"><\/span>/, () => sq);
}

/** The finished note with the circle property in its frontmatter, unless the style is inline-only. */
function circleFrontmatter(text: string, square: string, settings: Settings): string {
  return settings.markerStyle === 'inline' ? text : withCircleProperty(text, settings.circleProperty, [circleValue(square)]);
}

/** Text of a new week note: the template note's text if one is set and found, else the settings template. */
export function buildWeekNote(opts: {
  ww: string; yy: string; square: string; photoNames: string[]; settings: Settings;
  dates: WeekNoteDates; formatDate: DateFormatter;
  templateRaw?: string | null;
}): string {
  const { ww, yy, square, photoNames, settings, dates, formatDate } = opts;
  const sq = squareMarkup(square, settings.squares);
  const photos = photoEmbeds(photoNames, settings.photoWidth);
  const days = dayLines(dates.weekStart, dates.weekEnd, formatDate, settings.dateFormat);
  const text = circleTemplate(opts.templateRaw ?? settings.weekTemplate, settings)
    // a `{{photos}}` line of its own leaves no blank line behind when there are no photos
    .replace(/^\{\{photos\}\}\n/gm, () => (photos ? photos + '\n' : ''));
  // legacyTemplates: `{{date}}` in a template FILE keeps its old meaning, the creation date
  const legacyFile = settings.legacyTemplates && opts.templateRaw != null;
  return circleFrontmatter(fill(text,
    { ww, yy, circle: sq, square: sq, photos, days },
    { date: legacyFile ? dates.today : dates.weekStart, today: dates.today, weekEnd: dates.weekEnd },
    formatDate, settings.dateFormat), square, settings);
}

/** Text of a new day note, from the day template file (when found) or the settings text; same placeholders. */
export function renderDayTemplate(opts: {
  templateRaw: string | null; day: Date; today: Date; square: string; settings: Settings;
  formatDate: DateFormatter;
}): string {
  const { templateRaw, day, today, square, settings, formatDate } = opts;
  const sq = squareMarkup(square, daySquareSet(settings));
  // legacyTemplates: a template FILE gets the pre-1.10 handling ({{date}} = YYYY-MM-DD)
  const legacyFile = settings.legacyTemplates && templateRaw !== null;
  // (the literal work-circle span stays empty with property-only markers, like {{circle}})
  const legacySq = settings.markerStyle === 'property' ? '' : sq;
  const raw = legacyFile ? legacyTemplater(templateRaw, day, legacySq, formatDate) : (templateRaw ?? settings.dayTemplate);
  return circleFrontmatter(fill(circleTemplate(raw, settings),
    { circle: sq, square: sq, weekday: formatDate(day, 'dddd') },
    { date: day, today, yesterday: addDays(day, -1) },
    formatDate, settings.dateFormat, legacyFile ? { date: 'YYYY-MM-DD' } : {}), square, settings);
}
