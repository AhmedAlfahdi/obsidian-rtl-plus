#!/usr/bin/env node
/**
 * Loads the built plugin with a fake DOM and a fake Obsidian API, then runs the
 * real code paths that apply a direction. Verifies the thing that cannot be
 * checked by unit tests: that the direction actually lands on the elements
 * Obsidian renders.
 *
 *   node harness/plugin_smoke.cjs
 */
const path = require("node:path");
const Module = require("node:module");
const fs = require("node:fs");

// ── Minimal DOM ─────────────────────────────────────────────────────────────
class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...n) { n.forEach((x) => this.set.add(x)); }
  remove(...n) { n.forEach((x) => this.set.delete(x)); }
  toggle(n, force) { const on = force ?? !this.set.has(n); on ? this.set.add(n) : this.set.delete(n); return on; }
  contains(n) { return this.set.has(n); }
  toString() { return [...this.set].join(" "); }
}
/** The real plugin guards with `instanceof HTMLElement`, so provide the class. */
class FakeHTMLElement {
  constructor() {}
}
global.HTMLElement = FakeHTMLElement;

class FakeEl extends FakeHTMLElement {
  constructor(tag = "div", cls = "") {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.style = { direction: "" };
    this.classList = new FakeClassList();
    if (cls) cls.split(" ").forEach((c) => this.classList.add(c));
    this.attrs = new Map();
    this.textContent = "";
    this._selectorFlags = {};
  }
  get className() { return this.classList.toString(); }
  set className(v) { this.classList = new FakeClassList(); v.split(" ").filter(Boolean).forEach((c) => this.classList.add(c)); }
  createSpan() { const el = new FakeEl("span"); this.append(el); return el; }
  createDiv(o) { const el = new FakeEl("div", o && o.cls); this.append(el); return el; }
  append(el) { el.parentElement = this; this.children.push(el); return el; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addClass(c) { this.classList.add(c); }
  removeClass(c) { this.classList.remove(c); }
  setText(t) { this.textContent = t; }
  /** Supports only the selectors this plugin actually uses. */
  querySelector(sel) { return this._find(sel); }
  querySelectorAll(sel) { const out = []; this._collect(sel, out); return out; }
  closest(sel) { let el = this; while (el) { if (el._matches(sel)) return el; el = el.parentElement; } return null; }
  _matches(sel) {
    if (sel.startsWith(".")) return this.classList.contains(sel.slice(1));
    return this.tagName === sel.toUpperCase();
  }
  _find(sel) { for (const c of this.children) { if (c._matches(sel)) return c; const d = c._find(sel); if (d) return d; } return null; }
  _collect(sel, out) { for (const c of this.children) { if (c._matches(sel)) out.push(c); c._collect(sel, out); } }
}
// `@codemirror/view` reads these at import time, so they must exist before it
// is required. Only the few members it touches are provided.
const fakeDocElement = new FakeEl("html");
global.document = {
  documentElement: fakeDocElement,
  body: new FakeEl("body"),
  head: new FakeEl("head"),
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: (t) => new FakeEl(t),
  addEventListener: () => {},
  removeEventListener: () => {},
  createTextNode: (t) => ({ textContent: t }),
};
global.window = global.window ?? {};
global.window.document = global.document;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.navigator = { userAgent: "node", platform: "linux", clipboard: { writeText: async () => {} } };
global.getComputedStyle = () => ({ getPropertyValue: () => "" });
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.MutationObserver = class { observe() {} disconnect() {} };
global.ResizeObserver = class { observe() {} disconnect() {} };
global.IntersectionObserver = class { observe() {} disconnect() {} };

// ── Fake Obsidian ───────────────────────────────────────────────────────────
const noop = () => {};
const notices = [];
class Component {}
class Plugin extends Component {
  constructor(app) { super(); this.app = app; this.commands = []; }
  addCommand(c) { this.commands.push(c); return c; }
  addRibbonIcon() { return new FakeEl("div"); }
  addStatusBarItem() { return new FakeEl("div"); }
  addSettingTab() {}
  registerEvent() {}
  registerDomEvent(el, _ev, cb) { el.onclick = cb; }
  registerInterval() {}
  registerEditorExtension(ext) { this.editorExtension = ext; return ext; }
  registerMarkdownPostProcessor(cb) { this.postProcessor = cb; }
  async loadData() { return this.__data ?? null; }
  async saveData(d) { this.__data = d; }
}
class MarkdownView {}
class TFile {}
class Notice { constructor(msg) { notices.push(String(msg)); } }
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = new FakeEl("div"); } }
class Setting { constructor() {} setName() { return this; } setDesc() { return this; } addToggle() { return this; } addDropdown() { return this; } addText() { return this; } }
const stub = new Proxy(
  { Component, Plugin, MarkdownView, TFile, Notice, PluginSettingTab, Setting, debounce: (f) => f, Platform: { isMobile: false } },
  { get: (t, p) => (p in t ? t[p] : noop) },
);
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return stub;
  return originalLoad.call(this, request, parent, isMain);
};

