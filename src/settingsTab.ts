import { App, Notice, Plugin, PluginSettingTab, Setting, normalizePath, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, Language, Settings, normalizeSettings, encodeConfig, parseConfigPayload } from './config';
import { SquareEditor } from './squareEditor';
import { LANGUAGE_NAMES, t } from './i18n';

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
  readonly currentAge: number | null;
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
      const setting = new Setting(containerEl).setName(name).addText(tx =>
        tx.setPlaceholder(placeholder).setValue(s[key]).onChange(v => { s[key] = clean(v); void save(); }));
      if (desc) setting.setDesc(desc);
      return setting;
    };
    const trim = (v: string): string => v.trim();
    const folder = (fallback: string) => (v: string): string => normalizePath(v.trim() || fallback);
    const optionalPath = (v: string): string => (v.trim() ? normalizePath(v.trim()) : '');

    // --- Language ---
    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown(d => d
        .addOption('auto', t('settings.languageAuto'))
        .addOption('en', LANGUAGE_NAMES.en)
        .addOption('uk', LANGUAGE_NAMES.uk)
        .addOption('pl', LANGUAGE_NAMES.pl)
        .setValue(s.language)
        .onChange(async v => {
          s.language = (v === 'en' || v === 'uk' || v === 'pl' ? v : 'auto') satisfies Language;
          await save(); // applies the language
          this.display();
        }));

    // --- Calendar ---
    new Setting(containerEl).setName(t('settings.calendar')).setHeading();
    addText(t('settings.birthDate'), 'birthDate', trim, t('settings.birthDateDesc'), 'YYYY-MM-DD')
      // once the date is complete (blur / Enter), redraw so "Start from year" lists the right years
      .controlEl.querySelector('input')?.addEventListener('change', () => this.display());
    new Setting(containerEl)
      .setName(t('settings.yearStarts'))
      .setDesc(t('settings.yearStartsDesc'))
      .addDropdown(d => d
        .addOption('birthday', t('settings.yearStartBirthday'))
        .addOption('january', t('settings.yearStartJanuary'))
        .addOption('custom', t('settings.yearStartCustom'))
        .setValue(s.yearStart)
        .onChange(v => {
          s.yearStart = v === 'january' || v === 'custom' ? v : 'birthday';
          void save();
          this.display(); // show or hide the custom day
        }));
    if (s.yearStart === 'custom') {
      addText(t('settings.customStartDay'), 'yearStartDate', trim, t('settings.customStartDayDesc'), 'MM-DD');
    }

    const addAge = (name: string, key: 'startAge' | 'endAge', desc: string): void => {
      new Setting(containerEl).setName(name).setDesc(desc).addText(tx => {
        tx.inputEl.type = 'number';
        tx.setValue(String(s[key]));
        tx.inputEl.addEventListener('change', () => {
          void (async () => {
            const n = Number(tx.inputEl.value);
            if (Number.isFinite(n) && tx.inputEl.value !== '') {
              s[key] = n;
              Object.assign(s, normalizeSettings(s)); // whole ages, endAge > startAge
              await save();
            }
            this.display();
          })();
        });
      });
    };
    // One choice: follow the current year, or pin the first year anywhere from 0 up to now.
    const nowAge = this.host.currentAge;
    const pinned = Math.max(0, Math.floor(s.startAge));
    const lastPick = Math.max(nowAge ?? 0, s.startAtCurrentYear ? 0 : pinned);
    new Setting(containerEl)
      .setName(t('settings.startFromYear'))
      .setDesc(t('settings.startFromYearDesc'))
      .addDropdown(d => {
        d.addOption('current', nowAge === null ? t('settings.currentYear') : t('settings.currentYearAge', { age: nowAge }));
        for (let y = lastPick; y >= 0; y--) d.addOption(String(y), y === 0 ? t('settings.yearZero') : String(y));
        d.setValue(s.startAtCurrentYear ? 'current' : String(pinned));
        d.onChange(v => {
          const endAge = s.endAge;
          if (v === 'current') {
            s.startAtCurrentYear = true;
          } else {
            s.startAtCurrentYear = false;
            s.startAge = Number(v);
            Object.assign(s, normalizeSettings(s)); // endAge stays above the start
          }
          void save();
          if (s.endAge !== endAge) this.display(); // show the raised end age
        });
      });
    addAge(t('settings.endAge'), 'endAge', t('settings.endAgeDesc'));

    // --- Circles (previewed in the grid's current view; the view is switched from the grid's toolbar) ---
    new Setting(containerEl).setName(t('settings.circles')).setHeading()
      .setDesc(t('settings.circlesDesc'));
    new Setting(containerEl)
      .setName(t('settings.markerShape'))
      .setDesc(t('settings.markerShapeDesc'))
      .addDropdown(d => d
        .addOption('circle', t('settings.shapeCircle'))
        .addOption('square', t('settings.shapeSquare'))
        .setValue(s.noteShape)
        .onChange(v => { s.noteShape = v === 'square' ? 'square' : 'circle'; void save(); }));
    this.squares.mount(containerEl);

    // --- Notes ---
    new Setting(containerEl).setName(t('settings.notes')).setHeading();
    addText(t('settings.weekFolder'), 'weekFolder', folder(DEFAULT_SETTINGS.weekFolder));
    addText(t('settings.dayFolder'), 'dayFolder', folder(DEFAULT_SETTINGS.dayFolder));
    addText(t('settings.weekTemplatePath'), 'weekTemplatePath', optionalPath, t('settings.weekTemplatePathDesc'));
    addText(t('settings.dayTemplatePath'), 'dayTemplatePath', optionalPath, t('settings.dayTemplatePathDesc'));

    const ph = t('settings.placeholders', { tpl: '{{ww}} {{yy}} {{circle}} {{date}} {{photos}} {{weekday}}' });
    new Setting(containerEl).setName(t('settings.weekTemplate')).setDesc(ph).addTextArea(tx => {
      tx.inputEl.rows = 10;
      tx.setValue(s.weekTemplate).onChange(async v => { s.weekTemplate = v; await save(); });
    });
    new Setting(containerEl).setName(t('settings.dayTemplate')).setDesc(ph).addTextArea(tx => {
      tx.inputEl.rows = 4;
      tx.setValue(s.dayTemplate).onChange(async v => { s.dayTemplate = v; await save(); });
    });

    // --- Immich ---
    new Setting(containerEl).setName(t('settings.immich')).setHeading();
    containerEl.createEl('p', {
      text: t('settings.immichNote'),
      cls: 'setting-item-description',
    });
    new Setting(containerEl).setName(t('settings.immichEnable')).addToggle(tx =>
      tx.setValue(s.immichEnabled).onChange(async v => {
        s.immichEnabled = v;
        await save();
        this.display();
      }));
    const off = !s.immichEnabled;
    addText(t('settings.immichUrl'), 'immichUrl', v => v.trim().replace(/\/+$/, ''), '', 'https://immich.example.com').setDisabled(off);
    const keySetting = addText(t('settings.immichApiKey'), 'immichApiKey', trim).setDisabled(off);
    keySetting.controlEl.querySelector('input')?.setAttribute('type', 'password');
    new Setting(containerEl).setName(t('settings.immichPageSize')).addText(tx => {
      tx.inputEl.type = 'number';
      tx.setValue(String(s.immichPageSize)).onChange(async v => {
        const n = Math.floor(Number(v));
        if (!Number.isFinite(n) || n < 1) return;
        s.immichPageSize = Math.min(n, 1000);
        await save();
      });
    }).setDisabled(off);

    // --- Import / export: set up a new device (e.g. phone) in one paste ---
    new Setting(containerEl).setName(t('settings.configuration')).setHeading();
    new Setting(containerEl)
      .setName(t('settings.exportConfig'))
      .setDesc(t('settings.exportConfigDesc'))
      .addButton(b => b.setButtonText(t('settings.copyConfigCode')).onClick(() => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(encodeConfig(s));
            new Notice(t('settings.configCopied'));
          } catch {
            new Notice(t('settings.clipboardFailed'));
          }
        })();
      }));
    let importInput = '';
    new Setting(containerEl)
      .setName(t('settings.importConfig'))
      .setDesc(t('settings.importConfigDesc'))
      .addText(tx => tx.setPlaceholder(t('settings.importPlaceholder')).onChange(v => { importInput = v; }))
      .addButton(b => b.setButtonText(t('settings.apply')).setCta().onClick(() => {
        void (async () => {
          const raw = importInput.trim();
          if (!raw) { new Notice(t('settings.pasteFirst')); return; }
          try {
            const payload = /^https?:\/\//i.test(raw) ? (await requestUrl({ url: raw })).text : raw;
            Object.assign(s, normalizeSettings(parseConfigPayload(payload)));
            await save();
            new Notice(t('settings.configImported'));
            this.display();
          } catch {
            new Notice(t('settings.importFailed'));
          }
        })();
      }));
  }
}
