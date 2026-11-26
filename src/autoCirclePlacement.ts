// Where the drawn circles go inside a block rendered by reading view (DOM only, no Obsidian API).

/** Insert `circles` into a rendered block: after the first word and its space, or at the end of its first line. */
export function placeInRendered(block: HTMLElement, circles: HTMLElement, atEnd: boolean): void {
  const firstBreak = block.querySelector('br');
  if (!atEnd) {
    const walker = activeDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let inWord = false;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n === firstBreak) break; // the first line was one word: fall through to the line end
      if (n.nodeType !== Node.TEXT_NODE) continue;
      const text = n as Text;
      const data = text.data;
      for (let i = 0; i < data.length; i++) {
        const space = /\s/.test(data[i]);
        if (!inWord && !space) inWord = true;
        else if (inWord && space) {
          const rest = text.splitText(i + 1);
          rest.parentNode?.insertBefore(circles, rest);
          return;
        }
      }
    }
    circles.addClass('is-end');
  }
  if (firstBreak) firstBreak.parentNode?.insertBefore(circles, firstBreak);
  else block.appendChild(circles);
}
