import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
  Direction,
  directionLabel,
  nextDirection,
  parseDirection,
  resolveDirection,
} from "./direction";
import {
  RtlHost,
  refreshDirection,
  rtlEditorExtension,
} from "./editor_extension";
import { DEFAULT_SETTINGS, RtlSettingTab, RtlSettings } from "./settings";

const RTL_CLASS = "rtl-plus-rtl";
const LTR_CLASS = "rtl-plus-ltr";
const AUTO_CLASS = "rtl-plus-auto";

export default class RtlSupportPlugin extends Plugin implements RtlHost {
  settings: RtlSettings = { ...DEFAULT_SETTINGS };
  private statusBarItem: HTMLElement | null = null;
  private statusBarText: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerEditorExtension(
      rtlEditorExtension({
        directionForPath: (path) => this.directionForPath(path),
        preventsRtlFrontmatter: () => this.settings.pinFrontmatterLtr,
      }),
    );

    this.registerMarkdownPostProcessor((el, ctx) => {
      // Reading view and exports: the container carries the direction, and the
      // CSS handles the rest. Cheap enough to run per rendered block.
      const preview = el.closest(
        ".markdown-preview-view",
      ) as HTMLElement | null;
      if (preview) this.applyDirectionToReadingView(preview, ctx.sourcePath);
    });

    this.addCommand({
      id: "switch-text-direction",
      name: "Switch text direction (LTR → RTL → auto)",
      icon: "arrow-left-right",
      callback: () => this.cycleDirection(),
    });

    this.addCommand({
      id: "set-text-direction-ltr",
      name: "Set text direction: left to right",
      callback: () => this.setDirectionForActiveNote("ltr"),
    });

    this.addCommand({
      id: "set-text-direction-rtl",
      name: "Set text direction: right to left",
      callback: () => this.setDirectionForActiveNote("rtl"),
    });

    this.addCommand({
      id: "set-text-direction-auto",
      name: "Set text direction: automatic",
      callback: () => this.setDirectionForActiveNote("auto"),
    });

