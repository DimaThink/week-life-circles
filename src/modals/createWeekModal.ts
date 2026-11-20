import { Modal, Notice, Setting, TFile } from 'obsidian';
import { formatDMY, pad2, WEEKS_PER_YEAR } from '../calendar';
import { buildWeekNote, PHOTO_IMAGE_EXTS } from '../templates';
import type { ImmichAsset } from '../immich';
import { ensureFolder } from '../vaultUtil';
import { weekNotePath } from '../weekFiles';
import { defaultSquareKey, renderSquarePicker } from './swatches';
import type { ModalHost } from './createDayModal';

const DROP_HINT = 'Drop photos / videos here or click to upload';

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
    contentEl.createEl('h2', { text: 'Create week file' });
    this.renderTarget(contentEl);
    renderSquarePicker(this.app, contentEl, 'Week type', this.host.settings.squares, this.square,
      k => { this.square = k; });
    this.renderPhotoUpload(contentEl);
    if (this.host.immich.available && this.host.calendar) this.renderImmichPicker(contentEl);
    new Setting(contentEl)
      .addButton(btn => btn.setButtonText('Create').setCta().onClick(() => { void this.create(); }));
  }

  private renderTarget(contentEl: HTMLElement): void {
    if (this.prefilled) {
      contentEl.createEl('p', { text: `Week ${this.ww}, personal year ${this.yy}`, cls: 'setting-item-description' });
      return;
    }
    new Setting(contentEl)
      .setName('Week number (01–52)')
      .addText(t => t.setPlaceholder('02').onChange(v => { this.ww = v.trim(); this.scheduleImmichReload(); }));
    new Setting(contentEl)
      .setName('Personal year')
      .addText(t => t.setPlaceholder('28').onChange(v => { this.yy = v.trim(); this.scheduleImmichReload(); }));
  }

  private renderPhotoUpload(contentEl: HTMLElement): void {
    contentEl.createDiv({ text: 'Week photo (optional)', cls: 'wcg-section-label' });
    const dropZone = contentEl.createDiv({ cls: 'wcg-drop-zone' });
    const dropLabel = dropZone.createDiv({ text: DROP_HINT, cls: 'wcg-drop-label' });
    const photoInput = dropZone.createEl('input', {
      cls: 'wcg-file-input',
      attr: { type: 'file', accept: '.jpg,.jpeg,.png,.webp,.mp4,.mov,.avi,.webm,.mkv', multiple: 'true' },
    });
    const fileList = contentEl.createDiv({ cls: 'wcg-file-list' });

    const updateZone = (): void => {
      const n = this.photoFiles.length;
      dropZone.toggleClass('is-active', n > 0);
      dropLabel.textContent = n ? `✅ ${n} file(s) — drop more to append` : DROP_HINT;
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
        row.createSpan({ text: `${icon} Attachments/${yDisp}/${name}  (${kb} KB)`, cls: 'wcg-file-name' });
        const rm = row.createSpan({ text: '✕', cls: 'wcg-file-remove' });
        rm.addEventListener('click', e => { e.stopPropagation(); this.photoFiles.splice(i, 1); renderFileList(); updateZone(); });
      });
      const clear = fileList.createDiv({ text: 'Clear all', cls: 'wcg-file-clear' });
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
    this.immichHeader = contentEl.createDiv({ text: 'From Immich', cls: 'wcg-section-label' });
    this.immichBox = contentEl.createDiv({ cls: 'wcg-immich-box' });
    this.reloadImmich();
  }

  private scheduleImmichReload(): void {
    if (!this.immichBox) return;
    window.clearTimeout(this.immichReloadTimer);
    this.immichReloadTimer = window.setTimeout(() => this.reloadImmich(), 600);
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
    header.textContent = 'From Immich';
    const note = box.createDiv({ text: 'Loading photos…', cls: 'wcg-immich-note' });
    const ww = parseInt(this.ww, 10), yy = parseInt(this.yy, 10);
    if (Number.isNaN(ww) || Number.isNaN(yy) || ww < 1 || ww > WEEKS_PER_YEAR) {
      note.textContent = 'Enter week + year to load that week’s photos';
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
      note.textContent = 'Immich unavailable — use manual upload';
      new Notice('Immich unavailable — use manual upload');
      return;
    }
    if (token !== this.immichToken) return; // stale (user changed ww/yy)
    const { since, until: last } = calendar.weekRange(yy, ww);
    last.setDate(last.getDate() - 1);
    const fmtD = (d: Date): string => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
    const range = `${fmtD(since)}–${fmtD(last)}`;
    if (!items.length) { note.textContent = `No photos for ${range}`; return; }
    note.remove();

    const updateHeader = (): void => {
      header.textContent = `From Immich — ${items.length} for ${range}, ${this.immichSelected.size} selected`;
    };
    updateHeader();

    const grid = box.createDiv({ cls: 'wcg-immich-grid' });
    for (const a of items) this.makeImmichTile(grid, a, updateHeader, token);
    if (total > items.length) {
      box.createDiv({ text: `Showing first ${items.length} of ${total}`, cls: 'wcg-immich-more' });
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

  private async create(): Promise<void> {
    // an empty field must not pass as "00"
    if (!/^\d{1,2}$/.test(this.ww) || !/^\d{1,3}$/.test(this.yy)) {
      new Notice('Please enter a week from 01 to 52 and a personal year');
      return;
    }
    const ww = pad2(this.ww);
    const yy = pad2(this.yy);

    if (Number(ww) < 1 || Number(ww) > WEEKS_PER_YEAR) {
      new Notice('Please enter a week from 01 to 52 and a personal year');
      return;
    }

    // Download Immich picks: images as the 1440px JPEG preview (HEIC handled
    // server-side), videos as originals. Any failure aborts before writing.
    const immichFiles: PhotoFile[] = [];
    if (this.immichSelected.size) {
      new Notice(`⬇ Downloading ${this.immichSelected.size} file(s) from Immich…`);
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
        new Notice(`❌ Immich download failed: ${(e as Error).message}`);
        return;
      }
    }
    const files = [...this.photoFiles, ...immichFiles];

    const { vault, workspace } = this.host.app;
    const weekFolder = this.host.settings.weekFolder;
    // Line-1 date = the day the entry is written, NOT the computed week start.
    const dateStr = formatDMY(new Date());
    const photoNames = files.map((f, i) => photoFileName(ww, yy, i, f.ext));
    const tplPath = this.host.settings.weekTemplatePath;
    const tpl = tplPath ? vault.getAbstractFileByPath(tplPath) : null;
    const templateRaw = tpl instanceof TFile ? await vault.read(tpl) : null;
    const body = buildWeekNote({
      ww, yy, square: this.square, dateStr, photoNames, settings: this.host.settings, templateRaw,
    });

    const filePath = weekNotePath(weekFolder, yy, ww);

    try {
      await ensureFolder(vault, weekFolder);
      await ensureFolder(vault, `${weekFolder}/${yy}`);
      if (vault.getAbstractFileByPath(filePath)) {
        new Notice(`Already exists: ${filePath}`);
        return;
      }
      const file = await vault.create(filePath, body);
      if (files.length) {
        const attachRoot = `${weekFolder}/Attachments`;
        const attachFolder = `${attachRoot}/${yy}`;
        await ensureFolder(vault, attachRoot);
        await ensureFolder(vault, attachFolder);
        for (let i = 0; i < files.length; i++) {
          const photoPath = `${attachFolder}/${photoNames[i]}`;
          if (!vault.getAbstractFileByPath(photoPath)) await vault.createBinary(photoPath, files[i].buffer);
        }
      }
      this.close();
      new Notice(`✅ Created ${ww}.${yy}.md`);
      await workspace.getLeaf(false).openFile(file);
    } catch (e) {
      new Notice(`❌ ${(e as Error).message}`);
    }
  }

  onClose(): void {
    window.clearTimeout(this.immichReloadTimer);
    this.immichToken++;
    this.revokeImmichUrls();
    this.contentEl.empty();
  }
}
