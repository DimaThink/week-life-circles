import type { Vault } from 'obsidian';
import { folderChain } from './notePaths';

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

/** Create every missing parent folder of `filePath`, outermost first. */
export async function ensureParentFolders(vault: Vault, filePath: string): Promise<void> {
  for (const f of folderChain(filePath)) await ensureFolder(vault, f);
}
