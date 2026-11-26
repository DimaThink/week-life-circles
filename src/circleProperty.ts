// The circle as a note property: a tiny frontmatter reader/writer for one property.
// Deliberately not parseYaml (needs Obsidian 1.10.0); only the shapes Obsidian itself
// writes for a text or list property are understood: `p: a`, `p: [a, b]` and a `- a` block list.

import type { SquareDef } from './config';
import { squareClass } from './squares';

/** Property value of a circle: its key's base name, i.e. the squareClass without `sq-` ('work.png' -> 'work'). */
export function circleValue(key: string): string {
  return squareClass(key).slice(3);
}

/** Line range of the frontmatter body (between the `---` lines), or null when the note has none. */
function frontmatterRange(lines: string[]): { start: number; end: number } | null {
  if (lines[0] !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && l === '---');
  return end === -1 ? null : { start: 1, end };
}

const KEY_LINE = /^(?:"([^"]*)"|'([^']*)'|([^\s"'#\-[\]{}][^:]*?))[ \t]*:(?:[ \t]+(.*))?$/;

/** The top-level key of a frontmatter line and the text after its colon, or null. */
function keyOf(line: string): { key: string; rest: string } | null {
  const m = KEY_LINE.exec(line);
  if (!m) return null;
  return { key: m[1] ?? m[2] ?? m[3], rest: (m[4] ?? '').trim() };
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** One YAML scalar: double/single-quoted or plain (a trailing ` # comment` dropped). */
function scalar(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('"')) {
    const m = /^"((?:[^"\\]|\\.)*)"/.exec(s);
    return m ? m[1].replace(/\\(.)/g, '$1') : s.slice(1);
  }
  if (s.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'/.exec(s);
    return m ? m[1].replace(/''/g, "'") : s.slice(1);
  }
  return s.replace(/\s+#.*$/, '').trim();
}

/** Items of a flow list body (`a, "b, c", 'd'`), splitting on commas outside quotes. */
function flowItems(body: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(scalar);
}

/** Is a frontmatter line a continuation of the entry above it (a list item or an indented line)? */
const continues = (line: string): boolean => /^\s*-(\s|$)/.test(line) || /^\s+\S/.test(line);

/**
 * The values of top-level property `name` in the note's frontmatter: a string gives one
 * value, a list its items. null when there is no frontmatter or no such property;
 * [] when the property is empty. The name is matched case-insensitively.
 */
export function readPropertyValues(text: string, name: string): string[] | null {
  const lines = text.split(/\r?\n/);
  const fm = frontmatterRange(lines);
  if (!fm) return null;
  for (let i = fm.start; i < fm.end; i++) {
    const kv = keyOf(lines[i]);
    if (!kv || !sameName(kv.key, name)) continue;
    let values: string[];
    if (kv.rest === '' || kv.rest.startsWith('#')) {
      values = [];
      for (let j = i + 1; j < fm.end && /^\s*-(\s|$)/.test(lines[j]); j++) {
        values.push(scalar(lines[j].replace(/^\s*-\s*/, '')));
      }
    } else if (kv.rest.startsWith('[')) {
      const close = kv.rest.lastIndexOf(']');
      const body = kv.rest.slice(1, close === -1 ? undefined : close);
      values = body.trim() === '' ? [] : flowItems(body);
    } else {
      values = [scalar(kv.rest)];
    }
    return values.filter(v => v !== '');
  }
  return null;
}

/**
 * Circle keys for property values, in order: a value names a circle by its key, its key's
 * base name or its display name (case-insensitive; keys win over names). Unknown values are dropped.
 */
export function resolveCircles(values: string[], squares: SquareDef[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const q = squares.find(s => sameName(s.key, v) || sameName(circleValue(s.key), v))
      ?? squares.find(s => sameName(s.name, v));
    if (q) out.push(q.key);
  }
  return out;
}

/** Where a note's circle property is read from. */
export interface CircleProperty { name: string; squares: SquareDef[] }

/** The circles named by the note's property, or null when it has none that match a circle. */
export function propertyCircles(text: string, prop: CircleProperty): string[] | null {
  const values = readPropertyValues(text, prop.name);
  const keys = values ? resolveCircles(values, prop.squares) : [];
  return keys.length > 0 ? keys : null;
}

const YAML_WORDS = /^(true|false|yes|no|on|off|null|y|n)$/i;

/** A value as YAML: plain when it reads back as the same string, else double-quoted. */
function yamlValue(v: string): string {
  return /^[\p{L}_][\p{L}\p{N}_ .-]*$/u.test(v) && !/\s$/.test(v) && !YAML_WORDS.test(v) ? v : JSON.stringify(v);
}

/**
 * The note with property `name` set to `values` (one value as a string, several as a
 * block list), added to its frontmatter — created when the note has none. An existing
 * value of the property is replaced. Line endings follow the note.
 */
export function withCircleProperty(text: string, name: string, values: string[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const entry = values.length === 1
    ? [`${name}: ${yamlValue(values[0])}`]
    : values.length === 0 ? [`${name}: []`] : [`${name}:`, ...values.map(v => `  - ${yamlValue(v)}`)];
  const lines = text.split(/\r?\n/);
  const fm = frontmatterRange(lines);
  if (!fm) return ['---', ...entry, '---'].join(eol) + eol + text;
  const body: string[] = [];
  for (let i = fm.start; i < fm.end; i++) {
    const kv = keyOf(lines[i]);
    if (kv && sameName(kv.key, name)) {
      while (i + 1 < fm.end && continues(lines[i + 1])) i++;
      continue;
    }
    body.push(lines[i]);
  }
  return ['---', ...body, ...entry, ...lines.slice(fm.end)].join(eol);
}
