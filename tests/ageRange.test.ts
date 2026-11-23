import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, ageRange, normalizeSettings } from '../src/config';

describe('start from the current year', () => {
  it('a fresh install starts from the current year', () => {
    expect(DEFAULT_SETTINGS.startAtCurrentYear).toBe(true);
    expect(normalizeSettings(undefined).startAtCurrentYear).toBe(true);
    expect(normalizeSettings({}).startAtCurrentYear).toBe(true);
    expect(normalizeSettings(DEFAULT_SETTINGS).startAtCurrentYear).toBe(true);
  });
  it('settings saved before this option keep their own start age', () => {
    const legacy = { startAge: 21, endAge: 100 } as never;
    const s = normalizeSettings(legacy);
    expect(s.startAtCurrentYear).toBe(false);
    expect(s.startAge).toBe(21);
  });
  it('an explicit choice is kept', () => {
    expect(normalizeSettings({ startAge: 5, startAtCurrentYear: true } as never).startAtCurrentYear).toBe(true);
    expect(normalizeSettings({ startAtCurrentYear: false } as never).startAtCurrentYear).toBe(false);
  });
  it('default manual start age is 0 (from birth)', () => {
    expect(DEFAULT_SETTINGS.startAge).toBe(0);
  });
});

describe('ageRange', () => {
  const on = normalizeSettings({ startAtCurrentYear: true, startAge: 3, endAge: 100 } as never);
  const off = normalizeSettings({ startAtCurrentYear: false, startAge: 3, endAge: 100 } as never);
  it('on: starts at the current age', () => {
    expect(ageRange(on, 35)).toEqual({ startAge: 35, endAge: 100 });
  });
  it('on: never past the last year shown', () => {
    expect(ageRange(on, 140)).toEqual({ startAge: 99, endAge: 100 });
  });
  it('on, current age unknown (no birth date): falls back to the manual start age', () => {
    expect(ageRange(on, null)).toEqual({ startAge: 3, endAge: 100 });
  });
  it('off: the manual range', () => {
    expect(ageRange(off, 35)).toEqual({ startAge: 3, endAge: 100 });
  });
});

describe('note marker shape', () => {
  it('fresh installs draw circles in notes', () => {
    expect(DEFAULT_SETTINGS.noteShape).toBe('circle');
    expect(normalizeSettings({}).noteShape).toBe('circle');
    expect(normalizeSettings(DEFAULT_SETTINGS).noteShape).toBe('circle');
  });
  it('settings saved before this option keep the rounded squares', () => {
    expect(normalizeSettings({ startAge: 21 } as never).noteShape).toBe('square');
  });
  it('keeps an explicit choice, drops junk', () => {
    expect(normalizeSettings({ startAge: 1, noteShape: 'circle' } as never).noteShape).toBe('circle');
    expect(normalizeSettings({ noteShape: 'square' } as never).noteShape).toBe('square');
    expect(normalizeSettings({ noteShape: 'hexagon' } as never).noteShape).toBe('circle');
  });
});
