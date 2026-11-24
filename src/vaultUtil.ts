import type { Vault } from 'obsidian';

/** Create `path` as a folder unless something already exists there. Parents must exist. */
export async function ensureFolder(vault: Vault, path: string): Promise<void> {
  if (vault.getAbstractFileByPath(path)) return;
  try {
    await vault.createFolder(path);
  } catch (e) {
    // a parallel create (double tap) may have made it first; anything else is a real error
    if (!vault.getAbstractFileByPath(path)) throw e;
  }
}
