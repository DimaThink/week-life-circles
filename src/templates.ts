import type { Settings, SquareDef } from './config';
import { squareClass } from './squares';

// Extensions that embed as images (get a |600 display-width suffix); others embed bare
export const PHOTO_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function squareMarkup(square: string, squares: SquareDef[]): string {
  return squares.some(q => q.key === square && q.color)
    ? `<span class="sq ${squareClass(square)}"></span>`
    : `![[${square}|14]]`;
}

function photoEmbed(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return `![[${name}${PHOTO_IMAGE_EXTS.has(ext) ? '|600' : ''}]]`;
}

/** Text of a new week note: the template note's text if one is set and found, else the settings template. */
export function buildWeekNote(opts: {
  ww: string; yy: string; square: string; dateStr: string; photoNames: string[]; settings: Settings;
  templateRaw?: string | null;
}): string {
  const { ww, yy, square, dateStr, photoNames, settings } = opts;
  const sq = squareMarkup(square, settings.squares);
  const photos = photoNames.map(photoEmbed).join('\n');
  // function replacers: avoid `$` special patterns in substituted values
  return (opts.templateRaw ?? settings.weekTemplate)
    // a `{{photos}}` line of its own leaves no blank line behind when there are no photos
    .replace(/^\{\{photos\}\}\n/gm, () => (photos ? photos + '\n' : ''))
    .replace(/\{\{ww\}\}/g, () => ww)
    .replace(/\{\{yy\}\}/g, () => yy)
    .replace(/\{\{square\}\}/g, () => sq)
    .replace(/\{\{date\}\}/g, () => dateStr)
    .replace(/\{\{photos\}\}/g, () => photos);
}

export function renderDayTemplate(opts: {
  templateRaw: string | null; dateStr: string; weekdayName: string; yesterdayStr: string;
  square: string; settings: Settings;
}): string {
  const { templateRaw, dateStr, weekdayName, yesterdayStr, square, settings } = opts;
  const sq = squareMarkup(square, settings.squares);
  const fill = (text: string): string => text
    .replace(/\{\{date\}\}/g, () => dateStr)
    .replace(/\{\{weekday\}\}/g, () => weekdayName)
    .replace(/\{\{square\}\}/g, () => sq);
  if (templateRaw === null) return fill(settings.dayTemplate);
  // A template file: the same placeholders, plus the Templater tags of the original
  // personal template (script block dropped, date / weekday / yesterday tags filled in).
  return fill(templateRaw
    .replace(/<%\*[\s\S]*?-?%>\n?/, '')
    .replace(/<%\s*date\s*%>/g, () => dateStr)
    .replace(/<%\s*dayUA\s*%>/g, () => weekdayName)
    .replace(/<%[^%]*?-1[^%]*?%>/g, () => yesterdayStr)
    .replace(/<span class="sq sq-work"><\/span>/, () => sq));
}
