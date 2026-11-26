import type { App } from 'obsidian';
import type { Settings, SquareDef } from '../config';
import { daySquareSet } from '../config';
import { squareImage } from '../squares';

/** The square preselected in the create dialogs. */
export function defaultSquareKey(settings: Settings): string {
  return settings.squares[0]?.key ?? 'work.png';
}

/** The square preselected in the create-day dialog (from the day set when it is on). */
export function defaultDaySquareKey(settings: Pick<Settings, 'squares' | 'daySquares' | 'daySquaresEnabled'>): string {
  return daySquareSet(settings)[0]?.key ?? 'work.png';
}

/** Labelled grid of selectable squares (colour or image); calls `onPick` with the chosen key. */
export function renderSquarePicker(
  app: App,
  parent: HTMLElement,
  label: string,
  squares: SquareDef[],
  initial: string,
  onPick: (key: string) => void,
): void {
  parent.createDiv({ text: label, cls: 'setting-item-name wcg-field-label' });
  const grid = parent.createDiv({ cls: 'wcg-swatch-grid' });
  let selected: HTMLElement | null = null;
  for (const type of squares) {
    const swatch = grid.createDiv({ cls: 'wcg-swatch', attr: { title: type.name } });
    const dot = swatch.createDiv({ cls: 'wcg-swatch-dot' });
    if (type.color) {
      dot.setCssProps({ '--wcg-color': type.color });
    } else {
      const f = app.metadataCache.getFirstLinkpathDest(squareImage(type), '');
      if (f) dot.createEl('img', { attr: { src: app.vault.getResourcePath(f) } });
      else dot.addClass('wcg-swatch-missing');
    }
    swatch.createDiv({ cls: 'wcg-swatch-label', text: type.name });
    const select = (): void => {
      selected?.removeClass('wcg-swatch-selected');
      selected = swatch;
      swatch.addClass('wcg-swatch-selected');
    };
    if (type.key === initial) select();
    swatch.addEventListener('click', () => { select(); onPick(type.key); });
  }
}
