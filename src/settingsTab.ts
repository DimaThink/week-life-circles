import { App, Notice, Plugin, PluginSettingTab, Setting, normalizePath, requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS, Language, Settings, cleanPropertyName, normalizeSettings, encodeConfig, parseConfigPayload } from './config';
import { ConfirmModal, SquareEditor } from './squareEditor';
import { LANGUAGE_NAMES, resolveLang, t } from './i18n';
import { STARTER_PRESETS, StarterPreset, starterWeekTemplate } from './i18n/strings/templates';
import { formatDate, obsidianLocale } from './momentFmt';

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

type TextKey = 'birthDate' | 'yearStartDate' | 'weekFolder' | 'dayFolder' | 'weekTemplatePath' | 'dayTemplatePath' | 'vaultPhotoFolder' | 'attachmentFolder' | 'immichUrl' | 'immichApiKey';

/** Property names the circle-property dropdown offers; anything else is a custom name. */
const PROPERTY_PRESETS = ['circle', 'square'];

export class WeekLifeCirclesSettingTab extends PluginSettingTab {
  private readonly host: WlcHost;
  private readonly squares: SquareEditor;
  private readonly daySquares: SquareEditor;
  /** The "Custom…" property option is picked (the name field shows even while it still holds a preset). */
  private customProperty = false;

  constructor(app: App, plugin: Plugin & WlcHost) {
    super(app, plugin);
    this.host = plugin;
    const save = (): Promise<void> => this.host.saveSettings();
    // getters, not the arrays: an imported config replaces the lists
    this.squares = new SquareEditor({ app, settings: this.host.settings, list: () => this.host.settings.squares, save });
    this.daySquares = new SquareEditor({ app, settings: this.host.settings, list: () => this.host.settings.daySquares, save });
  }

