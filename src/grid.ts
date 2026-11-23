import { App, TFile } from 'obsidian';
import { Calendar, WEEKS_PER_YEAR, formatYMD, pad2 } from './calendar';
import { Cell, CellMap, CellShape, Settings } from './config';
import { colorMap, squareImage } from './squares';
import { dayLabel, isMonthStart } from './months';
import { momentFmt } from './momentFmt';
import { BASE_CELL, LABEL_W, isAlignedShape, isPageStart, nextCellShape, pageTarget, pagedCellSize, swipeStep } from './layout';

export interface GridHost {
  readonly app: App;
  readonly settings: Settings;
  calendar: Calendar | null; // null when settings.birthDate is unset/invalid
  /** First and last grid year in use (from the current year, or the manual start age). */
  ageRange: { startAge: number; endAge: number };
  weekCells: CellMap;
  dayCells: CellMap;
  weekBuiltAt: number; // 0 = cache never built
  dayBuiltAt: number;
  transposed: boolean; // week-grid orientation toggle
  /** Flips the orientation and re-renders the open week views. */
  setTransposed(v: boolean): void;
  /** Saves the cell shape and re-renders the open week and day views. */
  setCellShape(shape: CellShape): void;
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
const ICON_SHAPE: Record<CellShape, Shape[]> = {
  circle: [
    { tag: 'circle', attrs: { cx: '7', cy: '8', r: '3.5' } },
    { tag: 'circle', attrs: { cx: '17', cy: '8', r: '3.5' } },
    { tag: 'circle', attrs: { cx: '12', cy: '16.5', r: '3.5' } },
  ],
  square: [
    { tag: 'rect', attrs: { x: '4', y: '4', width: '7', height: '7', rx: '1.5' } },
    { tag: 'rect', attrs: { x: '13', y: '4', width: '7', height: '7', rx: '1.5' } },
    { tag: 'rect', attrs: { x: '4', y: '13', width: '7', height: '7', rx: '1.5' } },
    { tag: 'rect', attrs: { x: '13', y: '13', width: '7', height: '7', rx: '1.5' } },
  ],
  dots: [
    { tag: 'circle', attrs: { cx: '7.5', cy: '7.5', r: '3.5' } },
    { tag: 'circle', attrs: { cx: '16.5', cy: '7.5', r: '3.5' } },
    { tag: 'circle', attrs: { cx: '7.5', cy: '16.5', r: '3.5' } },
    { tag: 'circle', attrs: { cx: '16.5', cy: '16.5', r: '3.5' } },
  ],
};
const SHAPE_NAME: Record<CellShape, string> = { circle: 'Honeycomb', square: 'Squares', dots: 'Circles in columns' };
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

/** The decade page's first cell in `cell`'s row (the cell itself if it starts a page). */
function pageStartOf(cell: HTMLElement): HTMLElement {
  for (let c: Element | null = cell; c; c = c.previousElementSibling) {
    if (c.instanceOf(HTMLElement) && c.hasClass('wcg-page-start')) return c;
  }
  return cell;
}

/** scrollLeft that puts `cell` flush against the frozen label column. */
function leftFor(root: HTMLElement, cell: HTMLElement): number {
  return root.scrollLeft + cell.getBoundingClientRect().left - root.getBoundingClientRect().left - LABEL_W;
}

/**
 * Bring a cell into view, vertically centred. Unpaged: centred sideways too.
 * Paged: show the cell's whole decade — centring would let the mandatory snap
 * pick the next decade for a cell in a decade's second half.
 */
export function revealCell(cell: HTMLElement, behavior: ScrollBehavior = 'auto'): void {
  const root = cell.closest<HTMLElement>('.wcg-view-root');
  if (!root?.hasClass('wcg-paged')) {
    cell.scrollIntoView({ behavior, block: 'center', inline: 'center' });
    return;
  }
  const r = cell.getBoundingClientRect();
  const v = root.getBoundingClientRect();
  root.scrollTo({
    left: leftFor(root, pageStartOf(cell)),
    top: root.scrollTop + (r.top + r.height / 2) - (v.top + root.clientHeight / 2),
    behavior,
  });
}

/** Scroll a cell into view and flash it. */
export function flashCell(cell: HTMLElement): void {
  revealCell(cell, 'smooth');
  cell.classList.add('wcg-flash');
  window.setTimeout(() => cell.classList.remove('wcg-flash'), 1200);
}

const isDecadeStart = (yy: number): boolean => yy % 10 === 1;

/** Cell size each view's outer element was last paged at (absent = full size). */
const pagedSizes = new WeakMap<HTMLElement, number>();

/**
 * Decade paging for narrow views: when 10 year-columns don't fit at full size,
 * shrink the cells so exactly 10 do and snap sideways scrolling to decade
 * starts (one swipe = one decade); otherwise restore full size and free
 * scrolling. Only grids whose columns are years (cells marked
 * `wcg-page-start`) page. Safe to call repeatedly, e.g. on every resize.
 */
export function applyPaging(outer: HTMLElement, root: HTMLElement, shape: CellShape): void {
  const pageable = !root.hasClass('wcg-transposed') && root.querySelector('.wcg-page-start') !== null;
  // hidden/unsized view (width 0) → pagedCellSize gives null → stays unpaged until a real width arrives
  const raw = pageable ? pagedCellSize(root.clientWidth - LABEL_W, shape) : null;
  // floor to 1/64px: rounding up could make 10 columns overflow by a pixel
  const size = raw === null ? null : Math.floor(raw * 64) / 64;
  const prevCell = pagedSizes.get(outer) ?? BASE_CELL;
  const nextCell = size ?? BASE_CELL;
  // Note the leftmost visible column BEFORE any style write: reading scroll
  // after the change would see an already clamped / re-snapped position.
  const anchor = nextCell !== prevCell ? firstVisibleCell(root) : null;
  if (size !== null) {
    outer.setCssProps({ '--wcg-cell': `${size}px` });
    root.addClass('wcg-paged');
    pagedSizes.set(outer, size);
  } else {
    outer.setCssProps({ '--wcg-cell': '' });
    root.removeClass('wcg-paged');
    pagedSizes.delete(outer);
  }
  // Cell size changed (rotation, split pane): keep the same column in view —
  // paged, on the page of the decade that contains it.
  if (anchor) root.scrollLeft = leftFor(root, size !== null ? pageStartOf(anchor) : anchor);
}

/** Flip a paged grid one decade forward (+1) or back (-1). */
function flipPage(root: HTMLElement, step: number): void {
  const row = root.querySelector<HTMLElement>('.wcg-wrap > .wcg-row');
  if (!row) return;
  const lefts = Array.from(row.querySelectorAll<HTMLElement>(':scope > .wcg-page-start')).map(c => leftFor(root, c));
  const left = pageTarget(lefts, root.scrollLeft, step);
  if (left !== null) root.scrollTo({ left, behavior: 'smooth' });
}

/**
 * Touch paging for narrow views. In paged mode native sideways panning is off
 * (CSS `touch-action: pan-y`, so iOS can't fling between decades), vertical
 * scrolling stays native, and a sideways swipe flips exactly one decade here.
 * A horizontal swipe isn't passed on, so it can't also open a sidebar.
 */
function attachDecadeSwipe(root: HTMLElement): void {
  let x0 = 0, y0 = 0, tracking = false, sideways: boolean | null = null;
  root.addEventListener('touchstart', (e) => {
    tracking = root.hasClass('wcg-paged') && e.touches.length === 1;
    sideways = null;
    if (tracking) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    if (e.touches.length !== 1) { tracking = false; return; }
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (sideways === null && Math.max(Math.abs(dx), Math.abs(dy)) > 8) sideways = Math.abs(dx) > Math.abs(dy);
    if (sideways) e.stopPropagation();
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const step = swipeStep(t.clientX - x0, t.clientY - y0);
    if (step !== 0) flipPage(root, step);
  }, { passive: true });
  root.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
}

/** Leftmost column cell not hidden under the frozen labels, or null when scrolled to the start. */
function firstVisibleCell(root: HTMLElement): HTMLElement | null {
  if (root.scrollLeft <= 0) return null;
  const row = root.querySelector<HTMLElement>('.wcg-wrap > .wcg-row');
  if (!row) return null;
  const edge = root.getBoundingClientRect().left + LABEL_W - 1;
  for (const c of Array.from(row.children)) {
    if (c.instanceOf(HTMLElement) && c.hasClass('wcg-cell') && c.getBoundingClientRect().left >= edge) return c;
  }
  return null;
}

/** Re-apply paging to the grid currently rendered inside `el` (no-op if there is none). */
export function reapplyPaging(el: HTMLElement, shape: CellShape): void {
  const outer = el.querySelector<HTMLElement>('.wcg-outer');
  const root = outer?.querySelector<HTMLElement>('.wcg-view-root');
  if (outer && root) applyPaging(outer, root, shape);
}

interface Shell { outer: HTMLElement; root: HTMLElement; headerTrack: HTMLElement; toolbar: HTMLElement; info: HTMLElement }

/** Empty `el` and build the frame both grids share: sticky toolbar with title + counter. */
function renderShell(el: HTMLElement, title: string, rootCls: string, shape: CellShape): Shell {
  el.empty();
  // Toolbar lives OUTSIDE the scroll area so it never scrolls off on a wide (phone) grid.
  const outer = el.createDiv({ cls: 'wcg-outer' });
  if (isAlignedShape(shape)) outer.addClass('wcg-aligned');
  if (shape === 'square') outer.addClass('wcg-shape-square');
  const toolbar = outer.createDiv({ cls: 'wcg-toolbar' });
  const titleWrap = toolbar.createDiv({ cls: 'wcg-title-wrap' });
  titleWrap.createDiv({ cls: 'wcg-title', text: title });
  const info = titleWrap.createSpan({ cls: 'wcg-cache-info' });
  // Column labels sit OUTSIDE the scroller (position: sticky let cells peek
  // above it on iOS) and slide sideways in step with the grid's scroll.
  const headerViewport = outer.createDiv({ cls: 'wcg-header-viewport' });
  const headerTrack = headerViewport.createDiv({ cls: 'wcg-header-track' });
  const root = outer.createDiv({ cls: rootCls });
  let scrollFrame = 0;
  root.addEventListener('scroll', () => {
    if (scrollFrame) return; // one header update per frame, however many scroll events fire
    scrollFrame = root.win.requestAnimationFrame(() => {
      scrollFrame = 0;
      headerTrack.setCssProps({ '--wcg-scroll-x': `${-root.scrollLeft}px` });
    });
  }, { passive: true });
  attachDecadeSwipe(root);
  return { outer, root, headerTrack, toolbar, info };
}

/** First toolbar button: shows the current view, a click switches to the next one. */
function shapeButton(toolbar: HTMLElement, host: GridHost): void {
  const cur = host.settings.cellShape;
  const next = nextCellShape(cur);
  const btn = iconButton(toolbar, ICON_SHAPE[cur], `View: ${SHAPE_NAME[cur]} — switch to ${SHAPE_NAME[next]}`);
  btn.addEventListener('click', () => host.setCellShape(next));
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
function renderYearHeader(headerTrack: HTMLElement, years: number[], curYY: number | null): void {
  const header = headerTrack.createDiv({ cls: 'wcg-row wcg-header' });
  header.createDiv({ cls: 'wcg-ww-label' });
  years.forEach((yy, i) => {
    let cls = 'wcg-year-label';
    if (yy === curYY) cls += ' wcg-cur-year';
    // no divider before the first column: it would double the week-number column's edge
    if (i > 0 && isDecadeStart(yy)) cls += ' wcg-decade-start';
    header.createDiv({ cls, text: String(yy) });
  });
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
  const pictureOf = new Map(host.settings.squares.filter(q => !q.color).map(q => [q.key, squareImage(q)]));
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
      const url = imageUrl(pictureOf.get(d.square) ?? d.square);
      if (url) a.createEl('img', { attr: { src: url, loading: 'lazy' } });
    }
  };
}

