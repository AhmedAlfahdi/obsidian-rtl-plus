import { frontmatterRange, isFrontmatterFence } from "../src/frontmatter";

function docOf(lines: string[]) {
  let offset = 0;
  const starts = lines.map((text) => {
    const from = offset;
    offset += text.length + 1;
    return { text, from, to: from + text.length };
  });
  return (n: number) => starts[n - 1];
}

describe("isFrontmatterFence", () => {
  it("accepts only a bare fence", () => {
    for (const text of ["---", " --- ", "\t---"]) {
      expect(`${JSON.stringify(text)}:${isFrontmatterFence(text)}`).toBe(
        `${JSON.stringify(text)}:true`,
      );
    }
    for (const text of ["----", "--", "--- text", "# ---", ""]) {
      expect(`${JSON.stringify(text)}:${isFrontmatterFence(text)}`).toBe(
        `${JSON.stringify(text)}:false`,
      );
    }
  });
});

describe("frontmatterRange", () => {
  it("ends at the closing fence, not the body", () => {
    const lines = ["---", "title: x", "tags:", "  - a", "---", "body"];
    const range = frontmatterRange(docOf(lines), lines.length);
    expect(range).toEqual({ from: 0, to: lines.slice(0, 5).join("\n").length });
  });

  it("returns null when the note does not open with frontmatter", () => {
    const lines = ["# Title", "---", "a: 1", "---"];
    expect(frontmatterRange(docOf(lines), lines.length)).toBeNull();
  });

  it("tolerates whitespace around the fences", () => {
    const lines = ["--- ", "a: 1", " ---", "body"];
    expect(frontmatterRange(docOf(lines), lines.length)).not.toBeNull();
  });

  it("returns null for an unterminated block", () => {
    const lines = ["---", "a: 1", "b: 2"];
    expect(frontmatterRange(docOf(lines), lines.length)).toBeNull();
  });

  it("costs one line lookup when there is no frontmatter", () => {
    let calls = 0;
    const accessor = (n: number) => {
      calls++;
      return { text: "text", to: n * 5 };
    };
    expect(frontmatterRange(accessor, 20000)).toBeNull();
    expect(calls).toBe(1);
  });

  it("stops at the closing fence instead of scanning the note", () => {
    const lines = ["---", "a: 1", "---", ...Array(20000).fill("body")];
    let calls = 0;
    const accessor = (n: number) => {
      calls++;
      return { text: lines[n - 1], to: n * 5 };
    };
    frontmatterRange(accessor, lines.length);
    expect(calls).toBe(3);
  });

  it("handles an empty document", () => {
    expect(frontmatterRange(() => ({ text: "", to: 0 }), 0)).toBeNull();
  });
});