  hide(): void {
    this.squares.dispose(); // flushes a pending (debounced) save
    this.daySquares.dispose();
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
    /** Whole-number setting; the stored value is clamped by normalizeSettings, shown again on blur. */
    const addNumber = (name: string, key: 'photoWidth' | 'dayGridYears', desc: string): void => {
      new Setting(containerEl).setName(name).setDesc(desc).addText(tx => {
        tx.inputEl.type = 'number';
        tx.setValue(String(s[key]));
        tx.inputEl.addEventListener('change', () => {
          const n = Number(tx.inputEl.value);
          if (tx.inputEl.value !== '' && Number.isFinite(n)) {
            s[key] = n;
            s[key] = normalizeSettings(s)[key];
            void save();
          }
          tx.setValue(String(s[key]));
        });
      });
    };

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
    addNumber(t('settings.dayGridYears'), 'dayGridYears', t('settings.dayGridYearsDesc'));
    new Setting(containerEl)
      .setName(t('settings.showMobileButton'))
      .setDesc(t('settings.showMobileButtonDesc'))
      .addToggle(tg => tg.setValue(s.showMobileButton).onChange(v => { s.showMobileButton = v; void save(); }));

    // --- Circles (previewed in the grid's current view; the view is switched from the grid's toolbar) ---
    new Setting(containerEl).setName(t('settings.circles')).setHeading()
      .setDesc(t('settings.circlesDesc'));
    const custom = this.customProperty || !PROPERTY_PRESETS.includes(s.circleProperty);
    new Setting(containerEl)
      .setName(t('settings.circleProperty'))
      .setDesc(t('settings.circlePropertyDesc'))
      .addDropdown(d => d
        .addOption('circle', t('settings.propCircle'))
        .addOption('square', t('settings.propSquare'))
        .addOption('custom', t('settings.propCustom'))
        .setValue(custom ? 'custom' : s.circleProperty)
        .onChange(async v => {
          this.customProperty = v === 'custom';
          if (v !== 'custom') { s.circleProperty = v; await save(); }
          this.display();
        }));
    if (custom) {
      new Setting(containerEl).setName(t('settings.propCustomName')).addText(tx => tx
        .setPlaceholder('mood').setValue(PROPERTY_PRESETS.includes(s.circleProperty) ? '' : s.circleProperty)
        .onChange(v => { if (v.trim()) { s.circleProperty = cleanPropertyName(v); void save(); } }));
    }
    this.squares.mount(containerEl);
    new Setting(containerEl)
      .setName(t('settings.daySquaresEnabled'))
      .setDesc(t('settings.daySquaresEnabledDesc'))
      .addToggle(tg => tg.setValue(s.daySquaresEnabled).onChange(async v => {
        s.daySquaresEnabled = v;
        await save();
        this.display(); // show or hide the day circles
      }));
    if (s.daySquaresEnabled) {
      new Setting(containerEl).setName(t('settings.daySquares')).setHeading().setDesc(t('settings.daySquaresDesc'));
      this.daySquares.mount(containerEl);
    }

    // --- Notes ---
    new Setting(containerEl).setName(t('settings.notes')).setHeading();
    addText(t('settings.weekFolder'), 'weekFolder', folder(DEFAULT_SETTINGS.weekFolder));
    addText(t('settings.dayFolder'), 'dayFolder', folder(DEFAULT_SETTINGS.dayFolder));
    new Setting(containerEl)
      .setName(t('settings.dayLayout'))
      .setDesc(t('settings.dayLayoutDesc'))
      .addDropdown(d => d
        .addOption('week', t('settings.dayLayoutWeek'))
        .addOption('flat', t('settings.dayLayoutFlat'))
        .addOption('month', t('settings.dayLayoutMonth'))
        .setValue(s.dayLayout)
        .onChange(v => { s.dayLayout = v === 'week' || v === 'month' ? v : 'flat'; void save(); }));
    new Setting(containerEl)
      .setName(t('settings.attachmentLocation'))
      .setDesc(t('settings.attachmentLocationDesc'))
      .addDropdown(d => d
        .addOption('obsidian', t('settings.attachmentObsidian'))
        .addOption('folder', t('settings.attachmentFolder'))
        .setValue(s.attachmentLocation)
        .onChange(async v => {
          s.attachmentLocation = v === 'folder' ? v : 'obsidian';
          await save();
          this.display(); // show or hide the folder
        }));
    if (s.attachmentLocation === 'folder') {
      addText(t('settings.attachmentFolderPath'), 'attachmentFolder', v => v.trim().replace(/^\/+|\/+$/g, '') || `${s.weekFolder}/Attachments/{{yy}}`,
        t('settings.attachmentFolderPathDesc'), 'Photos/{{yy}}');
    }
    addNumber(t('settings.photoWidth'), 'photoWidth', t('settings.photoWidthDesc'));
    addText(t('settings.vaultPhotoFolder'), 'vaultPhotoFolder', optionalPath, t('settings.vaultPhotoFolderDesc'));
    addText(t('settings.weekTemplatePath'), 'weekTemplatePath', optionalPath, t('settings.weekTemplatePathDesc'));
    addText(t('settings.dayTemplatePath'), 'dayTemplatePath', optionalPath, t('settings.dayTemplatePathDesc'));

    const example = (): string => t('settings.dateFormatDesc', { example: formatDate(new Date(), s.dateFormat) });
    const dateSetting = new Setting(containerEl).setName(t('settings.dateFormat')).setDesc(example());
    dateSetting.addText(tx => tx.setPlaceholder(DEFAULT_SETTINGS.dateFormat).setValue(s.dateFormat).onChange(v => {
      s.dateFormat = v.trim() || DEFAULT_SETTINGS.dateFormat;
      dateSetting.setDesc(example());
      void save();
    }));

    const weekPh = t('settings.placeholders', { tpl: '{{date}} {{weekEnd}} {{today}} {{days}} {{photos}} {{ww}} {{yy}} {{circle}} {{square}}' });
    const dayPh = t('settings.placeholders', { tpl: '{{date}} {{weekday}} {{yesterday}} {{today}} {{circle}} {{square}}' });
    new Setting(containerEl).setName(t('settings.weekTemplate')).setDesc(weekPh).addTextArea(tx => {
      tx.inputEl.rows = 10;
      tx.setValue(s.weekTemplate).onChange(async v => { s.weekTemplate = v; await save(); });
    });
    const presetName: Record<StarterPreset, string> = {
      minimal: t('settings.starterMinimal'),
      journal: t('settings.starterJournal'),
      reflection: t('settings.starterReflection'),
    };
    let preset: StarterPreset = 'journal';
    new Setting(containerEl)
      .setName(t('settings.starterTemplate'))
      .setDesc(t('settings.starterTemplateDesc'))
      .addDropdown(d => {
        for (const p of STARTER_PRESETS) d.addOption(p, presetName[p]);
        d.setValue(preset).onChange(v => { preset = STARTER_PRESETS.find(p => p === v) ?? 'journal'; });
      })
      .addButton(b => b.setButtonText(t('settings.starterLoad')).onClick(() => {
        new ConfirmModal(this.app, t('settings.starterConfirm', { name: presetName[preset] }), t('settings.starterReplace'), () => {
          s.weekTemplate = starterWeekTemplate(preset, resolveLang(s.language, obsidianLocale()));
          void save().then(() => this.display());
        }).open();
      }));
    new Setting(containerEl).setName(t('settings.dayTemplate')).setDesc(dayPh).addTextArea(tx => {
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
