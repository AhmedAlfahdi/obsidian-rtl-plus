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
  applyDirection,
  clearDirection,
  labelFor,
  RTL_CLASS,
  LTR_CLASS,
  AUTO_CLASS,
} from "./apply";
import {
  RtlHost,
  refreshDirection,
  rtlEditorExtension,
} from "./editor_extension";
import { DEFAULT_SETTINGS, RtlSettingTab, RtlSettings } from "./settings";

/** Either kind of element we style: both expose style + classList + attributes. */
type Target = Parameters<typeof applyDirection>[0];

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
      const preview = el.closest(".markdown-preview-view");
      if (preview instanceof HTMLElement) {
        this.applyToReadingView(preview, ctx.sourcePath);
      }
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
    this.addCommand({
      id: "report-text-direction",
      name: "Report text direction (diagnostics)",
      callback: () => this.reportDirection(),
    });

    this.addSettingTab(new RtlSettingTab(this.app, this));

    const applyToLeaf = (leaf: WorkspaceLeaf | null): void => {
      const view = leaf?.view;
      if (!(view instanceof MarkdownView)) {
        this.hideStatusBar();
        return;
      }
      this.applyToView(view);
    };
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", applyToLeaf),
    );
    // Not every way of showing a note changes the active leaf, and the editor
    // element may not exist yet when the leaf event fires.
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshActiveView()),
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const remembered = this.settings.fileDirections[oldPath];
        if (!remembered) return;
        delete this.settings.fileDirections[oldPath];
        this.settings.fileDirections[file.path] = remembered;
        void this.saveSettings();
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (!this.settings.fileDirections[file.path]) return;
        delete this.settings.fileDirections[file.path];
        void this.saveSettings();
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
    document
      .querySelectorAll(`.${RTL_CLASS}, .${LTR_CLASS}, .${AUTO_CLASS}`)
      .forEach((el) => clearDirection(el as unknown as Target));
  }

  // ── RtlHost ───────────────────────────────────────────────────────────────

  directionForPath(path: string | undefined): Direction {
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    return this.resolveFor(file instanceof TFile ? file : null).direction;
  }

  preventsRtlFrontmatter(): boolean {
    return this.settings.pinFrontmatterLtr;
  }

  // ── Resolution ────────────────────────────────────────────────────────────

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

  // ── Applying ──────────────────────────────────────────────────────────────

  refreshActiveView(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) this.applyToView(view);
  }

  private applyToView(view: MarkdownView): void {
    const resolved = this.resolveFor(view.file);
    const { direction } = resolved;

    // 1. The view container ("reading view" and the pane background).
    this.styleTarget(view.contentEl, direction);

    // 2. The CodeMirror editor. Obsidian styles `.cm-editor` itself, so this
    //    needs the inline style, not just a class.
    const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
    const cmDom = cm?.dom as unknown as HTMLElement | undefined;
    if (cmDom) {
      this.styleTarget(cmDom, direction);
      const scroller = cmDom.closest(".cm-scroller");
      if (scroller instanceof HTMLElement)
        this.styleTarget(scroller, direction);
    }

    // 3. The rendered reading view, when it exists.
    const preview = view.contentEl.querySelector(".markdown-preview-view");
    if (preview instanceof HTMLElement) this.styleTarget(preview, direction);

    // 4. The properties panel. Obsidian lays the label/value rows out with
    //    flexbox, so the CSS `direction` alone does not move the labels — the
    //    `dir` attribute has to be on the container for the panel to lay out
    //    right-to-left as a whole.
    const metadata = view.contentEl.querySelector(".metadata-container");
    if (metadata instanceof HTMLElement) {
      metadata.setAttribute("dir", direction === "auto" ? "auto" : direction);
      this.styleTarget(metadata, direction);
    }

    // 5. The note title in the tab header.
    if (this.settings.setNoteTitleDirection) {
      const title = view.containerEl.querySelector(".view-header-title");
      if (title instanceof HTMLElement) {
        title.style.direction = direction === "auto" ? "" : direction;
      }
    }

    // 6. Let the per-view extension rebuild its auto decorations. Targeted state
    //    effect, not a blanket dispatch(): the latter re-measures the document.
    cm?.dispatch({ effects: refreshDirection.of(undefined) });

    this.updateStatusBar(direction, resolved.source, view.file);
  }

  private styleTarget(el: HTMLElement, direction: Direction): void {
    applyDirection(el as unknown as Target, direction);
  }

  private applyToReadingView(preview: HTMLElement, sourcePath: string): void {
    const direction = this.directionForPath(sourcePath);
    this.styleTarget(preview, direction);
    preview.classList.toggle(
      "rtl-plus-yaml-rtl",
      direction !== "ltr" && this.settings.setYamlDirectionInPreview,
    );
  }

  private updateStatusBar(
    direction: Direction,
    source: "frontmatter" | "file" | "default",
    file: TFile | null,
  ): void {
    if (!this.statusBarItem || !this.statusBarText) return;
    if (!this.settings.statusBar) {
      this.hideStatusBar();
      return;
    }
    this.statusBarText.setText(labelFor(direction, source));
    this.statusBarItem.removeClass("rtl-plus-hidden");
    this.statusBarItem.setAttribute(
      "aria-label",
      `Text direction: ${directionLabel(direction)} (${source}) — click to change`,
    );
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
    this.setDirectionForActiveNote(
      nextDirection(this.resolveFor(view.file).direction),
    );
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

  /**
   * Print what the plugin sees, so a misreport can be diagnosed without
   * guesswork: which note, which direction won, and which element carries it.
   */
  private reportDirection(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) {
      new Notice("RTL Support++: no active note");
      return;
    }

    const resolved = this.resolveFor(view.file);
    const cm = (view.editor as unknown as { cm?: EditorView })?.cm;
    const cmDom = cm?.dom as unknown as HTMLElement | undefined;
    const preview = view.contentEl.querySelector(".markdown-preview-view");

    const fileName = view.file.path.split("/").pop() ?? "";
    const lines = [
      `note: …/${fileName}`,
      `direction: ${resolved.direction} (${resolved.source})`,
      `default: ${this.settings.defaultDirection} | remember: ${this.settings.rememberPerFile}`,
      `frontmatter: ${JSON.stringify(
        this.app.metadataCache.getFileCache(view.file)?.frontmatter
          ?.direction ?? null,
      )}`,
      `view contentEl style: ${view.contentEl.style.direction || "(unset)"}`,
      `cm-editor style: ${cmDom?.style.direction || "(unset)"}`,
      `cm-editor class: ${
        cmDom?.className
          .split(" ")
          .filter((c) => c.startsWith("rtl-plus"))
          .join(" ") || "(none)"
      }`,
      `preview style: ${preview instanceof HTMLElement ? preview.style.direction || "(unset)" : "(absent)"}`,
      `settings: title=${this.settings.setNoteTitleDirection} pinFm=${this.settings.pinFrontmatterLtr} statusBar=${this.settings.statusBar}`,
    ];

    console.info("[RTL Support++]\n" + lines.join("\n"));
    new Notice(lines.join("\n"), 12000);
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
