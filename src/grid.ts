import { App, TFile } from 'obsidian';
import { Calendar, WEEKS_PER_YEAR, formatYMD, pad2 } from './calendar';
import { Cell, CellMap, Settings } from './config';
import { colorMap } from './squares';

export interface GridHost {
  readonly app: App;
  readonly settings: Settings;
  calendar: Calendar | null; // null when settings.birthDate is unset/invalid
  weekCells: CellMap;
  dayCells: CellMap;
  weekBuiltAt: number; // 0 = cache never built
  dayBuiltAt: number;
  transposed: boolean; // week-grid orientation toggle
  /** Flips the orientation and re-renders the open week views. */
  setTransposed(v: boolean): void;
  rebuildWeekCache(): Promise<CellMap>;
  rebuildDayCache(): Promise<CellMap>;
  openCreateWeek(yy: number, ww: number): void;
  openCreateDay(yy: number, doy: number): void;
}

type Shape = { tag: keyof SVGElementTagNameMap; attrs: Record<string, string> };

/** Build a 24x24 stroke icon with DOM calls. */
export function makeIcon(parent: HTMLElement, shapes: Shape[]): void {
  parent.empty();
  const svg = parent.createSvg('svg', {
    attr: {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
  });
  for (const s of shapes) svg.createSvg(s.tag, { attr: s.attrs });
}

export const ICON_CALENDAR: Shape[] = [
  { tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '18', rx: '2' } },
  { tag: 'line', attrs: { x1: '16', y1: '2', x2: '16', y2: '6' } },
  { tag: 'line', attrs: { x1: '8', y1: '2', x2: '8', y2: '6' } },
  { tag: 'line', attrs: { x1: '3', y1: '10', x2: '21', y2: '10' } },
];
const ICON_ROWS: Shape[] = [
  { tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '6', rx: '1.5' } },
  { tag: 'rect', attrs: { x: '3', y: '14', width: '18', height: '6', rx: '1.5' } },
];
const ICON_COLS: Shape[] = [
  { tag: 'rect', attrs: { x: '4', y: '3', width: '6', height: '18', rx: '1.5' } },
  { tag: 'rect', attrs: { x: '14', y: '3', width: '6', height: '18', rx: '1.5' } },
];
const ICON_REFRESH: Shape[] = [
  { tag: 'path', attrs: { d: 'M21 12a9 9 0 1 1-2.64-6.36' } },
  { tag: 'path', attrs: { d: 'M21 3v6h-6' } },
];
const ICON_TODAY: Shape[] = [
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } },
  { tag: 'circle', attrs: { cx: '12', cy: '12', r: '9' } },
];

function iconButton(toolbar: HTMLElement, shapes: Shape[], label: string): HTMLButtonElement {
  const btn = toolbar.createEl('button', { cls: 'wcg-icon-btn', attr: { type: 'button' } });
  makeIcon(btn, shapes);
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  return btn;
}

/** Scroll a cell into view and flash it. */
export function flashCell(cell: HTMLElement): void {
  cell.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  cell.classList.add('wcg-flash');
  window.setTimeout(() => cell.classList.remove('wcg-flash'), 1200);
}

const isDecadeStart = (yy: number): boolean => yy % 10 === 1;

interface Shell { root: HTMLElement; stickyTop: HTMLElement; toolbar: HTMLElement; info: HTMLElement }

/** Empty `el` and build the frame both grids share: sticky toolbar with title + counter. */
function renderShell(el: HTMLElement, title: string, rootCls: string): Shell {
  el.empty();
  const root = el.createDiv({ cls: rootCls });
  const stickyTop = root.createDiv({ cls: 'wcg-sticky-top' });
  const toolbar = stickyTop.createDiv({ cls: 'wcg-toolbar' });
  const titleWrap = toolbar.createDiv({ cls: 'wcg-title-wrap' });
  titleWrap.createDiv({ cls: 'wcg-title', text: title });
  const info = titleWrap.createSpan({ cls: 'wcg-cache-info' });
  return { root, stickyTop, toolbar, info };
}

function renderNoBirthDate(el: HTMLElement): void {
  el.empty();
  el.createDiv({
    cls: 'wcg-status',
    text: 'Set your birth date in the plugin settings to see your calendar.',
  });
}

/** Toolbar button that rebuilds a cache (spinning meanwhile), then re-renders. */
function rebuildButton(toolbar: HTMLElement, label: string, rebuild: () => Promise<unknown>, rerender: () => Promise<void>): void {
  const btn = iconButton(toolbar, ICON_REFRESH, label);
  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.classList.add('wcg-spin');
    // re-render even if the rebuild failed, so the button does not stay disabled
    void rebuild().catch(e => console.error('week-life-circles: cache rebuild failed', e)).then(rerender);
  });
}

