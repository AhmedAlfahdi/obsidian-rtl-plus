# Changelog

All notable changes to this plugin.

## 1.0.4

### Fixed

- **Property names are right-aligned in RTL notes.** The panel was RTL, so labels
  moved to the right-hand side, but each label's text still started at its box's
  left edge and read as detached from its value. Alignment now uses logical
  `text-align: end`, so the same rules work in both directions.
- **`auto` now resolves the panel direction from the note's content.** `dir="auto"`
  is resolved by the browser per element, and a properties panel is mostly the
  single word "Properties" plus Latin keys — so auto resolved LTR and undid the
  note's direction.

## 1.0.3

### Fixed

- **Properties panel now renders right-to-left in RTL notes.** The move-list that
  pins code, maths and tables to LTR also included `.metadata-container`, so the
  panel was forced left-to-right: Arabic labels sat on the left of their values.
  The container now follows the note, and only individual values are isolated.
- The panel's `dir` attribute is set, not just its CSS direction, because
  Obsidian lays the label/value rows out with flexbox — CSS `direction` alone
  does not move them.

## 1.0.2

- Run the built plugin against a fake DOM as part of the build.
- Apply the direction on `file-open` as well as `active-leaf-change`.

## 1.0.1

- Apply the direction as an inline style as well as a class; a class alone lost to Obsidian's own `.cm-editor` rules.
- Add a diagnostics command.

## 1.0.0

- First release.
