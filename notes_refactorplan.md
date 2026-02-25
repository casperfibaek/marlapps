# Notes App Refactor Plan

## Goal

Refactor the notes app into a rich-text editor with IndexedDB storage, debounced autosave, keyword search, and per-note Markdown export. No frameworks. Follow the existing MarlApps app conventions.

---

## 1. File structure

Keep the standard MarlApps app layout. All code stays in `apps/notes/`.

```
apps/notes/
├── index.html          # Entry point (same pattern as all apps)
├── styles.css          # All CSS (imports ../../themes/app-common.css)
├── app.js              # Main NotesApp class, bootstraps modules, event listeners
├── db.js               # IndexedDB wrapper
├── editor.js           # contenteditable surface + toolbar actions
├── autosave.js          # Debounce logic + flush triggers
├── search.js           # Tokenised keyword search across title + body
├── export-markdown.js  # HTML → Markdown conversion + .md download
├── icon.svg            # Existing icon
└── manifest.json       # Existing manifest (update storageKeys)
```

No bundler. Each module is a plain ES module (`<script type="module">`). `app.js` imports the others.

## 2. UI changes

### Remove top bar

The current `<header class="app-header">` with the title and `+ New Note` button is removed entirely.

### Floating "New Note" button

A floating action button (FAB) is placed at the bottom of the notes sidebar column.

```html
<aside class="notes-sidebar">
  <div class="search-container">
    <input type="text" id="searchInput" placeholder="Search notes..." autocomplete="off">
  </div>
  <div class="notes-list" id="notesList"></div>
  <button id="newNoteBtn" class="fab-new-note">+</button>
</aside>
```

CSS for the FAB:

```css
.fab-new-note {
  position: absolute;
  bottom: var(--space-4);
  right: var(--space-4);
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  background: var(--app-accent);
  color: #fff;
  border: none;
  font-size: 1.5rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--app-shadow-md);
  transition: background var(--transition-fast);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-target-min);
  min-width: var(--touch-target-min);
}

.fab-new-note:hover {
  background: var(--app-accent-hover);
}
```

The sidebar needs `position: relative` so the FAB anchors to it.

### Editor toolbar

A formatting toolbar appears above the contenteditable area inside `.note-editor`:

```html
<div class="editor-toolbar" id="editorToolbar">
  <button data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button>
  <button data-cmd="italic" title="Italic (Ctrl+I)"><i>I</i></button>
  <button data-cmd="underline" title="Underline (Ctrl+U)"><u>U</u></button>
  <span class="toolbar-divider"></span>
  <button data-cmd="insertUnorderedList" title="Bullet list">•</button>
  <button data-cmd="insertOrderedList" title="Numbered list">1.</button>
  <span class="toolbar-divider"></span>
  <select data-cmd="formatBlock" title="Heading">
    <option value="p">Paragraph</option>
    <option value="h1">Heading 1</option>
    <option value="h2">Heading 2</option>
    <option value="h3">Heading 3</option>
  </select>
  <span class="toolbar-divider"></span>
  <button data-cmd="insertHorizontalRule" title="Separator">―</button>
</div>
```

### Save status indicator

Replace the static "Last edited" text in the note footer with a dynamic save status:

```
"Saved" | "Unsaved changes" | "Saving…" | "Save failed"
```

The "Last edited: X ago" text moves next to it, separated by a dot.

### Export button

Add an "Export .md" button in the note footer, next to the delete button.

## 3. Storage: IndexedDB via `db.js`

### Why switch from localStorage

localStorage has a ~5 MB limit and blocks the main thread on read/write. IndexedDB handles larger content and works asynchronously.

### Database schema

- Database name: `marlapps-notes`
- Object store: `notes`
- Key path: `id`
- Indexes: `updatedAt` (for sorted listing)

### Note object shape

```js
{
  id: "uuid",                           // crypto.randomUUID()
  title: "Note title",
  contentHtml: "<p>Hello <strong>world</strong></p>",
  contentPlainText: "Hello world",      // derived on save for search
  createdAt: 1730000000000,             // timestamp ms
  updatedAt: 1730000000000,             // timestamp ms
  version: 1                            // optimistic concurrency
}
```

