import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_SQUARES, normalizeSettings, parseBirthDate, encodeConfig, parseConfigPayload } from '../src/config';
import type { Settings } from '../src/config';

describe('DEFAULT_SETTINGS', () => {
  it('has sane defaults', () => {
    expect(DEFAULT_SETTINGS.startAge).toBeLessThan(DEFAULT_SETTINGS.endAge);
    expect(DEFAULT_SETTINGS.immichEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.weekFolder).toBe('Week life calendar');
    expect(DEFAULT_SETTINGS.dayFolder).toBe('Week day status');
  });
  it('squares exclude personal markers and include generic ones', () => {
    const keys = DEFAULT_SQUARES.map(s => s.key);
    expect(keys).not.toContain('england.png');
    expect(keys).not.toContain('korea.png');
    expect(keys).toContain('work.png');
    expect(keys).toContain('christmas.png');
    expect(DEFAULT_SQUARES.every(s => s.color !== null)).toBe(true);
    expect(DEFAULT_SQUARES).toHaveLength(17);
  });
  it('templates carry placeholders', () => {
    expect(DEFAULT_SETTINGS.weekTemplate).toContain('{{ww}}.{{yy}} {{square}} {{date}}');
    expect(DEFAULT_SETTINGS.weekTemplate).toContain('{{photos}}');
    expect(DEFAULT_SETTINGS.dayTemplate).toContain('{{weekday}}');
  });
});

describe('normalizeSettings', () => {
  it('clamps endAge above startAge', () => {
    const s = normalizeSettings({ startAge: 100, endAge: 21 });
    expect(s.endAge).toBeGreaterThan(s.startAge);
  });
  it('fills missing fields', () => {
    const s = normalizeSettings({});
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.squares).not.toBe(DEFAULT_SETTINGS.squares);
  });
  it('falls back to defaults for undefined/null/wrong-typed values', () => {
    const s = normalizeSettings({ startAge: undefined, endAge: null, weekFolder: 123, squares: null } as any);
    expect(s.startAge).toBe(21);
    expect(s.endAge).toBe(100);
    expect(s.weekFolder).toBe(DEFAULT_SETTINGS.weekFolder);
    expect(s.squares).toEqual(DEFAULT_SQUARES);
  });
  it('rejects NaN ages and keeps endAge > startAge', () => {
    const s = normalizeSettings({ startAge: NaN, endAge: NaN });
    expect(s.startAge).toBe(21);
    expect(s.endAge).toBe(100);
    expect(normalizeSettings({ startAge: 30, endAge: NaN }).endAge).toBeGreaterThan(30);
  });
  it('round-trips DEFAULT_SETTINGS', () => {
    expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
  it('does not alias default squares', () => {
    expect(DEFAULT_SETTINGS.squares).not.toBe(DEFAULT_SQUARES);
    expect(DEFAULT_SETTINGS.squares[0]).not.toBe(DEFAULT_SQUARES[0]);
    expect(normalizeSettings({}).squares[0]).not.toBe(DEFAULT_SETTINGS.squares[0]);
  });
  it('keeps provided values', () => {
    expect(normalizeSettings({ birthDate: '2000-01-01', weekFolder: 'W' }).weekFolder).toBe('W');
  });
});

describe('parseBirthDate', () => {
  it('parses valid', () => {
    expect(parseBirthDate('2000-01-01')).toEqual({ birthYear: 2000, birthMonth: 1, birthDay: 1 });
  });
  it('rejects invalid', () => {
    expect(parseBirthDate('')).toBeNull();
    expect(parseBirthDate('not-a-date')).toBeNull();
    expect(parseBirthDate('2000-13-40')).toBeNull();
    expect(parseBirthDate('2000-02-30')).toBeNull();
  });
});

describe('config code (encode/parse)', () => {
  const sample = normalizeSettings({
    ...DEFAULT_SETTINGS,
    birthDate: '2000-01-01',
    immichApiKey: 'secret-key',
    weekTemplate: '# Що було\n', // non-ASCII survives
    squares: [{ key: 'flag.png', name: 'Trip', color: null }],
  });

  it('round-trips settings through a code (incl. non-ASCII + the key)', () => {
    const code = encodeConfig(sample);
    expect(code).not.toContain('secret-key'); // encoded, not plaintext
    const back = normalizeSettings(parseConfigPayload(code));
    expect(back).toEqual(sample);
  });

  it('also accepts raw JSON (as a URL would return)', () => {
    const json = JSON.stringify(sample);
    expect(normalizeSettings(parseConfigPayload(json))).toEqual(sample);
  });

  it('rejects garbage / non-object payloads', () => {
    expect(() => parseConfigPayload('not a code')).toThrow();
    expect(() => parseConfigPayload(btoa('[1,2,3]'))).toThrow();
  });
});

describe('cellShape', () => {
  it('defaults to circle', () => {
    expect(DEFAULT_SETTINGS.cellShape).toBe('circle');
    expect(normalizeSettings({}).cellShape).toBe('circle');
  });
  it('keeps square, rejects garbage', () => {
    expect(normalizeSettings({ cellShape: 'square' }).cellShape).toBe('square');
    expect(normalizeSettings({ cellShape: 'dots' }).cellShape).toBe('dots');
    expect(normalizeSettings({ cellShape: 'hexagon' as never }).cellShape).toBe('circle');
    expect(normalizeSettings({ cellShape: 3 as never }).cellShape).toBe('circle');
  });
  it('survives the config code round-trip', () => {
    const s = normalizeSettings({ cellShape: 'square' });
    expect(normalizeSettings(parseConfigPayload(encodeConfig(s))).cellShape).toBe('square');
  });
  it('an old config code without cellShape loads as circle', () => {
    const old = { ...normalizeSettings({}) } as Partial<Settings>;
    delete old.cellShape;
    expect(normalizeSettings(parseConfigPayload(JSON.stringify(old))).cellShape).toBe('circle');
  });
});
