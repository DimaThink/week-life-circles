import { MarkdownView, Notice, Platform, Plugin, TAbstractFile, TFile, TFolder } from 'obsidian';
import { applyLanguage, resolveLang, t } from './i18n';
import { obsidianLocale } from './momentFmt';
import type { WorkspaceLeaf } from 'obsidian';
import { CellMap, CellShape, Settings, DEFAULT_SETTINGS, normalizeSettings, parseBirthDate, resolveAnchor, ageRange, freshInstallSettings, daySquareSet, markerSquares } from './config';
import { migrate, SavedData } from './migrate';
import { Calendar, WEEKS_PER_YEAR } from './calendar';
import { decorateSquares, squareClass, squareImage } from './squares';
import { parseWeekFilename, readWeekData, weekNotePath } from './weekFiles';
import { parseDayFilename, readDayData } from './dayFiles';
import { DAY_VIEW_TYPE, DayCalendarView, GridView, WEEK_VIEW_TYPE, WeekCalendarView } from './views/gridViews';
import { GridHost, HOVER_SOURCE, ICON_CALENDAR, makeIcon } from './grid';
import { CreateWeekModal } from './modals/createWeekModal';
import { CreateDayModal, ModalHost } from './modals/createDayModal';
import { CircleMigrationModal } from './modals/circleMigrationModal';
import { planCircleMigration, stripInlineMarkers, type MigrationNote } from './circleMigration';
import { circlePropertyNames, type CircleProperty } from './circleProperty';
import { circleNoteKind, planAutoCircles, planSignature, titleCircleProps, type AutoCirclePlan } from './autoCircle';
import { AUTO_CIRCLE_CLASS, autoCircleEditorExtension, autoCirclePostProcessor, refreshEditorCircles, type AutoCircleHost } from './autoCircleView';
import { ImmichClient } from './immich';
import { WeekLifeCirclesSettingTab } from './settingsTab';

type Kind = 'week' | 'day';

/** Named one-shot timers: scheduling a name again replaces its pending run. */
class Debouncer {
  private readonly timers = new Map<string, number>();

  run(name: string, ms: number, fn: () => void): void {
    window.clearTimeout(this.timers.get(name));
    this.timers.set(name, window.setTimeout(() => {
      this.timers.delete(name);
      fn();
    }, ms));
  }

  has(name: string): boolean {
    return this.timers.has(name);
  }

  cancelAll(): void {
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
  }
}

/** Run `fn` over `items`, at most `size` at a time, keeping order. */
async function mapChunked<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  }
  return out;
}

const READ_CHUNK = 64;

/** Obsidian's settings modal; not in the public API, so only used after a runtime check. */
interface SettingModal { open(): void; openTabById(id: string): unknown }

function isSettingModal(v: unknown): v is SettingModal {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.open === 'function' && typeof o.openTabById === 'function';
}

/** Class of an inline title that shows circles (drawn by its ::before, see styles.css). */
const TITLE_CLASS = 'wcg-titled';
const TITLE_PROPS = ['--wcg-title-bg', '--wcg-title-pos', '--wcg-title-size', '--wcg-title-w'];

function clearTitle(el: HTMLElement): void {
  if (!el.hasClass(TITLE_CLASS)) return;
  el.removeClass(TITLE_CLASS);
  el.removeAttribute('data-wcg-circles');
  for (const p of TITLE_PROPS) el.style.removeProperty(p);
}

export default class WeekLifeCirclesPlugin extends Plugin implements GridHost, ModalHost, AutoCircleHost {
  // Replaced once in onload, then only edited in place: immich + the setting tab hold this reference.
  settings: Settings = normalizeSettings(DEFAULT_SETTINGS);
  /** The personal year you are in now (null until a valid birth date is set). */
  currentAge: number | null = null;
  ageRange = { startAge: DEFAULT_SETTINGS.startAge, endAge: DEFAULT_SETTINGS.endAge };
  calendar: Calendar | null = null;
  weekCells: CellMap = {};
  dayCells: CellMap = {};
  weekBuiltAt = 0;
  dayBuiltAt = 0;
  transposed = false;
  immich!: ImmichClient;

  private squareObserver: MutationObserver | null = null;
  private fab: HTMLElement | null = null;
  private readonly debounce = new Debouncer();
  private readonly modified: Record<Kind, Set<string>> = { week: new Set(), day: new Set() };
  /** What each cache was built from; a change means the cache must be rebuilt. */
  private cacheInputs: Record<Kind, string> = { week: '', day: '' };
  /** Cache work runs one job at a time, so a slow rebuild cannot overwrite a newer result. */
  private cacheQueue: Promise<unknown> = Promise.resolve();
  private unloaded = false;
  /** Bumped on every settings change: circles drawn from the note property are redrawn. */
  autoCircleVersion = 0;
  /** Last known: does Obsidian show the inline title? */
  private titleVisible = true;
  /** Circles drawn last for each open note, to re-render reading view only when they change. */
  private readonly autoCircleSigs = new Map<string, string>();

