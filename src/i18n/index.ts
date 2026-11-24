import type { Language } from '../config';
import { settingsPack } from './strings/settings';
import { circlesPack } from './strings/circles';
import { notesPack } from './strings/notes';

export type Lang = 'en' | 'uk' | 'pl';
export type Dict = Record<string, string>;
/** One namespace of UI strings: English is the source of truth; the others must cover every key. */
export interface Pack { en: Dict; uk: Dict; pl: Dict }

export const PACKS: Pack[] = [settingsPack, circlesPack, notesPack];

/** Language names, each written in its own language (shown in the picker). */
export const LANGUAGE_NAMES: Record<Lang, string> = { en: 'English', uk: 'Українська', pl: 'Polski' };

const merged: Record<Lang, Dict> = { en: {}, uk: {}, pl: {} };
for (const p of PACKS) for (const l of ['en', 'uk', 'pl'] as const) Object.assign(merged[l], p[l]);

let current: Lang = 'en';

/** Pick the language: an explicit choice, or Obsidian's own locale ("uk", "pl", "en-GB", …). */
export function resolveLang(pref: Language, obsidianLocale: string): Lang {
  if (pref === 'en' || pref === 'uk' || pref === 'pl') return pref;
  const code = obsidianLocale.toLowerCase().slice(0, 2);
  return code === 'uk' || code === 'pl' ? code : 'en';
}

export function setLang(l: Lang): void {
  current = l;
}

export function getLang(): Lang {
  return current;
}

/** Translate `key`, filling `{name}` placeholders. Missing keys fall back to English, then to the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = merged[current][key] ?? merged.en[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : raw;
}