export async function renderWeekGrid(el: HTMLElement, host: GridHost): Promise<void> {
  const cal = host.calendar;
  if (cal === null) { renderNoBirthDate(el); return; }

  const { outer, root, headerTrack, toolbar, info } = renderShell(
    el, 'Life in weeks', host.transposed ? 'wcg-view-root wcg-transposed' : 'wcg-view-root', host.settings.cellShape);
  const transposed = host.transposed;
  shapeButton(toolbar, host);
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
  const { startAge, endAge } = host.ageRange;
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
    renderYearHeader(headerTrack, years, curYY);
    for (const ww of weeks) {
      const row = wrap.createDiv({ cls: 'wcg-row' + (ww === curWW ? ' wcg-cur-week' : '') });
      row.createDiv({ cls: 'wcg-ww-label', text: pad2(ww) });
      for (const yy of years) {
        const cell = makeCell(row, yy, ww, yy - startAge);
        if (isDecadeStart(yy)) cell.addClass('wcg-decade-start');
        if (isPageStart(yy, years[0])) cell.addClass('wcg-page-start');
      }
    }
  } else {
    // Transposed: rows = years, columns = weeks
    const header = headerTrack.createDiv({ cls: 'wcg-row wcg-header' });
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
  applyPaging(outer, root, host.settings.cellShape);
}

