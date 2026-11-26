import {
  CellMap, Settings, DEFAULT_SETTINGS, DEFAULT_SQUARES, SquareDef, normalizeSettings, legacyDayTemplate, legacyWeekTemplate,
} from './config';

export interface SavedData {
  settings: Settings;
  cells: CellMap;
  builtAt: number;
  dayCells: CellMap;
  dayBuiltAt: number;
}

function mergeSquares(custom: unknown): SquareDef[] {
  const out: SquareDef[] = DEFAULT_SQUARES.map(q => ({ ...q }));
  if (!Array.isArray(custom)) return out;
  for (const c of custom as SquareDef[]) {
    if (!c || typeof c.key !== 'string') continue;
    const i = out.findIndex(q => q.key === c.key);
    if (i >= 0) out[i] = { ...c };
    else out.push({ ...c });
  }
  return out;
}

/** data.json of the old week-calendar-sync plugin (no `settings` key). */
interface LegacyData {
  customSquares?: unknown;
  cells?: CellMap;
  builtAt?: number;
  dayCells?: CellMap;
  dayBuiltAt?: number;
}

const LEGACY_KEYS = ['cells', 'customSquares', 'dayCells', 'builtAt', 'dayBuiltAt'];

/** `fresh`: nothing usable was saved (a new install), so first-run defaults may be applied. */
export function migrate(raw: unknown): { data: SavedData; migrated: boolean; fresh: boolean } {
  const isObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
  const hasSettings = isObject && 'settings' in raw && !!raw.settings;
  // Anything that is neither our data nor the old plugin's is treated as a fresh install.
  if (!isObject || (!hasSettings && !LEGACY_KEYS.some(k => k in raw))) {
    return {
      data: { settings: normalizeSettings(DEFAULT_SETTINGS), cells: {}, builtAt: 0, dayCells: {}, dayBuiltAt: 0 },
      migrated: false,
      fresh: true,
    };
  }
  if (hasSettings) return { data: raw as SavedData, migrated: false, fresh: false };
  const loaded = raw as LegacyData;
  // Generic defaults; the user's own customSquares are the one carry-over. Notes written by
  // the old plugin keep its behaviour, as for any settings saved before 1.10.
  const base = normalizeSettings(DEFAULT_SETTINGS);
  const squares = mergeSquares(loaded.customSquares);
  const settings: Settings = {
    ...base,
    squares,
    daySquares: squares.map(q => ({ ...q })),
    dayLayout: 'week',
    attachmentLocation: 'week-folder',
    markerStyle: 'inline',
    legacyTemplates: true,
    weekTemplate: legacyWeekTemplate(base.weekTemplate),
    dayTemplate: legacyDayTemplate(base.dayTemplate),
  };
  return {
    data: {
      settings,
      cells: loaded.cells ?? {},
      builtAt: loaded.builtAt ?? 0,
      dayCells: loaded.dayCells ?? {},
      dayBuiltAt: loaded.dayBuiltAt ?? 0,
    },
    migrated: true,
    fresh: false,
  };
}