### Data migration

On first load, check `localStorage.getItem('marlapps-notes')`. If it exists and the IndexedDB store is empty, migrate all notes into IndexedDB, mapping `content` → `contentHtml` (wrap in `<p>` tags since existing content is plain text) and deriving `contentPlainText`. After successful migration, remove the localStorage key.

### Manifest update

Update `manifest.json` `storageKeys` to `["marlapps-notes-idb"]` (or a similar marker) so the launcher settings export/import knows about the new storage. Since IndexedDB isn't exportable via the current settings system, add a note-level export instead (Markdown export covers this).

### Module API

```js
// db.js
export async function openDB()
export async function getAllNotes()           // returns sorted by updatedAt desc
export async function getNote(id)
export async function saveNote(note)          // upsert
export async function deleteNote(id)
export async function clearAllNotes()
```

## 4. Editor: `editor.js`

### Approach

Use `contenteditable="true"` with `document.execCommand()` for formatting. This is deprecated but universally supported and the fastest path for a framework-free rich-text editor.

### Supported formatting

| Action | Command | Shortcut |
|---|---|---|
| Bold | `bold` | Ctrl+B |
| Italic | `italic` | Ctrl+I |
| Underline | `underline` | Ctrl+U |
| Bullet list | `insertUnorderedList` | — |
| Numbered list | `insertOrderedList` | — |
| Heading 1–3 | `formatBlock` | — |
| Paragraph | `formatBlock` | — |
| Horizontal rule | `insertHorizontalRule` | — |

### Separator shortcuts

When the user types a line that is exactly `----`, `****`, or `====` and presses Enter, replace that line with an `<hr>` element. Optionally add `data-style="dash|star|double"` for CSS styling, but export all as `---`.

### HTML normalisation

After each edit, normalise the editor HTML:
- Remove empty `<span>` wrappers
- Collapse nested identical tags (e.g. `<b><b>text</b></b>`)
- Ensure block-level content is wrapped in `<p>` or heading tags

### Module API

```js
// editor.js
export function initEditor(containerEl, options)
export function getContentHtml()
export function getContentPlainText()
export function setContent(html)
export function focus()
```

## 5. Autosave: `autosave.js`

### Debounce timing

- Idle delay: 2000ms (increased from current 500ms since IndexedDB writes are async)
- The editor fires an `input` event on every change; autosave resets its timer each time

### Flush triggers

Force-save immediately (bypass debounce) on:
- `blur` on the editor
- Note switch (before loading new note)
- `visibilitychange` when tab becomes hidden
- `beforeunload` / `pagehide` (iframe destroy safety)

### Save status

The module exposes a callback for status updates:

```js
// autosave.js
export function createAutosaver(saveFn, onStatusChange)
// onStatusChange receives: "saved" | "unsaved" | "saving" | "failed"
export function scheduleSave()
export function flushSave()
export function isDirty()
```

## 6. Search: `search.js`

### Strategy

Search across `title` and `contentPlainText`. For small-to-medium collections, load all notes from IndexedDB into memory and filter.

### Ranking

1. Exact title match → highest score
2. Title contains query → high score
3. Body contains query → base score
4. Recency boost: notes updated in the last 24h get a small bump

### Debounce

150ms debounce on search input (same as current).

### Module API

```js
// search.js
export function searchNotes(notes, query)  // returns filtered + sorted array
```

## 7. Markdown export: `export-markdown.js`

### Conversion mapping

| HTML | Markdown |
|---|---|
| `<h1>` – `<h6>` | `#` – `######` |
| `<strong>`, `<b>` | `**text**` |
| `<em>`, `<i>` | `*text*` |
| `<u>` | `<u>text</u>` (no Markdown equivalent) |
| `<ul><li>` | `- item` |
| `<ol><li>` | `1. item` |
| `<hr>` | `---` |
| `<p>` | Double newline separation |
| `<br>` | Single newline |

### Download flow

