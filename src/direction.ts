/**
 * Pure direction logic. No Obsidian or CodeMirror imports, so every rule here is
 * unit-testable and the hot paths stay allocation-light.
 */

export type Direction = "ltr" | "rtl" | "auto";
/** A direction that can be applied to an element: never "auto". */
export type ResolvedDirection = "ltr" | "rtl";

// Strong right-to-left scripts: Hebrew, Arabic (incl. Supplement/Extended),
// Syriac, Thaana, NKo, Samaritan, Mandaic, Arabic Presentation Forms.
const RTL_RANGES: Array<[number, number]> = [
  [0x0590, 0x05ff],
  [0x0600, 0x06ff],
  [0x0700, 0x074f],
  [0x0750, 0x077f],
  [0x0780, 0x07bf],
  [0x07c0, 0x07ff],
  [0x0800, 0x083f],
  [0x0840, 0x085f],
  [0x08a0, 0x08ff],
  [0xfb1d, 0xfb4f],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
  [0x10800, 0x10fff],
  [0x1e800, 0x1efff],
];

// Characters that live *inside* RTL script blocks but are not strong RTL
// letters: digits, punctuation, marks and format characters. Unicode classes
// them as neutral — they take the surrounding direction and must not decide it.
// Without this, "2026" would read as RTL, and the Arabic comma in
// "مرحبا، Hello" would beat the Latin word that follows it.
const RTL_BLOCK_NEUTRALS: Array<[number, number]> = [
  [0x0591, 0x05bd], // Hebrew accents and points (marks)
  [0x05be, 0x05c7], // Hebrew punctuation and marks
  [0x0600, 0x0605], // Arabic number signs
  [0x0606, 0x060f], // Arabic signs and marks (incl. ، ؛ ؟)
  [0x0610, 0x061a], // Arabic marks
  [0x064b, 0x065f], // Arabic vowel marks
  [0x0660, 0x0669], // Arabic-Indic digits
  [0x066a, 0x066f], // Arabic percent, decimal separator, etc.
  [0x06d6, 0x06ed], // Arabic small marks
  [0x06f0, 0x06f9], // Extended Arabic-Indic digits
  [0x06fd, 0x06fe], // Arabic signs
  [0x070f, 0x070f], // Syriac abbreviation mark
  [0x0711, 0x0711], // Syriac mark
  [0x0730, 0x074a], // Syriac marks
  [0x07a6, 0x07b0], // Thaana marks
  [0x07eb, 0x07f3], // NKo marks
  [0x0816, 0x082d], // Samaritan marks
  [0x0859, 0x085b], // Mandaic marks
  [0x08d3, 0x08ff], // Arabic marks (Extended-A)
  [0xfb1e, 0xfb1e], // Hebrew point
  [0xfe00, 0xfe0f], // variation selectors
  [0xfeff, 0xfeff], // zero-width no-break space
];

export function isStrongRtlChar(code: number): boolean {
  for (const [lo, hi] of RTL_BLOCK_NEUTRALS) {
    if (code >= lo && code <= hi) return false;
  }
  for (const [lo, hi] of RTL_RANGES) {
    if (code >= lo && code <= hi) return true;
    if (code < lo) return false; // ranges are ascending
  }
  return false;
}

/**
 * Is this a strong left-to-right letter? Latin, Greek, Cyrillic, CJK and the
 * other LTR scripts. Digits and punctuation are deliberately neutral: they
 * follow the surrounding direction and must not decide it.
 */
export function isStrongLtrChar(code: number): boolean {
  if (code < 0x41) return false;
  if (code <= 0x5a) return true; // A-Z
  if (code <= 0x60) return false;
  if (code <= 0x7a) return true; // a-z
  if (code < 0x00c0) return false;
  // Latin-1 letters, Latin Extended, Greek, Cyrillic, Armenian, Georgian, Hangul
  // Jamo, CJK, Kana, Hangul syllables.
  return (
    (code >= 0x00c0 && code <= 0x02af) ||
    (code >= 0x0370 && code <= 0x03ff) ||
    (code >= 0x0400 && code <= 0x052f) ||
    (code >= 0x0530 && code <= 0x058f) ||
    (code >= 0x10a0 && code <= 0x10ff) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x3040 && code <= 0x30ff)
  );
}

