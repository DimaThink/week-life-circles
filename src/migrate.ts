import { CellMap, Settings, DEFAULT_SETTINGS, DEFAULT_SQUARES, SquareDef, normalizeSettings } from './config';

export interface SavedData {
  settings: Settings;
  cells: CellMap;
  builtAt: number;
  dayCells: CellMap;
  dayBuiltAt: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

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

export function migrate(raw: unknown): { data: SavedData; migrated: boolean } {
  const isObject = raw !== null && typeof raw === 'object' && !Array.isArray(raw);
  const hasSettings = isObject && 'settings' in raw && !!raw.settings;
  // Anything that is neither our data nor the old plugin's is treated as a fresh install.
  if (!isObject || (!hasSettings && !LEGACY_KEYS.some(k => k in raw))) {
    return {
      data: { settings: normalizeSettings(DEFAULT_SETTINGS), cells: {}, builtAt: 0, dayCells: {}, dayBuiltAt: 0 },
      migrated: false,
    };
  }
  if (hasSettings) return { data: raw as SavedData, migrated: false };
  const loaded = raw as LegacyData;
  // Generic defaults only; the user's own customSquares are the one carry-over.
  const settings: Settings = {
    ...normalizeSettings(DEFAULT_SETTINGS),
    squares: mergeSquares(loaded.customSquares),
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
  };
}
