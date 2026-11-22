// Pure rules behind the squares editor in the settings tab.

/** Longest side of an uploaded square image, in px (cells are 42px; room for HiDPI). */
export const SQUARE_IMAGE_MAX = 256;

/** A plain lowercase slug for file names and keys; "square" when nothing usable is left. */
export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'square';
}

/**
 * Whether a vault image can be an image square. Notes reference it as
 * `![[name|14]]`, and only lowercase .png/.jpg names are read back from notes
 * (see extractSquares), so other types are refused rather than silently lost.
 */
export function isSquareImageName(name: string): boolean {
  return /^[^"'\\[\]|<>/#^]+\.(?:png|jpg)$/.test(name);
}

/** `<base>.png`, or `<base>-2.png`, … — the first name not in `taken` (lowercased vault file names). */
export function uniqueImageName(base: string, taken: { has(name: string): boolean }): string {
  for (let i = 1; ; i++) {
    const name = `${base}${i === 1 ? '' : `-${i}`}.png`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** Key of a new colour square; it ends up in a CSS class and note markup, so it stays plain. */
export function colorSquareKey(name: string, now: number): string {
  return `custom-${slugify(name)}-${now.toString(36)}`;
}

/** A copy of `list` with item `from` moved to `to`; unchanged copy when either is out of range. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** Size that fits `w`×`h` within `max`×`max` keeping the ratio, never enlarging. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (!(w > 0 && h > 0)) return { w: max, h: max };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A colour the colour picker can show as-is (#rgb or #rrggbb). */
export function isHexColor(c: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
}

/** The part of a key notes match on: squareClass drops the extension, so `rest.png` and `rest.jpg` clash. */
function classBase(key: string): string {
  return key.replace(/\.[^.]+$/, '').toLowerCase();
}

/** Whether `key` would be read back from notes as one of `keys` (same CSS class). */
export function squareClassClash(key: string, keys: string[]): boolean {
  const base = classBase(key);
  return keys.some(k => classBase(k) === base);
}

/**
 * Names an uploaded image must avoid: every vault file name, plus `<base>.png`
 * for every existing square (colour squares and missing images have no file,
 * but still own their class). All lowercased, for uniqueImageName.
 */
export function takenImageNames(squareKeys: string[], vaultFileNames: string[]): Set<string> {
  return new Set([
    ...vaultFileNames.map(n => n.toLowerCase()),
    ...squareKeys.map(k => `${classBase(k)}.png`),
  ]);
}
