import { describe, it, expect } from 'vitest';
import { notePreview } from '../src/weekFiles';

const keys = ['work.png'];

describe('notePreview', () => {
  it('skips frontmatter and the marker line, keeps the writing', () => {
    const t = '---\ntags: x\n---\n07.28 <span class="sq sq-work"></span> 18.11.2026\n\n# What happened\n\nWent to the sea.\nMet friends.\n';
    expect(notePreview(t, keys)).toBe('What happened\nWent to the sea.\nMet friends.');
  });
  it('turns markdown into plain text', () => {
    const t = '01.28 `sq:work.png` 06.05.2026\n* [ ] Plan the trip\n- see [[Notes|my notes]] and **bold**\n![[photo.jpg]]\n';
    expect(notePreview(t, keys)).toBe('☐ Plan the trip\n• see my notes and bold');
  });
  it('empty note -> empty preview', () => {
    expect(notePreview('01.28 <span class="sq sq-work"></span> 06.05.2026\n\n', keys)).toBe('');
    expect(notePreview('', keys)).toBe('');
  });
  it('is short: at most 5 lines, long lines cut', () => {
    const body = Array.from({ length: 9 }, (_, i) => `line ${i + 1} ` + 'x'.repeat(200)).join('\n');
    const out = notePreview('01.28 `sq:work.png` d\n' + body, keys).split('\n');
    expect(out.length).toBeLessThanOrEqual(5);
    for (const l of out) expect(l.length).toBeLessThanOrEqual(91);
    expect(out[0].endsWith('…')).toBe(true);
  });
  it('a note with no marker line keeps its first line', () => {
    expect(notePreview('Just text here\nand more', keys)).toBe('Just text here\nand more');
  });
});
