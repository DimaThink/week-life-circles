import { App, FuzzySuggestModal, Modal, Notice, Setting, TFile, normalizePath } from 'obsidian';
import type { CellShape, SquareDef } from './config';
import { squareImage } from './squares';
import {
  SQUARE_IMAGE_MAX, colorSquareKey, fitWithin, isHexColor, isSquareImageName, moveItem, slugify, squareClassClash,
  takenImageNames, uniqueImageName,
} from './squareEdit';

/** What the squares editor needs from the settings tab. */
export interface SquareEditorHost {
  readonly app: App;
  /** Live settings fields, edited in place. */
  readonly settings: { squares: SquareDef[]; cellShape: CellShape };
  save(): Promise<void>;
}

/** A square's look, drawn the way the grid draws it (circle or rounded square, contrast ring). */
export function renderSquarePreview(
  app: App, parent: HTMLElement, sq: Pick<SquareDef, 'key' | 'color' | 'image'>, shape: CellShape, cls = '',
): HTMLElement {
  const el = parent.createDiv({ cls: `wcg-sq-preview${shape === 'square' ? ' is-square' : ''}${cls ? ' ' + cls : ''}` });
  if (sq.color) {
    el.setCssProps({ '--wcg-color': sq.color });
  } else {
    const f = app.metadataCache.getFirstLinkpathDest(squareImage(sq as SquareDef), '');
    if (f) el.createEl('img', { attr: { src: app.vault.getResourcePath(f), alt: '' } });
    else { el.addClass('is-missing'); el.setText('?'); }
  }
  return el;
}

/** Decode any browser-readable image, shrink it to ≤256px and re-encode (PNG, or JPEG for .jpg names). */
async function toSquareImage(blob: Blob, mime: 'image/png' | 'image/jpeg'): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(blob);
  try {
    const img = createEl('img');
    img.src = url;
    await img.decode();
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, SQUARE_IMAGE_MAX);
    const canvas = createEl('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    ctx.drawImage(img, 0, 0, w, h);
    const out = await new Promise<Blob | null>(res => canvas.toBlob(res, mime, 0.92));
    if (!out) throw new Error('could not encode the image');
    return await out.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ask for one image file with the system picker (photo library on phones). */
function pickImageFile(parent: HTMLElement): Promise<File | null> {
  return new Promise(resolve => {
    const input = parent.createEl('input', { cls: 'wcg-file-input', attr: { type: 'file', accept: 'image/*' } });
    input.addEventListener('change', () => {
      const f = input.files?.[0] ?? null;
      input.remove();
      resolve(f);
    }, { once: true });
    input.click();
  });
}

/** Create the parent folders of `path` that are missing. */
async function ensureParents(app: App, path: string): Promise<void> {
  const parts = path.split('/').slice(0, -1);
  for (let i = 1; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join('/');
    if (dir && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
  }
}

/**
 * Save processed image bytes as a vault file named exactly `name` (the square's key),
 * in the folder Obsidian uses for attachments. Returns the created file.
 */
async function createSquareImage(app: App, name: string, bytes: ArrayBuffer): Promise<TFile> {
  const path = normalizePath(await app.fileManager.getAvailablePathForAttachment(name, ''));
  if (path.split('/').pop() !== name) throw new Error(`${name} already exists`);
  await ensureParents(app, path);
  return app.vault.createBinary(path, bytes);
}

/** Vault images that can serve as a square (png/jpg). */
class VaultImageModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly onPick: (f: TFile) => void) {
    super(app);
    this.setPlaceholder('Pick a PNG or JPG from your vault');
  }
  /** Only files whose bare name resolves back to them (a square stores just the name). */
  getItems(): TFile[] {
    return this.app.vault.getFiles().filter(f =>
      isSquareImageName(f.name) && this.app.metadataCache.getFirstLinkpathDest(f.name, '') === f);
  }
  getItemText(f: TFile): string { return f.path; }
  onChooseItem(f: TFile): void { this.onPick(f); }
}

class ConfirmModal extends Modal {
  constructor(app: App, private readonly text: string, private readonly action: string, private readonly onYes: () => void) {
    super(app);
  }
  onOpen(): void {
    this.contentEl.createEl('p', { text: this.text });
    new Setting(this.contentEl)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => {
        // red "danger" button; setWarning() is deprecated and its replacement needs Obsidian 1.13
        b.buttonEl.addClass('mod-warning');
        b.setButtonText(this.action).onClick(() => { this.close(); this.onYes(); });
      });
  }
  onClose(): void { this.contentEl.empty(); }
}

