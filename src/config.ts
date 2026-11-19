export interface SquareDef { key: string; name: string; color: string | null } // color null = image square

/** One grid cell: the square shown and the note it opens. */
export interface Cell { square: string | null; path: string }
/** Cells keyed by personal year, then by week number (week grid) or day-of-year (day grid). */
export type CellMap = Record<string, Record<string, Cell>>;

export interface Settings {
  birthDate: string; // "YYYY-MM-DD", "" until set
  startAge: number;
  endAge: number;
  weekFolder: string;
  dayFolder: string;
  dayTemplatePath: string; // "" = use built-in day template
  weekTemplate: string;
  dayTemplate: string;
  squares: SquareDef[];
  immichEnabled: boolean;
  immichUrl: string;
  immichApiKey: string;
  immichPageSize: number;
}

export const DEFAULT_SQUARES: SquareDef[] = [
  { key: 'work.png', name: 'Work', color: '#4A4A4A' },
  { key: 'brgt.png', name: 'Bright', color: '#F1F145' },
  { key: 'rest.png', name: 'Rest', color: '#7EC8E3' },
  { key: 'msic.png', name: 'Music', color: '#00FFFF' },
  { key: 'love.png', name: 'Love', color: '#FF0000' },
  { key: 'lost.png', name: 'Lost', color: '#973D3D' },
  { key: 'hope.png', name: 'Hope', color: '#A349A4' },
  { key: 'sick.png', name: 'Sick', color: '#AE984E' },
  { key: 'void.png', name: 'Void', color: '#000000' },
  { key: 'build.png', name: 'Building', color: '#CC8400' },
  { key: 'sport.png', name: 'Sport', color: '#39FF14' },
  { key: 'sexx.png', name: 'Intimate', color: '#FF00FF' },
  { key: 'none.png', name: 'Neutral', color: '#9F8CAE' },
  { key: 'past.png', name: 'Nostalgia', color: '#C6C6FF' },
  { key: 'news.png', name: 'New chapter', color: '#FFFFFF' },
  { key: 'futu.png', name: 'Future', color: '#FFFBE6' },
  { key: 'christmas.png', name: 'Christmas', color: '#0CB04A' },
];

/*
 * Template placeholders:
 *   {{ww}}      personal week number 01-52, zero-padded (e.g. 07)
 *   {{yy}}      two-digit year (e.g. 26)
 *   {{square}}  embed/marker of the week's square
 *   {{date}}    date (week start for week notes, the day for day notes)
 *   {{photos}}  photo embeds (week template only; replaced by embed lines)
 *   {{weekday}} weekday name (day template only)
 */
export const DEFAULT_WEEK_TEMPLATE = [
  '{{ww}}.{{yy}} {{square}} {{date}}',
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

export const DEFAULT_DAY_TEMPLATE = '# {{date}} · {{weekday}} {{square}}\n';

export const DEFAULT_SETTINGS: Settings = {
  birthDate: '',
  startAge: 21,
  endAge: 100,
  weekFolder: 'Week life calendar',
  dayFolder: 'Week day status',
  dayTemplatePath: '',
  weekTemplate: DEFAULT_WEEK_TEMPLATE,
  dayTemplate: DEFAULT_DAY_TEMPLATE,
  squares: DEFAULT_SQUARES.map(q => ({ ...q })),
  immichEnabled: false,
  immichUrl: '',
  immichApiKey: '',
  immichPageSize: 500,
};

const MAX_AGE = 150;
const MAX_IMMICH_PAGE = 1000;

function normalizeSquares(v: unknown): SquareDef[] {
  if (!Array.isArray(v)) return DEFAULT_SQUARES.map(q => ({ ...q }));
  const out: SquareDef[] = [];
  for (const q of v as unknown[]) {
    if (q === null || typeof q !== 'object') continue;
    const { key, name, color } = q as Record<string, unknown>;
    if (typeof key !== 'string' || key === '') continue;
    out.push({
      key,
      name: typeof name === 'string' ? name : key,
      color: typeof color === 'string' && color !== '' ? color : null,
    });
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
    startAge,
    endAge: Math.min(Math.max(num('endAge'), startAge + 1), MAX_AGE),
    weekFolder: str('weekFolder'),
    dayFolder: str('dayFolder'),
    dayTemplatePath: str('dayTemplatePath'),
    weekTemplate: str('weekTemplate'),
    dayTemplate: str('dayTemplate'),
    squares: normalizeSquares(src.squares),
    immichEnabled: typeof src.immichEnabled === 'boolean' ? src.immichEnabled : d.immichEnabled,
    immichUrl: str('immichUrl').trim().replace(/\/+$/, ''),
    immichApiKey: str('immichApiKey'),
    immichPageSize: pageSize >= 1 ? Math.min(pageSize, MAX_IMMICH_PAGE) : d.immichPageSize,
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