export async function renderDayGrid(el: HTMLElement, host: GridHost): Promise<void> {
  const cal = host.calendar;
  if (cal === null) { renderNoBirthDate(el); return; }

  const { outer, root, headerTrack, toolbar, info } = renderShell(
    el, 'Life in days', 'wcg-view-root wcg-day-mode', host.settings.cellShape);
  shapeButton(toolbar, host);
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
  const startYY = curYY ?? host.ageRange.startAge;
  const years = Array.from({ length: DAY_VIEW_YEARS }, (_, i) => i + startYY);
  const yearLen = new Map(years.map(yy => [yy, cal.personalYearDays(yy)]));

  const isPast = (yy: number, doy: number): boolean => {
    if (curYY == null || curDOY == null) return false;
    return yy < curYY || (yy === curYY && doy < curDOY);
  };

  renderYearHeader(headerTrack, years, curYY);
  const wrap = root.createDiv({ cls: 'wcg-wrap' });

  // 1 row per day-of-personal-year. Labels show the calendar date of the first
  // column (the current personal year): day of month, or the month's short name
  // on the 1st. Other columns may have their month starts one row off (leap
  // years) — each cell marks its own month start, so the separators stay true.
  const monthShort = (d: Date): string => momentFmt(d).format('MMM'); // in Obsidian's language
  const labelYY = years[0];
  const labelDays = cal.personalYearDays(labelYY);
  for (let doy = 1; doy <= 366; doy++) {
    const row = wrap.createDiv({ cls: 'wcg-row' + (doy === curDOY ? ' wcg-cur-week' : '') });
    const labelDate = doy <= labelDays ? cal.personalToDate(labelYY, doy) : null;
    row.createDiv({
      cls: 'wcg-ww-label' + (labelDate && isMonthStart(labelDate) ? ' wcg-month-label' : ''),
      text: labelDate ? dayLabel(labelDate, monthShort) : '',
    });

    for (const yy of years) {
      const colOff = (yy - startYY) % 2 === 1;
      let cell: HTMLElement;
      if (doy > (yearLen.get(yy) ?? 0)) {
        // Beyond the personal year's length (doy=366 in a 365-day year) → invisible placeholder
        cell = row.createDiv({ cls: 'wcg-cell wcg-cell-empty' + (colOff ? ' wcg-col-offset' : '') });
      } else {
        const d = cells[String(yy)]?.[String(doy)];
        let cls = cellClass(colOff, yy === curYY && doy === curDOY, !!d, isPast(yy, doy));
        if (isMonthStart(cal.personalToDate(yy, doy))) cls += ' wcg-month-start';
        cell = row.createDiv({ cls, attr: { 'data-yy': String(yy), 'data-doy': String(doy) } });
        if (d) {
          fillLink(cell, d);
        } else {
          cell.setAttribute('title', `Create ${formatYMD(cal.personalToDate(yy, doy))}`);
          cell.addEventListener('click', () => host.openCreateDay(yy, doy));
        }
      }
      if (isDecadeStart(yy)) cell.addClass('wcg-decade-start');
      if (isPageStart(yy, years[0])) cell.addClass('wcg-page-start');
    }
  }
  applyPaging(outer, root, host.settings.cellShape);

  const todayCell = (): HTMLElement | null =>
    curYY == null || curDOY == null
      ? null
      : root.querySelector<HTMLElement>(`[data-yy="${curYY}"][data-doy="${curDOY}"]`);

  todayBtn.addEventListener('click', () => {
    const cell = todayCell();
    if (cell) flashCell(cell);
  });
}
