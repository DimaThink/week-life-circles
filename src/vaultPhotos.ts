// Photos and videos already in the vault: which of them belong to a week. Pure (no vault access).

/** Extensions Obsidian embeds as images or videos. */
export const VAULT_MEDIA_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'mov', 'webm', 'mkv', 'ogv']);

export function isVaultMedia(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && VAULT_MEDIA_EXTS.has(name.slice(dot + 1).toLowerCase());
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2199;

/**
 * The date in a file name: the first `YYYY-MM-DD` or `YYYYMMDD` that is a real day
 * (not part of a longer run of digits), else null. Local midnight.
 */
export function nameDate(name: string): Date | null {
  // `(?:^|\D)` instead of a lookbehind (unsupported on iOS < 16.4)
  for (const m of name.matchAll(/(?:^|\D)(\d{4})(?:-(\d{2})-(\d{2})|(\d{2})(\d{2}))(?!\d)/g)) {
    const y = Number(m[1]), mo = Number(m[2] ?? m[4]), d = Number(m[3] ?? m[5]);
    if (y < MIN_YEAR || y > MAX_YEAR) continue;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) return dt;
  }
  return null;
}

/** A media file's day: from its name, else its creation time (local midnight). */
export function mediaDate(file: { name: string; ctime: number }): Date {
  const fromName = nameDate(file.name);
  if (fromName) return fromName;
  const c = new Date(file.ctime);
  return new Date(c.getFullYear(), c.getMonth(), c.getDate());
}

/** Media files dated within [since, until), sorted by date, then path. */
export function mediaInRange<F extends { path: string; name: string; ctime: number }>(
  files: F[], range: { since: Date; until: Date },
): F[] {
  return files
    .filter(f => isVaultMedia(f.name))
    .map(f => ({ f, t: mediaDate(f).getTime() }))
    .filter(x => x.t >= range.since.getTime() && x.t < range.until.getTime())
    .sort((a, b) => a.t - b.t || (a.f.path < b.f.path ? -1 : a.f.path > b.f.path ? 1 : 0))
    .map(x => x.f);
}
