# Changelog

All notable changes to this plugin.

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