  async onload(): Promise<void> {
    const { data, migrated, fresh } = migrate(await this.loadData());
    // A new install starts with the starter templates in the user's language.
    const normalized = fresh
      ? freshInstallSettings(resolveLang(DEFAULT_SETTINGS.language, obsidianLocale()))
      : normalizeSettings(data.settings);
    const changed = JSON.stringify(normalized) !== JSON.stringify(data.settings);
    this.settings = normalized;
    this.syncLanguage();
    this.weekCells = data.cells ?? {};
    this.weekBuiltAt = data.builtAt ?? 0;
    this.dayCells = data.dayCells ?? {};
    this.dayBuiltAt = data.dayBuiltAt ?? 0;
    this.immich = new ImmichClient(this.settings);
    if (migrated || changed || fresh) await this.persist();

    this.rebuildCalendar();
    this.cacheInputs = this.currentCacheInputs();

    // Square colours are user-defined: set per element (not via an injected stylesheet).
    this.startSquareDecoration();

    this.registerView(WEEK_VIEW_TYPE, leaf => new WeekCalendarView(leaf, this));
    this.registerView(DAY_VIEW_TYPE, leaf => new DayCalendarView(leaf, this));

    this.addRibbonIcon('calendar-days', 'Week Life Circles', () => { void this.activateWeekView(); });
    this.addRibbonIcon('calendar', t('notes.main.dayRibbon'), () => { void this.activateDayView(); });

    this.syncMobileButton();

    this.addCommand({ id: 'open-week-view', name: t('notes.main.openWeek'), callback: () => { void this.activateWeekView(); } });
    this.addCommand({ id: 'open-day-view', name: t('notes.main.openDay'), callback: () => { void this.activateDayView(); } });
    this.addCommand({
      id: 'create-next-week',
      name: t('notes.main.createNext'),
      callback: () => {
        const next = this.nextWeekToCreate();
        if (!next) { new Notice(t('notes.main.needBirth')); return; }
        this.openCreateWeek(next.yy, next.ww);
      },
    });
    // Lets the grid show Obsidian's note popover on hover (Settings → Page preview lists it).
    this.registerHoverLinkSource(HOVER_SOURCE, { display: 'Week Life Circles', defaultMod: false });
    this.addCommand({
      id: 'create-week',
      name: t('notes.createWeek.title'),
      callback: () => { new CreateWeekModal(this).open(); },
    });
    this.addCommand({
      id: 'add-circle-properties',
      name: t('notes.migrate.command'),
      callback: () => { void this.openCircleMigration(); },
    });

    // Clicking a colour square in reading view jumps to the grid cell
    this.registerMarkdownPostProcessor((el, ctx) => {
      const target = parseWeekFilename(ctx.sourcePath.split('/').pop() ?? '');
      decorateSquares(el, markerSquares(this.settings), this.squareImageUrl);
      el.querySelectorAll('span.sq').forEach(span => {
        if (span.closest(`.${AUTO_CIRCLE_CLASS}`)) return; // the property circle is not a link to the grid
        span.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          void this.activateWeekView(target);
        });
      });
    });

    // The circle named by the note's circle property, drawn without any markup in the note
    this.registerMarkdownPostProcessor(autoCirclePostProcessor(this));
    this.registerEditorExtension(autoCircleEditorExtension(this));
    this.registerEvent(this.app.metadataCache.on('changed', (file, data) => this.onNoteChanged(file, data)));

    // PNG squares are embedded images resolved async — use a global listener instead
    this.registerDomEvent(activeDocument, 'click', (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      // the image itself, or the embed wrapper around it — not any container that has one inside
      const img = t?.instanceOf(HTMLImageElement) ? t : t?.matches?.('.internal-embed') ? t.querySelector('img') : null;
      if (!img) return;
      const name = (img.getAttribute('alt') || '').trim();
      if (!markerSquares(this.settings).some(s => !s.color && (s.key === name || squareImage(s) === name))) return;
      e.preventDefault();
      e.stopPropagation();
      const file = this.app.workspace.getActiveFile();
      void this.activateWeekView(file ? parseWeekFilename(file.name) : null);
    }, true);

    // File watchers. Registered once the layout is ready: before that the vault
    // reports every existing file as a "create".
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) return;
      // A file appearing, vanishing or moving can change neighbouring cells (multi-week notes).
      const structural = (f: TAbstractFile, oldPath?: string): void => {
        if (!(f instanceof TFile)) return;
        for (const kind of ['week', 'day'] as const) {
          if (this.isNotePath(kind, f.path) || (oldPath && this.isNotePath(kind, oldPath))) {
            this.debounce.run(`${kind}-rebuild`, 600, () => { void this.rebuildAndRerender(kind); });
          }
        }
      };
      // The saved caches may predate changes made while the app was closed (sync, other devices).
      for (const kind of ['week', 'day'] as const) {
        this.debounce.run(`${kind}-rebuild`, 2000, () => { void this.rebuildAndRerender(kind); });
      }
      this.registerEvent(this.app.vault.on('create', structural));
      this.registerEvent(this.app.vault.on('delete', structural));
      this.registerEvent(this.app.vault.on('rename', structural));
      this.registerEvent(this.app.vault.on('modify', f => {
        if (!(f instanceof TFile)) return;
        for (const kind of ['week', 'day'] as const) {
          if (!this.isNotePath(kind, f.path)) continue;
          this.modified[kind].add(f.path);
          this.debounce.run(`${kind}-modify`, 1500, () => { void this.flushModified(kind); });
        }
      }));
    });

    this.addSettingTab(new WeekLifeCirclesSettingTab(this.app, this));
  }

  onunload(): void {
    this.unloaded = true;
    this.squareObserver?.disconnect();
    this.squareObserver = null;
    this.clearTitles();
    this.fab?.remove();
    this.fab = null;
    if (this.debounce.has('save')) void this.persist(); // do not lose a pending cache write
    this.debounce.cancelAll();
  }

  /** Decorate squares in the open document and in anything rendered later (live preview, embeds). */
  private startSquareDecoration(): void {
    this.refreshSquares();
    this.squareObserver = new MutationObserver(records => {
      for (const r of records) {
        if (r.type === 'attributes') {
          // Live Preview can set a span's class after inserting it: colour it once it becomes a square
          const t = r.target;
          if (t.nodeType === Node.ELEMENT_NODE && (t as Element).classList.contains('sq')) {
            decorateSquares(t as HTMLElement, markerSquares(this.settings), this.squareImageUrl);
          }
          continue;
        }
        r.addedNodes.forEach(n => {
          if (n.nodeType !== Node.ELEMENT_NODE) return;
          // the grid draws its own cells (thousands of nodes) and holds no note markers
          if ((n as HTMLElement).closest('.wcg-view-root')) return;
          decorateSquares(n as HTMLElement, markerSquares(this.settings), this.squareImageUrl);
        });
      }
    });
    this.squareObserver.observe(activeDocument.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
    });
    // Belt and braces: switching notes, panes or reading/editing mode re-colours what is on screen.
    const recolour = (): void => {
      this.debounce.run('recolour-squares', 150, () => { this.refreshSquares(); this.syncTitles(); });
    };
    this.registerEvent(this.app.workspace.on('layout-change', recolour));
    this.registerEvent(this.app.workspace.on('active-leaf-change', recolour));
    this.registerEvent(this.app.workspace.on('file-open', recolour));
    // turning the inline title on or off moves the circle between the title and the first line
    this.registerEvent(this.app.workspace.on('css-change', () => {
      this.debounce.run('auto-circles', 300, () => this.refreshAutoCircles());
    }));
  }

  private refreshSquares(): void {
    decorateSquares(activeDocument.body, markerSquares(this.settings), this.squareImageUrl);
  }

  // ── Circle drawn from the note property ─────────────────────────────────

  /** The circles of a week/day note from its property, or null (not such a note, or none to draw). */
  private notePlan(path: string, text: () => string): AutoCirclePlan | null {
    const kind = circleNoteKind(path, this.settings.weekFolder, this.settings.dayFolder);
    if (!kind) return null;
    try {
      return planAutoCircles(text(), kind, this.squareSet(kind), circlePropertyNames(this.settings.circleProperty));
    } catch (e) {
      console.error(`week-life-circles: cannot read the circle of ${path}`, e);
      return null;
    }
  }

  /**
   * Obsidian shows the note name at the top of notes (Settings → Appearance → Show inline
   * title): read from an inline title element when one exists, else the last known answer
   * (the default, on, until a note is open).
   */
  private titleShown(): boolean {
    const el = activeDocument.querySelector('.workspace-leaf .inline-title');
    if (el) this.titleVisible = getComputedStyle(el).display !== 'none';
    return this.titleVisible;
  }

  /** Circles for the note's first line: only when there is no inline title to show them in. */
  autoCirclePlan(path: string, text: () => string): AutoCirclePlan | null {
    if (this.titleShown() || !this.isAnyNotePath(path)) return null;
    const plan = this.notePlan(path, text);
    this.autoCircleSigs.set(path, planSignature(plan));
    return plan;
  }

  renderAutoCircles(keys: string[], atEnd: boolean, shape: AutoCirclePlan['shape']): HTMLElement {
    const squares = markerSquares(this.settings);
    const cls = [AUTO_CIRCLE_CLASS, ...(atEnd ? ['is-end'] : []), ...(shape === 'square' ? ['is-square'] : [])];
    const wrap = createSpan({ cls: cls.join(' '), attr: { contenteditable: 'false' } });
    const names = keys.map(k => squares.find(q => q.key === k)?.name ?? k);
    wrap.setAttr('aria-label', names.join(', '));
    for (const key of keys) wrap.createSpan({ cls: `sq ${squareClass(key)}` });
    decorateSquares(wrap, squares, this.squareImageUrl);
    return wrap;
  }

  /** Draw (or clear) the circles in the inline title of every open note; the title text is never touched. */
  private syncTitles(path?: string): void {
    const before = this.titleVisible;
    const show = this.titleShown();
    // the title appeared or vanished: the first-line circles must follow
    if (show !== before) { this.refreshAutoCircles(); return; }
    const squares = markerSquares(this.settings);
    this.app.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      if (path && view.file?.path !== path) return;
      const file = view.file;
      const plan = show && file ? this.notePlan(file.path, () => view.getViewData()) : null;
      view.containerEl.querySelectorAll<HTMLElement>('.inline-title').forEach(el => {
        if (!plan) { clearTitle(el); return; }
        const circles = plan.keys.map(k => {
          const q = squares.find(s => s.key === k);
          return { color: q?.color ?? null, url: q && !q.color ? this.squareImageUrl(squareImage(q)) : null };
        });
        el.addClass(TITLE_CLASS);
        el.setAttr('data-wcg-circles', plan.keys.map(k => squares.find(s => s.key === k)?.name ?? k).join(', '));
        el.setCssProps(titleCircleProps(circles, plan.shape));
      });
    });
  }

  private clearTitles(): void {
    activeDocument.querySelectorAll<HTMLElement>(`.inline-title.${TITLE_CLASS}`).forEach(clearTitle);
  }

  /** A note's text changed: re-render it in reading view when the circles it shows changed. */
  private onNoteChanged(file: TFile, data: string): void {
    if (this.isAnyNotePath(file.path)) this.syncTitles(file.path);
    const before = this.autoCircleSigs.get(file.path);
    if (before === undefined) return; // not open, or not a week/day note
    const plan = this.autoCirclePlan(file.path, () => data);
    if (planSignature(plan) !== before) this.rerenderReading(file.path);
  }

  /** Re-render week/day notes open in reading view (all of them, or the one at `path`). */
  private rerenderReading(path?: string): void {
    this.app.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !view.file || view.getMode() !== 'preview') return;
      if (path ? view.file.path !== path : !this.isAnyNotePath(view.file.path)) return;
      view.previewMode.rerender(true);
    });
  }

  /** Settings changed: redraw every circle drawn from a note property. */
  private refreshAutoCircles(): void {
    this.autoCircleVersion++;
    this.autoCircleSigs.clear();
    refreshEditorCircles();
    this.rerenderReading();
    this.syncTitles();
  }

  private isAnyNotePath(path: string): boolean {
    return circleNoteKind(path, this.settings.weekFolder, this.settings.dayFolder) !== null;
  }

  /** Resource URL of a vault image by name (for image squares drawn as a class span in notes). */
  private readonly squareImageUrl = (name: string): string | null => {
    const f = this.app.metadataCache.getFirstLinkpathDest(name, '');
    return f ? this.app.vault.getResourcePath(f) : null;
  };

  // ── Persistence / settings ──────────────────────────────────────────────

  async persist(): Promise<void> {
    const data: SavedData = {
      settings: this.settings,
      cells: this.weekCells,
      builtAt: this.weekBuiltAt,
      dayCells: this.dayCells,
      dayBuiltAt: this.dayBuiltAt,
    };
    await this.saveData(data);
  }

  /** data.json was changed from outside (sync from another device): adopt it instead of overwriting it. */
  async onExternalSettingsChange(): Promise<void> {
    const { data } = migrate(await this.loadData());
    Object.assign(this.settings, normalizeSettings(data.settings));
    this.syncLanguage();
    this.weekCells = data.cells ?? {};
    this.weekBuiltAt = data.builtAt ?? 0;
    this.dayCells = data.dayCells ?? {};
    this.dayBuiltAt = data.dayBuiltAt ?? 0;
    this.rebuildCalendar();
    this.syncMobileButton();
    this.refreshSquares();
    this.debounce.run('auto-circles', 300, () => this.refreshAutoCircles()); // settings save per keystroke
    this.debounce.run('apply-settings', 400, () => { void this.applySettings(); });
  }

  /** Called by the setting tab after it edited `settings` in place. */
  /** Show or remove the floating grid button (mobile only), following settings.showMobileButton. */
  private syncMobileButton(): void {
    const want = Platform.isMobile && this.settings.showMobileButton && !this.unloaded;
    if (want && !this.fab) {
      this.fab = activeDocument.body.createEl('button', {
        cls: 'wcg-fab',
        attr: { 'aria-label': 'Week Life Circles' },
      });
      makeIcon(this.fab, ICON_CALENDAR);
      this.fab.addEventListener('click', () => { void this.activateWeekView(); });
    } else if (!want && this.fab) {
      this.fab.remove();
      this.fab = null;
    }
  }

  async saveSettings(): Promise<void> {
    this.syncLanguage(); // the language picker and an imported config both land here
    this.syncMobileButton();
    this.rebuildCalendar();
    this.refreshSquares();
    this.debounce.run('auto-circles', 300, () => this.refreshAutoCircles()); // settings save per keystroke
    await this.persist();
    // Settings are saved per keystroke; the expensive follow-up waits for a pause.
    this.debounce.run('apply-settings', 400, () => { void this.applySettings(); });
  }

  /** Rebuild whichever cache the new settings invalidated, then redraw the open grids. */
  private async applySettings(): Promise<void> {
    const inputs = this.currentCacheInputs();
    try {
      if (inputs.week !== this.cacheInputs.week) {
        await this.rebuildWeekCache();
        this.cacheInputs.week = inputs.week;
      }
      // Day cells are keyed by the personal calendar: without one there is nothing to build.
      if (inputs.day !== this.cacheInputs.day && this.calendar) {
        await this.rebuildDayCache();
        this.cacheInputs.day = inputs.day;
      }
    } catch (e) {
      console.error('week-life-circles: cache rebuild failed', e);
    }
    this.refreshViews(WEEK_VIEW_TYPE);
    this.refreshViews(DAY_VIEW_TYPE);
  }

  private currentCacheInputs(): Record<Kind, string> {
    const s = this.settings;
    const keys = this.squareKeys('week');
    const names = s.squares.map(q => q.name);
    const dayKeys = this.squareKeys('day');
    const dayNames = daySquareSet(s).map(q => q.name);
    return {
      // circle names count too: a property value may name a circle
      week: JSON.stringify([s.weekFolder, keys, s.circleProperty, names]),
      day: JSON.stringify([s.dayFolder, dayKeys, s.circleProperty, dayNames, s.birthDate, s.startAtCurrentYear, s.startAge, s.endAge, s.yearStart, s.yearStartDate]),
    };
  }

  private syncLanguage(): void {
    applyLanguage(this.settings.language, obsidianLocale());
  }

  private rebuildCalendar(): void {
    const b = parseBirthDate(this.settings.birthDate);
    const a = resolveAnchor(this.settings);
    if (!b || !a) {
      this.calendar = null;
      this.currentAge = null;
      this.ageRange = ageRange(this.settings, null);
      return;
    }
    const anchor = { anchorMonth: a.month, anchorDay: a.day };
    // The year you are in now, counted from birth (a probe calendar that starts at 0).
    const currentAge = new Calendar({ ...b, ...anchor, startAge: 0, endAge: this.settings.endAge }).personalYearWeek().yy;
    this.currentAge = currentAge;
    this.ageRange = ageRange(this.settings, currentAge);
    this.calendar = new Calendar({ ...b, ...anchor, ...this.ageRange });
  }

  private scheduleCacheSave(): void {
    this.debounce.run('save', 2000, () => { void this.persist(); });
  }

  // ── GridHost / ModalHost ────────────────────────────────────────────────

  setCellShape(shape: CellShape): void {
    this.settings.cellShape = shape;
    void this.persist(); // only the look changed: no cache rebuild
    this.refreshViews(WEEK_VIEW_TYPE);
    this.refreshViews(DAY_VIEW_TYPE);
  }

  setTransposed(v: boolean): void {
    this.transposed = v;
    this.refreshViews(WEEK_VIEW_TYPE);
  }

  openCreateWeek(yy: number, ww: number): void {
    new CreateWeekModal(this, { ww, yy }).open();
  }

  openCreateDay(yy: number, doy: number): void {
    new CreateDayModal(this, { yy, doy }).open();
  }

  openSettings(): void {
    const setting = (this.app as unknown as Record<string, unknown>).setting;
    if (isSettingModal(setting)) {
      try {
        setting.open();
        setting.openTabById(this.manifest.id);
        return;
      } catch (e) {
        console.error('week-life-circles: cannot open the settings tab', e);
      }
    }
    new Notice(t('notes.grid.settingsWhere'));
  }

  // ── Views ───────────────────────────────────────────────────────────────

  private refreshViews(type: string): void {
    for (const leaf of this.app.workspace.getLeavesOfType(type)) {
      if (leaf.view instanceof GridView) void leaf.view.refresh();
    }
  }

  private scheduleRerender(kind: Kind): void {
    this.debounce.run(`${kind}-render`, 300, () => this.refreshViews(kind === 'week' ? WEEK_VIEW_TYPE : DAY_VIEW_TYPE));
  }

  /** Bring the view of `type` to the front, opening it in a new tab if there is none. */
  private async revealView(type: string): Promise<WorkspaceLeaf> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(type)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type, active: true });
    }
    await workspace.revealLeaf(leaf);
    return leaf;
  }

  /** Open the week grid; with a `target`, also scroll to that week and flash it. */
  async activateWeekView(target?: { ww: number; yy: number } | null): Promise<void> {
    const leaf = await this.revealView(WEEK_VIEW_TYPE);
    if (target && leaf.view instanceof WeekCalendarView) {
      await leaf.view.focusCell(`[data-ww="${target.ww}"][data-yy="${target.yy}"]`);
    }
  }

  async activateDayView(): Promise<void> {
    await this.revealView(DAY_VIEW_TYPE);
  }

  private nextWeekToCreate(): { yy: number; ww: number } | null {
    if (!this.calendar) return null;
    const { yy, ww: todayWW } = this.calendar.personalYearWeek();
    let maxWW = 0;
    for (let w = 1; w <= WEEKS_PER_YEAR; w++) {
      if (this.app.vault.getAbstractFileByPath(weekNotePath(this.settings.weekFolder, yy, w))) maxWW = w;
    }
    if (maxWW === 0) return { yy, ww: todayWW };
    if (maxWW + 1 > WEEKS_PER_YEAR) return { yy: yy + 1, ww: 1 };
    return { yy, ww: maxWW + 1 };
  }

  // ── Caches ──────────────────────────────────────────────────────────────

  /** Is `path` a week/day note: inside the configured folder, with a matching file name? */
  private isNotePath(kind: Kind, path: string): boolean {
    return circleNoteKind(path, this.settings.weekFolder, this.settings.dayFolder) === kind;
  }

  private noteFiles(kind: Kind): TFile[] {
    // Walk only the notes folder — never the whole vault.
    const folder = kind === 'week' ? this.settings.weekFolder : this.settings.dayFolder;
    const out: TFile[] = [];
    const walk = (node: TAbstractFile | null): void => {
      if (node instanceof TFolder) node.children.forEach(walk);
      else if (node instanceof TFile && this.isNotePath(kind, node.path)) out.push(node);
    };
    walk(this.app.vault.getAbstractFileByPath(folder));
    return out;
  }

  /** The circles of week notes, or of day notes (the day set when it is on). */
  private squareSet(kind: Kind): Settings['squares'] {
    return kind === 'week' ? this.settings.squares : daySquareSet(this.settings);
  }

  private squareKeys(kind: Kind): string[] {
    return this.squareSet(kind).map(s => s.key);
  }

  /** Where notes keep their circle as a frontmatter property (read whatever the marker style). */
  private circleProp(kind: Kind): CircleProperty {
    return { names: circlePropertyNames(this.settings.circleProperty), squares: this.squareSet(kind) };
  }

  private readFile = (f: TFile): Promise<string> => this.app.vault.cachedRead(f);

  /** Run `job` after every cache job queued before it. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = this.cacheQueue.then(job);
    this.cacheQueue = result.catch(() => undefined);
    return result;
  }

  /** `read` for one note of a rebuild; a note that vanished meanwhile is skipped, not fatal. */
  private async tryRead<T>(file: TFile, read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch (e) {
      console.error(`week-life-circles: cannot read ${file.path}`, e);
      return null;
    }
  }

  /** Store a rebuilt cache; data.json is only rewritten when the cells actually changed. */
  private async storeCells(kind: Kind, cells: CellMap): Promise<CellMap> {
    const week = kind === 'week';
    const old = week ? this.weekCells : this.dayCells;
    const fresh = (week ? this.weekBuiltAt : this.dayBuiltAt) === 0 || JSON.stringify(old) !== JSON.stringify(cells);
    if (week) this.weekCells = cells; else this.dayCells = cells;
    if (fresh) {
      if (week) this.weekBuiltAt = Date.now(); else this.dayBuiltAt = Date.now();
      await this.persist();
    }
    return cells;
  }

  private async rebuildAndRerender(kind: Kind): Promise<void> {
    try {
      await (kind === 'week' ? this.rebuildWeekCache() : this.rebuildDayCache());
    } catch (e) {
      console.error('week-life-circles: cache rebuild failed', e);
    }
    this.scheduleRerender(kind);
  }

  rebuildWeekCache(): Promise<CellMap> {
    return this.enqueue(() => this.buildWeekCache());
  }

  rebuildDayCache(): Promise<CellMap> {
    return this.enqueue(() => this.buildDayCache());
  }

  /** Re-read the notes modified since the last flush and patch their cells. */
  private flushModified(kind: Kind): Promise<void> {
    return this.enqueue(() => this.patchModified(kind)).catch(e => {
      console.error('week-life-circles: cache update failed', e);
    });
  }

  private async patchModified(kind: Kind): Promise<void> {
    const paths = [...this.modified[kind]];
    this.modified[kind].clear();
    let needsRebuild = false;
    for (const path of paths) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const patched = await this.tryRead(file, async () =>
        kind === 'day' ? (await this.updateDayCell(file), true) : this.updateWeekCell(file));
      if (patched === false) needsRebuild = true;
    }
    if (needsRebuild) await this.buildWeekCache(); // already inside the queue
    else this.scheduleCacheSave();
    this.scheduleRerender(kind);
  }

  /** Patch the cell of one week note. Returns false for a multi-week note, which needs a full rebuild. */
  private async updateWeekCell(file: TFile): Promise<boolean> {
    const p = parseWeekFilename(file.name);
    if (!p) return true;
    const { squares, startWW, endWW } = await readWeekData(this.readFile, file, this.squareKeys('week'), this.circleProp('week'));
    // span file — continuation cells may have changed
    if (squares.length > 1 || (startWW !== null && endWW !== null)) return false;
    const yyk = String(p.yy), wwk = String(p.ww);
    const year = this.weekCells[yyk] ?? (this.weekCells[yyk] = {});
    // it used to be a span file: its old continuation cells must go
    if (Object.entries(year).some(([k, c]) => k !== wwk && c.path === file.path)) return false;
    year[wwk] = { square: squares[0] || null, path: file.path };
    return true;
  }

  private async buildWeekCache(): Promise<CellMap> {
    const keys = this.squareKeys('week');
    const prop = this.circleProp('week');

    type Entry = { squares: string[]; startWW: number | null; endWW: number | null; path: string; ww: number; yy: number };
    const entries = await mapChunked(this.noteFiles('week'), READ_CHUNK, async (file): Promise<Entry | null> => {
      const p = parseWeekFilename(file.name);
      if (!p) return null;
      const data = await this.tryRead(file, () => readWeekData(this.readFile, file, keys, prop));
      return data && { ...data, path: file.path, ww: p.ww, yy: p.yy };
    });
    const fileMap: Record<string, Record<string, Entry>> = {};
    for (const e of entries) {
      if (!e) continue;
      const yyk = String(e.yy);
      if (!fileMap[yyk]) fileMap[yyk] = {};
      fileMap[yyk][String(e.ww)] = e;
    }

    const cells: CellMap = {};
    const setCell = (ww: number, yy: number, square: string | null, path: string, overwrite: boolean): void => {
      if (ww < 1 || ww > WEEKS_PER_YEAR) return;
      const yyk = String(yy), wwk = String(ww);
      if (!cells[yyk]) cells[yyk] = {};
      if (overwrite || !cells[yyk][wwk]) cells[yyk][wwk] = { square: square || null, path };
    };

    // Sub-pass A — continuation cells (no overwrite)
    for (const year of Object.values(fileMap)) {
      for (const { squares, startWW, endWW, path, ww, yy } of Object.values(year)) {
        if (squares.length <= 1) continue;

        let sWW: number, eWW: number;
        if (startWW !== null && endWW !== null) {
          sWW = startWW; eWW = endWW;
        } else {
          let forward = true;
          for (let i = 1; i < squares.length; i++) {
            if (year[String(ww + i)] || ww + i > WEEKS_PER_YEAR) { forward = false; break; }
          }
          sWW = forward ? ww : ww - squares.length + 1;
          eWW = forward ? ww + squares.length - 1 : ww;
        }

        const len = eWW - sWW + 1;
        for (let i = 0; i < Math.min(squares.length, len); i++) setCell(sWW + i, yy, squares[i], path, false);
      }
    }

    // Sub-pass B — direct cells (always overwrite)
    for (const year of Object.values(fileMap)) {
      for (const { squares, startWW, endWW, path, ww, yy } of Object.values(year)) {
        let ownSquare: string | null = squares[0] || null;
        if (squares.length > 1 && startWW !== null && endWW !== null) {
          const idx = ww - startWW;
          if (idx >= 0 && idx < squares.length) ownSquare = squares[idx];
        }
        setCell(ww, yy, ownSquare, path, true);
      }
    }

    return this.storeCells('week', cells);
  }

  private async updateDayCell(file: TFile): Promise<void> {
    const p = parseDayFilename(file.name);
    const pers = p ? this.calendar?.dateToPersonal(p.y, p.m, p.d) : null;
    if (!pers) return;
    const { square } = await readDayData(this.readFile, file, this.squareKeys('day'), this.circleProp('day'));
    const yyk = String(pers.yy);
    if (!this.dayCells[yyk]) this.dayCells[yyk] = {};
    this.dayCells[yyk][String(pers.doy)] = { square: square || null, path: file.path };
  }

  private async buildDayCache(): Promise<CellMap> {
    const cal = this.calendar;
    // Day cells are keyed by the personal calendar: without one, keep what we have.
    if (!cal) return this.dayCells;
    const keys = this.squareKeys('day');
    const prop = this.circleProp('day');
    const entries = await mapChunked(this.noteFiles('day'), READ_CHUNK, async file => {
      const p = parseDayFilename(file.name);
      const pers = p ? cal.dateToPersonal(p.y, p.m, p.d) : null;
      if (!pers) return null;
      const data = await this.tryRead(file, () => readDayData(this.readFile, file, keys, prop));
      return data && { ...pers, square: data.square, path: file.path };
    });
    const cells: CellMap = {};
    for (const e of entries) {
      if (!e) continue;
      const yyk = String(e.yy);
      if (!cells[yyk]) cells[yyk] = {};
      cells[yyk][String(e.doy)] = { square: e.square || null, path: e.path };
    }
    return this.storeCells('day', cells);
  }

  // ── Circle property migration ───────────────────────────────────────────

  /** Dry run: plan which notes get the circle property, then let the user confirm. */
  private async openCircleMigration(): Promise<void> {
    const property = this.settings.circleProperty;
    const names = circlePropertyNames(property);
    const files = new Map<string, TFile>();
    const notes = (await mapChunked([...this.noteFiles('week'), ...this.noteFiles('day')], READ_CHUNK, async file => {
      const text = await this.tryRead(file, () => this.readFile(file));
      if (text === null) return null;
      files.set(file.path, file);
      const note: MigrationNote = { path: file.path, kind: this.isNotePath('week', file.path) ? 'week' : 'day', text };
      return note;
    })).filter((n): n is MigrationNote => n !== null);
    const sets = { week: this.settings.squares, day: daySquareSet(this.settings) };
    const plan = planCircleMigration(notes, sets, names);
    if (plan.items.length === 0) {
      new Notice(t('notes.migrate.nothing', { prop: property, has: plan.counts.hasProperty, unknown: plan.counts.unknown }));
      return;
    }
    new CircleMigrationModal(this.app, plan, property, async () => {
      let written = 0, failed = 0, changed = 0;
      for (const item of plan.items) {
        const file = files.get(item.path);
        if (!file || this.app.vault.getAbstractFileByPath(item.path) !== file) { failed++; continue; }
        try {
          // The dry run may be minutes old: plan this note again from its current text and
          // leave it alone if it changed meanwhile (other circles, or the property was added).
          const text = await this.app.vault.read(file); // not cachedRead: the text on disk now
          const replan = (cur: string) => planCircleMigration([{ path: item.path, kind: item.kind, text: cur }], sets, names).items[0];
          const now = replan(text);
          if (!now || JSON.stringify(now.values) !== JSON.stringify(item.values)) { changed++; continue; }
          // the property first: the marker is only removed once the circle is safe in the frontmatter
          if (item.values.length > 0) {
            await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
              if (Object.keys(fm).some(k => names.some(n => k.toLowerCase() === n.toLowerCase()))) return; // set meanwhile
              fm[property] = item.values.length === 1 ? item.values[0] : item.values;
            });
          }
          await this.app.vault.process(file, cur => {
            const p = replan(cur);
            return p && p.values.length === 0 ? stripInlineMarkers(cur, p.markerLine, sets[item.kind]) : cur;
          });
          written++;
        } catch (e) {
          console.error(`week-life-circles: cannot move the circle of ${item.path} into its property`, e);
          failed++;
        }
      }
      const parts = [failed > 0
        ? t('notes.migrate.doneFailed', { n: written, failed })
        : t('notes.migrate.done', { n: written })];
      if (changed > 0) parts.push(t('notes.migrate.doneChanged', { n: changed }));
      new Notice(parts.join(' '));
    }).open();
  }
}