/** The cached cells, building the cache first (with a status line) if it never was. */
async function ensureCells(
  root: HTMLElement, statusText: string, cells: CellMap, builtAt: number, rebuild: () => Promise<CellMap>,
): Promise<CellMap> {
  if (builtAt !== 0) return cells;
  const st = root.createDiv({ cls: 'wcg-status', text: statusText });
  try {
    return await rebuild();
  } catch (e) {
    console.error('week-life-circles: cache build failed', e);
    return cells;
  } finally {
    st.remove();
  }
}

function countCells(cells: CellMap): number {
  return Object.values(cells).reduce((n, y) => n + Object.keys(y).length, 0);
}

/** Header row of personal-year labels (the columns of the default week grid and of the day grid). */
function renderYearHeader(stickyTop: HTMLElement, years: number[], curYY: number | null): void {
  const header = stickyTop.createDiv({ cls: 'wcg-row wcg-header' });
  header.createDiv({ cls: 'wcg-ww-label' });
  for (const yy of years) {
    let cls = 'wcg-year-label';
    if (yy === curYY) cls += ' wcg-cur-year';
    if (isDecadeStart(yy)) cls += ' wcg-decade-start';
    header.createDiv({ cls, text: String(yy) });
  }
}

function cellClass(colOffset: boolean, isCur: boolean, filled: boolean, past: boolean): string {
  let cls = 'wcg-cell';
  if (colOffset) cls += ' wcg-col-offset';
  if (isCur) cls += ' wcg-cur-cell';
  if (!filled) cls += past ? ' wcg-past' : ' wcg-future';
  return cls;
}

/** Returns a function that fills a cell with its link (colour or image square) and click-to-open. */
function linkFiller(host: GridHost): (cell: HTMLElement, d: Cell) => void {
  const colors = colorMap(host.settings.squares);
  const imageUrls = new Map<string, string | null>();
  // Only used for image-based squares (flags, photos, etc.)
  const imageUrl = (key: string): string | null => {
    let url = imageUrls.get(key);
    if (url === undefined) {
      const f = host.app.metadataCache.getFirstLinkpathDest(key, '');
      url = f ? host.app.vault.getResourcePath(f) : null;
      imageUrls.set(key, url);
    }
    return url;
  };
  return (cell, d) => {
    const a = cell.createEl('a', { cls: 'wcg-link', attr: { title: d.path.split('/').pop() ?? d.path } });
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const f = host.app.vault.getAbstractFileByPath(d.path);
      if (f instanceof TFile) void host.app.workspace.getLeaf(false).openFile(f);
    });
    if (!d.square) return;
    const color = Object.prototype.hasOwnProperty.call(colors, d.square) ? colors[d.square] : null;
    if (color) {
      a.setCssProps({ '--wcg-color': color });
    } else {
      const url = imageUrl(d.square);
      if (url) a.createEl('img', { attr: { src: url, loading: 'lazy' } });
    }
  };
}

export async function renderWeekGrid(el: HTMLElement, host: GridHost): Promise<void> {
  const cal = host.calendar;
  if (cal === null) { renderNoBirthDate(el); return; }

  const { root, stickyTop, toolbar, info } = renderShell(el, 'Life in weeks', 'wcg-view-root');
  const transposed = host.transposed;
  const rotateBtn = iconButton(
    toolbar,
    transposed ? ICON_COLS : ICON_ROWS,
    transposed ? 'Show weeks as rows' : 'Show years as rows',
  );
  rotateBtn.addEventListener('click', () => host.setTransposed(!host.transposed));
  rebuildButton(toolbar, 'Rebuild calendar cache', () => host.rebuildWeekCache(), () => renderWeekGrid(el, host));

  const cells = await ensureCells(root, 'Building cache…', host.weekCells, host.weekBuiltAt, () => host.rebuildWeekCache());
  info.setText(`${countCells(cells)} weeks`);

  const fillLink = linkFiller(host);
  const { startAge, endAge } = host.settings;
  const { yy: curYY, ww: curWW } = cal.personalYearWeek();
  const years = Array.from({ length: endAge - startAge + 1 }, (_, i) => i + startAge);
  const weeks = Array.from({ length: WEEKS_PER_YEAR }, (_, i) => i + 1);

  // isPast: year < current, or same year and week <= current
  const isPast = (yy: number, ww: number): boolean => yy < curYY || (yy === curYY && ww <= curWW);

  const wrap = root.createDiv({ cls: 'wcg-wrap' });

  const makeCell = (parent: HTMLElement, yy: number, ww: number, colIndex: number): HTMLElement => {
    const d = cells[String(yy)]?.[String(ww)];
    const cls = cellClass(colIndex % 2 === 1, yy === curYY && ww === curWW, !!d, isPast(yy, ww));
    const cell = parent.createDiv({ cls, attr: { 'data-yy': String(yy), 'data-ww': String(ww) } });
    if (d) {
      fillLink(cell, d);
    } else {
      cell.setAttribute('title', `Create ${pad2(ww)}.${pad2(yy)}`);
      cell.addEventListener('click', () => host.openCreateWeek(yy, ww));
    }
    return cell;
  };

  if (!transposed) {
    // Default: rows = weeks, columns = years
    renderYearHeader(stickyTop, years, curYY);
    for (const ww of weeks) {
      const row = wrap.createDiv({ cls: 'wcg-row' + (ww === curWW ? ' wcg-cur-week' : '') });
      row.createDiv({ cls: 'wcg-ww-label', text: pad2(ww) });
      for (const yy of years) {
        const cell = makeCell(row, yy, ww, yy - startAge);
        if (isDecadeStart(yy)) cell.addClass('wcg-decade-start');
      }
    }
  } else {
    // Transposed: rows = years, columns = weeks
    const header = stickyTop.createDiv({ cls: 'wcg-row wcg-header' });
    header.createDiv({ cls: 'wcg-ww-label' });
    for (const ww of weeks) {
      header.createDiv({ cls: 'wcg-year-label' + (ww === curWW ? ' wcg-cur-year' : ''), text: pad2(ww) });
    }
    for (const yy of years) {
      let rowCls = 'wcg-row';
      if (yy === curYY) rowCls += ' wcg-cur-week';
      if (isDecadeStart(yy)) rowCls += ' wcg-decade-top';
      const row = wrap.createDiv({ cls: rowCls });
      row.createDiv({ cls: 'wcg-ww-label' + (yy === curYY ? ' wcg-cur-year-lbl' : ''), text: String(yy) });
      for (const ww of weeks) makeCell(row, yy, ww, ww - 1);
    }
  }
}