    this.addSettingTab(new RtlSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) =>
        this.onActiveLeafChange(leaf),
      ),
    );

    // Keep the stored direction in step with file renames and deletions.
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const remembered = this.settings.fileDirections[oldPath];
        if (remembered) {
          delete this.settings.fileDirections[oldPath];
          this.settings.fileDirections[file.path] = remembered;
          void this.saveSettings();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.settings.fileDirections[file.path]) {
          delete this.settings.fileDirections[file.path];
          void this.saveSettings();
        }
      }),
    );

    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.addClass("rtl-plus-status");
    this.statusBarText = this.statusBarItem.createSpan();
    this.statusBarItem.setAttribute("aria-label", "Text direction");
    this.registerDomEvent(this.statusBarItem, "click", () =>
      this.cycleDirection(),
    );

    this.app.workspace.onLayoutReady(() => this.refreshActiveView());
  }

  onunload(): void {
    // Remove the classes we added so nothing is left styled after a disable.
    document
      .querySelectorAll(`.${RTL_CLASS}, .${LTR_CLASS}, .${AUTO_CLASS}`)
      .forEach((el) => el.classList.remove(RTL_CLASS, LTR_CLASS, AUTO_CLASS));
  }

  // ── RtlHost ───────────────────────────────────────────────────────────────

  directionForPath(path: string | undefined): Direction {
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    return this.resolveFor(file instanceof TFile ? file : null).direction;
  }

  preventsRtlFrontmatter(): boolean {
    return this.settings.pinFrontmatterLtr;
  }

  // ── Direction resolution ──────────────────────────────────────────────────

  private resolveFor(file: TFile | null) {
    const frontmatter = file
      ? parseDirection(
          this.app.metadataCache.getFileCache(file)?.frontmatter?.direction,
        )
      : null;
    const remembered =
      file && this.settings.rememberPerFile
        ? (this.settings.fileDirections[file.path] ?? null)
        : null;
    return resolveDirection({
      frontmatter,
      remembered,
      defaultDirection: this.settings.defaultDirection,
    });
  }

  // ── Applying direction ────────────────────────────────────────────────────

  private onActiveLeafChange(leaf: WorkspaceLeaf | null): void {
    const view = leaf?.view;
    if (!(view instanceof MarkdownView)) {
      this.hideStatusBar();
      return;
    }
    this.applyToView(view);
  }

  /** Re-apply to the active view; used after a settings change. */
  refreshActiveView(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) this.applyToView(view);
  }

  private applyToView(view: MarkdownView): void {
    const file = view.file;
    const { direction } = this.resolveFor(file);

    this.applyDirectionClasses(view, direction);
    this.applyEditorDirection(view, direction);
    this.updateStatusBar(direction, file);
  }

  private applyDirectionClasses(
    view: MarkdownView,
    direction: Direction,
  ): void {
    const target = view.contentEl;
    target.classList.remove(RTL_CLASS, LTR_CLASS, AUTO_CLASS);
    target.classList.add(
      direction === "rtl"
        ? RTL_CLASS
        : direction === "ltr"
          ? LTR_CLASS
          : AUTO_CLASS,
    );
    // The class drives layout through CSS; set the attribute too so Obsidian's
    // own direction handling agrees with us.
    target.setAttribute("dir", direction === "auto" ? "auto" : direction);

    if (this.settings.setNoteTitleDirection) {
      const header = view.containerEl.querySelector(".view-header-title");
      header?.setAttribute("dir", direction === "auto" ? "auto" : direction);
    }
  }

  private applyEditorDirection(view: MarkdownView, direction: Direction): void {
    // `cm` is Obsidian's EditorView; it is not part of the public typings.
    const editorView = (view.editor as unknown as { cm?: unknown })?.cm as
      | { dom: HTMLElement; plugin?: (p: unknown) => unknown }
      | undefined;
    const editorDom = editorView?.dom;
    if (!editorDom) return;

    editorDom.classList.remove(RTL_CLASS, LTR_CLASS, AUTO_CLASS);
    if (direction !== "auto") {
      editorDom.classList.add(direction === "rtl" ? RTL_CLASS : LTR_CLASS);
      editorDom.setAttribute("dir", direction);
    } else {
      editorDom.classList.add(AUTO_CLASS);
      editorDom.removeAttribute("dir");
    }

    // Tell the per-view extension to rebuild its auto decorations. A targeted
    // state effect, not a blanket `dispatch()`: the latter re-measures the whole
    // document, which is what made direction toggles stutter on long notes.
    const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
    cm?.dispatch({ effects: refreshDirection.of(undefined) });
  }

  private applyDirectionToReadingView(
    preview: HTMLElement,
    sourcePath: string,
  ): void {
    const direction = this.directionForPath(sourcePath);
    preview.classList.remove(RTL_CLASS, LTR_CLASS, AUTO_CLASS);
    preview.classList.add(
      direction === "rtl"
        ? RTL_CLASS
        : direction === "ltr"
          ? LTR_CLASS
          : AUTO_CLASS,
    );
    preview.setAttribute("dir", direction === "auto" ? "auto" : direction);
    preview.classList.toggle(
      "rtl-plus-yaml-rtl",
      direction !== "ltr" && this.settings.setYamlDirectionInPreview,
    );
  }

  private updateStatusBar(direction: Direction, file: TFile | null): void {
    if (!this.statusBarItem || !this.statusBarText) return;
    if (!this.settings.statusBar) {
      this.hideStatusBar();
      return;
    }
    const { source } = this.resolveFor(file);
    const label = directionLabel(direction);
    this.statusBarText.setText(
      source === "default" ? `${label} (default)` : label,
    );
    this.statusBarItem.removeClass("rtl-plus-hidden");
  }

  private hideStatusBar(): void {
    this.statusBarItem?.addClass("rtl-plus-hidden");
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  private cycleDirection(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice("Open a note to change its text direction");
      return;
    }
    const current = this.resolveFor(view.file).direction;
    this.setDirectionForActiveNote(nextDirection(current));
  }

  private setDirectionForActiveNote(direction: Direction): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice("Open a note to change its text direction");
      return;
    }

    if (this.settings.rememberPerFile) {
      this.settings.fileDirections[view.file.path] = direction;
      void this.saveSettings();
    }

    this.applyToView(view);
    new Notice(`Text direction: ${directionLabel(direction)}`, 1500);
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.fileDirections) this.settings.fileDirections = {};
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
