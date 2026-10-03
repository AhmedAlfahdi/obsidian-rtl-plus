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
  /**
   * A string-like object that counts `charCodeAt` reads. Asserting the number of
   * characters examined is deterministic, unlike a wall-clock bound — an
   * absolute 20ms threshold failed on a cold CI runner at 22ms, which said
   * nothing about the algorithm.
   */
  function counted(text: string, maxScan?: number) {
    let reads = 0;
    const obj = {
      length: text.length,
      charCodeAt(i: number): number {
        reads++;
        return text.charCodeAt(i);
      },
      slice: (a?: number, b?: number) => text.slice(a, b),
      toString: () => text,
      valueOf: () => text,
    };
    return {
      /** Cast because the implementation only uses the members above. */
      text: obj as unknown as string,
      run: () => dominantDirection(obj as unknown as string, maxScan),
      runLine: () => lineDirection(obj as unknown as string),
      reads: () => reads,
    };
  }

  it("scans a fixed prefix, so the cost does not grow with the note", () => {
    const small = counted("ا".repeat(2000), 1000);
    small.run();
    const huge = counted("ا".repeat(200000), 1000);
    huge.run();

    // 100x more text, the same amount of work.
    expect(small.reads()).toBeLessThanOrEqual(1000);
    expect(huge.reads()).toBeLessThanOrEqual(1000);
    expect(huge.reads()).toBe(small.reads());
  });

  it("samples the prefix even when the note is short", () => {
    const short = counted("ا".repeat(300), 1000);
    short.run();
    expect(short.reads()).toBe(300);
  });

  it("stops at the first strong character, so long lines are cheap", () => {
    const arabic = counted("م" + "ن".repeat(5000));
    arabic.runLine();
    const latin = counted("a" + "b".repeat(5000));
    latin.runLine();

    // Decided within the first character, not after 5001.
    expect(arabic.reads()).toBeLessThan(10);
    expect(latin.reads()).toBeLessThan(10);
  });

  it("reads neutrals before deciding, but no more than the leading run", () => {
    const leading = counted("- ".repeat(20) + "م" + "ن".repeat(5000));
    leading.runLine();
    expect(leading.reads()).toBeLessThan(50);
  });
});
