# Notes App v2 - Improvement Plan

## Bug Fixes

### 1. Missing `.btn-danger` CSS class
**File:** `apps/notes/styles.css`
The delete button in `index.html:75` uses `class="btn btn-danger btn-sm"` but `.btn-danger` is never defined in the stylesheet. Add proper danger button styling consistent with `.btn-secondary`.

### 2. Notebook icon color not applied
**File:** `apps/notes/app.js` — `renderNotebooks()`
The color style is applied to the icon span via inline `style="color: ..."` but the icon is an HTML entity (📗) which is an emoji and ignores CSS `color`. Fix by using a colored dot or a non-emoji glyph that respects the `color` property, or by adding a separate color indicator element next to the icon.

### 3. Notebook list visual shift on hover
**File:** `apps/notes/styles.css`
Hovering a notebook item causes the list to visually shift. Likely caused by the settings gear button toggling from `display: none` to `display: flex` on hover, which changes the item's layout. Fix by using `visibility: hidden` / `visibility: visible` instead, or reserving space with `opacity: 0` / `opacity: 1` so the button always occupies its space.

### 4. Unsanitized `nb.color` in HTML style attributes
**Files:** `apps/notes/app.js:245, 589, 750`
Notebook colors are injected directly into `style` attributes via template literals. Validate that `nb.color` matches a known color from `NOTEBOOK_COLORS` before inserting it into HTML.

### 5. `exportCurrentNote` doesn't flush unsaved changes
**File:** `apps/notes/app.js:727-732`
`exportCurrentNote()` is synchronous and doesn't call `flushSave()` before exporting. This means the exported markdown could contain stale content. Make it async and flush first.

### 6. Popover vertical overflow
**File:** `apps/notes/app.js:361`
The notebook settings popover is positioned at `rect.bottom + 4` but only horizontal overflow is clamped. If a notebook is near the bottom of the sidebar, the popover overflows below the viewport. Add a vertical bounds check and flip the popover above the button when needed.

### 7. Blur/Enter race in inline notebook rename/create
**Files:** `apps/notes/app.js:422-450, 506-537`
When validation fails in the `finish()` handler, `finished` is set back to `false`. The `blur` event can fire while the `alert` dialog is showing, potentially causing a double call. Use a more robust guard (e.g. remove the blur listener before showing alert, or use a microtask flag).

### 8. Missing notes refresh after notebook deletion
**File:** `apps/notes/app.js:554-555`
`deleteNotebookById` mutates `this.notes` locally (setting `notebookId = null`) but doesn't refresh from the DB. Add `this.notes = await getAllNotes()` after the DB operation to stay in sync.

---

## New Features

### 9. Drag and drop to reorder notebooks
**File:** `apps/notes/app.js` — `renderNotebooks()`
Add drag-and-drop support for reordering user notebooks in the sidebar. "All Notes" and "Uncategorized" should remain pinned at the top. Each notebook item should become draggable. On drop, recalculate `order` values for all notebooks and persist to IndexedDB. Add visual indicators (drag handle, drop line) consistent with the existing note drag-drop styling.

### 10. Drag and drop to reorder notes within a notebook
**File:** `apps/notes/app.js` — `renderNotesList()`
Add drag-and-drop support for reordering notes within the current notebook view. This requires:
- Adding an `order` field to notes (or a `position` field) in the data model.
- A DB migration or lazy-add of the field (default to `updatedAt`-based ordering for existing notes).
- Visual drop indicators between note items.
- Updating the sort logic to use manual order when within a specific notebook, falling back to `updatedAt` for "All Notes" view.
- Mobile: long-press could enter a reorder mode, or use a drag handle.

---

## Performance

### 11. Avoid `renderNotebooks()` on every autosave
**File:** `apps/notes/app.js:702`
`saveCurrentNote()` calls `renderNotebooks()` on every autosave (every 2s). Since autosave doesn't change notebook membership, skip the notebooks re-render. Only call `renderNotebooks()` when a note is created, deleted, or moved between notebooks.

### 12. O(n×m) notebook count computation
**File:** `apps/notes/app.js:221-244`
`renderNotebooks()` calls `this.notes.filter(...)` per notebook to compute counts. Replace with a single-pass count map:
```js
const countMap = {};
for (const n of this.notes) {
  const key = n.notebookId || '__uncategorized__';
  countMap[key] = (countMap[key] || 0) + 1;
}
```

### 13. Move `ALLOWED_TAGS` to module scope
**File:** `apps/notes/editor.js:88-91`
The `ALLOWED_TAGS` Set is recreated on every recursive call to `sanitizeNode()`. Hoist it to a module-level constant.

