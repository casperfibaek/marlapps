# Notes Editor Upgrade Plan

## Overview
Upgrade the rich-text editor in `apps/notes/editor.js` to handle multi-block selections, reflect toolbar state, support repeat-formatting, and add markdown-style shortcuts.

---

## 1. Multi-Block Selection Support for Block Operations

**Problem:** `setBlockType()` and `toggleList()` both call `getCurrentBlock()`, which returns only the single block at the anchor (cursor start). When the user selects text spanning multiple paragraphs/blocks and clicks H2 or bullet list, only the first block is affected.

**Solution:** Add a `getSelectedBlocks()` helper that returns all block-level elements intersecting the current selection range, then update `setBlockType()` and `toggleList()` to iterate over all of them.

### Implementation

**New helper — `getSelectedBlocks()`:**
- Get the selection range's `startContainer` and `endContainer`.
- Walk up from each to find their containing block element (same logic as `getCurrentBlock()`).
- Collect every direct-child block of the editor between (and including) those two blocks.
- Return the array. If the selection is collapsed, return a single-element array with the current block.

**Update `setBlockType(tagName)`:**
- Call `getSelectedBlocks()` instead of `getCurrentBlock()`.
- Loop: convert each block to the new tag (skip if already that tag).
- After the loop, restore the selection to span the first-to-last converted block.

**Update `toggleList(listTag)`:**
- Call `getSelectedBlocks()`.
- **Wrap case:** Create one `<UL>` or `<OL>`, wrap each selected block as a `<LI>` inside it, and insert the list where the first block was.
- **Unwrap case:** If *all* selected blocks are `<LI>` children of the same list type, convert each `<LI>` back to `<P>`.
- **Mixed case:** If some blocks are in a list and some aren't, normalize everything into the target list type.

**Files:** `editor.js`

---

## 2. Inline Formatting Across Selections (Audit)

**Current state:** `wrapSelection()` already uses `range.surroundContents()` with a fallback to `extractContents()` + re-insert, so it *should* handle cross-block selections. However, there's a subtle issue: unwrapping only finds one ancestor wrapper via `findWrappingElement()`, which checks only the anchor node's ancestors — it won't unwrap formatting in the focus-side of the selection.

**Fix:**
- When toggling off (unwrap), iterate through all `<STRONG>`/`<EM>`/`<U>` elements within the selection range (using `range.cloneContents()` or a TreeWalker within the range) and unwrap each one.
- When toggling on, the existing `extractContents` fallback is fine — just ensure we don't double-wrap nodes already formatted.

**Files:** `editor.js`

---

## 3. Toolbar State Reflection

**Problem:** The toolbar buttons don't visually indicate the active formatting at the cursor. Users can't tell if they're inside a bold span, an H2 block, or a list.

**Solution:** Add a `updateToolbarState()` function that inspects the current selection and toggles an `.active` class on the relevant toolbar buttons.

### Implementation

**`updateToolbarState()`:**
- Get the selection's anchor node.
- Walk up the DOM from the anchor to the editor root, collecting all tag names.
- For each toolbar button, check if its command's tag is in the ancestor chain:
  - `bold` → `STRONG` or `B` in ancestors
  - `italic` → `EM` or `I` in ancestors
  - `underline` → `U` in ancestors
  - `insertUnorderedList` → `LI` inside `UL`
  - `insertOrderedList` → `LI` inside `OL`
  - `formatBlock` with value `h1`/`h2`/`h3`/`p` → nearest block tag matches
- Toggle `.active` class on each button accordingly.

**When to call it:**
- On `selectionchange` event (on `document`, filtered to our editor).
- After every formatting command in `execToolbarCommand()`.
- On editor focus.

**Performance:** `selectionchange` fires frequently but the function is a simple ancestor walk (O(depth), typically 5-10 nodes) with a fixed set of ~11 buttons. No DOM queries, no layout thrashing. Negligible cost.

