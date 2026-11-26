import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';
import type { MigrationPlan } from '../circleMigration';

const EXAMPLES = 5;

/** Dry run of "add circle properties": what would change, with a confirm button that does it. */
export class CircleMigrationModal extends Modal {
  private running = false;

  constructor(app: App, private readonly plan: MigrationPlan, private readonly property: string,
    private readonly apply: () => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const { counts, items } = this.plan;
    this.setTitle(t('notes.migrate.title'));
    contentEl.createEl('p', { text: t('notes.migrate.summary', { week: counts.week, day: counts.day, prop: this.property }) });
    if (counts.hasProperty > 0 || counts.unknown > 0) {
      contentEl.createEl('p', {
        text: t('notes.migrate.skipped', { has: counts.hasProperty, unknown: counts.unknown }),
        cls: 'setting-item-description',
      });
    }
    contentEl.createEl('p', { text: t('notes.migrate.examples') });
    const list = contentEl.createEl('ul');
    for (const item of items.slice(0, EXAMPLES)) {
      list.createEl('li', { text: `${item.path} → ${this.property}: ${item.values.join(', ')}` });
    }
    contentEl.createEl('p', { text: t('notes.migrate.keepsInline'), cls: 'setting-item-description' });
    new Setting(contentEl)
      .addButton(b => b.setButtonText(t('circles.cancel')).onClick(() => this.close()))
      .addButton(b => b.setButtonText(t('notes.migrate.confirm', { n: items.length })).setCta().onClick(() => {
        if (this.running) return;
        this.running = true;
        b.setDisabled(true);
        void this.apply().finally(() => this.close());
      }));
  }

  onClose(): void { this.contentEl.empty(); }
}
