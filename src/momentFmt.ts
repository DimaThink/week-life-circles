import { moment } from 'obsidian';

// Obsidian re-exports `moment`, but under strict type-checking its type can
// resolve to `any` (triggers @typescript-eslint/no-unsafe-*). Pin a minimal
// typed view so date formatting stays type-safe in every environment.
export const momentFmt = moment as unknown as (date: Date) => { format(fmt: string): string };
