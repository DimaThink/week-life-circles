// Where new notes and attachments go. Pure path building (no vault access).
import { formatYMD, pad2, weekOfDoy } from './calendar';

/**
 * How day notes are laid out inside the day folder: one subfolder per personal week
 * (`WW.YY/`), all in the folder itself, or one subfolder per calendar month (`YYYY/MM/`).
 * Reading is recursive, so notes in any of these layouts are found.
 */
export type DayLayout = 'week' | 'flat' | 'month';

/** Vault path of the day note for `date` (personal year/day-of-year in `personal`). */
export function dayNotePath(
  dayFolder: string, layout: DayLayout, date: Date, personal: { yy: number; doy: number },
): string {
  const name = `${formatYMD(date)}.md`;
  switch (layout) {
    case 'flat': return `${dayFolder}/${name}`;
    case 'month': return `${dayFolder}/${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${name}`;
    default: return `${dayFolder}/${pad2(weekOfDoy(personal.doy))}.${pad2(personal.yy)}/${name}`;
  }
}

/** Every parent folder of `filePath`, outermost first (`a/b/x.md` -> `a`, `a/b`). */
export function folderChain(filePath: string): string[] {
  const parts = filePath.split('/').slice(0, -1);
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

/** Where a week's uploads go with the `week-folder` attachment location: `<weekFolder>/Attachments/YY/<name>`. */
export function weekAttachmentPath(weekFolder: string, yy: string, name: string): string {
  return `${weekFolder}/Attachments/${yy}/${name}`;
}
