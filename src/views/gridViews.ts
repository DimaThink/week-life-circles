import { ItemView } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { t } from '../i18n';
import { GridHost, flashCell, reapplyPaging, renderDayGrid, renderWeekGrid, revealCell } from '../grid';

export const WEEK_VIEW_TYPE = 'wlc-week-grid';
export const DAY_VIEW_TYPE = 'wlc-day-grid';

export abstract class GridView extends ItemView {
  private rendered: Promise<void> = Promise.resolve();
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame = 0;

  constructor(leaf: WorkspaceLeaf, protected readonly host: GridHost) {
    super(leaf);
  }

  protected abstract render(): Promise<void>;

  async onOpen(): Promise<void> {
    // Width changes (phone rotation, split pane, sidebar) flip decade paging on/off
    // and resize the paged cells. Use this window's constructor so popouts work too.
    const win = this.contentEl.win;
    const Observer = (win as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver;
    this.resizeObserver = new Observer(() => {
      if (this.resizeFrame) return;
      this.resizeFrame = win.requestAnimationFrame(() => {
        this.resizeFrame = 0;
        reapplyPaging(this.contentEl, this.host.settings.cellShape);
      });
    });
    this.resizeObserver.observe(this.contentEl);
    await this.refresh();
  }

  /** Obsidian's own resize hook (pane resized / shown) — a second trigger besides the observer. */
  onResize(): void {
    reapplyPaging(this.contentEl, this.host.settings.cellShape);
  }

  async onClose(): Promise<void> {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame) this.contentEl.win.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = 0;
    await super.onClose();
  }

  /**
   * Re-render, keeping the scroll position when the layout is unchanged (e.g.
   * after creating a note); on first open or a layout switch, centre on today.
   */
  refresh(): Promise<void> {
    const prev = this.contentEl.querySelector<HTMLElement>('.wcg-view-root');
    const keep = prev ? { cls: prev.className, left: prev.scrollLeft, top: prev.scrollTop } : null;
    this.rendered = this.render().then(() => {
      const root = this.contentEl.querySelector<HTMLElement>('.wcg-view-root');
      if (!root) return;
      if (keep && keep.cls === root.className) root.scrollTo(keep.left, keep.top);
      else {
        const cur = root.querySelector<HTMLElement>('.wcg-cur-cell');
        if (cur) revealCell(cur);
      }
    });
    return this.rendered;
  }

  /** Scroll to and flash the first cell matching `selector`, once the current render is done. */
  async focusCell(selector: string): Promise<void> {
    await this.rendered;
    const cell = this.contentEl.querySelector<HTMLElement>(selector);
    if (cell) flashCell(cell);
  }
}

export class WeekCalendarView extends GridView {
  getViewType(): string { return WEEK_VIEW_TYPE; }
  getDisplayText(): string { return t('notes.grid.lifeWeeks'); }
  getIcon(): string { return 'calendar-days'; }
  protected render(): Promise<void> { return renderWeekGrid(this.contentEl, this.host); }
}

export class DayCalendarView extends GridView {
  getViewType(): string { return DAY_VIEW_TYPE; }
  getDisplayText(): string { return t('notes.grid.lifeDays'); }
  getIcon(): string { return 'calendar'; }
  protected render(): Promise<void> { return renderDayGrid(this.contentEl, this.host); }
}
