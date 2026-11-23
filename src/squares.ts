import type { SquareDef } from './config';

/** CSS class name for a square key: 'work.png' -> 'sq-work'. */
export function squareClass(key: string): string {
  return 'sq-' + key.replace(/\.[^.]+$/, '');
}

/** Vault file name of an image square's picture (its own key unless converted from colour). */
export function squareImage(q: SquareDef): string {
  return q.image || q.key;
}

/** Marker class for image squares embedded in a note (styled in styles.css). */
export const SQ_IMG_CLASS = 'wcg-sq-img';
/** Marker class for a colour span whose key is not in the settings (styled as a neutral box). */
export const SQ_UNKNOWN_CLASS = 'wcg-sq-unknown';

/** Toggle the marker only when it actually changes: touching `class` re-fires the class observer. */
function setUnknown(span: HTMLElement, on: boolean): void {
  if (span.classList.contains(SQ_UNKNOWN_CLASS) === on) return;
  if (on) span.classList.add(SQ_UNKNOWN_CLASS); else span.classList.remove(SQ_UNKNOWN_CLASS);
}

/**
 * Square colours are user-defined, so they are applied per element (a CSS custom property
 * read by the static `.sq` rule in styles.css) rather than through an injected stylesheet.
 * Idempotent; safe to call on any subtree.
 */
export function decorateSquares(
  root: ParentNode, squares: SquareDef[], imageUrl: (name: string) => string | null = () => null,
): void {
  const colors = new Map(squares.filter(t => t.color).map(t => [squareClass(t.key), t.color as string]));
  // image squares written as a class span (converted from colour): the picture is the span's background
  const pictures = new Map(squares.filter(t => !t.color).map(t => [squareClass(t.key), squareImage(t)]));
  const images = new Set(squares.filter(t => !t.color).flatMap(t => [t.key, squareImage(t)]));
  const all = (sel: string): HTMLElement[] => [
    ...(typeof (root as HTMLElement).matches === 'function' && (root as HTMLElement).matches(sel) ? [root as HTMLElement] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(sel)),
  ];
  all('span.sq').forEach(span => {
    for (const [cls, color] of colors) {
      if (span.classList.contains(cls)) {
        span.style.removeProperty('--wcg-sq-img');
        setUnknown(span, false);
        span.setCssProps({ '--wcg-sq-color': color });
        return;
      }
    }
    span.style.removeProperty('--wcg-sq-color');
    for (const [cls, name] of pictures) {
      const url = span.classList.contains(cls) ? imageUrl(name) : null;
      if (url) { setUnknown(span, false); span.setCssProps({ '--wcg-sq-img': `url("${url.replace(/"/g, '%22')}")` }); return; }
    }
    span.style.removeProperty('--wcg-sq-img');
    // a square the settings no longer list (or an image still loading) must not vanish: neutral box
    const known = [...pictures.keys()].some(cls => span.classList.contains(cls));
    setUnknown(span, !known);
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
