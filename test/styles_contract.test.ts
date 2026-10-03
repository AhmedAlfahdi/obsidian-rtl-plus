/**
 * Contract tests on the shipped stylesheet.
 *
 * Both properties-panel regressions so far were CSS-only and invisible to the
 * unit tests, so the rules themselves are asserted here. They encode lessons
 * that were measured in a browser (see test_vault_rtl/.align.html):
 *
 *   text-align: end  on the key  -> resolves against the element's own
 *                                   direction, which is not RTL, so labels went
 *                                   LEFT-aligned.
 *   direction: rtl   on the key  -> Latin labels end 20-40px further right than
 *                                   Arabic ones.
 *   text-align: right            -> both scripts on the same edge.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rawCss = readFileSync(join(__dirname, "..", "styles.css"), "utf-8");
/** Comments are stripped before parsing: a stale one must not satisfy a rule. */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");
const comments = (rawCss.match(/\/\*[\s\S]*?\*\//g) ?? []).join("\n");

/** Every selector list in the file, with its declarations. */
function rules(): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

describe("properties panel label alignment", () => {
  it("aligns labels with an absolute side, never a logical one", () => {
    const labelRules = rules().filter((r) =>
      r.selector.includes(".metadata-property-key"),
    );
    expect(labelRules.length).toBeGreaterThan(0);

    const withAlignment = labelRules.filter((r) =>
      /text-align\s*:/.test(r.body),
    );
    expect(withAlignment.length).toBeGreaterThan(0);

    for (const rule of withAlignment) {
      // `end`/`start` depend on the element's direction, which the key does not
      // inherit — that is the bug that made every label go left-aligned.
      expect(`${rule.selector} => ${rule.body}`).not.toMatch(
        /text-align\s*:\s*(end|start)/,
      );
    }
  });

  it("right-aligns labels in RTL notes", () => {
    const rtlLabelRules = rules().filter(
      (r) =>
        r.selector.includes(".metadata-property-key") &&
        r.selector.includes("rtl-plus-rtl"),
    );
    const alignsRight = rtlLabelRules.some((r) =>
      /text-align\s*:\s*right/.test(r.body),
    );
    expect(alignsRight).toBe(true);
  });

  it("does not force a direction on the label element", () => {
    // Forcing it aligned Latin and Arabic labels to different edges.
    const labelRules = rules().filter((r) =>
      r.selector.includes(".metadata-property-key"),
    );
    for (const rule of labelRules) {
      expect(`${rule.selector} => ${rule.body}`).not.toMatch(
        /direction\s*:\s*rtl/,
      );
    }
  });

  it("keeps the properties container following the note", () => {
    // The RTL container must be rtl. A `.rtl-plus-ltr` rule pinning ltr is fine:
    // that is a left-to-right note asking for a left-to-right panel.
    const rtlContainer = rules().filter(
      (r) =>
        r.selector.includes(".metadata-container") &&
        r.selector.includes("rtl-plus-rtl"),
    );
    expect(rtlContainer.length).toBeGreaterThan(0);
    for (const rule of rtlContainer) {
      expect(`${rule.selector} => ${rule.body}`).toMatch(/direction\s*:\s*rtl/);
    }
  });

  it("no comment claims a rule that no longer exists", () => {
    // A leftover comment recommended `text-align: start/end` after the code had
    // moved to absolute alignment, which is how the wrong rule gets reintroduced.
    expect(comments).not.toMatch(/text-align: start\/end/);
  });

  it("does not pin the properties panel to ltr in the content move-list", () => {
    // The list of things kept LTR (code, maths, tables) must not contain the
    // panel: that is what broke it in 1.0.0/1.0.2.
    const moveList = css.slice(
      css.indexOf(".rtl-plus-rtl :is("),
      css.indexOf("}", css.indexOf(".rtl-plus-rtl :is(")),
    );
    expect(moveList).not.toContain(".metadata-container");
  });
});
