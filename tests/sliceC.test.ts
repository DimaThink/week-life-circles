import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, freshInstallSettings, normalizeSettings } from '../src/config';
import { dayNotePath, folderChain, weekAttachmentPath } from '../src/notePaths';
import { isVaultMedia, mediaDate, mediaInRange, nameDate } from '../src/vaultPhotos';
import { buildWeekNote, type DateFormatter } from '../src/templates';
import { migrate } from '../src/migrate';

const day = (y: number, m: number, d: number): Date => new Date(y, m - 1, d);
const LEGACY = { startAge: 0, endAge: 90 };

describe('dayNotePath', () => {
  const date = day(2026, 3, 9);
  it('week layout: <folder>/WW.YY/YYYY-MM-DD.md (the 1.9 path)', () => {
    expect(dayNotePath('Days', 'week', date, { yy: 28, doy: 15 })).toBe('Days/03.28/2026-03-09.md');
  });
  it('week layout: days 365/366 belong to week 52; years 100+ keep three digits', () => {
    expect(dayNotePath('D', 'week', date, { yy: 7, doy: 366 })).toBe('D/52.07/2026-03-09.md');
    expect(dayNotePath('D', 'week', date, { yy: 101, doy: 1 })).toBe('D/01.101/2026-03-09.md');
  });
  it('flat layout: <folder>/YYYY-MM-DD.md', () => {
    expect(dayNotePath('Daily', 'flat', date, { yy: 28, doy: 15 })).toBe('Daily/2026-03-09.md');
  });
  it('month layout: <folder>/YYYY/MM/YYYY-MM-DD.md', () => {
    expect(dayNotePath('Daily', 'month', date, { yy: 28, doy: 15 })).toBe('Daily/2026/03/2026-03-09.md');
    expect(dayNotePath('Daily', 'month', day(2026, 12, 31), { yy: 28, doy: 1 })).toBe('Daily/2026/12/2026-12-31.md');
  });
});

describe('folderChain', () => {
  it('lists every parent folder of a file, outermost first', () => {
    expect(folderChain('a/b/c/x.md')).toEqual(['a', 'a/b', 'a/b/c']);
    expect(folderChain('x.md')).toEqual([]);
  });
});

describe('weekAttachmentPath', () => {
  it('is <weekFolder>/Attachments/YY/<name> (the 1.9 location)', () => {
    expect(weekAttachmentPath('Week life calendar', '28', '07.28.jpg')).toBe('Week life calendar/Attachments/28/07.28.jpg');
  });
});

describe('vault photos: dates', () => {
  it('reads YYYY-MM-DD and YYYYMMDD from the file name', () => {
    expect(nameDate('2026-03-09 beach.jpg')).toEqual(day(2026, 3, 9));
    expect(nameDate('IMG_20260309_141516.jpg')).toEqual(day(2026, 3, 9));
    expect(nameDate('PXL_20251231_235959123.mp4')).toEqual(day(2025, 12, 31));
    expect(nameDate('Screenshot 2026-11-26 at 10.00.png')).toEqual(day(2026, 11, 26));
  });
  it('ignores impossible dates, mixed separators and digits inside longer numbers', () => {
    expect(nameDate('2026-02-30.jpg')).toBeNull();
    expect(nameDate('20261340.jpg')).toBeNull();
    expect(nameDate('2026-0309.jpg')).toBeNull();
    expect(nameDate('1234567890123.jpg')).toBeNull();
    expect(nameDate('photo.jpg')).toBeNull();
    expect(nameDate('17000101.jpg')).toBeNull(); // implausible year
  });
  it('falls back to the creation time when the name carries no date', () => {
    const ctime = new Date(2026, 2, 9, 23, 30).getTime();
    expect(mediaDate({ name: 'photo.jpg', ctime })).toEqual(day(2026, 3, 9));
    expect(mediaDate({ name: '2025-01-02.jpg', ctime })).toEqual(day(2025, 1, 2));
  });
  it('recognises images and videos by extension', () => {
    for (const n of ['a.jpg', 'a.JPEG', 'a.png', 'a.webp', 'a.gif', 'a.mp4', 'a.MOV', 'a.webm', 'a.mkv']) expect(isVaultMedia(n)).toBe(true);
    for (const n of ['a.md', 'a.pdf', 'jpg', 'a.jpg.txt']) expect(isVaultMedia(n)).toBe(false);
  });
});

describe('vault photos: week matching', () => {
  // A week from Wed 18.11.2026 to Tue 24.11.2026 (until = the day after).
  const range = { since: day(2026, 11, 18), until: day(2026, 11, 25) };
  const ctime = new Date(2020, 0, 1).getTime();
  const f = (path: string, c = ctime) => ({ path, name: path.split('/').pop()!, ctime: c });
  it('keeps media dated inside the week, sorted by date then path, and drops non-media', () => {
    const files = [
      f('P/2026-11-24 last.jpg'),
      f('P/2026-11-25 after.jpg'),
      f('P/2026-11-17 before.jpg'),
      f('P/sub/IMG_20261118_0900.jpg'),
      f('P/b 2026-11-20.mp4'),
      f('P/a 2026-11-20.png'),
      f('P/2026-11-20 notes.md'),
      f('P/undated.jpg', new Date(2026, 10, 21, 12).getTime()),
      f('P/undated-old.jpg'),
    ];
    expect(mediaInRange(files, range).map(x => x.path)).toEqual([
      'P/sub/IMG_20261118_0900.jpg',
      'P/a 2026-11-20.png',
      'P/b 2026-11-20.mp4',
      'P/undated.jpg',
      'P/2026-11-24 last.jpg',
    ]);
  });
  it('the name date wins over ctime', () => {
    expect(mediaInRange([f('P/2026-01-01.jpg', new Date(2026, 10, 20).getTime())], range)).toEqual([]);
  });
});

