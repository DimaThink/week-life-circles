import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { t } from '../i18n';
import { daySquareSet, type Settings } from '../config';
import { Calendar, formatYMD } from '../calendar';
import type { ImmichClient } from '../immich';
import { renderDayTemplate } from '../templates';
import { ensureParentFolders } from '../vaultUtil';
import { dayNotePath } from '../notePaths';
import { dayNoteWeek } from '../weekFiles';
import { formatDate, momentFmt } from '../momentFmt';
import { defaultDaySquareKey, renderSquarePicker } from './swatches';


export interface ModalHost {
  readonly app: App;
  readonly settings: Settings;
  calendar: Calendar | null;
  immich: ImmichClient;
}

export class CreateDayModal extends Modal {
  private square: string;
  private date: Date | null;
  private dateStr = '';
  private weekdayName = '';

  constructor(private readonly host: ModalHost, private readonly target: { yy: number; doy: number }) {
    super(host.app);
    this.square = defaultDaySquareKey(host.settings);
    this.date = host.calendar ? host.calendar.personalToDate(target.yy, target.doy) : null;
    if (this.date) {
      this.dateStr = formatYMD(this.date);
      this.weekdayName = momentFmt(this.date).format('dddd'); // in Obsidian's language
    }
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: t('notes.createDay.title') });
    if (!this.date) {
      contentEl.createEl('p', { text: t('notes.day.noCalendar'), cls: 'setting-item-description' });
      return;
    }
    contentEl.createEl('p', { text: `${this.dateStr} · ${this.weekdayName}`, cls: 'setting-item-description' });
    renderSquarePicker(this.app, contentEl, t('notes.dayType'), daySquareSet(this.host.settings), this.square,
      k => { this.square = k; });
    new Setting(contentEl)
      .addButton(btn => btn.setButtonText(t('notes.create')).setCta().onClick(() => { void this.create(); }));
  }

  private async renderBody(date: Date): Promise<string> {
    const { vault } = this.host.app;
    const path = this.host.settings.dayTemplatePath;
    let templateRaw: string | null = null;
    if (path) {
      const tpl = vault.getAbstractFileByPath(path);
      if (tpl instanceof TFile) templateRaw = await vault.read(tpl);
    }
    return renderDayTemplate({
      templateRaw,
      day: date,
      today: new Date(),
      square: this.square,
      settings: this.host.settings,
      formatDate,
      week: dayNoteWeek(this.target),
    });
  }

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
    if (!this.date) return;
    try {
      const { vault, workspace } = this.host.app;
      const { dayFolder, dayLayout } = this.host.settings;
      const filePath = dayNotePath(dayFolder, dayLayout, this.date, this.target);

      if (vault.getAbstractFileByPath(filePath)) {
        new Notice(t('notes.exists', { path: filePath }));
        return;
      }
      const body = await this.renderBody(this.date);
      await ensureParentFolders(vault, filePath);
      const file = await vault.create(filePath, body);
      this.close();
      new Notice(`✅ ${t('notes.created', { name: `${this.dateStr}.md` })}`);
      // New tab so the day calendar stays visible behind it
      await workspace.getLeaf('tab').openFile(file);
    } catch (e) {
      console.error('week-life-circles: CreateDayModal.create failed', e);
      new Notice(`❌ ${(e instanceof Error && e.message) || String(e)}`, 8000);
    }
  }

  onClose(): void { this.contentEl.empty(); }
}