/** Turn a colour square into an image square: upload a picture or pick one from the vault. */
class ToImageModal extends Modal {
  constructor(app: App, private readonly name: string,
    private readonly upload: (anchor: HTMLElement) => Promise<boolean>, private readonly fromVault: () => void) {
    super(app);
  }
  onOpen(): void {
    this.setTitle(`Use an image for "${this.name}"`);
    this.contentEl.createEl('p', {
      text: 'Notes that already use this square keep pointing at it and will show the image instead of the colour.',
      cls: 'setting-item-description',
    });
    new Setting(this.contentEl)
      .addButton(b => b.setButtonText('From vault…').onClick(() => { this.close(); this.fromVault(); }))
      // the file picker opens straight from this tap (phones require that); close once a picture is in
      .addButton(b => b.setButtonText('Upload…').setCta().onClick(() => {
        void this.upload(this.contentEl).then(done => { if (done) this.close(); });
      }));
  }
  onClose(): void { this.contentEl.empty(); }
}

type Pending = { kind: 'upload'; bytes: ArrayBuffer; url: string } | { kind: 'vault'; file: TFile } | null;

/**
 * The squares section of the settings tab: a live preview of every square in the
 * current cell shape, an editable row per square (name, colour, image, order,
 * delete) and an "add" form with image upload. Re-renders only itself.
 */
export class SquareEditor {
  private el: HTMLElement | null = null;
  /** Strip labels by square, so a rename updates in place (no re-render, focus kept). */
  private stripLabels = new Map<SquareDef, HTMLElement>();
  private newName = '';
  private newMode: 'color' | 'image' = 'color';
  private newColor = '#7EC8E3';
  private pending: Pending = null;
  private saveTimer = 0;

  constructor(private readonly host: SquareEditorHost) {}

  /** Render into `parent` (replacing an earlier render of this editor). */
  mount(parent: HTMLElement): void {
    this.el = parent.createDiv({ cls: 'wcg-squares-editor' });
    this.render();
  }

  /** Free the pending upload preview (call when the settings tab closes). */
  dispose(): void {
    this.setPending(null);
    if (this.saveTimer) { window.clearTimeout(this.saveTimer); void this.host.save(); }
    this.saveTimer = 0;
  }

  render(): void {
    const el = this.el;
    if (!el) return;
    el.empty();
    const { app, settings } = this.host;
    const shape = settings.cellShape;

    const strip = el.createDiv({ cls: 'wcg-sq-strip' });
    this.stripLabels.clear();
    for (const q of settings.squares) {
      const item = strip.createDiv({ cls: 'wcg-sq-strip-item', attr: { title: q.name } });
      renderSquarePreview(app, item, q, shape);
      this.stripLabels.set(q, item.createDiv({ cls: 'wcg-sq-strip-label', text: q.name }));
    }
    if (settings.squares.length === 0) strip.createDiv({ cls: 'setting-item-description', text: 'No squares yet — add one below.' });

    settings.squares.forEach((q, i) => this.renderRow(el, q, i));
    this.renderAdd(el);
  }

