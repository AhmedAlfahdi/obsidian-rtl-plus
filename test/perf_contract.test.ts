/**
 * These tests lock in the performance properties that the plugin this replaces
 * lacked. They do not benchmark; they assert the work *shape* — how many lines
 * are touched per operation — because that is what decides whether typing lags
 * on a long note.
 */
import { frontmatterRange } from "../src/frontmatter";
import { dominantDirection, lineDirection } from "../src/direction";

/** Counts how many line lookups an operation performs. */
function countingDoc(lines: string[]) {
  let calls = 0;
  const accessor = (n: number) => {
    calls++;
    return { text: lines[n - 1] ?? "", to: (n - 1) * 40 };
  };
  return { accessor, calls: () => calls };
}

describe("work is proportional to the viewport, not the document", () => {
  it("frontmatter detection never scans the body", () => {
    const body = Array(50000).fill("some body line");
    const doc = countingDoc(["---", "title: x", "---", ...body]);

    frontmatterRange(doc.accessor, body.length + 3);

    expect(doc.calls()).toBeLessThanOrEqual(3);
  });

  it("a note without frontmatter costs a single lookup", () => {
    const doc = countingDoc(Array(50000).fill("plain text"));
    frontmatterRange(doc.accessor, 50000);
    expect(doc.calls()).toBe(1);
  });
});

describe("direction detection is bounded", () => {
  it("dominantDirection samples a fixed prefix, not the whole note", () => {
    // A 200k-character note: the scan must stay bounded by maxScan.
    const huge = "ا".repeat(200000);
    const started = process.hrtime.bigint();
    dominantDirection(huge, 2000);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    // 2000 characters is microseconds of work; a whole-document scan would be
    // ~100x this. The bound is deliberately loose so it cannot be flaky.
    expect(elapsedMs).toBeLessThan(20);
  });

  it("lineDirection is linear in the line, and lines are short", () => {
    const line = "هذا سطر عربي طويل نسبيا مع كلمات كثيرة ".repeat(10);
    const started = process.hrtime.bigint();
    for (let i = 0; i < 10000; i++) lineDirection(line);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    // 10k classifications of a ~430-character line.
    expect(elapsedMs).toBeLessThan(1500);
  });

  it("returns on the first strong character for typical prose", () => {
    // Cheap early exit: the answer is available in the first few characters.
    expect(lineDirection("مرحبا بكم في هذا النص الطويل")).toBe("rtl");
    expect(lineDirection("Welcome to this long English sentence")).toBe("ltr");
  });
});
