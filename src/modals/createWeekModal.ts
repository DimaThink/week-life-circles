import { Modal, Notice, Setting, TAbstractFile, TFile, TFolder } from 'obsidian';
import { t } from '../i18n';
import { pad2, WEEKS_PER_YEAR } from '../calendar';
import { buildWeekNote, PHOTO_IMAGE_EXTS, photoEmbeds, weekNoteDates } from '../templates';
import { formatDate } from '../momentFmt';
import type { ImmichAsset } from '../immich';
import { ensureParentFolders } from '../vaultUtil';
import { weekAttachmentPath } from '../notePaths';
import { isVaultMedia, mediaInRange } from '../vaultPhotos';
import { weekNotePath } from '../weekFiles';
import { defaultSquareKey, renderSquarePicker } from './swatches';
import type { ModalHost } from './createDayModal';


// Lower-cased extension of a file name, with jpeg folded into jpg
function fileExt(name: string): string {
  const raw = (name.split('.').pop() ?? '').toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

// Vault filename for the i-th uploaded file of a week: WW.YY.ext, WW_2.YY.ext, ...
function photoFileName(ww: string, yy: string, i: number, ext: string): string {
  return i === 0 ? `${ww}.${yy}.${ext}` : `${ww}_${i + 1}.${yy}.${ext}`;
}

interface PhotoFile { buffer: ArrayBuffer; ext: string; size: number }

/** The most vault photos one week lists (a folder of thousands stays responsive). */
const MAX_VAULT_TILES = 300;

export class CreateWeekModal extends Modal {
  private ww: string;
  private yy: string;
  private readonly prefilled: boolean;
  private square: string;
  private photoFiles: PhotoFile[] = [];
  private immichSelected = new Map<string, ImmichAsset>();
  private immichUrls: string[] = [];
  private immichHeader: HTMLElement | null = null;
  private immichBox: HTMLElement | null = null;
  private immichReloadTimer: number | undefined;
  private immichToken = 0;
  private vaultSelected = new Map<string, TFile>();
  private vaultHeader: HTMLElement | null = null;
  private vaultBox: HTMLElement | null = null;

  constructor(private readonly host: ModalHost, defaults: { ww?: number; yy?: number } = {}) {
    super(host.app);
    this.ww = defaults.ww != null ? pad2(defaults.ww) : '';
    this.yy = defaults.yy != null ? pad2(defaults.yy) : ''; // personal year 0 is a valid year
    this.prefilled = defaults.ww != null && defaults.yy != null;
    this.square = defaultSquareKey(host.settings);
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass('wcg-create-modal');
    contentEl.createEl('h2', { text: t('notes.createWeek.title') });
    this.renderTarget(contentEl);
    renderSquarePicker(this.app, contentEl, t('notes.weekType'), this.host.settings.squares, this.square,
      k => { this.square = k; });
    this.renderPhotoUpload(contentEl);
    if (this.host.settings.vaultPhotoFolder && this.host.calendar) this.renderVaultPicker(contentEl);
    if (this.host.immich.available && this.host.calendar) this.renderImmichPicker(contentEl);
    new Setting(contentEl)
      .addButton(btn => btn.setButtonText(t('notes.create')).setCta().onClick(() => { void this.create(); }));
  }

  private renderTarget(contentEl: HTMLElement): void {
    if (this.prefilled) {
      contentEl.createEl('p', { text: t('notes.week.prefilled', { ww: this.ww, yy: this.yy }), cls: 'setting-item-description' });
      return;
    }
    new Setting(contentEl)
      .setName(t('notes.week.numberName'))
      .addText(tx => tx.setPlaceholder('02').onChange(v => { this.ww = v.trim(); this.scheduleImmichReload(); }));
    new Setting(contentEl)
      .setName(t('notes.personalYear'))
      .addText(tx => tx.setPlaceholder('28').onChange(v => { this.yy = v.trim(); this.scheduleImmichReload(); }));
  }

  private renderPhotoUpload(contentEl: HTMLElement): void {
    contentEl.createDiv({ text: t('notes.week.photoLabel'), cls: 'wcg-section-label' });
    const dropZone = contentEl.createDiv({ cls: 'wcg-drop-zone' });
    const dropLabel = dropZone.createDiv({ text: t('notes.dropHint'), cls: 'wcg-drop-label' });
    const photoInput = dropZone.createEl('input', {
      cls: 'wcg-file-input',
      attr: { type: 'file', accept: '.jpg,.jpeg,.png,.webp,.mp4,.mov,.avi,.webm,.mkv', multiple: 'true' },
    });
    const fileList = contentEl.createDiv({ cls: 'wcg-file-list' });

    const updateZone = (): void => {
      const n = this.photoFiles.length;
      dropZone.toggleClass('is-active', n > 0);
      dropLabel.textContent = n ? `✅ ${t('notes.files.count', { n })}` : t('notes.dropHint');
    };

    const renderFileList = (): void => {
      fileList.empty();
      if (!this.photoFiles.length) return;
      const wDisp = pad2(this.ww || '??');
      const yDisp = pad2(this.yy || '??');
      this.photoFiles.forEach((f, i) => {
        const icon = PHOTO_IMAGE_EXTS.has(f.ext) ? '📷' : '🎬';
        const name = photoFileName(wDisp, yDisp, i, f.ext);
        const kb = (f.size / 1024).toFixed(0);
        const row = fileList.createDiv({ cls: 'wcg-file-row' });
        const { attachmentLocation, attachmentFolder } = this.host.settings;
        const shown = attachmentLocation === 'folder' ? weekAttachmentPath(attachmentFolder, wDisp, yDisp, name) : name;
        row.createSpan({ text: `${icon} ${shown}  (${kb} KB)`, cls: 'wcg-file-name' });
        const rm = row.createSpan({ text: '✕', cls: 'wcg-file-remove' });
        rm.addEventListener('click', e => { e.stopPropagation(); this.photoFiles.splice(i, 1); renderFileList(); updateZone(); });
      });
      const clear = fileList.createDiv({ text: t('notes.files.clearAll'), cls: 'wcg-file-clear' });
      clear.addEventListener('click', e => { e.stopPropagation(); this.photoFiles = []; renderFileList(); updateZone(); });
    };

    const handleFiles = async (files: FileList): Promise<void> => {
      for (const file of Array.from(files)) {
        this.photoFiles.push({ buffer: await file.arrayBuffer(), ext: fileExt(file.name), size: file.size });
      }
      renderFileList();
      updateZone();
    };

    dropZone.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => { if (photoInput.files?.length) void handleFiles(photoInput.files); });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.addClass('is-active'); });
    dropZone.addEventListener('dragleave', () => updateZone());
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length) void handleFiles(e.dataTransfer.files); else updateZone();
    });
  }

  // ── Immich picker (only rendered when host.immich.available && calendar) ──

  private renderImmichPicker(contentEl: HTMLElement): void {
    this.immichHeader = contentEl.createDiv({ text: t('notes.immich.header'), cls: 'wcg-section-label' });
    this.immichBox = contentEl.createDiv({ cls: 'wcg-immich-box' });
    this.reloadImmich();
  }

  /** The week number or year was edited: reload the week's photo pickers after a pause. */
  private scheduleImmichReload(): void {
    if (!this.immichBox && !this.vaultBox) return;
    window.clearTimeout(this.immichReloadTimer);
    this.immichReloadTimer = window.setTimeout(() => { this.reloadVault(); this.reloadImmich(); }, 600);
  }

  // ── Vault photos (only rendered when settings.vaultPhotoFolder && calendar) ──

  private renderVaultPicker(contentEl: HTMLElement): void {
    this.vaultHeader = contentEl.createDiv({ text: t('notes.vault.header'), cls: 'wcg-section-label' });
    this.vaultBox = contentEl.createDiv({ cls: 'wcg-immich-box' });
    this.reloadVault();
  }

  /** Images and videos in the vault photo folder (recursively) — never the whole vault. */
  private vaultMedia(): TFile[] {
    const out: TFile[] = [];
    const walk = (node: TAbstractFile | null): void => {
      if (node instanceof TFolder) node.children.forEach(walk);
      else if (node instanceof TFile && isVaultMedia(node.name)) out.push(node);
    };
    walk(this.app.vault.getAbstractFileByPath(this.host.settings.vaultPhotoFolder));
    return out;
  }

  private reloadVault(): void {
    const header = this.vaultHeader, box = this.vaultBox, calendar = this.host.calendar;
    if (!header || !box || !calendar) return;
    box.empty();
    this.vaultSelected.clear();
    header.textContent = t('notes.vault.header');
    const ww = parseInt(this.ww, 10), yy = parseInt(this.yy, 10);
    if (Number.isNaN(ww) || Number.isNaN(yy) || ww < 1 || ww > WEEKS_PER_YEAR) {
      box.createDiv({ text: t('notes.immich.enterWeek'), cls: 'wcg-immich-note' });
      return;
    }
    const range = calendar.weekRange(yy, ww);
    const files = mediaInRange(this.vaultMedia().map(f => ({ path: f.path, name: f.name, ctime: f.stat.ctime, file: f })), range);
    if (!files.length) {
      box.createDiv({ text: t('notes.vault.none', { folder: this.host.settings.vaultPhotoFolder }), cls: 'wcg-immich-note' });
      return;
    }
    const updateHeader = (): void => {
      header.textContent = t('notes.vault.headerCount', { count: files.length, selected: this.vaultSelected.size });
    };
    updateHeader();
    const grid = box.createDiv({ cls: 'wcg-immich-grid' });
    for (const { file } of files.slice(0, MAX_VAULT_TILES)) {
      const tile = grid.createDiv({ cls: 'wcg-immich-tile', attr: { title: file.path } });
      tile.createDiv({ text: '✓', cls: 'wcg-immich-check' });
      if (PHOTO_IMAGE_EXTS.has(file.extension.toLowerCase())) {
        tile.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), loading: 'lazy' } });
      } else {
        tile.createDiv({ text: file.name, cls: 'wcg-vault-name' });
        tile.createDiv({ text: '🎬', cls: 'wcg-immich-badge' });
      }
      tile.addEventListener('click', () => {
        const selected = !this.vaultSelected.has(file.path);
        if (selected) this.vaultSelected.set(file.path, file);
        else this.vaultSelected.delete(file.path);
        tile.toggleClass('is-selected', selected);
        updateHeader();
      });
    }
    if (files.length > MAX_VAULT_TILES) {
      box.createDiv({ text: t('notes.immich.showingFirst', { shown: MAX_VAULT_TILES, total: files.length }), cls: 'wcg-immich-more' });
    }
  }

  private revokeImmichUrls(): void {
    for (const u of this.immichUrls) URL.revokeObjectURL(u);
    this.immichUrls = [];
  }

  private reloadImmich(): void {
    const header = this.immichHeader, box = this.immichBox;
    if (!header || !box) return;
    this.immichToken++;
    box.empty();
    this.revokeImmichUrls();
    this.immichSelected.clear();
    header.textContent = t('notes.immich.header');
    const note = box.createDiv({ text: t('notes.immich.loading'), cls: 'wcg-immich-note' });
    const ww = parseInt(this.ww, 10), yy = parseInt(this.yy, 10);
    if (Number.isNaN(ww) || Number.isNaN(yy) || ww < 1 || ww > WEEKS_PER_YEAR) {
      note.textContent = t('notes.immich.enterWeek');
      return;
    }
    void this.loadImmichAssets(header, box, note, ww, yy, this.immichToken);
  }

  private async loadImmichAssets(
    header: HTMLElement, box: HTMLElement, note: HTMLElement, ww: number, yy: number, token: number,
  ): Promise<void> {
    const calendar = this.host.calendar;
    if (!calendar) return;
    let items: ImmichAsset[], total: number;
    try {
      ({ items, total } = await this.host.immich.searchWeek(calendar, yy, ww));
    } catch (e) {
      console.error('week-life-circles: Immich search failed', e);
      if (token !== this.immichToken) return;
      note.textContent = t('notes.immich.unavailable');
      new Notice(t('notes.immich.unavailable'));
      return;
    }
    if (token !== this.immichToken) return; // stale (user changed ww/yy)
    const { since, until: last } = calendar.weekRange(yy, ww);
    last.setDate(last.getDate() - 1);
    const fmtD = (d: Date): string => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
    const range = `${fmtD(since)}–${fmtD(last)}`;
    if (!items.length) { note.textContent = t('notes.immich.none', { range }); return; }
    note.remove();

    const updateHeader = (): void => {
      header.textContent = t('notes.immich.headerCount', { count: items.length, range, selected: this.immichSelected.size });
    };
    updateHeader();

    const grid = box.createDiv({ cls: 'wcg-immich-grid' });
    for (const a of items) this.makeImmichTile(grid, a, updateHeader, token);
    if (total > items.length) {
      box.createDiv({ text: t('notes.immich.showingFirst', { shown: items.length, total }), cls: 'wcg-immich-more' });
    }
  }

  private makeImmichTile(grid: HTMLElement, asset: ImmichAsset, updateHeader: () => void, token: number): void {
    const tile = grid.createDiv({ cls: 'wcg-immich-tile', attr: { title: asset.originalFileName || '' } });
    let dead = false;
    if (asset.type === 'VIDEO') {
      // duration is milliseconds in /api/search/metadata responses
      const s = Math.round((Number(asset.duration) || 0) / 1000);
      const dur = `${Math.floor(s / 60)}:${pad2(s % 60)}`;
      tile.createDiv({ text: `🎬 ${dur}`, cls: 'wcg-immich-badge' });
    }
    tile.createDiv({ text: '✓', cls: 'wcg-immich-check' });
    this.host.immich.thumbnail(asset.id)
      .then(buf => {
        if (token !== this.immichToken) return;
        const url = URL.createObjectURL(new Blob([buf]));
        this.immichUrls.push(url);
        tile.createEl('img', { attr: { src: url } });
      })
      .catch(() => {
        dead = true;
        tile.addClass('is-dead');
        tile.createDiv({ text: '✕', cls: 'wcg-immich-dead' });
      });
    tile.addEventListener('click', () => {
      if (dead) return;
      const selected = !this.immichSelected.has(asset.id);
      if (selected) this.immichSelected.set(asset.id, asset);
      else this.immichSelected.delete(asset.id);
      tile.toggleClass('is-selected', selected);
      updateHeader();
    });
  }

  // ── Create ──

  private creating = false;

  /** Ignore a second tap while the first create is still running. */
  private async create(): Promise<void> {
    if (this.creating) return;
    this.creating = true;
    try {
      await this.doCreate();
    } finally {
      this.creating = false;
    }
  }

  private async doCreate(): Promise<void> {
    // an empty field must not pass as "00"
    if (!/^\d{1,2}$/.test(this.ww) || !/^\d{1,3}$/.test(this.yy)) {
      new Notice(t('notes.week.invalid'));
      return;
    }
    const ww = pad2(this.ww);
    const yy = pad2(this.yy);

    if (Number(ww) < 1 || Number(ww) > WEEKS_PER_YEAR) {
      new Notice(t('notes.week.invalid'));
      return;
    }

    // Download Immich picks: images as the 1440px JPEG preview (HEIC handled
    // server-side), videos as originals. Any failure aborts before writing.
    const immichFiles: PhotoFile[] = [];
    if (this.immichSelected.size) {
      new Notice(`⬇ ${t('notes.immich.downloading', { n: this.immichSelected.size })}`);
      try {
        for (const [id, a] of this.immichSelected) {
          if (a.type === 'VIDEO') {
            const buf = await this.host.immich.original(id);
            immichFiles.push({ buffer: buf, ext: fileExt(a.originalFileName || 'video.mp4'), size: buf.byteLength });
          } else {
            const buf = await this.host.immich.thumbnail(id, 'preview');
            immichFiles.push({ buffer: buf, ext: 'jpg', size: buf.byteLength });
          }
        }
      } catch (e) {
        new Notice(`❌ ${t('notes.immich.downloadFailed', { error: (e as Error).message })}`);
        return;
      }
    }
    const files = [...this.photoFiles, ...immichFiles];

    const { vault, workspace } = this.host.app;
    const weekFolder = this.host.settings.weekFolder;
    const range = this.host.calendar ? this.host.calendar.weekRange(Number(yy), Number(ww)) : null;
    const dates = weekNoteDates(range, new Date());
    const tplPath = this.host.settings.weekTemplatePath;
    const tpl = tplPath ? vault.getAbstractFileByPath(tplPath) : null;
    const templateRaw = tpl instanceof TFile ? await vault.read(tpl) : null;
    const filePath = weekNotePath(weekFolder, yy, ww);

    try {
      if (vault.getAbstractFileByPath(filePath)) {
        new Notice(t('notes.exists', { path: filePath }));
        return;
      }
      const settings = this.host.settings;
      const vaultLinks = [...this.vaultSelected.values()].map(f => this.app.metadataCache.fileToLinktext(f, filePath));
      const render = (photoNames: string[]): string => buildWeekNote({
        ww, yy, square: this.square, dates, formatDate, photoNames, settings, templateRaw,
      });
      // The note comes first, so a failed upload never leaves orphaned photos without it.
      // folder: the upload names are known up front; obsidian: the attachment paths
      // depend on the (now existing) note, so its links are added once the files are written.
      const weekFolderMode = settings.attachmentLocation === 'folder';
      const uploadNames = weekFolderMode ? files.map((f, i) => photoFileName(ww, yy, i, f.ext)) : [];
      const initial = render([...uploadNames, ...vaultLinks]);
      await ensureParentFolders(vault, filePath);
      const file = await vault.create(filePath, initial);
      const { links, error } = await this.writeAttachments(files, ww, yy, file.path);
      if (!weekFolderMode && links.length) {
        const full = render([...links, ...vaultLinks]);
        // unchanged since creation (the usual case): the full text; else append the embeds
        await vault.process(file, cur => (cur === initial
          ? full
          : `${cur.replace(/\n*$/, '\n')}${photoEmbeds(links, settings.photoWidth)}\n`));
      }
      this.close();
      new Notice(`✅ ${t('notes.created', { name: `${ww}.${yy}.md` })}`);
      if (error) new Notice(`❌ ${error.message}`);
      await workspace.getLeaf(false).openFile(file);
    } catch (e) {
      new Notice(`❌ ${(e as Error).message}`);
    }
  }

  /**
   * Save uploaded files next to the existing note at `notePath` and return how the note
   * links to each: `folder` writes `<attachment folder>/WW.YY.ext` (an existing
   * file is kept, linked by name); `obsidian` asks Obsidian for a free path in its attachment
   * location and links to the result. Stops at the first failure and returns it with the
   * links of the files written so far.
   */
  private async writeAttachments(
    files: PhotoFile[], ww: string, yy: string, notePath: string,
  ): Promise<{ links: string[]; error: Error | null }> {
    const { vault, fileManager, metadataCache } = this.app;
    const links: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const name = photoFileName(ww, yy, i, files[i].ext);
        if (this.host.settings.attachmentLocation === 'folder') {
          const path = weekAttachmentPath(this.host.settings.attachmentFolder, ww, yy, name);
          await ensureParentFolders(vault, path);
          if (!vault.getAbstractFileByPath(path)) await vault.createBinary(path, files[i].buffer);
          links.push(name);
        } else {
          const path = await fileManager.getAvailablePathForAttachment(name, notePath);
          await ensureParentFolders(vault, path);
          const created = await vault.createBinary(path, files[i].buffer);
          links.push(metadataCache.fileToLinktext(created, notePath));
        }
      }
    } catch (e) {
      console.error('week-life-circles: cannot save an attachment', e);
      return { links, error: e instanceof Error ? e : new Error(String(e)) };
    }
    return { links, error: null };
  }

  onClose(): void {
    window.clearTimeout(this.immichReloadTimer);
    this.immichToken++;
    this.revokeImmichUrls();
    this.contentEl.empty();
  }
}
