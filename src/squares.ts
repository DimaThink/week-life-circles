import type { SquareDef } from './config';

/** CSS class name for a square key: 'work.png' -> 'sq-work'. */
export function squareClass(key: string): string {
  return 'sq-' + key.replace(/\.[^.]+$/, '');
}

/** Marker class for image squares embedded in a note (styled in styles.css). */
export const SQ_IMG_CLASS = 'wcg-sq-img';

/**
 * Square colours are user-defined, so they are applied per element (a CSS custom property
 * read by the static `.sq` rule in styles.css) rather than through an injected stylesheet.
 * Idempotent; safe to call on any subtree.
 */
export function decorateSquares(root: ParentNode, squares: SquareDef[]): void {
  const colors = new Map(squares.filter(t => t.color).map(t => [squareClass(t.key), t.color as string]));
  const images = new Set(squares.filter(t => !t.color).map(t => t.key));
  const all = (sel: string): HTMLElement[] => [
    ...(typeof (root as HTMLElement).matches === 'function' && (root as HTMLElement).matches(sel) ? [root as HTMLElement] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(sel)),
  ];
  all('span.sq').forEach(span => {
    for (const [cls, color] of colors) {
      if (span.classList.contains(cls)) { span.setCssProps({ '--wcg-sq-color': color }); return; }
    }
    span.style.removeProperty('--wcg-sq-color');
  });
  if (images.size === 0) return;
  all('img[alt], .internal-embed[alt]').forEach(el => {
    if (images.has((el.getAttribute('alt') ?? '').trim())) el.classList.add(SQ_IMG_CLASS);
  });
}

/** {key: color} for colour squares only. */
export function colorMap(squares: SquareDef[]): Record<string, string> {
  return Object.fromEntries(squares.filter(t => t.color).map(t => [t.key, t.color as string]));
}