### 14. Use string-based `escapeHtml`
**File:** `apps/notes/app.js:840-844`
The current implementation creates a DOM element per call. Replace with a simple string replacement:
```js
escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
             .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

---

## Dead Code Removal

### 15. Remove unused `dragNoteId` property
**File:** `apps/notes/app.js:32, 775, 783`
`this.dragNoteId` is set on dragstart/dragend but never read — the drop handler uses `e.dataTransfer.getData()`. Remove the property and its assignments.

### 16. Remove unused `longPressNoteId` property
**File:** `apps/notes/app.js:36`
Declared in the constructor but never assigned or read.

### 17. Remove unused `isDirty()` from autosaver
**File:** `apps/notes/autosave.js:45-47`
Returned from `createAutosaver` but never called.

### 18. Remove unused DB exports: `getNote`, `clearAllNotes`
**File:** `apps/notes/db.js:136-145, 169-178`
Exported but never imported anywhere. Remove to reduce dead code.

---

## Code Quality & Consistency

### 19. Extract magic strings to constants
**File:** `apps/notes/app.js`
`'__all__'` and `'__uncategorized__'` appear in 7+ locations. Define at the top:
```js
const NB_ALL = '__all__';
const NB_UNCATEGORIZED = '__uncategorized__';
```

### 20. Rename `initEventListeners` to `attachEventListeners`
**File:** `apps/notes/app.js:115`
Other apps (Todo, Kanban) use `attachEventListeners`. Rename for consistency.

### 21. Add `aria-label` attributes to buttons
**Files:** `apps/notes/index.html:28, 48-60`
Add `aria-label` to the FAB button and all toolbar buttons for screen reader accessibility.

---

## Editor Modernization

### 22. Migrate from `document.execCommand` to Input Events API
**File:** `apps/notes/editor.js`

`document.execCommand` is deprecated and browser support may eventually be removed. Replace with the Input Events API (`beforeinput` / `inputType`) and manual DOM manipulation.

**Toolbar commands migration:**
- **Bold / Italic / Underline:** Listen to `beforeinput` for `formatBold`, `formatItalic`, `formatUnderline` input types (browser keyboard shortcuts already emit these). For toolbar button clicks, wrap/unwrap the current selection in `<strong>`, `<em>`, `<u>` tags manually using `Range` and `Selection` APIs.
- **Lists (`insertUnorderedList`, `insertOrderedList`):** On toolbar click, inspect the current block. If already a list, unwrap `<li>` contents back into `<p>` elements. If not, wrap the current block(s) in `<ul>`/`<ol>` with `<li>` children.
- **`formatBlock` (P, H1, H2, H3):** Replace the current block element's tag using `document.createElement` + moving child nodes, rather than `execCommand('formatBlock')`.
- **`insertHorizontalRule`:** Insert an `<hr>` element at the current cursor position using Range API, then create a new `<p><br></p>` after it and place the cursor there.
- **Tab insertion (`insertText`):** Use `beforeinput` handler or insert a text node with `\t` via `Range.insertNode()`.
- **Paste handling:** Already intercepts `paste` and uses `insertHTML`/`insertText` via execCommand. Replace with `Range.deleteContents()` + `Range.insertNode()` for plain text, and parse + insert sanitized fragment for HTML paste.

**Helper utilities to create:**
- `wrapSelection(tagName)` — wraps the current selection in an inline element, or unwraps if already wrapped (toggle behavior).
- `setBlockType(tagName)` — changes the current block element's tag.
- `insertNodeAtCursor(node)` — inserts a node at the current cursor position and moves the cursor after it.
- `getCurrentBlock()` — walks up from the selection anchor to find the nearest block-level element within the editor.

**Keyboard shortcut handling:**
- The `beforeinput` event with `inputType` values like `formatBold` is fired by browsers when the user presses Ctrl+B, etc. Intercept these to apply formatting manually instead of relying on the browser's built-in execCommand behavior.
- Keep the existing `keydown` handler for Tab and Enter (separator pattern detection) since those are custom behaviors not covered by `inputType`.

**Testing considerations:**
- Verify that all formatting operations produce consistent HTML across Chrome, Firefox, and Safari (a key benefit of manual DOM manipulation vs execCommand, which has browser-inconsistent output).
- Ensure undo/redo still works — browsers track undo history for `contenteditable` natively with execCommand; with manual DOM manipulation, consider using `beforeinput` with `historyUndo`/`historyRedo` input types, or implementing a simple undo stack.

---

## Suggested Execution Order

1. **Bug fixes first** (items 1–8) — fix broken behavior before adding features
2. **Dead code removal** (items 15–18) — clean slate
3. **Code quality & consistency** (items 19–21) — clean up before new code
4. **Performance** (items 11–14) — optimize existing code
5. **New features** (items 9–10) — notebook and note reordering
6. **Editor modernization** (item 22) — migrate away from deprecated execCommand
