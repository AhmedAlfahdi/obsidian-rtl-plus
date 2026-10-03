import {
  directionClass,
  directionLabel,
  dominantDirection,
  isStrongLtrChar,
  isStrongRtlChar,
  lineDirection,
  nextDirection,
  parseDirection,
  resolveDirection,
} from "../src/direction";

describe("character classification", () => {
  it("recognises RTL script ranges", () => {
    for (const text of ["ا", "ب", "א", "ב", "پ", "ݣ"]) {
      expect(`${text}:${isStrongRtlChar(text.charCodeAt(0))}`).toBe(
        `${text}:true`,
      );
    }
  });

  it("does not treat digits or punctuation as strong", () => {
    for (const ch of ["5", "٠", "٥", ".", "-", " ", "_", "،"]) {
      const code = ch.charCodeAt(0);
      expect(`${ch}:${isStrongRtlChar(code) || isStrongLtrChar(code)}`).toBe(
        `${ch}:false`,
      );
    }
  });

  it("recognises LTR letters including accented and CJK", () => {
    for (const ch of ["A", "z", "é", "Δ", "д", "あ", "漢", "한"]) {
      expect(`${ch}:${isStrongLtrChar(ch.charCodeAt(0))}`).toBe(`${ch}:true`);
    }
  });

  it("keeps the two classifications disjoint", () => {
    for (let code = 0x20; code < 0x3000; code++) {
      if (isStrongRtlChar(code)) {
        expect(`${code}:${isStrongLtrChar(code)}`).toBe(`${code}:false`);
      }
    }
  });
});

describe("lineDirection", () => {
  it("uses the first strong character, like dir=auto", () => {
    expect(lineDirection("مرحبا Hello")).toBe("rtl");
    expect(lineDirection("Hello مرحبا")).toBe("ltr");
  });

  it("skips leading neutrals (list markers, quotes, digits)", () => {
    expect(lineDirection("- مرحبا")).toBe("rtl");
    expect(lineDirection("1. שלום")).toBe("rtl");
    expect(lineDirection('"Hello"')).toBe("ltr");
    expect(lineDirection("2026 تقرير")).toBe("rtl");
  });

  it("returns null when there is no strong character", () => {
    for (const text of ["", "   ", "123", "---", "!?*", "١٢٣"]) {
      expect(`${JSON.stringify(text)}:${lineDirection(text)}`).toBe(
        `${JSON.stringify(text)}:null`,
      );
    }
  });
});

describe("dominantDirection", () => {
  it("counts strong characters rather than taking the first", () => {
    // Opens in English but is overwhelmingly Arabic.
    const note = "Title: Arabic notes\n" + "هذا نص عربي طويل جدا. ".repeat(20);
    expect(dominantDirection(note)).toBe("rtl");
  });

  it("prefers ltr on a tie", () => {
    expect(dominantDirection("اA")).toBe("ltr");
  });

  it("falls back to ltr for content with no strong characters", () => {
    expect(dominantDirection("123 --- 456")).toBe("ltr");
  });

  it("only scans the start of very long notes (performance guard)", () => {
    // 100 Latin characters, then an enormous Arabic tail. With a 100-character
    // budget only the Latin head is read, so the result stays "ltr".
    const head = "a".repeat(100);
    const tail = "ا".repeat(100000);
    expect(head + tail).toHaveLength(100100);
    expect(dominantDirection(head + tail, 100)).toBe("ltr");
  });

  it("decides on the scanned text when the budget covers it", () => {
    // 100 Latin + 150 Arabic (250 chars), scanned in full: majority RTL.
    expect(dominantDirection("a".repeat(100) + "ا".repeat(150), 1000)).toBe(
      "rtl",
    );
  });
});

describe("parseDirection", () => {
  it("accepts the three canonical values in any case", () => {
    expect(parseDirection("RTL")).toBe("rtl");
    expect(parseDirection(" ltr ")).toBe("ltr");
    expect(parseDirection("Auto")).toBe("auto");
  });

  it("accepts long-hand spellings people write", () => {
    expect(parseDirection("right-to-left")).toBe("rtl");
    expect(parseDirection("right to left")).toBe("rtl");
    expect(parseDirection("left_to_right")).toBe("ltr");
  });

  it("rejects anything else, including non-strings", () => {
    for (const value of ["sideways", "", "  ", null, undefined, 5, true, {}]) {
      expect(`${JSON.stringify(value)}:${parseDirection(value)}`).toBe(
        `${JSON.stringify(value)}:null`,
      );
    }
  });
});

describe("resolveDirection", () => {
  it("prefers frontmatter over everything", () => {
    expect(
      resolveDirection({
        frontmatter: "ltr",
        remembered: "rtl",
        defaultDirection: "auto",
      }),
    ).toEqual({ direction: "ltr", source: "frontmatter" });
  });

  it("honours auto in frontmatter without falling through", () => {
    expect(
      resolveDirection({
        frontmatter: "auto",
        remembered: "rtl",
        defaultDirection: "ltr",
      }),
    ).toEqual({ direction: "auto", source: "frontmatter" });
  });

  it("uses the remembered direction next", () => {
    expect(
      resolveDirection({ remembered: "rtl", defaultDirection: "auto" }),
    ).toEqual({ direction: "rtl", source: "file" });
  });

  it("falls back to the default", () => {
    expect(resolveDirection({ defaultDirection: "rtl" })).toEqual({
      direction: "rtl",
      source: "default",
    });
  });

  it("ignores absent or invalid frontmatter values", () => {
    expect(
      resolveDirection({ frontmatter: null, defaultDirection: "ltr" }).source,
    ).toBe("default");
  });
});

describe("cycle and labels", () => {
  it("cycles ltr -> rtl -> auto -> ltr", () => {
    expect(nextDirection("ltr")).toBe("rtl");
    expect(nextDirection("rtl")).toBe("auto");
    expect(nextDirection("auto")).toBe("ltr");
  });

  it("labels directions for the status bar", () => {
    expect(directionLabel("auto")).toBe("Auto");
    expect(directionLabel("rtl")).toBe("RTL");
    expect(directionLabel("ltr")).toBe("LTR");
  });

  it("maps directions to CSS classes", () => {
    expect(directionClass("rtl")).toBe("rtl-plus-rtl");
    expect(directionClass("ltr")).toBe("rtl-plus-ltr");
    expect(directionClass("auto")).toBe("rtl-plus-ltr");
  });
});