/** Scripts that read right-to-left. */
export const RTL_LANGUAGES = [
  "Arabic",
  "Hebrew",
  "Persian",
  "Farsi",
  "Urdu",
  "Pashto",
  "Sindhi",
  "Kurdish",
  "Dhivehi",
  "Syriac",
  "Aramaic",
  "Yiddish",
  "Uyghur",
] as const;

/**
 * The direction of a single line, used when the document is on `auto`.
 *
 * The first strong character decides, which is what Unicode's `dir="auto"`
 * does, and what a reader expects: an English sentence embedded in an Arabic
 * note should render left-to-right even though the note is Arabic.
 */
export function lineDirection(text: string): ResolvedDirection | null {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isStrongRtlChar(code)) return "rtl";
    if (isStrongLtrChar(code)) return "ltr";
  }
  return null;
}

/**
 * Direction of a whole document: whichever strong script appears more often.
 *
 * Counting beats "first strong character" here because notes usually open with
 * frontmatter, a title, or a Markdown marker — none of which should decide the
 * direction of a long Arabic note that happens to start with an English word.
 */
export function dominantDirection(
  text: string,
  maxScan = 4000,
): ResolvedDirection {
  const sample = text.length > maxScan ? text.slice(0, maxScan) : text;
  let rtl = 0;
  let ltr = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (isStrongRtlChar(code)) rtl++;
    else if (isStrongLtrChar(code)) ltr++;
  }
  return rtl > ltr ? "rtl" : "ltr";
}

/** Normalise a value that may be a frontmatter scalar, number or boolean. */
export function parseDirection(value: unknown): Direction | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim().toLowerCase();
  if (normalised === "rtl" || normalised === "ltr" || normalised === "auto") {
    return normalised;
  }
  // Long-hand spellings people actually type: "right-to-left", "right to left",
  // "rtl", "left_to_right", "ltr".
  const separators = "[-_ ]*";
  const rtlWords = new RegExp(
    `^(r|rtl|right)${separators}(to)?${separators}(l|left)$`,
  );
  const ltrWords = new RegExp(
    `^(l|ltr|left)${separators}(to)?${separators}(r|right)$`,
  );
  if (rtlWords.test(normalised)) return "rtl";
  if (ltrWords.test(normalised)) return "ltr";
  return null;
}

export interface DirectionInputs {
  /** `direction:` in the note's frontmatter, when present and valid. */
  frontmatter?: Direction | null;
  /** Direction remembered for this file, when `rememberPerFile` is on. */
  remembered?: Direction | null;
  /** The plugin's default direction. */
  defaultDirection: Direction;
}

export interface DirectionResolution {
  direction: Direction;
  /** Where the decision came from, for the status bar and for tests. */
  source: "frontmatter" | "file" | "default";
}

/**
 * Decide the direction for a note.
 *
 * Precedence is frontmatter → remembered per file → default, matching the
 * behaviour of the plugin this replaces.
 */
export function resolveDirection(inputs: DirectionInputs): DirectionResolution {
  if (inputs.frontmatter) {
    return { direction: inputs.frontmatter, source: "frontmatter" };
  }
  if (inputs.remembered) {
    return { direction: inputs.remembered, source: "file" };
  }
  return { direction: inputs.defaultDirection, source: "default" };
}

/** The next direction in the cycle used by the toggle command. */
export function nextDirection(current: Direction): Direction {
  switch (current) {
    case "ltr":
      return "rtl";
    case "rtl":
      return "auto";
    default:
      return "ltr";
  }
}

export function directionLabel(direction: Direction): string {
  return direction === "auto" ? "Auto" : direction.toUpperCase();
}

/** CSS class applied to a container for a direction. */
export function directionClass(direction: Direction): string {
  return direction === "rtl" ? "rtl-plus-rtl" : "rtl-plus-ltr";
}