export async function renderDayGrid(el: HTMLElement, host: GridHost): Promise<void> {
  const cal = host.calendar;
  if (cal === null) { renderNoBirthDate(el); return; }

  const { root, stickyTop, toolbar, info } = renderShell(el, 'Life in days', 'wcg-view-root wcg-day-mode');
  const todayBtn = iconButton(toolbar, ICON_TODAY, 'Scroll to today');
  rebuildButton(toolbar, 'Rebuild day cache', () => host.rebuildDayCache(), () => renderDayGrid(el, host));

  const cells = await ensureCells(root, 'Building day cache…', host.dayCells, host.dayBuiltAt, () => host.rebuildDayCache());
  info.setText(`${countCells(cells)} days`);

  const fillLink = linkFiller(host);
  const today = new Date();
  const todayP = cal.dateToPersonal(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const curYY = todayP?.yy ?? null;
  const curDOY = todayP?.doy ?? null;

  // Day view shows 10 years starting at the current personal year.
  const DAY_VIEW_YEARS = 10;
  const startYY = curYY ?? host.settings.startAge;
  const years = Array.from({ length: DAY_VIEW_YEARS }, (_, i) => i + startYY);
  const yearLen = new Map(years.map(yy => [yy, cal.personalYearDays(yy)]));

  const isPast = (yy: number, doy: number): boolean => {
    if (curYY == null || curDOY == null) return false;
    return yy < curYY || (yy === curYY && doy < curDOY);
  };

  renderYearHeader(stickyTop, years, curYY);
  const wrap = root.createDiv({ cls: 'wcg-wrap' });

  // 1 row per day-of-personal-year. Label = day number from birthday.
  for (let doy = 1; doy <= 366; doy++) {
    const row = wrap.createDiv({ cls: 'wcg-row' + (doy === curDOY ? ' wcg-cur-week' : '') });
    row.createDiv({ cls: 'wcg-ww-label', text: String(doy) });

    for (const yy of years) {
      const colOff = (yy - startYY) % 2 === 1;
      let cell: HTMLElement;
      if (doy > (yearLen.get(yy) ?? 0)) {
        // Beyond the personal year's length (doy=366 in a 365-day year) → invisible placeholder
        cell = row.createDiv({ cls: 'wcg-cell wcg-cell-empty' + (colOff ? ' wcg-col-offset' : '') });
      } else {
        const d = cells[String(yy)]?.[String(doy)];
        const cls = cellClass(colOff, yy === curYY && doy === curDOY, !!d, isPast(yy, doy));
        cell = row.createDiv({ cls, attr: { 'data-yy': String(yy), 'data-doy': String(doy) } });
        if (d) {
          fillLink(cell, d);
        } else {
          cell.setAttribute('title', `Create ${formatYMD(cal.personalToDate(yy, doy))}`);
          cell.addEventListener('click', () => host.openCreateDay(yy, doy));
        }
      }
      if (isDecadeStart(yy)) cell.addClass('wcg-decade-start');
    }
  }

  const todayCell = (): HTMLElement | null =>
    curYY == null || curDOY == null
      ? null
      : root.querySelector<HTMLElement>(`[data-yy="${curYY}"][data-doy="${curDOY}"]`);

  todayBtn.addEventListener('click', () => {
    const cell = todayCell();
    if (cell) flashCell(cell);
  });

  // Wait two frames so the grid has actually laid out before we scroll
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    todayCell()?.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
  }));
}
