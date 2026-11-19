import type { SquareDef } from './config';

/** CSS class name for a square key: 'work.png' -> 'sq-work'. */
export function squareClass(key: string): string {
  return 'sq-' + key.replace(/\.[^.]+$/, '');
}

/** CSS injected for inline square spans/images in week files. */
export function buildSquareCSS(squares: SquareDef[]): string {
  return `.sq{display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:middle;margin:0 1px;cursor:pointer}\n` +
    squares.filter(t => t.color).map(t => `.${squareClass(t.key)}{background:${t.color}}`).join('\n') + '\n' +
    squares.filter(t => !t.color).map(t =>
      `img[alt="${t.key}"]{width:18px!important;height:18px!important;display:inline-block!important;vertical-align:middle!important;border-radius:4px!important;cursor:pointer!important}`
    ).join('\n');
}

/** {key: color} for colour squares only. */
export function colorMap(squares: SquareDef[]): Record<string, string> {
  return Object.fromEntries(squares.filter(t => t.color).map(t => [t.key, t.color as string]));
}
