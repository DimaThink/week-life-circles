import { ItemView } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { GridHost, flashCell, renderDayGrid, renderWeekGrid } from '../grid';

export const WEEK_VIEW_TYPE = 'wlc-week-grid';
export const DAY_VIEW_TYPE = 'wlc-day-grid';

export abstract class GridView extends ItemView {
  private rendered: Promise<void> = Promise.resolve();

  constructor(leaf: WorkspaceLeaf, protected readonly host: GridHost) {
    super(leaf);
  }

  protected abstract render(): Promise<void>;

  async onOpen(): Promise<void> {
    await this.refresh();
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
      else root.querySelector<HTMLElement>('.wcg-cur-cell')?.scrollIntoView({ block: 'center', inline: 'center' });
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
  getDisplayText(): string { return 'Week Life Circles'; }
  getIcon(): string { return 'calendar-days'; }
  protected render(): Promise<void> { return renderWeekGrid(this.contentEl, this.host); }
}

export class DayCalendarView extends GridView {
  getViewType(): string { return DAY_VIEW_TYPE; }
  getDisplayText(): string { return 'Day Life Circles'; }
  getIcon(): string { return 'calendar'; }
  protected render(): Promise<void> { return renderDayGrid(this.contentEl, this.host); }
}
