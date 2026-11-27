// Drawing the circle named by a note's circle property (rules in autoCircle.ts):
// a CodeMirror 6 widget for live preview and source mode, and a reading-view post-processor.
// The circles are never part of the note text.

import { StateEffect, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { editorInfoField, type MarkdownPostProcessorContext } from 'obsidian';
import type { AutoCirclePlan } from './autoCircle';
import { placeInRendered } from './autoCirclePlacement';

/** Class of the element that holds the drawn circles. */
export const AUTO_CIRCLE_CLASS = 'wcg-sq-auto';

export interface AutoCircleHost {
  /** The circles to draw for the note at `path`, or null (not a week/day note, or nothing to draw). */
  autoCirclePlan(path: string, text: () => string): AutoCirclePlan | null;
  /** The element showing `keys` (one `.sq` per circle, coloured like inline markers). */
  renderAutoCircles(keys: string[], atEnd: boolean, shape: AutoCirclePlan['shape']): HTMLElement;
  /** Bumped when settings change, so every drawn circle is redrawn. */
  readonly autoCircleVersion: number;
}

/** Sent to every open editor when the settings changed: recompute its circles. */
const refreshCircles = StateEffect.define<null>();

class CirclesWidget extends WidgetType {
  constructor(
    private readonly host: AutoCircleHost,
    private readonly keys: string[],
    private readonly atEnd: boolean,
    private readonly shape: AutoCirclePlan['shape'],
    private readonly version: number,
  ) { super(); }

  eq(other: CirclesWidget): boolean {
    return other.version === this.version && other.atEnd === this.atEnd && other.shape === this.shape && other.keys.join('\n') === this.keys.join('\n');
  }

  toDOM(): HTMLElement {
    return this.host.renderAutoCircles(this.keys, this.atEnd, this.shape);
  }

  /** Clicks on the circle are left to the editor (it does nothing special). */
  ignoreEvent(): boolean {
    return false;
  }
}

/** Editors currently showing a note, so a settings change can refresh their circles. */
const openEditors = new Set<EditorView>();

/** Recompute the circles of every open editor (after a settings change). */
export function refreshEditorCircles(): void {
  for (const view of openEditors) view.dispatch({ effects: refreshCircles.of(null) });
}

/** The CodeMirror extension drawing the circles in live preview and source mode. */
export function autoCircleEditorExtension(host: AutoCircleHost): Extension {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      openEditors.add(view);
      this.decorations = this.build();
    }

    update(u: ViewUpdate): void {
      const refresh = u.transactions.some(tr => tr.effects.some(e => e.is(refreshCircles)));
      if (u.docChanged || refresh) this.decorations = this.build();
    }

    destroy(): void {
      openEditors.delete(this.view);
    }

    private build(): DecorationSet {
      try {
        const { state } = this.view;
        const file = state.field(editorInfoField, false)?.file;
        if (!file) return Decoration.none;
        const plan = host.autoCirclePlan(file.path, () => state.doc.toString());
        if (!plan || plan.line + 1 > state.doc.lines) return Decoration.none;
        const line = state.doc.line(plan.line + 1);
        const pos = line.from + Math.min(plan.ch, line.length);
        const widget = new CirclesWidget(host, plan.keys, plan.atEnd, plan.shape, host.autoCircleVersion);
        return Decoration.set([Decoration.widget({ widget, side: 1 }).range(pos)]);
      } catch (e) {
        console.error('week-life-circles: cannot draw the circle', e);
        return Decoration.none;
      }
    }
  }, { decorations: v => v.decorations });
}

/** Reading view: draw the circles into the rendered section that holds the note's header line. */
export function autoCirclePostProcessor(host: AutoCircleHost): (el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
  return (el, ctx) => {
    try {
      const info = ctx.getSectionInfo(el);
      if (!info) return;
      const plan = host.autoCirclePlan(ctx.sourcePath, () => info.text);
      if (!plan || plan.line !== info.lineStart) return;
      el.querySelectorAll(`.${AUTO_CIRCLE_CLASS}`).forEach(n => n.remove());
      const first = el.firstElementChild;
      const block = first?.instanceOf(HTMLElement) ? first : el;
      placeInRendered(block, host.renderAutoCircles(plan.keys, plan.atEnd, plan.shape), plan.atEnd);
    } catch (e) {
      console.error('week-life-circles: cannot draw the circle', e);
    }
  };
}
