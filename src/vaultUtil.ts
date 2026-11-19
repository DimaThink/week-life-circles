import type { Vault } from 'obsidian';

/** Create `path` as a folder unless something already exists there. Parents must exist. */
export async function ensureFolder(vault: Vault, path: string): Promise<void> {
  if (!vault.getAbstractFileByPath(path)) await vault.createFolder(path);
}