**CSS:** Add `.editor-toolbar button.active` style — subtle background highlight + slightly bolder text, using existing theme variables.

**Files:** `editor.js`, `styles.css`

---

## 4. Ctrl+Y — Reapply Last Formatting

**Problem:** No way to quickly reapply the last used formatting command (e.g., apply bold to several non-contiguous selections without clicking the button each time).

**Solution:** Track the last formatting command and allow Ctrl+Y to reapply it.

### Implementation

- Add a module-level `lastFormatCommand = null` variable (stores `{ cmd, value }`).
- In `execToolbarCommand()`, before the switch, save `lastFormatCommand = { cmd, value }`.
- In `handleKeydown()`, intercept `Ctrl+Y` (and `Cmd+Y` on Mac):
  - If `lastFormatCommand` exists, call `execToolbarCommand(lastFormatCommand.cmd, lastFormatCommand.value)`.
  - Prevent default.
- **Note:** Ctrl+Y is commonly used for redo in some apps, but this editor already handles redo via the `beforeinput` event's `historyRedo` input type. The `handleBeforeInput` handler catches redo before keydown fires, so there's no conflict. We should add a check: only reapply if `lastFormatCommand` is set; otherwise, fall through to default behavior.
- Add the shortcut to the toolbar button title/tooltip for discoverability (e.g., "Bold (Ctrl+B) · Ctrl+Y to repeat last").

**Files:** `editor.js`

---

## 5. Markdown-Style Input Shortcuts

**Problem:** Power users want to type shorthand like `## ` to create a heading, without reaching for the toolbar.

**Solution:** Detect markdown-like patterns at the start of a block and auto-convert them on Space (for headings/lists) or Enter (for rules).

### Patterns

| Input | Trigger | Result |
|-------|---------|--------|
| `# ` | Space | Convert block to `<H1>`, remove the `# ` prefix |
| `## ` | Space | Convert block to `<H2>` |
| `### ` | Space | Convert block to `<H3>` |
| `* ` or `- ` | Space | Convert block to `<UL><LI>` |
| `1. ` | Space | Convert block to `<OL><LI>` |
| `----` (4+ dashes) | Enter | Convert to `<HR>` (already implemented) |
| `---` | Space | Convert to `<HR>` + new `<P>` |

### Implementation

**New function — `handleMarkdownShortcut(e)`:**
- Called from `handleKeydown` when `e.key === ' '` (Space) and selection is collapsed.
- Get current block's text content.
- Check if cursor is at the end of a recognized prefix (e.g., text starts with `## ` and cursor is right after the space would be inserted).
- If matched:
  - `e.preventDefault()`
  - Push undo snapshot
  - Remove the prefix text from the block
  - Apply the corresponding block transformation (`setBlockType` or `toggleList`)
  - Trigger `onInputCallback`

**Edge cases:**
- Only trigger at the very start of a block (no text before the prefix).
- Don't trigger inside list items or headings (avoid converting `## ` inside an existing H2).
- The existing `----` + Enter pattern already works; we extend it to also accept `---` + Space.

**Files:** `editor.js`

---

## 6. Implementation Order

1. **`getSelectedBlocks()` helper** — Foundation for items 2 and 3.
2. **Multi-block `setBlockType()`** — Uses the new helper.
3. **Multi-block `toggleList()`** — Uses the new helper.
4. **Inline formatting audit** — Fix unwrap across selections.
5. **Toolbar state reflection** — `updateToolbarState()` + CSS.
6. **Ctrl+Y reapply** — Small addition, low risk.
7. **Markdown shortcuts** — Builds on existing `handleKeydown`, independent of other changes.

Each step is independently testable and can be merged incrementally.

---

## 7. Files Changed

| File | Changes |
|------|---------|
| `apps/notes/editor.js` | All logic changes (items 1–6) |
| `apps/notes/styles.css` | `.active` state for toolbar buttons |
| `service-worker.js` | Cache version bump |

No new files needed. No changes to `index.html` or `app.js`.
