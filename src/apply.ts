import { Direction } from "./direction";

export const RTL_CLASS = "rtl-plus-rtl";
export const LTR_CLASS = "rtl-plus-ltr";
export const AUTO_CLASS = "rtl-plus-auto";

/** Just enough of an element for these helpers, so they are unit-testable. */
export interface StylableElement {
  style: { direction: string };
  classList: {
    add(...names: string[]): void;
    remove(...names: string[]): void;
  };
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export function classFor(direction: Direction): string {
  if (direction === "rtl") return RTL_CLASS;
  if (direction === "ltr") return LTR_CLASS;
  return AUTO_CLASS;
}

export function clearDirectionClasses(el: StylableElement): void {
  el.classList.remove(RTL_CLASS, LTR_CLASS, AUTO_CLASS);
}

/**
 * Apply a direction to an element.
 *
 * Sets the inline `direction` style, not just a class. Obsidian's own
 * stylesheets target `.cm-editor` and `.markdown-preview-view` with selectors
 * more specific than a plugin class, so a class alone loses and the note stays
 * left-to-right. An inline style has the highest precedence, which is why the
 * plugin this replaces used one.
 *
 * `dir` is set as well so the browser does bidi resolution for the subtree and
 * `:dir()` selectors work.
 */
export function applyDirection(
  el: StylableElement,
  direction: Direction,
): void {
  clearDirectionClasses(el);
  el.classList.add(classFor(direction));

  if (direction === "auto") {
    el.style.direction = "";
    el.setAttribute("dir", "auto");
    return;
  }
  el.style.direction = direction;
  el.setAttribute("dir", direction);
}

/** Remove everything this plugin applied, so disabling it leaves no trace. */
export function clearDirection(el: StylableElement): void {
  clearDirectionClasses(el);
  el.style.direction = "";
  el.removeAttribute("dir");
}

export function labelFor(
  direction: Direction,
  source: "frontmatter" | "file" | "default",
): string {
  const name = direction === "auto" ? "Auto" : direction.toUpperCase();
  switch (source) {
    case "frontmatter":
      return `${name} (frontmatter)`;
    case "file":
      return `${name} (this note)`;
    default:
      return `${name} (default)`;
  }
}
