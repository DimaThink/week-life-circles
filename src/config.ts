/**
 * A square. `key` is its identity in notes and never changes. color null = image
 * square; its picture is the vault file `image`, or `key` itself when absent
 * (a square converted from colour to image keeps its key and gets an `image`).
 */
export interface SquareDef { key: string; name: string; color: string | null; image?: string }

/** One grid cell: the square shown and the note it opens. */
export interface Cell { square: string | null; path: string }
/** Cells keyed by personal year, then by week number (week grid) or day-of-year (day grid). */
export type CellMap = Record<string, Record<string, Cell>>;

/**
 * How grid cells are drawn: circles in a honeycomb, squares in a plain aligned
 * grid, or circles in that same aligned grid (`dots`).
 */
export type CellShape = 'circle' | 'square' | 'dots';

/** Where each grid year starts: on the birthday, on 1 January, or on a day of your choice. */
export type YearStart = 'birthday' | 'january' | 'custom';

export interface Settings {
  birthDate: string; // "YYYY-MM-DD", "" until set
  yearStart: YearStart;
  yearStartDate: string; // "MM-DD", used when yearStart is 'custom'
  startAtCurrentYear: boolean; // true: the grid starts at the year you are in now
  startAge: number; // first year shown when startAtCurrentYear is off
  endAge: number;
  weekFolder: string;
  dayFolder: string;
  weekTemplatePath: string; // "" = use the weekTemplate text below
  dayTemplatePath: string; // "" = use built-in day template
  weekTemplate: string;
  dayTemplate: string;
  squares: SquareDef[];
  immichEnabled: boolean;
  immichUrl: string;
  immichApiKey: string;
  immichPageSize: number;
  cellShape: CellShape;
}

/** The circles a fresh install starts with: seven generic kinds of week (the palette from week.dth.ink). */
export const DEFAULT_SQUARES: SquareDef[] = [
  { key: 'work.png', name: 'Work', color: '#9893A5' },
  { key: 'rest.png', name: 'Rest', color: '#56949F' },
  { key: 'brgt.png', name: 'Bright', color: '#EA9D34' },
  { key: 'love.png', name: 'Love', color: '#B4637A' },
  { key: 'build.png', name: 'Building', color: '#D7827E' },
  { key: 'hope.png', name: 'Hope', color: '#907AA9' },
  { key: 'trip.png', name: 'Trip', color: '#286983' },
];

/*
 * Template placeholders:
 *   {{ww}}      personal week number 01-52, zero-padded (e.g. 07)
 *   {{yy}}      two-digit year (e.g. 26)
 *   {{circle}}  embed/marker of the week's circle ({{square}} still works)
 *   {{date}}    date (week start for week notes, the day for day notes)
 *   {{photos}}  photo embeds (week template only; replaced by embed lines)
 *   {{weekday}} weekday name (day template only)
 */
export const DEFAULT_WEEK_TEMPLATE = [
  '{{ww}}.{{yy}} {{circle}} {{date}}',
  '',
  '# What happened',
  '',
  '',
  '# Takeaways',
  '',
  '',
  '# Photos',
  '',
  '{{photos}}',
  '',
  '# Days',
  '',
  '- Mon — ',
  '- Tue — ',
  '- Wed — ',
  '- Thu — ',
  '- Fri — ',
  '- Sat — ',
  '- Sun — ',
  '',
  '# Pulse',
  '',
  'I was running away into: ',
  'What brought me back to myself: ',
  'Next week I change one thing: ',
  '',
  '# Plans',
  '',
  '* [ ] ',
  '',
].join('\n');

export const DEFAULT_DAY_TEMPLATE = '# {{date}} · {{weekday}} {{circle}}\n';

export const DEFAULT_SETTINGS: Settings = {
  birthDate: '',
  yearStart: 'birthday',
  yearStartDate: '',
  startAtCurrentYear: true,
  startAge: 0,
  endAge: 100,
  weekFolder: 'Week life calendar',
  dayFolder: 'Week day status',
  weekTemplatePath: '',
  dayTemplatePath: '',
  weekTemplate: DEFAULT_WEEK_TEMPLATE,
  dayTemplate: DEFAULT_DAY_TEMPLATE,
  squares: DEFAULT_SQUARES.map(q => ({ ...q })),
  immichEnabled: false,
  immichUrl: '',
  immichApiKey: '',
  immichPageSize: 500,
  cellShape: 'circle',
};

const MAX_AGE = 150;
const MAX_IMMICH_PAGE = 1000;

