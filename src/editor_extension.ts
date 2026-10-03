import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import type { DecorationSet, PluginValue } from "@codemirror/view";
import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import { editorInfoField } from "obsidian";
import { Direction, directionClass, lineDirection } from "./direction";
import { frontmatterRange } from "./frontmatter";

/** Minimal surface of the plugin the extension needs, so this file stays testable. */
export interface RtlHost {
  /** Direction configured for a document, by note path. */
  directionForPath(path: string | undefined): Direction;
  /** Should raw frontmatter be pinned left-to-right in the editor? */
  preventsRtlFrontmatter(): boolean;
}

const ltrLine = Decoration.line({ attributes: { dir: "ltr" } });
const rtlLine = Decoration.line({ attributes: { dir: "rtl" } });

/**
 * Dispatched when the note's direction changes. The container class handles a
 * fixed direction, so this only needs to rebuild the `auto` per-line set — and
 * it avoids dispatching a blanket editor update, which re-measures the whole
 * document and is what made direction toggles stutter.
 */
export const refreshDirection = StateEffect.define<void>();

interface Plan {
  /** Decorations for a viewport, built from scratch. */
  set: DecorationSet;
}

/**
 * Per-view editor extension.
 *
 * The plugin this replaces rebuilt a `RangeSetBuilder` for the whole viewport on
 * every document change and dispatched an `EditorView` update on every direction
 * toggle. On a long note that is O(lines) work per keystroke, which is where the
 * reported lag comes from. Here:
 *
 *  - decorations are only rebuilt when the viewport actually changes, when the
 *    direction changes, or when an edit lands in the viewport;
 *  - a fixed direction needs no decorations at all (the container class does the
 *    work), so the common case costs nothing per keystroke;
 *  - line directions for `auto` are memoised by line text, so typing on one line
 *    never re-scans the others.
 */
export function rtlEditorExtension(host: RtlHost) {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      decorations: DecorationSet;
      private host: RtlHost;
      private view: EditorView;
      private viewportFrom = -1;
      private viewportTo = -1;
      private frontmatter: { from: number; to: number } | null = null;
      private readonly lineCache = new Map<string, "ltr" | "rtl" | null>();

      constructor(view: EditorView) {
        this.host = host;
        this.view = view;
        this.frontmatter = this.computeFrontmatter();
        this.decorations = this.build();
      }

      update(update: ViewUpdate): void {
        if (
          update.transactions.some((tr) =>
            tr.effects.some((e) => e.is(refreshDirection)),
          )
        ) {
          this.lineCache.clear();
          this.forceRebuild();
          return;
        }

        const viewportChanged =
          update.viewportChanged ||
          update.view.viewport.from !== this.viewportFrom ||
          update.view.viewport.to !== this.viewportTo;

        // A document change only matters if it touched the viewport we render.
        const touchedViewport =
          update.docChanged &&
          update.changes.touchesRange(
            update.view.viewport.from,
            update.view.viewport.to,
          );

        if (!viewportChanged && !touchedViewport) return;

        if (update.docChanged) {
          this.lineCache.clear();
          this.frontmatter = this.computeFrontmatter();
        }
        this.decorations = this.build();
      }

      destroy(): void {
        this.lineCache.clear();
      }

      /** Rebuild now, ignoring the viewport caches. */
      private forceRebuild(): void {
        this.viewportFrom = -1;
        this.viewportTo = -1;
        this.frontmatter = this.computeFrontmatter();
        this.decorations = this.build();
      }

      private path(): string | undefined {
        const info = this.view.state.field(editorInfoField, false) as
          | { file?: { path?: string } }
          | undefined;
        return info?.file?.path;
      }

      private computeFrontmatter(): { from: number; to: number } | null {
        if (!this.host.preventsRtlFrontmatter()) return null;
        const doc = this.view.state.doc;
        return frontmatterRange((n) => doc.line(n), doc.lines);
      }

      private lineDirectionFor(text: string): "ltr" | "rtl" | null {
        const cached = this.lineCache.get(text);
        if (cached !== undefined) return cached;
        const direction = lineDirection(text);
        // Bound the cache: notes being typed in have many transient line texts.
        if (this.lineCache.size > 2000) this.lineCache.clear();
        this.lineCache.set(text, direction);
        return direction;
      }

      private build(): Plan["set"] {
        const { view } = this;
        const doc = view.state.doc;
        const from = view.viewport.from;
        const to = view.viewport.to;
        this.viewportFrom = from;
        this.viewportTo = to;

        // A fixed direction is applied once to the container: no per-line
        // decorations, so nothing to rebuild while typing.
        const direction = this.host.directionForPath(this.path());
        if (direction !== "auto") {
          return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();
        let pos = from;
        const fm = this.frontmatter;

        while (pos <= to) {
          const line = doc.lineAt(pos);
          if (fm && line.from <= fm.to) {
            builder.add(line.from, line.from, ltrLine);
          } else {
            const direction = this.lineDirectionFor(line.text);
            if (direction === "rtl") {
              builder.add(line.from, line.from, rtlLine);
            } else if (direction === "ltr") {
              builder.add(line.from, line.from, ltrLine);
            }
            // Neutrals (blank lines, separators) inherit from the container.
          }
          pos = line.to + 1;
        }
        return builder.finish();
      }
    },
    {
      decorations: (value) => value.decorations,
    },
  );
}

/** The class Obsidian puts on the editor container for a direction. */
export function containerClassFor(direction: Direction): string {
  return directionClass(direction);
}
