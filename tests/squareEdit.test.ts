import { describe, it, expect } from 'vitest';
import {
  colorSquareKey, fitWithin, isHexColor, isSquareImageName, moveItem, slugify, squareClassClash, takenImageNames, uniqueImageName,
} from '../src/squareEdit';
import { extractSquares } from '../src/weekFiles';
import { squareImage } from '../src/squares';
import { squareMarkup } from '../src/templates';
import { encodeConfig, normalizeSettings, parseConfigPayload } from '../src/config';

describe('slugify', () => {
  it('plain lowercase words joined by dashes', () => {
    expect(slugify('New Chapter!')).toBe('new-chapter');
    expect(slugify('  --Trip 2026--  ')).toBe('trip-2026');
  });
  it('falls back to "square" when nothing usable is left (e.g. Cyrillic)', () => {
    expect(slugify('Подорож')).toBe('square');
    expect(slugify('')).toBe('square');
  });
});

describe('isSquareImageName', () => {
  it('accepts only the file types notes can reference back', () => {
    expect(isSquareImageName('flag.png')).toBe(true);
    expect(isSquareImageName('my flag.jpg')).toBe(true);
    expect(isSquareImageName('flag.webp')).toBe(false);
    expect(isSquareImageName('flag.PNG')).toBe(false);
    expect(isSquareImageName('a|b.png')).toBe(false);
    expect(isSquareImageName('dir/flag.png')).toBe(false);
  });
  it('every accepted name round-trips through note parsing', () => {
    for (const n of ['flag.png', 'my flag.jpg', 'trip-2.png']) {
      expect(extractSquares(`![[${n}|14]]`, [n])).toEqual([n]);
    }
  });
});

describe('uniqueImageName', () => {
  it('first free name, case-insensitive against the vault', () => {
    expect(uniqueImageName('trip', new Set())).toBe('trip.png');
    expect(uniqueImageName('trip', new Set(['trip.png']))).toBe('trip-2.png');
    expect(uniqueImageName('trip', new Set(['trip.png', 'trip-2.png']))).toBe('trip-3.png');
  });
});

describe('colorSquareKey', () => {
  it('plain, unique-by-time key that is safe in a CSS class', () => {
    expect(colorSquareKey('Deep Work', 0)).toBe('custom-deep-work-0');
    expect(colorSquareKey('Подорож', 35)).toBe('custom-square-z');
  });
});

describe('moveItem', () => {
  it('moves one step, returns a new array, ignores moves off the ends', () => {
    const a = ['a', 'b', 'c'];
    expect(moveItem(a, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(a, 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(a, 0, -1)).toEqual(a);
    expect(moveItem(a, 2, 3)).toEqual(a);
    expect(a).toEqual(['a', 'b', 'c']);
  });
});

describe('fitWithin', () => {
  it('scales down keeping the ratio, never up', () => {
    expect(fitWithin(1024, 512, 256)).toEqual({ w: 256, h: 128 });
    expect(fitWithin(300, 900, 256)).toEqual({ w: 85, h: 256 });
    expect(fitWithin(64, 32, 256)).toEqual({ w: 64, h: 32 });
  });
  it('unsized images (e.g. some SVGs) get the full box', () => {
    expect(fitWithin(0, 0, 256)).toEqual({ w: 256, h: 256 });
  });
});

describe('isHexColor', () => {
  it('what the colour picker can show', () => {
    expect(isHexColor('#4A4A4A')).toBe(true);
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#12345')).toBe(false);
  });
});

describe('square key collisions', () => {
  it('a different extension still clashes with an existing square', () => {
    expect(squareClassClash('rest.jpg', ['work.png', 'rest.png'])).toBe(true);
    expect(squareClassClash('trip.png', ['work.png', 'rest.png'])).toBe(false);
  });
  it('an upload never takes a name an existing square owns, file or no file', () => {
    const taken = takenImageNames(['work.png', 'custom-x-1'], ['Trip.png']);
    expect(uniqueImageName('work', taken)).toBe('work-2.png');
    expect(uniqueImageName('trip', taken)).toBe('trip-2.png');
    expect(uniqueImageName('custom-x-1', taken)).toBe('custom-x-1-2.png');
    expect(squareClassClash(uniqueImageName('work', taken), ['work.png'])).toBe(false);
  });
});

describe('converting a square between colour and image', () => {
  it('the image file defaults to the key; an explicit image wins', () => {
    expect(squareImage({ key: 'flag.png', name: 'F', color: null })).toBe('flag.png');
    expect(squareImage({ key: 'work.png', name: 'W', color: null, image: 'work-2.png' })).toBe('work-2.png');
  });
  it('settings keep the image file of an image square, drop junk', () => {
    const [a, b, c] = normalizeSettings({ squares: [
      { key: 'work.png', name: 'W', color: null, image: 'work-2.png' },
      { key: 'rest.png', name: 'R', color: '#fff', image: 'x.png' }, // colour square: image ignored
      { key: 'flag.png', name: 'F', color: null, image: 5 as never },
    ] }).squares;
    expect(a).toEqual({ key: 'work.png', name: 'W', color: null, image: 'work-2.png' });
    expect(b).toEqual({ key: 'rest.png', name: 'R', color: '#fff' });
    expect(c).toEqual({ key: 'flag.png', name: 'F', color: null });
  });
  it('survives the config code', () => {
    const s = normalizeSettings({ squares: [{ key: 'work.png', name: 'W', color: null, image: 'work-2.png' }] });
    expect(normalizeSettings(parseConfigPayload(encodeConfig(s))).squares[0].image).toBe('work-2.png');
  });
  it('markup: a converted square keeps writing its class, so every note reads it back the same way', () => {
    const squares = [
      { key: 'work.png', name: 'W', color: null, image: 'work-2.png' }, // colour → image
      { key: 'flag.png', name: 'F', color: '#123456' },                  // image → colour
      { key: 'trip.png', name: 'T', color: null },                       // plain image square
    ];
    expect(squareMarkup('work.png', squares)).toBe('<span class="sq sq-work"></span>');
    expect(squareMarkup('flag.png', squares)).toBe('<span class="sq sq-flag"></span>');
    expect(squareMarkup('trip.png', squares)).toBe('![[trip.png|14]]');
    for (const k of ['work.png', 'flag.png', 'trip.png']) {
      expect(extractSquares(squareMarkup(k, squares), squares.map(q => q.key))).toEqual([k]);
    }
    // old notes of the converted squares still read back
    expect(extractSquares('![[flag.png|14]]', squares.map(q => q.key))).toEqual(['flag.png']);
  });
});
