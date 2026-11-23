import { App, Notice, Plugin, PluginSettingTab, Setting, normalizePath, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, Settings, normalizeSettings, encodeConfig, parseConfigPayload } from './config';
import { SquareEditor } from './squareEditor';

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

type TextKey = 'birthDate' | 'yearStartDate' | 'weekFolder' | 'dayFolder' | 'weekTemplatePath' | 'dayTemplatePath' | 'immichUrl' | 'immichApiKey';

export class WeekLifeCirclesSettingTab extends PluginSettingTab {
  private readonly host: WlcHost;
  private readonly squares: SquareEditor;

  constructor(app: App, plugin: Plugin & WlcHost) {
    super(app, plugin);
    this.host = plugin;
    this.squares = new SquareEditor({
      app,
      settings: this.host.settings,
      save: () => this.host.saveSettings(),
    });
  }

  hide(): void {
    this.squares.dispose(); // flushes a pending (debounced) save
    super.hide();
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
    const optionalPath = (v: string): string => (v.trim() ? normalizePath(v.trim()) : '');

    // --- Calendar ---
    new Setting(containerEl).setName('Calendar').setHeading();
    addText('Birth date', 'birthDate', trim, 'Your date of birth (YYYY-MM-DD).', 'YYYY-MM-DD');
    new Setting(containerEl)
      .setName('Year starts')
      .setDesc('Where each grid year begins: on your birthday, on 1 January, or on a day you choose. '
        + 'Existing notes keep their week and year numbers, so after a change they land on different dates.')
      .addDropdown(d => d
        .addOption('birthday', 'On my birthday')
        .addOption('january', 'On 1 January')
        .addOption('custom', 'On a custom day')
        .setValue(s.yearStart)
        .onChange(v => {
          s.yearStart = v === 'january' || v === 'custom' ? v : 'birthday';
          void save();
          this.display(); // show or hide the custom day
        }));
    if (s.yearStart === 'custom') {
      addText('Custom start day', 'yearStartDate', trim,
        'Month and day each year starts on (MM-DD, e.g. 09-01). An invalid day falls back to your birthday.', 'MM-DD');
    }

    const addAge = (name: string, key: 'startAge' | 'endAge', desc: string): void => {
      new Setting(containerEl).setName(name).setDesc(desc).addText(t => {
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
    new Setting(containerEl)
      .setName('Start from the current year')
      .setDesc('The grid begins with the year you are in now, so it shows what is ahead. '
        + 'Turn off to pick the first year yourself, for example 0 to see your whole life.')
      .addToggle(t => t.setValue(s.startAtCurrentYear).onChange(v => {
        s.startAtCurrentYear = v;
        void save();
        this.display(); // show or hide the start age
      }));
    if (!s.startAtCurrentYear) addAge('Start age', 'startAge', 'First personal year shown in the week grid (0 = from birth).');
    addAge('End age', 'endAge', 'Last personal year shown in the week grid.');

    // --- Squares (previewed in the grid's current view; the view is switched from the grid's toolbar) ---
    new Setting(containerEl).setName('Circles').setHeading()
      .setDesc('What kind of week or day it was. Rename, recolour, replace images and reorder here — the first circle is preselected for new notes.');
    new Setting(containerEl)
      .setName('Marker shape in notes')
      .setDesc('How a circle is drawn at the top of a week or day note. Colour and image circles use the same shape.')
      .addDropdown(d => d
        .addOption('circle', 'Circle')
        .addOption('square', 'Rounded square')
        .setValue(s.noteShape)
        .onChange(v => { s.noteShape = v === 'square' ? 'square' : 'circle'; void save(); }));
    this.squares.mount(containerEl);

    // --- Notes ---
    new Setting(containerEl).setName('Notes').setHeading();
    addText('Week folder', 'weekFolder', folder(DEFAULT_SETTINGS.weekFolder));
    addText('Day folder', 'dayFolder', folder(DEFAULT_SETTINGS.dayFolder));
    addText('Week template path', 'weekTemplatePath', optionalPath,
      'Optional: path to a note used as the week template. Leave blank to use the week template below.');
    addText('Day template path', 'dayTemplatePath', optionalPath,
      'Optional: path to a Templater daily-note template. Leave blank to use the built-in day template.');

    const ph = 'Placeholders: {{ww}} {{yy}} {{circle}} {{date}} {{photos}} {{weekday}}';
    new Setting(containerEl).setName('Week template').setDesc(ph).addTextArea(t => {
      t.inputEl.rows = 10;
      t.setValue(s.weekTemplate).onChange(async v => { s.weekTemplate = v; await save(); });
    });
    new Setting(containerEl).setName('Day template').setDesc(ph).addTextArea(t => {
      t.inputEl.rows = 4;
      t.setValue(s.dayTemplate).onChange(async v => { s.dayTemplate = v; await save(); });
    });

    // --- Immich ---
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
      .setDesc('Paste a config code — or a URL that returns one — and Apply. This replaces all current settings. Image circles need their image files in this vault too.')
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
  }
}