// ── Fake app state ──────────────────────────────────────────────────────────
const NOTE_PATH = "Books/كتاب.md";
function makeView() {
  const contentEl = new FakeEl("div", "view-content");
  const cmEditor = new FakeEl("div", "cm-editor");
  const cmScroller = new FakeEl("div", "cm-scroller");
  cmScroller.append(cmEditor);
  contentEl.append(cmScroller);
  const preview = new FakeEl("div", "markdown-preview-view");
  contentEl.append(preview);
  // Obsidian's Properties panel lives inside the view content.
  const metadata = new FakeEl("div", "metadata-container");
  const propertyKey = new FakeEl("div", "metadata-property-key");
  const propertyValue = new FakeEl("div", "metadata-property-value");
  metadata.append(propertyKey);
  metadata.append(propertyValue);
  contentEl.append(metadata);
  const containerEl = new FakeEl("div");
  const title = new FakeEl("div", "view-header-title");
  containerEl.append(title);

  const file = Object.assign(new TFile(), { path: NOTE_PATH, basename: "كتاب" });
  const view = Object.assign(new MarkdownView(), {
    file,
    contentEl,
    containerEl,
    editor: { cm: { dom: cmEditor, dispatch: () => { dispatched++; } } },
  });
  return {
    view,
    contentEl,
    cmEditor,
    preview,
    title,
    metadata,
    propertyKey,
    propertyValue,
  };
}
let dispatched = 0;
const { view, contentEl, cmEditor, preview, title, metadata, propertyKey } =
  makeView();
const app = {
  vault: { getAbstractFileByPath: (p) => (p === NOTE_PATH ? view.file : null), on: () => {} },
  metadataCache: { getFileCache: () => ({ frontmatter: { direction: "rtl" } }) },
  workspace: {
    getActiveViewOfType: () => view,
    on: () => {},
    onLayoutReady: (cb) => cb(),
  },
};

(async () => {
  const bundle = path.join(__dirname, "..", "main.js");
  if (!fs.existsSync(bundle)) {
    console.error("main.js not found — run: node esbuild.config.mjs production");
    process.exit(1);
  }
  const PluginClass = require(bundle).default;
  const plugin = new PluginClass(app, { id: "rtl-support-plus", version: "0.0.0" });
  await plugin.loadSettings();
  await plugin.onload();

  const report = [
    ["contentEl style", contentEl.style.direction],
    ["cm-editor style", cmEditor.style.direction],
    ["cm-editor class", cmEditor.className],
    ["preview style", preview.style.direction],
    ["view dir attr", contentEl.getAttribute("dir")],
    ["title style", title.style.direction],
    ["cm dispatch called", String(dispatched > 0)],
    ["status bar text", plugin.statusBarText?.textContent ?? "(none)"],
    ["properties dir attr", metadata.getAttribute("dir")],
    ["properties style", metadata.style.direction],
  ];

  console.log("=== direction applied to the editor path ===");
  for (const [k, v] of report) console.log(`  ${k.padEnd(20)} ${v}`);

  const failures = [];
  if (contentEl.style.direction !== "rtl") failures.push("contentEl");
  if (cmEditor.style.direction !== "rtl") failures.push("cm-editor inline style");
  if (!cmEditor.classList.contains("rtl-plus-rtl")) failures.push("cm-editor class");
  if (preview.style.direction !== "rtl") failures.push("preview");
  if (contentEl.getAttribute("dir") !== "rtl") failures.push("dir attribute");
  if (!plugin.commands.some((c) => c.id === "report-text-direction")) failures.push("diagnostics command");
  // Regression: the properties panel was pinned LTR by the pin-list, which left
  // Arabic labels on the left of their values.
  if (metadata.style.direction !== "rtl") failures.push("properties inline style");
  if (metadata.getAttribute("dir") !== "rtl") failures.push("properties dir attribute");

  console.log(failures.length ? `\nFAIL: ${failures.join(", ")}` : "\nPASS: every target received rtl");
  process.exit(failures.length ? 1 : 0);
})();
