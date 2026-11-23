import { describe, it, expect } from 'vitest';
import { CIRCLE_PRESETS, DEFAULT_SQUARES, circlePreset } from '../src/config';
import { isHexColor } from '../src/squareEdit';

describe('circle presets', () => {
  it('offers the classic set and the soft (week.dth.ink) set', () => {
    expect(CIRCLE_PRESETS.map(p => p.id)).toEqual(['classic', 'soft']);
  });
  it('classic is today\'s default list', () => {
    expect(circlePreset('classic')).toEqual(DEFAULT_SQUARES);
  });
  it('soft has the 7 kinds of the website demo, all coloured, unique keys', () => {
    const s = circlePreset('soft')!;
    expect(s.map(q => q.name)).toEqual(['Work', 'Rest', 'Bright', 'Love', 'Building', 'Hope', 'Trip']);
    expect(new Set(s.map(q => q.key)).size).toBe(s.length);
    for (const q of s) expect(isHexColor(q.color ?? '')).toBe(true);
  });
  it('returns fresh copies (editing one never changes the preset)', () => {
    const a = circlePreset('soft')!; a[0].name = 'X';
    expect(circlePreset('soft')![0].name).toBe('Work');
  });
  it('unknown id -> null', () => {
    expect(circlePreset('nope')).toBeNull();
  });
});
