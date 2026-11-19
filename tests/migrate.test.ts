import { describe, it, expect } from 'vitest';
import { migrate } from '../src/migrate';
import { DEFAULT_SETTINGS } from '../src/config';

const oldData = () => ({
  cells: { '21': { '1': { square: 'work.png', path: 'x' } } },
  builtAt: 123,
  customSquares: [{ key: 'custom-x.png', name: 'X', color: '#111' }],
  dayCells: {},
  dayBuiltAt: 0,
});

describe('migrate', () => {
  it('fresh install -> defaults, not migrated', () => {
    const { data, migrated } = migrate(null);
    expect(migrated).toBe(false);
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
    expect(data.settings).not.toBe(DEFAULT_SETTINGS);
    expect(data.settings.squares).not.toBe(DEFAULT_SETTINGS.squares);
    expect(data.cells).toEqual({});
    expect(data.builtAt).toBe(0);
    expect(data.dayCells).toEqual({});
    expect(data.dayBuiltAt).toBe(0);
  });

  it('legacy data -> generic defaults + custom squares + caches preserved', () => {
    const { data, migrated } = migrate(oldData());
    expect(migrated).toBe(true);
    const s = data.settings;
    expect(s.birthDate).toBe('');
    expect(s.startAge).toBe(DEFAULT_SETTINGS.startAge);
    expect(s.endAge).toBe(DEFAULT_SETTINGS.endAge);
    expect(s.weekFolder).toBe(DEFAULT_SETTINGS.weekFolder);
    expect(s.dayFolder).toBe(DEFAULT_SETTINGS.dayFolder);
    expect(s.dayTemplatePath).toBe(DEFAULT_SETTINGS.dayTemplatePath);
    const keys = s.squares.map(q => q.key);
    expect(keys).not.toContain('korea.png');
    expect(keys).not.toContain('england.png');
    expect(keys).toContain('work.png');
    expect(keys).toContain('custom-x.png');
    expect(new Set(keys).size).toBe(keys.length);
    expect(s.squares.length).toBe(DEFAULT_SETTINGS.squares.length + 1);
    expect(s.weekTemplate).toBe(DEFAULT_SETTINGS.weekTemplate);
    expect(s.weekTemplate).not.toContain('Що було');
    expect(s.dayTemplate).toBe(DEFAULT_SETTINGS.dayTemplate);
    expect(s.immichEnabled).toBe(false);
    expect(data.cells['21']['1'].square).toBe('work.png');
    expect(data.builtAt).toBe(123);
    expect(data.dayCells).toEqual({});
    expect(data.dayBuiltAt).toBe(0);
  });

  it('customSquares override same-key default entries', () => {
    const o = oldData();
    o.customSquares = [{ key: 'work.png', name: 'Job', color: '#222' }];
    const { data } = migrate(o);
    const k = data.settings.squares.filter(q => q.key === 'work.png');
    expect(k).toEqual([{ key: 'work.png', name: 'Job', color: '#222' }]);
  });

  it('missing caches default; squares are not shared between calls', () => {
    const a = migrate({ cells: {} });
    expect(a.data.builtAt).toBe(0);
    expect(a.data.dayCells).toEqual({});
    a.data.settings.squares[0].name = 'MUTATED';
    expect(migrate({ cells: {} }).data.settings.squares[0].name).toBe(DEFAULT_SETTINGS.squares[0].name);
  });

  it('idempotent', () => {
    const first = migrate(oldData()).data;
    const snap = JSON.parse(JSON.stringify(first));
    const second = migrate(first);
    expect(second.migrated).toBe(false);
    expect(second.data).toEqual(snap);
  });
});
