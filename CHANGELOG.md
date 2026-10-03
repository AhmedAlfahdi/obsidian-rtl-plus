# Changelog

All notable changes to this plugin.

## 1.0.6

### Fixed

- **Property names are right-aligned again.** 1.0.5 switched the label rule to
  logical `text-align: end`, which resolves against the *element's* own
  direction — and the key element does not inherit RTL, so `end` resolved to
  left and every label went left-aligned. The rule now uses absolute
  `text-align: right`, which no inherited direction can redirect.
- `direction: rtl` remains off the label: with it set, Latin labels (`isbn 13`)
  end 20-40px further right than Arabic ones. Measured in a browser over five
  candidate rules; `text-align: right` alone is the one that puts both scripts on
  the same edge without that side effect.
- The value column is aligned absolutely too, and Latin values inside an RTL note
  keep their own reading direction.

## 1.0.5

### Fixed

- **Arabic and Latin property names now share the same right edge.** The label
  rule set `direction: rtl` on the key element, which made Latin labels
  ("isbn 13", "Asin") pin flush right while Arabic labels stopped 20-40px short —
  measured against a screenshot of the panel. The direction is no longer forced;
  the key inherits the container's direction and is aligned with
  `text-align: end`, so every label lands on the same edge.
- Cover the camel-case `.metadataPropertyKey` / `.metadataPropertyValue`
  spellings used by some Obsidian builds.

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
