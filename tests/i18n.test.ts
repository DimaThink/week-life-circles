import { describe, it, expect, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS, t, setLang, resolveLang, applyLanguage, forcedLocale } from '../src/i18n';

/** A key's text in one language, looked up in the packs (keeps test code free of non-English text). */
const text = (lang: 'en' | 'uk' | 'pl', key: string): string => {
  const p = PACKS.find(pk => key in pk.en);
  if (!p) throw new Error(`unknown key ${key}`);
  return p[lang][key];
};

const vars = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

/** Every .ts file under src/, except the dictionaries themselves. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'i18n' ? [] : sourceFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

afterEach(() => applyLanguage('en', 'en'));

describe('translations', () => {
  it('every English key exists in uk and pl, with the same placeholders, and no extras', () => {
    for (const p of PACKS) {
      for (const lang of ['uk', 'pl'] as const) {
        expect(Object.keys(p[lang]).sort()).toEqual(Object.keys(p.en).sort());
        for (const k of Object.keys(p.en)) expect(vars(p[lang][k])).toEqual(vars(p.en[k]));
      }
    }
  });

  it('no key is defined in two packs (a later pack would silently win)', () => {
    const keys = PACKS.flatMap(p => Object.keys(p.en));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every key the code asks for exists (a typo would show the raw key)', () => {
    const en = Object.assign({}, ...PACKS.map(p => p.en)) as Record<string, string>;
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const used = sourceFiles(src).flatMap(f =>
      [...readFileSync(f, 'utf8').matchAll(/'((?:settings|circles|notes)\.[\w.]+)'/g)].map(m => m[1]));
    expect(used.length).toBeGreaterThan(100);
    // built from a template literal in grid.ts: `notes.shape.${shape}`
    used.push('notes.shape.circle', 'notes.shape.square', 'notes.shape.dots');
    expect(used.filter(k => !(k in en))).toEqual([]);
  });
});

describe('language selection', () => {
  it('resolveLang follows Obsidian unless forced', () => {
    expect(resolveLang('auto', 'uk')).toBe('uk');
    expect(resolveLang('auto', 'pl-PL')).toBe('pl');
    expect(resolveLang('auto', 'de')).toBe('en');
    expect(resolveLang('pl', 'uk')).toBe('pl');
  });

  it('auto keeps Obsidian date names; a picked language forces them', () => {
    applyLanguage('auto', 'uk');
    expect(t('settings.language')).toBe(text('uk', 'settings.language'));
    expect(forcedLocale()).toBeNull();
    applyLanguage('pl', 'en');
    expect(t('settings.language')).toBe(text('pl', 'settings.language'));
    expect(forcedLocale()).toBe('pl');
    applyLanguage('auto', 'de');
    expect(t('settings.language')).toBe('Language');
    expect(forcedLocale()).toBeNull();
  });

  it('t fills placeholders, keeps unknown ones, and falls back to the key', () => {
    setLang('uk');
    expect(t('notes.grid.weekCount', { n: 5 })).toBe(text('uk', 'notes.grid.weekCount').replace('{n}', '5'));
    expect(t('notes.grid.weekCount', { n: 5 })).not.toContain('{n}');
    setLang('en');
    expect(t('notes.grid.weekCount', { n: 5 })).toBe('5 weeks');
    expect(t('notes.grid.weekCount', { other: 1 })).toBe('{n} weeks');
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
