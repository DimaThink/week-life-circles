import type { Lang } from './i18n';
import { defaultAttachmentFolder, type DayLayout } from './notePaths';
import { starterDayTemplate, starterWeekTemplate } from './i18n/strings/templates';

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

/**
 * Where uploaded photos of a week go: a folder of your own (`attachmentFolder`, `{{yy}}` and
 * `{{ww}}` filled in), or wherever Obsidian's "Default location for new attachments" says.
 */
export type AttachmentLocation = 'folder' | 'obsidian';

export type { DayLayout };

/** Interface language: follow Obsidian's, or force one. */
export type Language = 'auto' | 'en' | 'uk' | 'pl';

export interface Settings {
  language: Language;
  birthDate: string; // "YYYY-MM-DD", "" until set
  yearStart: YearStart;
  yearStartDate: string; // "MM-DD", used when yearStart is 'custom'
  startAtCurrentYear: boolean; // true: the grid starts at the year you are in now
  startAge: number; // first year shown when startAtCurrentYear is off
  endAge: number;
  weekFolder: string;
  dayFolder: string;
  /** Where new day notes go inside dayFolder (existing notes are found in any layout). */
  dayLayout: DayLayout;
  attachmentLocation: AttachmentLocation;
  /** Folder of the `folder` attachment location; may use {{yy}} and {{ww}}. */
  attachmentFolder: string;
  /** Display width of embedded images in px; 0 = no width. */
  photoWidth: number;
  /** Vault folder whose photos/videos the week dialog offers ('' = off). */
  vaultPhotoFolder: string;
  showMobileButton: boolean; // the floating grid button on mobile
  dayGridYears: number; // years shown side by side in the day grid
  weekTemplatePath: string; // "" = use the weekTemplate text below
  dayTemplatePath: string; // "" = use built-in day template
  weekTemplate: string;
  dayTemplate: string;
  /** moment.js format of every date written into notes (day FILE names stay YYYY-MM-DD). */
  dateFormat: string;
  squares: SquareDef[];
  /** Day notes, the day grid and the day dialog use `daySquares` instead of `squares`. */
  daySquaresEnabled: boolean;
  daySquares: SquareDef[];
  /** New notes get a `week: "WW.YY"` property (the personal week; day notes: the week of the day). */
  weekProperty: boolean;
  /**
   * Frontmatter property new notes write the circle to (a list for a note covering several
   * weeks). `square` draws squares, any other name circles; `circle` and `square` are always read.
   */
  circleProperty: string;
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
 * Template placeholders (see templates.ts):
 *   {{ww}}       personal week number 01-52, zero-padded (e.g. 07)
 *   {{yy}}       two-digit year (e.g. 26)
 *   {{circle}} / {{square}}  write nothing; they pick the property (`circle` / `square`) new notes get
 *   {{date}}     first day of the week (week notes) / the day (day notes)
 *   {{today}}    the day the note is created
 *   {{weekEnd}}  last day of the week (week notes)
 *   {{days}}     one line per day of the week (week notes)
 *   {{photos}}   photo embeds (week notes)
 *   {{weekday}}, {{yesterday}}  weekday name / the day before (day notes)
 * Date placeholders take an optional moment format: {{date:YYYY-MM-DD}}.
 * The starter texts live in i18n (they are translated); English is the default.
 */
export const DEFAULT_WEEK_TEMPLATE = starterWeekTemplate('journal', 'en');

export const DEFAULT_DAY_TEMPLATE = starterDayTemplate('en');

export const DEFAULT_DATE_FORMAT = 'DD.MM.YYYY';

export const DEFAULT_CIRCLE_PROPERTY = 'circle';

/** A property name that is safe to write as a plain YAML key (letters, digits, `_ .-` and inner spaces). */
export function cleanPropertyName(v: unknown): string {
  const name = typeof v === 'string' ? v.trim() : '';
  return /^[\p{L}\p{N}_][\p{L}\p{N}_ .-]*$/u.test(name) ? name : DEFAULT_CIRCLE_PROPERTY;
}

export const DEFAULT_SETTINGS: Settings = {
  birthDate: '',
  yearStart: 'birthday',
  yearStartDate: '',
  startAtCurrentYear: true,
  startAge: 0,
  endAge: 100,
  weekFolder: 'Week life calendar',
  dayFolder: 'Week day status',
  dayLayout: 'flat',
  attachmentLocation: 'obsidian',
  attachmentFolder: defaultAttachmentFolder('Week life calendar'),
  photoWidth: 600,
  vaultPhotoFolder: '',
  showMobileButton: true,
  dayGridYears: 10,
  weekTemplatePath: '',
  dayTemplatePath: '',
  weekTemplate: DEFAULT_WEEK_TEMPLATE,
  dayTemplate: DEFAULT_DAY_TEMPLATE,
  dateFormat: DEFAULT_DATE_FORMAT,
  squares: DEFAULT_SQUARES.map(q => ({ ...q })),
  daySquaresEnabled: false,
  daySquares: DEFAULT_SQUARES.map(q => ({ ...q })),
  circleProperty: DEFAULT_CIRCLE_PROPERTY,
  weekProperty: true,
  immichEnabled: false,
  immichUrl: '',
  immichApiKey: '',
  immichPageSize: 500,
  language: 'auto',
  cellShape: 'circle',
};

const MAX_AGE = 150;
const MAX_IMMICH_PAGE = 1000;
const MAX_PHOTO_WIDTH = 4000;
const MAX_DAY_GRID_YEARS = 30;

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
 * A template text already in the 1.10 form: an older plugin version may re-save data.json
 * without `dateFormat` (synced devices), and the one-time rewrite must not run twice.
 */
const rewritten = (text: string): boolean => text.includes('{{today}}') || text.includes('{{date:');

/** The stored week template of pre-1.10 settings: `{{date}}` meant the creation date. */
export function legacyWeekTemplate(text: string): string {
  return rewritten(text) ? text : text.replace(/\{\{date\}\}/g, '{{today}}');
}

/** The stored day template of pre-1.10 settings: `{{date}}` was written as YYYY-MM-DD. */
export function legacyDayTemplate(text: string): string {
  return rewritten(text) ? text : text.replace(/\{\{date\}\}/g, '{{date:YYYY-MM-DD}}');
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
  /** A vault folder path: no leading or trailing slashes (they would never match a note path); empty = the default. */
  const folder = (k: keyof Settings): string => str(k).trim().replace(/^\/+|\/+$/g, '') || (d[k] as string);
  const num = (k: keyof Settings): number =>
    typeof src[k] === 'number' && Number.isFinite(src[k]) ? Math.floor(src[k]) : (d[k] as number);
  const startAge = Math.min(Math.max(num('startAge'), 0), MAX_AGE - 1);
  const pageSize = num('immichPageSize');
  const photoWidth = num('photoWidth');
  // Settings saved before an option existed keep the old behaviour; a fresh install gets the new default.
  const legacy = 'startAge' in src;
  // Settings saved before dateFormat existed: {{date}} meant the creation date in week
  // notes and YYYY-MM-DD in day notes. Rewrite once so new notes look as before.
  const legacyDates = 'startAge' in src && !('dateFormat' in src);
  const squares = normalizeSquares(src.squares);
  const weekFolder = folder('weekFolder');
  const weekTemplate = legacyDates ? legacyWeekTemplate(str('weekTemplate')) : str('weekTemplate');
  const dayTemplate = legacyDates ? legacyDayTemplate(str('dayTemplate')) : str('dayTemplate');
  return {
    birthDate: str('birthDate').trim(),
    yearStart: src.yearStart === 'january' || src.yearStart === 'custom' ? src.yearStart : 'birthday',
    yearStartDate: str('yearStartDate').trim(),
    startAtCurrentYear: typeof src.startAtCurrentYear === 'boolean'
      ? src.startAtCurrentYear
      : !('startAge' in src), // settings saved before this option keep their start age
    startAge,
    endAge: Math.min(Math.max(num('endAge'), startAge + 1), MAX_AGE),
    weekFolder,
    dayFolder: folder('dayFolder'),
    dayLayout: src.dayLayout === 'week' || src.dayLayout === 'flat' || src.dayLayout === 'month'
      ? src.dayLayout
      : (legacy ? 'week' : d.dayLayout),
    // 'week-folder' (before 1.12) is the folder location with its old folder
    attachmentLocation: src.attachmentLocation === 'obsidian' ? 'obsidian'
      : src.attachmentLocation === 'folder' || src.attachmentLocation === 'week-folder' || legacy ? 'folder'
        : d.attachmentLocation,
    attachmentFolder: (typeof src.attachmentFolder === 'string' ? src.attachmentFolder : '').trim().replace(/^\/+|\/+$/g, '')
      || defaultAttachmentFolder(weekFolder),
    photoWidth: photoWidth >= 0 ? Math.min(photoWidth, MAX_PHOTO_WIDTH) : d.photoWidth,
    vaultPhotoFolder: str('vaultPhotoFolder').trim().replace(/^\/+|\/+$/g, ''),
    showMobileButton: typeof src.showMobileButton === 'boolean' ? src.showMobileButton : d.showMobileButton,
    dayGridYears: Math.min(Math.max(num('dayGridYears'), 1), MAX_DAY_GRID_YEARS),
    weekTemplatePath: str('weekTemplatePath'),
    dayTemplatePath: str('dayTemplatePath'),
    weekTemplate,
    dayTemplate,
    dateFormat: str('dateFormat').trim() || d.dateFormat,
    squares,
    daySquaresEnabled: typeof src.daySquaresEnabled === 'boolean' ? src.daySquaresEnabled : d.daySquaresEnabled,
    // no saved day set yet: start from a copy of the week circles (the seven defaults on a fresh install),
    // so turning the day set on keeps existing day notes recognised
    daySquares: Array.isArray(src.daySquares) ? normalizeSquares(src.daySquares) : squares.map(q => ({ ...q })),
    circleProperty: cleanPropertyName(src.circleProperty),
    weekProperty: typeof src.weekProperty === 'boolean' ? src.weekProperty : d.weekProperty,
    immichEnabled: typeof src.immichEnabled === 'boolean' ? src.immichEnabled : d.immichEnabled,
    immichUrl: str('immichUrl').trim().replace(/\/+$/, ''),
    immichApiKey: str('immichApiKey'),
    immichPageSize: pageSize >= 1 ? Math.min(pageSize, MAX_IMMICH_PAGE) : d.immichPageSize,
    language: src.language === 'en' || src.language === 'uk' || src.language === 'pl' ? src.language : 'auto',
    cellShape: src.cellShape === 'square' || src.cellShape === 'dots' ? src.cellShape : 'circle',
  };
}

/** The circles day notes, the day grid and the day dialog use. */
export function daySquareSet(s: Pick<Settings, 'squares' | 'daySquares' | 'daySquaresEnabled'>): SquareDef[] {
  return s.daySquaresEnabled ? s.daySquares : s.squares;
}

/**
 * Every circle a note may show: the week circles, then the day-only ones (a key in both
 * sets keeps its week look). Used to colour markers inside notes.
 */
export function markerSquares(s: Pick<Settings, 'squares' | 'daySquares' | 'daySquaresEnabled'>): SquareDef[] {
  if (!s.daySquaresEnabled) return s.squares;
  const keys = new Set(s.squares.map(q => q.key));
  return [...s.squares, ...s.daySquares.filter(q => !keys.has(q.key))];
}

/** Settings of a brand-new install: the defaults, with the starter templates in the user's language. */
export function freshInstallSettings(lang: Lang): Settings {
  return {
    ...normalizeSettings(DEFAULT_SETTINGS),
    weekTemplate: starterWeekTemplate('journal', lang),
    dayTemplate: starterDayTemplate(lang),
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