1. Read `contentHtml` from current note
2. Parse into detached DOM element
3. Walk DOM recursively, convert to Markdown string
4. Prepend `# {title}\n\n`
5. Create `Blob` with `text/markdown` type
6. Trigger download as `{title}.md` via `URL.createObjectURL`

### Module API

```js
// export-markdown.js
export function htmlToMarkdown(html)
export function downloadMarkdown(title, html)
```

## 8. Main app class: `app.js`

Stays as a single `NotesApp` class following the existing MarlApps pattern:

```js
import { openDB, getAllNotes, saveNote, deleteNote } from './db.js';
import { initEditor, getContentHtml, getContentPlainText, setContent } from './editor.js';
import { createAutosaver } from './autosave.js';
import { searchNotes } from './search.js';
import { downloadMarkdown } from './export-markdown.js';

class NotesApp {
  constructor() { ... }
  async init() { ... }          // async because IndexedDB
  initElements() { ... }
  initEventListeners() { ... }
  syncThemeWithParent() { ... }  // identical to all other apps
  applyTheme(theme) { ... }

  // Note CRUD
  async createNewNote() { ... }
  async openNote(id) { ... }
  async saveCurrentNote() { ... }
  async deleteCurrentNote() { ... }

  // UI
  renderNotesList(notes) { ... }
  updateSaveStatus(status) { ... }

  // Utilities
  formatDate(timestamp) { ... }
  escapeHtml(text) { ... }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new NotesApp();
  app.init();
});
```

The class keeps the same structure as existing apps (kanban, pomodoro, habits, etc.): constructor caches elements, sets up listeners, syncs theme, then renders.

## 9. PWA considerations

### Service worker

No changes to the service worker strategy. The app shell (HTML, CSS, JS modules) is cached as static assets. IndexedDB data is not cached in the service worker — it already persists locally.

After the refactor, bump the cache version in `service-worker.js` and add the new module files to the cache list.

### Lifecycle

- `visibilitychange` → flush autosave (mobile suspend safety)
- `beforeunload` / `pagehide` → flush autosave (iframe destroy safety)
- These are already in the current app and carry over unchanged

## 10. Implementation phases

### Phase 1: Storage + state

- Create `db.js` with IndexedDB wrapper
- Migrate existing localStorage data on first load
- Update `app.js` to use async IndexedDB calls
- Keep the current plain textarea editor temporarily
- Verify notes persist correctly

### Phase 2: UI changes

- Remove the top bar header
- Add the floating `+ New Note` button to the sidebar
- Add the export button and save status to the footer
- Update `styles.css`

### Phase 3: Rich text editor

- Create `editor.js` with contenteditable surface
- Replace the `<textarea>` with a `contenteditable` div
- Add the formatting toolbar
- Wire toolbar buttons to `execCommand` calls
- Implement separator shortcuts (`----`, `****`, `====`)
- Handle HTML normalisation

### Phase 4: Autosave

- Create `autosave.js` with debounce logic
- Increase debounce to 2000ms
- Add flush on blur, note switch, visibility change
- Wire up save status indicator in the footer

### Phase 5: Search

- Create `search.js` with tokenised search
- Store `contentPlainText` on every save
- Add ranked results (title > body, recency boost)

### Phase 6: Markdown export

- Create `export-markdown.js`
- Implement recursive DOM-to-Markdown walker
- Wire up the export button to download `.md`
- Test with real notes containing all formatting types

Each phase keeps the app fully usable.

## Known trade-offs

- **`contenteditable` quirks**: Browser behaviour is inconsistent around nested lists, pasted content, and undo history. Accept this for a lightweight PWA.
- **`execCommand` is deprecated**: Still universally supported. Can be replaced with Selection/Range API later if browser quirks become a problem.
- **Underline has no Markdown equivalent**: Exported as `<u>text</u>` inline HTML. This is portable and renders in most Markdown viewers.
- **IndexedDB not exportable via settings**: The existing settings export/import uses localStorage. Markdown export per note covers the data portability need. A full IndexedDB export could be added later if needed.