describe('photo width', () => {
  const fmt: DateFormatter = d => String(d.getDate());
  const dates = { weekStart: day(2026, 11, 18), weekEnd: day(2026, 11, 24), today: day(2026, 11, 27) };
  const note = (photoWidth: number) => buildWeekNote({
    ww: '07', yy: '28', square: 'work.png', photoNames: ['a.jpg', 'b.mp4'], dates, formatDate: fmt,
    settings: { ...DEFAULT_SETTINGS, markerStyle: 'inline', photoWidth }, templateRaw: '{{photos}}',
  });
  it('images get |<width>, videos stay bare', () => {
    expect(note(600)).toBe('![[a.jpg|600]]\n![[b.mp4]]');
    expect(note(320)).toBe('![[a.jpg|320]]\n![[b.mp4]]');
  });
  it('0 = no width suffix', () => {
    expect(note(0)).toBe('![[a.jpg]]\n![[b.mp4]]');
  });
});

describe('settings: slice C', () => {
  it('fresh install: flat days, Obsidian attachment location, width 600, button on, 10 years, no vault folder', () => {
    for (const s of [DEFAULT_SETTINGS, normalizeSettings({}), freshInstallSettings('pl'), migrate(null).data.settings]) {
      expect(s.dayLayout).toBe('flat');
      expect(s.attachmentLocation).toBe('obsidian');
      expect(s.photoWidth).toBe(600);
      expect(s.showMobileButton).toBe(true);
      expect(s.dayGridYears).toBe(10);
      expect(s.vaultPhotoFolder).toBe('');
    }
  });
  it('settings saved by an older version keep the 1.9 behaviour', () => {
    const s = normalizeSettings(LEGACY);
    expect(s.dayLayout).toBe('week');
    expect(s.attachmentLocation).toBe('week-folder');
    expect(s.photoWidth).toBe(600);
    expect(s.showMobileButton).toBe(true);
    expect(s.dayGridYears).toBe(10);
    expect(s.vaultPhotoFolder).toBe('');
  });
  it('saved choices are kept; invalid ones fall back (legacy or fresh)', () => {
    const s = normalizeSettings({ ...LEGACY, dayLayout: 'month', attachmentLocation: 'obsidian', photoWidth: 320,
      showMobileButton: false, dayGridYears: 3, vaultPhotoFolder: '/Photos/Camera/' });
    expect(s).toMatchObject({ dayLayout: 'month', attachmentLocation: 'obsidian', photoWidth: 320,
      showMobileButton: false, dayGridYears: 3, vaultPhotoFolder: 'Photos/Camera' });
    expect(normalizeSettings({ dayLayout: 'x', attachmentLocation: 'x' } as never)).toMatchObject({ dayLayout: 'flat', attachmentLocation: 'obsidian' });
    expect(normalizeSettings({ ...LEGACY, dayLayout: 'x', attachmentLocation: 'x' } as never)).toMatchObject({ dayLayout: 'week', attachmentLocation: 'week-folder' });
    expect(normalizeSettings({ showMobileButton: 'no' } as never).showMobileButton).toBe(true);
  });
  it('photo width: whole, 0..4000; negative or junk = 600', () => {
    expect(normalizeSettings({ photoWidth: 0 }).photoWidth).toBe(0);
    expect(normalizeSettings({ photoWidth: 450.7 }).photoWidth).toBe(450);
    expect(normalizeSettings({ photoWidth: 99999 }).photoWidth).toBe(4000);
    expect(normalizeSettings({ photoWidth: -5 }).photoWidth).toBe(600);
    expect(normalizeSettings({ photoWidth: NaN }).photoWidth).toBe(600);
  });
  it('day grid years are clamped to 1..30', () => {
    expect(normalizeSettings({ dayGridYears: 0 }).dayGridYears).toBe(1);
    expect(normalizeSettings({ dayGridYears: 99 }).dayGridYears).toBe(30);
    expect(normalizeSettings({ dayGridYears: 5.9 }).dayGridYears).toBe(5);
    expect(normalizeSettings({ dayGridYears: 'x' } as never).dayGridYears).toBe(10);
  });
  it('the vault photo folder is trimmed of slashes; "/" and blanks mean off', () => {
    expect(normalizeSettings({ vaultPhotoFolder: '  ' }).vaultPhotoFolder).toBe('');
    expect(normalizeSettings({ vaultPhotoFolder: '/' }).vaultPhotoFolder).toBe('');
    expect(normalizeSettings({ vaultPhotoFolder: 7 } as never).vaultPhotoFolder).toBe('');
  });
  it('round-trips the defaults', () => {
    expect(normalizeSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    const legacy = normalizeSettings(LEGACY);
    expect(normalizeSettings(legacy)).toEqual(legacy);
  });
});
