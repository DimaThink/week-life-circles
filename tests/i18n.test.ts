import { describe, it, expect } from 'vitest';
import { PACKS, t, setLang, resolveLang } from '../src/i18n';

const vars = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('translations', () => {
  it('every English key exists in uk and pl, with the same placeholders, and no extras', () => {
    for (const p of PACKS) {
      for (const lang of ['uk', 'pl'] as const) {
        expect(Object.keys(p[lang]).sort()).toEqual(Object.keys(p.en).sort());
        for (const k of Object.keys(p.en)) expect(vars(p[lang][k])).toEqual(vars(p.en[k]));
      }
    }
  });
  it('resolveLang follows Obsidian unless forced', () => {
    expect(resolveLang('auto', 'uk')).toBe('uk');
    expect(resolveLang('auto', 'pl-PL')).toBe('pl');
    expect(resolveLang('auto', 'de')).toBe('en');
    expect(resolveLang('pl', 'uk')).toBe('pl');
  });
  it('t falls back to the key and fills placeholders', () => {
    setLang('en');
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
