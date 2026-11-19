import { App, Notice, Plugin, PluginSettingTab, Setting, normalizePath, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, Settings, SquareDef, normalizeSettings, encodeConfig, parseConfigPayload } from './config';

/**
 * What the settings tab needs from the plugin. A plain interface, NOT a
 * `Plugin` intersection on purpose: typing the stored reference as
 * `Plugin & {...}` makes `this.host.settings` resolve to `Plugin.settings`
 * (added in Obsidian 1.13.0), which trips obsidianmd/no-unsupported-api
 * against our 1.7.2 minAppVersion. A plain interface keeps `.settings` ours.
 */
interface WlcHost {
  /** Edited in place — the object itself is never replaced. */
  readonly settings: Settings;
  saveSettings(): Promise<void>;
}

type TextKey = 'birthDate' | 'weekFolder' | 'dayFolder' | 'dayTemplatePath' | 'immichUrl' | 'immichApiKey';

export class WeekLifeCirclesSettingTab extends PluginSettingTab {
  private newName = '';
  private newMode: 'color' | 'image' = 'color';
  private newColor = '#888888';
  private newKey = '';

  private readonly host: WlcHost;

  constructor(app: App, plugin: Plugin & WlcHost) {
    super(app, plugin);
    this.host = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.host.settings;
    const save = (): Promise<void> => this.host.saveSettings();

    /** Text setting bound to `key`; `clean` turns the typed text into the stored value. */
    const addText = (name: string, key: TextKey, clean: (v: string) => string, desc = '', placeholder = ''): Setting => {
      const setting = new Setting(containerEl).setName(name).addText(t =>
        t.setPlaceholder(placeholder).setValue(s[key]).onChange(v => { s[key] = clean(v); void save(); }));
      if (desc) setting.setDesc(desc);
      return setting;
    };
    const trim = (v: string): string => v.trim();
    const folder = (fallback: string) => (v: string): string => normalizePath(v.trim() || fallback);

    // --- Import / export: set up a new device (e.g. phone) in one paste ---
    new Setting(containerEl).setName('Configuration').setHeading();
    new Setting(containerEl)
      .setName('Export config')
      .setDesc('Copy every setting as one code to paste on another device. It includes your Immich key, so keep the code private.')
      .addButton(b => b.setButtonText('Copy config code').onClick(() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(encodeConfig(s));
            new Notice('Config code copied — it contains your Immich key, keep it private.');
          } catch {
            new Notice('Could not access the clipboard.');
          }
        })();
      }));
    let importInput = '';
    new Setting(containerEl)
      .setName('Import config')
      .setDesc('Paste a config code — or a URL that returns one — and Apply. This replaces all current settings.')
      .addText(t => t.setPlaceholder('code, or https://…').onChange(v => { importInput = v; }))
      .addButton(b => b.setButtonText('Apply').setCta().onClick(() => {
        void (async () => {
          const raw = importInput.trim();
          if (!raw) { new Notice('Paste a config code or URL first.'); return; }
          try {
            const payload = /^https?:\/\//i.test(raw) ? (await requestUrl({ url: raw })).text : raw;
            Object.assign(s, normalizeSettings(parseConfigPayload(payload)));
            await save();
            new Notice('Config imported.');
            this.display();
          } catch {
            new Notice('Import failed — not a valid config code or URL.');
          }
        })();
      }));

    addText('Birth date', 'birthDate', trim, "Your date of birth — the grid's anchor (YYYY-MM-DD)", 'YYYY-MM-DD');

    const addAge = (name: string, key: 'startAge' | 'endAge'): void => {
      new Setting(containerEl).setName(name).addText(t => {
        t.inputEl.type = 'number';
        t.setValue(String(s[key]));
        t.inputEl.addEventListener('change', () => {
          void (async () => {
            const n = Number(t.inputEl.value);
            if (Number.isFinite(n) && t.inputEl.value !== '') {
              s[key] = n;
              Object.assign(s, normalizeSettings(s)); // whole ages, endAge > startAge
              await save();
            }
            this.display();
          })();
        });
      });
    };
    addAge('Start age', 'startAge');
    addAge('End age', 'endAge');

    addText('Week folder', 'weekFolder', folder(DEFAULT_SETTINGS.weekFolder));
    addText('Day folder', 'dayFolder', folder(DEFAULT_SETTINGS.dayFolder));
    addText('Day template path', 'dayTemplatePath', v => (v.trim() ? normalizePath(v.trim()) : ''),
      'Optional: path to a Templater daily-note template. Leave blank to use the built-in day template.');

    const ph = 'Placeholders: {{ww}} {{yy}} {{square}} {{date}} {{photos}} {{weekday}}';
    new Setting(containerEl).setName('Week template').setDesc(ph).addTextArea(t => {
      t.inputEl.rows = 10;
      t.setValue(s.weekTemplate).onChange(async v => { s.weekTemplate = v; await save(); });
    });
    new Setting(containerEl).setName('Day template').setDesc(ph).addTextArea(t => {
      t.inputEl.rows = 4;
      t.setValue(s.dayTemplate).onChange(async v => { s.dayTemplate = v; await save(); });
    });

    new Setting(containerEl).setName('Immich').setHeading();
    containerEl.createEl('p', {
      text: 'Optional, user-provided integration: it makes network calls to the Immich server you configure.',
      cls: 'setting-item-description',
    });
    new Setting(containerEl).setName('Enable Immich').addToggle(t =>
      t.setValue(s.immichEnabled).onChange(async v => {
        s.immichEnabled = v;
        await save();
        this.display();
      }));
    const off = !s.immichEnabled;
    addText('Immich URL', 'immichUrl', v => v.trim().replace(/\/+$/, ''), '', 'https://immich.example.com').setDisabled(off);
    const keySetting = addText('Immich API key', 'immichApiKey', trim).setDisabled(off);
    keySetting.controlEl.querySelector('input')?.setAttribute('type', 'password');
    new Setting(containerEl).setName('Immich page size').addText(t => {
      t.inputEl.type = 'number';
      t.setValue(String(s.immichPageSize)).onChange(async v => {
        const n = Math.floor(Number(v));
        if (!Number.isFinite(n) || n < 1) return;
        s.immichPageSize = Math.min(n, 1000);
        await save();
      });
    }).setDisabled(off);

    new Setting(containerEl).setName('Squares').setHeading();
    s.squares.forEach((q, i) => {
      const row = new Setting(containerEl).setName(q.name);
      if (q.color) {
        row.controlEl.createDiv({ cls: 'wcg-settings-swatch' }).setCssProps({ '--wcg-color': q.color });
      } else {
        row.controlEl.createDiv({ text: q.key });
      }
      row.addExtraButton(b => b.setIcon('trash').setTooltip('Remove').onClick(async () => {
        s.squares.splice(i, 1);
        await save();
        this.display();
      }));
    });

    const add = new Setting(containerEl).setName('Add square');
    add.addText(t => t.setPlaceholder('Name').setValue(this.newName).onChange(v => { this.newName = v; }));
    add.addDropdown(d => d
      .addOption('color', 'Color')
      .addOption('image', 'Image')
      .setValue(this.newMode)
      .onChange(v => { this.newMode = v as 'color' | 'image'; this.display(); }));
    if (this.newMode === 'color') {
      const c = add.controlEl.createEl('input', { type: 'color' });
      c.value = this.newColor;
      c.addEventListener('input', () => { this.newColor = c.value; });
    } else {
      add.addText(t => t.setPlaceholder('image.png').setValue(this.newKey).onChange(v => { this.newKey = v; }));
    }
    add.addButton(b => b.setButtonText('Add').setCta().onClick(async () => {
      const name = this.newName.trim();
      if (!name) { new Notice('Enter a name'); return; }
      // The key ends up in a CSS class, a CSS selector and note markup: keep it plain.
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const key = this.newMode === 'image'
        ? this.newKey.trim()
        : `custom-${slug ? slug + '-' : ''}${Date.now().toString(36)}`;
      if (this.newMode === 'image' && !/^[^"'\\[\]|<>]+\.[A-Za-z0-9]+$/.test(key)) {
        new Notice('Enter the image file name, e.g. flag.png');
        return;
      }
      if (s.squares.some(q => q.key === key)) { new Notice('This square already exists'); return; }
      const sq: SquareDef = { key, name, color: this.newMode === 'color' ? this.newColor : null };
      s.squares.push(sq);
      this.newName = '';
      this.newKey = '';
      await save();
      this.display();
    }));
  }
}