  private saveSoon(): void {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { this.saveTimer = 0; void this.host.save(); }, 400);
  }

  private async saveNow(): Promise<void> {
    if (this.saveTimer) { window.clearTimeout(this.saveTimer); this.saveTimer = 0; }
    await this.host.save();
  }

  private renderRow(parent: HTMLElement, q: SquareDef, i: number): void {
    const { app, settings } = this.host;
    const row = new Setting(parent).setClass('wcg-sq-row');
    const preview = renderSquarePreview(app, row.nameEl, q, settings.cellShape);
    row.nameEl.addClass('wcg-sq-row-name');
    const file = q.color ? null : app.metadataCache.getFirstLinkpathDest(squareImage(q), '');
    row.setDesc(q.color ? (i === 0 ? 'Colour · default for new notes' : 'Colour')
      : file ? `Image · ${file.path}${i === 0 ? ' · default for new notes' : ''}`
        : `Image missing: ${squareImage(q)} — upload one to restore it`);

    row.addText(t => {
      t.setPlaceholder('Name').setValue(q.name);
      t.inputEl.addClass('wcg-sq-name-input');
      // saved as you type (debounced; flushed when settings close), no re-render: focus stays
      t.onChange(v => {
        const name = v.trim();
        if (!name) return;
        q.name = name;
        this.stripLabels.get(q)?.setText(name);
        this.stripLabels.get(q)?.parentElement?.setAttribute('title', name);
        this.saveSoon();
      });
    });

    if (q.color) {
      row.addColorPicker(cp => {
        cp.setValue(isHexColor(q.color ?? '') ? (q.color as string) : '#000000');
        cp.onChange(v => {
          q.color = v;
          preview.setCssProps({ '--wcg-color': v });
          this.saveSoon();
        });
      });
    } else {
      row.addButton(b => b
        .setButtonText(file ? 'Replace image' : 'Upload image')
        .setTooltip('Pick an image; it is shrunk to a small PNG/JPG and saved under the same name, so existing notes keep working.')
        .onClick(() => {
          if (!file) { void this.replaceImage(q, row.controlEl); return; }
          new ConfirmModal(app,
            `Replace ${file.path} with a new picture? The file is overwritten with a small (≤${SQUARE_IMAGE_MAX}px) version; anything else that embeds this file will show the new picture too.`,
            'Choose picture', () => { void this.replaceImage(q, row.controlEl); }).open();
        }));
    }

    // switch type, keeping the key: existing notes follow the square to its new look
    if (q.color) {
      row.addExtraButton(b => b.setIcon('image').setTooltip('Use an image instead of the colour').onClick(() => {
        new ToImageModal(app, q.name, anchor => this.convertToUpload(q, anchor), () => {
          new VaultImageModal(app, f => {
            q.color = null;
            if (f.name === q.key) delete q.image; else q.image = f.name;
            void this.saveNow().then(() => this.render());
          }).open();
        }).open();
      }));
    } else {
      row.addExtraButton(b => b.setIcon('palette').setTooltip('Use a colour instead of the image').onClick(() => {
        q.color = '#9F8CAE';
        delete q.image; // the picture file itself stays in the vault
        void this.saveNow().then(() => this.render());
      }));
    }

    row.addExtraButton(b => b.setIcon('arrow-up').setTooltip('Move up').setDisabled(i === 0)
      .onClick(() => { void this.move(i, i - 1); }));
    row.addExtraButton(b => b.setIcon('arrow-down').setTooltip('Move down').setDisabled(i === settings.squares.length - 1)
      .onClick(() => { void this.move(i, i + 1); }));
    row.addExtraButton(b => b.setIcon('trash').setTooltip('Delete').onClick(() => {
      new ConfirmModal(app,
        `Delete the square "${q.name}"? Notes that use it keep their text, but it will no longer show a colour or image in the grid.`,
        'Delete', () => {
          const at = settings.squares.indexOf(q);
          if (at !== -1) settings.squares.splice(at, 1);
          void this.saveNow().then(() => this.render());
        }).open();
    }));
  }

  private async move(from: number, to: number): Promise<void> {
    const sq = this.host.settings.squares;
    const moved = moveItem(sq, from, to);
    sq.splice(0, sq.length, ...moved); // in place: the settings object is shared
    await this.saveNow();
    this.render();
  }

  /** Colour square → image square from an uploaded picture; true once converted. */
  private async convertToUpload(q: SquareDef, anchor: HTMLElement): Promise<boolean> {
    const { app, settings } = this.host;
    const picked = await pickImageFile(anchor);
    if (!picked) return false;
    try {
      const bytes = await toSquareImage(picked, 'image/png');
      const taken = takenImageNames(settings.squares.map(s => s.key), app.vault.getFiles().map(f => f.name));
      const file = await createSquareImage(app, uniqueImageName(slugify(q.name), taken), bytes);
      q.color = null;
      q.image = file.name;
      await this.saveNow();
      this.render();
      return true;
    } catch (e) {
      console.error('week-life-circles: square image upload failed', e);
      new Notice(`Could not use that image: ${(e as Error).message}`);
      return false;
    }
  }

  /** New pixels for an image square, written under its existing file name (so notes keep resolving). */
  private async replaceImage(q: SquareDef, anchor: HTMLElement): Promise<void> {
    const { app } = this.host;
    const pic = squareImage(q);
    const existing = app.metadataCache.getFirstLinkpathDest(pic, '');
    if (!existing && pic.includes('/')) {
      new Notice(`"${pic}" names a folder too, so it can't be restored by upload. Add a new square instead.`);
      return;
    }
    const picked = await pickImageFile(anchor);
    if (!picked) return;
    try {
      const bytes = await toSquareImage(picked, pic.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
      if (existing) await app.vault.modifyBinary(existing, bytes);
      else await createSquareImage(app, pic, bytes);
      await this.saveNow(); // re-render open grids so they pick up the new image
      new Notice(`Image for "${q.name}" updated.`);
      this.render();
    } catch (e) {
      console.error('week-life-circles: square image upload failed', e);
      new Notice(`Could not use that image: ${(e as Error).message}`);
    }
  }

  private setPending(p: Pending): void {
    if (this.pending?.kind === 'upload') URL.revokeObjectURL(this.pending.url);
    this.pending = p;
  }

  private renderAdd(parent: HTMLElement): void {
    const { app, settings } = this.host;
    const add = new Setting(parent).setName('Add a square').setClass('wcg-sq-add');

    // live preview of the square being added
    const previewHost = add.nameEl.createDiv({ cls: 'wcg-sq-add-preview' });
    const drawPreview = (): void => {
      previewHost.empty();
      const p = this.pending;
      if (this.newMode === 'color') {
        renderSquarePreview(app, previewHost, { key: '', color: this.newColor }, settings.cellShape);
      } else if (p?.kind === 'upload') {
        const el = previewHost.createDiv({ cls: `wcg-sq-preview${settings.cellShape === 'square' ? ' is-square' : ''}` });
        el.createEl('img', { attr: { src: p.url, alt: '' } });
      } else if (p?.kind === 'vault') {
        renderSquarePreview(app, previewHost, { key: p.file.name, color: null }, settings.cellShape);
      }
    };
    drawPreview();
    add.setDesc(this.newMode === 'color' ? 'A colour square.'
      : this.pending?.kind === 'vault' ? `Uses ${this.pending.file.path}.`
        : this.pending?.kind === 'upload' ? 'Uploaded image — saved to your attachments folder when you add it.'
          : 'Upload an image (e.g. a flag) or pick one already in your vault.');

    add.addText(t => {
      t.setPlaceholder('Name').setValue(this.newName).onChange(v => { this.newName = v; });
      t.inputEl.addClass('wcg-sq-name-input');
    });
    add.addDropdown(d => d
      .addOption('color', 'Colour')
      .addOption('image', 'Image')
      .setValue(this.newMode)
      .onChange(v => { this.newMode = v === 'image' ? 'image' : 'color'; this.render(); }));

    if (this.newMode === 'color') {
      add.addColorPicker(cp => cp.setValue(this.newColor).onChange(v => { this.newColor = v; drawPreview(); }));
    } else {
      add.addButton(b => b.setButtonText('Upload…').onClick(() => {
        void (async () => {
          const picked = await pickImageFile(add.controlEl);
          if (!picked) return;
          try {
            const bytes = await toSquareImage(picked, 'image/png');
            this.setPending({ kind: 'upload', bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'image/png' })) });
            if (!this.newName.trim()) this.newName = picked.name.replace(/\.[^.]+$/, '');
            this.render();
          } catch (e) {
            new Notice(`Could not read that image: ${(e as Error).message}`);
          }
        })();
      }));
      add.addButton(b => b.setButtonText('From vault…').onClick(() => {
        new VaultImageModal(app, f => {
          this.setPending({ kind: 'vault', file: f });
          if (!this.newName.trim()) this.newName = f.basename;
          this.render();
        }).open();
      }));
    }

    add.addButton(b => b.setButtonText('Add').setCta().onClick(() => { void this.addSquare(); }));
  }

  private async addSquare(): Promise<void> {
    const { app, settings } = this.host;
    const name = this.newName.trim();
    if (!name) { new Notice('Give the square a name first.'); return; }
    const keys = settings.squares.map(q => q.key);
    let sq: SquareDef;
    try {
      if (this.newMode === 'color') {
        sq = { key: colorSquareKey(name, Date.now()), name, color: this.newColor };
      } else if (this.pending?.kind === 'vault') {
        // notes match squares by name without extension: rest.jpg would read as rest.png's notes
        if (squareClassClash(this.pending.file.name, keys)) {
          new Notice(`A square already uses the name "${this.pending.file.basename}". Rename the file first.`);
          return;
        }
        sq = { key: this.pending.file.name, name, color: null };
      } else if (this.pending?.kind === 'upload') {
        const taken = takenImageNames(keys, app.vault.getFiles().map(f => f.name));
        const file = await createSquareImage(app, uniqueImageName(slugify(name), taken), this.pending.bytes);
        sq = { key: file.name, name, color: null };
      } else {
        new Notice('Upload an image or pick one from your vault first.');
        return;
      }
    } catch (e) {
      console.error('week-life-circles: adding square failed', e);
      new Notice(`Could not add the square: ${(e as Error).message}`);
      return;
    }
    if (settings.squares.some(q => q.key === sq.key)) { new Notice('That image is already a square.'); return; }
    settings.squares.push(sq);
    this.newName = '';
    this.setPending(null);
    await this.saveNow();
    this.render();
  }
}
