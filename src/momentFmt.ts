import { moment } from 'obsidian';
import { forcedLocale } from './i18n';

// Obsidian re-exports `moment`, but under strict type-checking its type can
// resolve to `any` (triggers @typescript-eslint/no-unsafe-*). Pin a minimal
// typed view so date formatting stays type-safe in every environment.
interface MomentLike { format(fmt: string): string; locale(code: string): MomentLike }
const typedMoment = moment as unknown as ((date: Date) => MomentLike) & { locale(): string };

/** Obsidian's current locale code ("en", "uk", "pl", …). */
export const obsidianLocale = (): string => String(typedMoment.locale());

/**
 * Month and weekday names in Obsidian's language, or in the plugin's language when the
 * user picked one explicitly. An unknown locale leaves moment on Obsidian's.
 */
export function momentFmt(date: Date): { format(fmt: string): string } {
  const m = typedMoment(date);
  const forced = forcedLocale();
  return forced ? m.locale(forced) : m;
}
