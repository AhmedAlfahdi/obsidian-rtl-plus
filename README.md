# RTL Support++

Right-to-left text direction for Obsidian, for Arabic, Hebrew, Persian, Urdu and
the other RTL scripts — written to stay responsive on long notes.

This is an independent implementation, motivated by
[obsidian-rtl](https://github.com/esm7/obsidian-rtl) by esm7 (MIT). It keeps the
behaviour that plugin established and rebuilds the parts that made large notes
slow to type in.

## What it does

- **Per-note direction** from a `direction:` frontmatter field:

  ```yaml
  ---
  العنوان: ...
  direction: rtl
  ---
  ```

  Accepted values: `rtl`, `ltr`, `auto` (also `right-to-left`, `left to right`).
- **Commands** (and the status bar item) cycle a note through
  `LTR → RTL → Auto`, plus direct commands for each.
- **Remember direction per note**, so a note you set to RTL stays RTL.
- **Auto** decides per line from the first strong character, so an English
  sentence inside an Arabic note still reads left to right.
- **Frontmatter stays left-to-right** in the editor by default, because property
  values are usually Latin and punctuation otherwise jumps around.
- Code, math, tables, tags and links are isolated so they keep their own
  direction inside RTL prose.

## Why it is faster

The plugin this replaces rebuilt a CodeMirror decoration set for the whole
viewport on every document change, and called `EditorView.dispatch()` (forcing a
full re-measure) on every direction toggle. Work therefore grew with the length
of the note *and* with every keystroke.

This implementation changes the shape of the work:

| | Original | Here |
| --- | --- | --- |
| Keystroke in a fixed-direction note | Rebuild a decoration for every line in the viewport | Nothing: the direction is one class on the container, so there are no per-line decorations to rebuild |
| Keystroke in an `auto` note | Re-scan every line in the viewport | Re-scan only when the edit touches the viewport; line results are memoised by line text |
| Direction toggle | `dispatch()` → full document re-measure | A targeted state effect that only rebuilds the `auto` decorations |
| Frontmatter detection | Walked the syntax tree on every change | One line lookup when there is no frontmatter, and it stops at the closing fence |
| Whole-note direction | — | `dominantDirection` samples a bounded prefix rather than the whole document |
| Styling | `.is-rtl div, .is-rtl li, .is-rtl p` matched every element in the note | The `dir` attribute on the container, which the browser applies natively |

`test/perf_contract.test.ts` asserts these properties rather than benchmarking
them, so a regression that reintroduces whole-document work fails the suite.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/rtl-support-plus/`, then enable **RTL Support++**.

If you are switching from *RTL Support*, disable that plugin first: both add a
status bar item and a direction command, and they will fight over the same
notes.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Default text direction | Auto | Used when a note has no frontmatter direction and none is remembered |
| Remember direction per note | On | Restore the direction you chose for a note |
| Set note title direction | On | Apply the direction to the note title in the tab header |
| Keep frontmatter left to right | On | Raw YAML always reads LTR in the editor |
| Right-align YAML in reading view | Off | Show YAML blocks right-aligned in RTL notes |
| Show status bar item | On | Clickable direction indicator |

## Develop

```bash
npm install
npm test          # direction, frontmatter and performance-contract tests
npm run build     # lint, type-check, bundle main.js
```

## License

MIT. Behaviour modelled on [obsidian-rtl](https://github.com/esm7/obsidian-rtl)
(MIT, © esm7); implementation independent.
