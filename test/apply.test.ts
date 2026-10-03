import {
  applyDirection,
  AUTO_CLASS,
  classFor,
  clearDirection,
  labelFor,
  LTR_CLASS,
  RTL_CLASS,
  StylableElement,
} from "../src/apply";

/** Minimal element double: records exactly what the plugin touches. */
function fakeElement() {
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const el: StylableElement = {
    style: { direction: "" },
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
    },
    setAttribute: (name, value) => void attrs.set(name, value),
    removeAttribute: (name) => void attrs.delete(name),
  };
  return {
    el,
    classes: () => [...classes].sort(),
    attr: (name: string) => attrs.get(name),
    style: () => el.style.direction,
  };
}

describe("classFor", () => {
  it("maps each direction to its class", () => {
    expect(classFor("rtl")).toBe(RTL_CLASS);
    expect(classFor("ltr")).toBe(LTR_CLASS);
    expect(classFor("auto")).toBe(AUTO_CLASS);
  });
});

describe("applyDirection", () => {
  it("sets an INLINE style, not only a class", () => {
    // Regression: setting only a class loses to Obsidian's own `.cm-editor`
    // rules, which is why the note stayed left-to-right.
    const el = fakeElement();
    applyDirection(el.el, "rtl");

    expect(el.style()).toBe("rtl");
    expect(el.classes()).toEqual([RTL_CLASS]);
    expect(el.attr("dir")).toBe("rtl");
  });

  it("sets ltr explicitly so it can override an rtl ancestor", () => {
    const el = fakeElement();
    applyDirection(el.el, "ltr");
    expect(el.style()).toBe("ltr");
    expect(el.attr("dir")).toBe("ltr");
  });

  it("clears the inline style for auto and lets the browser decide", () => {
    const el = fakeElement();
    applyDirection(el.el, "rtl");
    applyDirection(el.el, "auto");

    expect(el.style()).toBe("");
    expect(el.attr("dir")).toBe("auto");
    expect(el.classes()).toEqual([AUTO_CLASS]);
  });

  it("never leaves two direction classes behind", () => {
    const el = fakeElement();
    for (const direction of ["rtl", "ltr", "auto", "rtl"] as const) {
      applyDirection(el.el, direction);
      expect(el.classes()).toEqual([classFor(direction)]);
    }
  });
});

describe("clearDirection", () => {
  it("undoes everything, so disabling the plugin leaves no trace", () => {
    const el = fakeElement();
    applyDirection(el.el, "rtl");
    clearDirection(el.el);

    expect(el.style()).toBe("");
    expect(el.classes()).toEqual([]);
    expect(el.attr("dir")).toBeUndefined();
  });
});

describe("labelFor", () => {
  it("says where the direction came from", () => {
    expect(labelFor("rtl", "frontmatter")).toBe("RTL (frontmatter)");
    expect(labelFor("auto", "default")).toBe("Auto (default)");
    expect(labelFor("ltr", "file")).toBe("LTR (this note)");
  });
});
