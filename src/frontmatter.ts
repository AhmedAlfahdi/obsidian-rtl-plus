/**
 * Frontmatter detection for the editor.
 *
 * Deliberately free of Obsidian and CodeMirror imports: it sits on the per-edit
 * path, so it is written to touch as few lines as possible and is unit-tested
 * on its own.
 */

export interface LineInfo {
  text: string;
  to: number;
}

/** Frontmatter opens with exactly `---` on the first line, like Obsidian. */
export function isFrontmatterFence(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "---";
}

/**
 * Range of the note's frontmatter, or null.
 *
 * Only the first line is inspected to decide whether frontmatter exists at all,
 * and scanning stops at the closing fence — so a note with no frontmatter costs
 * exactly one line lookup, and one with frontmatter costs the size of the block,
 * never the size of the note.
 */
export function frontmatterRange(
  lineAt: (lineNumber: number) => LineInfo,
  lineCount: number,
): { from: number; to: number } | null {
  if (lineCount < 1) return null;
  const first = lineAt(1);
  if (!isFrontmatterFence(first.text)) return null;

  for (let n = 2; n <= lineCount; n++) {
    const line = lineAt(n);
    // Reuse the line we already fetched: one lookup per line, never two.
    if (isFrontmatterFence(line.text)) {
      return { from: 0, to: line.to };
    }
  }
  return null;
}
