// The circle drawn from the note's circle property (pure rules; the DOM / CodeMirror glue
// lives in autoCircleView.ts). A week or day note whose frontmatter names its circle gets
// the circle shown at the top of the note without any HTML in the note itself.

import type { SquareDef } from './config';
import { findCircleProperty, shapeOfProperty, type MarkerShape } from './circleProperty';
import { parseDayFilename } from './dayFiles';
import { squareImage } from './squares';
import { contentStart, parseWeekFilename } from './weekFiles';

export type NoteKind = 'week' | 'day';

/** Is `path` a week/day note: inside the configured folder, with a matching file name? */
export function circleNoteKind(path: string, weekFolder: string, dayFolder: string): NoteKind | null {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (path.startsWith(weekFolder + '/') && parseWeekFilename(name)) return 'week';
  if (path.startsWith(dayFolder + '/') && parseDayFilename(name)) return 'day';
  return null;
}

/** How many lines after the frontmatter can hold the note's header (same window as firstSquares). */
const HEADER_WINDOW = 5;

/**
 * Does the line already show a circle written into the note: a `<span class="sq …">`,
 * a `` `sq:…` `` code marker, or an embed of a circle image (`![[work.png|14]]`)?
 * A small image embed (width up to 32) counts too, as old notes used one for the circle.
 */
export function hasInlineMarker(line: string, imageNames: ReadonlySet<string> = new Set()): boolean {
  if (/<span\b[^>]*\bclass\s*=\s*["'](?:[^"']*\s)?sq(?:\s|["'])/i.test(line)) return true;
  if (/`sq:[^`]+`/.test(line)) return true;
  for (const m of line.matchAll(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g)) {
    const target = m[1].trim();
    if (imageNames.has(target) || imageNames.has(target.slice(target.lastIndexOf('/') + 1))) return true;
    const width = /^\s*(\d+)\s*(?:x\s*\d+\s*)?$/.exec(m[2] ?? '');
    if (width && /\.(png|jpe?g|gif|webp|svg)$/i.test(target) && parseInt(width[1], 10) <= 32) return true;
  }
  return false;
}

/** Where the circles go and which ones (circle keys, in order). */
export interface AutoCirclePlan {
  /** 0-based line of the note text. */
  line: number;
  /** Offset in that line: right after the first token and the space after it, or the line end. */
  ch: number;
  /** True when nothing follows on the line (a heading, or a one-token line): space goes before the circle. */
  atEnd: boolean;
  keys: string[];
  /** Set by the property that names the circles (`square` draws squares). */
  shape: MarkerShape;
}

/**
 * The circles to draw for a note: the circles its property names (all of them for a week
 * note, which covers one week per list item; the first for a day note), placed on the first
 * non-empty line after the frontmatter — after its first token (`06.28 ● 04.06.2026`), or at
 * the end of the line when it is a heading. Null when the note has no frontmatter, no such
 * property, no value that names a circle, no content line, or when its header already shows
 * a circle written into the text (never draw a second one).
 */
export function planAutoCircles(
  text: string, kind: NoteKind, squares: SquareDef[], properties: string[],
): AutoCirclePlan | null {
  const found = findCircleProperty(text, { names: properties, squares });
  if (!found) return null;
  const keys = kind === 'day' ? found.keys.slice(0, 1) : found.keys;
  const shape = shapeOfProperty(found.name);

  const lines = text.split(/\r?\n/);
  const start = contentStart(lines);
  if (start === 0) return null; // no (closed) frontmatter, so no property either
  const window = lines.slice(start, start + HEADER_WINDOW);
  const imageNames = new Set(squares.filter(s => !s.color).flatMap(s => [s.key, squareImage(s)]));
  if (window.some(l => hasInlineMarker(l, imageNames))) return null;

  const offset = window.findIndex(l => l.trim() !== '');
  if (offset === -1) return null;
  const line = start + offset;
  const raw = lines[line];
  const end = raw.trimEnd().length;
  if (/^\s{0,3}#{1,6}(\s|$)/.test(raw)) return { line, ch: end, atEnd: true, keys, shape };
  const token = /^\s*\S+/.exec(raw);
  const tokenEnd = token ? token[0].length : end;
  if (tokenEnd >= end) return { line, ch: end, atEnd: true, keys, shape };
  // after the one space or tab that follows the token, so the circle sits between the words
  return { line, ch: tokenEnd + 1, atEnd: false, keys, shape };
}

/** A stable string for a plan, to tell whether the circles of an open note changed. */
export function planSignature(plan: AutoCirclePlan | null): string {
  return plan ? `${plan.line}:${plan.ch}:${plan.shape}:${plan.keys.join(',')}` : '';
}

/** One circle as the note title shows it: a colour, or a picture URL (both null = not found). */
export interface TitleCircle { color: string | null; url: string | null }

const NEUTRAL = 'var(--background-modifier-border-hover)';
const RING = 'var(--wcg-ring)';

/** A colour safe to put inside a CSS gradient (else the neutral fill). */
function safeColor(c: string | null): string | null {
  return c && /^[#\w(),.%\s-]+$/.test(c) ? c.trim() : null;
}

/**
 * CSS custom properties that draw `circles` side by side as the background of the note
 * title's ::before (styles.css): one background layer (or two) per circle, so the title
 * text itself is never touched. Sizes come from --wcg-ts (circle) and --wcg-tg (gap).
 */
export function titleCircleProps(circles: TitleCircle[], shape: MarkerShape): Record<string, string> {
  const bg: string[] = [], pos: string[] = [], size: string[] = [];
  const full = 'var(--wcg-ts) var(--wcg-ts)';
  const inner = 'calc(var(--wcg-ts) - 2px) calc(var(--wcg-ts) - 2px)';
  const layer = (image: string, x: string, s: string): void => { bg.push(image); pos.push(`${x} center`); size.push(s); };
  circles.forEach((c, i) => {
    const x = `calc(${i} * (var(--wcg-ts) + var(--wcg-tg)))`;
    const color = safeColor(c.color);
    const url = !color && c.url ? `url("${c.url.replace(/"/g, '%22')}")` : null;
    const fill = color ?? (url ? null : NEUTRAL);
    if (shape === 'square') {
      layer(fill ? `linear-gradient(${fill}, ${fill})` : url as string, `calc(${x} + 1px)`, inner);
      layer(`linear-gradient(${RING}, ${RING})`, x, full);
      return;
    }
    if (fill) {
      layer(`radial-gradient(circle closest-side, transparent calc(100% - 1.5px), ${RING} calc(100% - 1.5px) calc(100% - 0.5px), transparent 100%)`, x, full);
      layer(`radial-gradient(circle closest-side, ${fill} calc(100% - 0.5px), transparent 100%)`, x, full);
    } else {
      // the picture is square: cover its corners with the page background
      layer(`radial-gradient(circle closest-side, transparent calc(100% - 1.5px), ${RING} calc(100% - 1.5px) calc(100% - 0.5px), var(--background-primary) 100%)`, x, full);
      layer(url as string, x, full);
    }
  });
  const n = circles.length;
  return {
    '--wcg-title-bg': bg.join(', ') || 'none',
    '--wcg-title-pos': pos.join(', ') || '0 0',
    '--wcg-title-size': size.join(', ') || 'auto',
    '--wcg-title-w': `calc(${n} * var(--wcg-ts) + ${Math.max(n - 1, 0)} * var(--wcg-tg))`,
  };
}
