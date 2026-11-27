/** A note without its leading frontmatter block (new notes always start with one holding the circle). */
export function body(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
  return m ? text.slice(m[0].length) : text;
}