function normalizeSquares(v: unknown): SquareDef[] {
  if (!Array.isArray(v)) return DEFAULT_SQUARES.map(q => ({ ...q }));
  const out: SquareDef[] = [];
  for (const q of v as unknown[]) {
    if (q === null || typeof q !== 'object') continue;
    const { key, name, color, image } = q as Record<string, unknown>;
    if (typeof key !== 'string' || key === '') continue;
    const sq: SquareDef = {
      key,
      name: typeof name === 'string' ? name : key,
      color: typeof color === 'string' && color !== '' ? color : null,
    };
    if (sq.color === null && typeof image === 'string' && image !== '') sq.image = image;
    out.push(sq);
  }
  return out;
}

/**
 * The single validator for settings: coerce each field (missing/wrong type -> default),
 * keep ages whole and within 0..150 with endAge >= startAge + 1, drop malformed squares.
 * Always returns a fresh object.
 */
export function normalizeSettings(s: Partial<Settings> | null | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  const src = (s ?? {}) as Record<string, unknown>;
  const str = (k: keyof Settings): string => (typeof src[k] === 'string' ? (src[k]) : (d[k] as string));
  const num = (k: keyof Settings): number =>
    typeof src[k] === 'number' && Number.isFinite(src[k]) ? Math.floor(src[k]) : (d[k] as number);
  const startAge = Math.min(Math.max(num('startAge'), 0), MAX_AGE - 1);
  const pageSize = num('immichPageSize');
  return {
    birthDate: str('birthDate').trim(),
    yearStart: src.yearStart === 'january' || src.yearStart === 'custom' ? src.yearStart : 'birthday',
    yearStartDate: str('yearStartDate').trim(),
    startAtCurrentYear: typeof src.startAtCurrentYear === 'boolean'
      ? src.startAtCurrentYear
      : !('startAge' in src), // settings saved before this option keep their start age
    startAge,
    endAge: Math.min(Math.max(num('endAge'), startAge + 1), MAX_AGE),
    weekFolder: str('weekFolder'),
    dayFolder: str('dayFolder'),
    weekTemplatePath: str('weekTemplatePath'),
    dayTemplatePath: str('dayTemplatePath'),
    weekTemplate: str('weekTemplate'),
    dayTemplate: str('dayTemplate'),
    squares: normalizeSquares(src.squares),
    immichEnabled: typeof src.immichEnabled === 'boolean' ? src.immichEnabled : d.immichEnabled,
    immichUrl: str('immichUrl').trim().replace(/\/+$/, ''),
    immichApiKey: str('immichApiKey'),
    immichPageSize: pageSize >= 1 ? Math.min(pageSize, MAX_IMMICH_PAGE) : d.immichPageSize,
    cellShape: src.cellShape === 'square' || src.cellShape === 'dots' ? src.cellShape : 'circle',
  };
}

export function parseBirthDate(
  s: string,
): { birthYear: number; birthMonth: number; birthDay: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { birthYear: y, birthMonth: mo, birthDay: d };
}

/**
 * A compact, self-contained config code: base64 of the settings JSON. Includes
 * the Immich key, so the code is as sensitive as the key — meant for moving
 * your own setup to another device (e.g. phone) in one paste.
 */
export function encodeConfig(s: Settings): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Decode a config code or raw JSON (e.g. fetched from a URL) into settings. */
export function parseConfigPayload(payload: string): Partial<Settings> {
  const text = payload.trim();
  const json = text.startsWith('{') ? text : decodeBase64Utf8(text);
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('config payload is not an object');
  }
  return parsed;
}

function decodeBase64Utf8(code: string): string {
  const bin = atob(code);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** "MM-DD" -> month/day; a real day of a non-leap year (so no 02-29), else null. */
export function parseYearStartDate(s: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const [month, day] = [Number(m[1]), Number(m[2])];
  const dt = new Date(Date.UTC(2001, month - 1, day));
  return dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day ? { month, day } : null;
}

/** The month/day each grid year starts on; null while there is no valid birth date. */
export function resolveAnchor(s: Settings): { month: number; day: number } | null {
  const b = parseBirthDate(s.birthDate);
  if (!b) return null;
  if (s.yearStart === 'january') return { month: 1, day: 1 };
  if (s.yearStart === 'custom') {
    const c = parseYearStartDate(s.yearStartDate);
    if (c) return c;
  }
  return { month: b.birthMonth, day: b.birthDay };
}

/** The first and last grid year: from the year you are in now, or the manual start age. */
export function ageRange(s: Settings, currentAge: number | null): { startAge: number; endAge: number } {
  if (s.startAtCurrentYear && currentAge !== null) {
    return { startAge: Math.max(0, Math.min(currentAge, s.endAge - 1)), endAge: s.endAge };
  }
  return { startAge: s.startAge, endAge: s.endAge };
}
