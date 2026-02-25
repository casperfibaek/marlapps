# Notes App - Notebooks Feature Plan

## Goal
Add notebook support to the Notes app so users can organize notes into named notebooks. Notes can be created inside a notebook or dragged/dropped between notebooks. A default "All Notes" view shows everything.

---

## Data Model Changes

### Notebook Object
```javascript
{
  id: string,         // UUID
  name: string,       // User-defined name
  order: number,      // Sort position in sidebar
  createdAt: number,  // Timestamp
  updatedAt: number   // Timestamp
}
```

### Note Object (additions)
```javascript
{
  // ...existing fields
  notebookId: string | null  // null = uncategorized
}
```

### IndexedDB Changes (`db.js`)
- Bump DB version to 2
- Add `notebooks` object store with `id` keyPath
- Add `notebookId` index on `notes` store
- `onupgradeneeded`: migrate existing notes (set `notebookId: null`)
- Add CRUD methods: `saveNotebook()`, `deleteNotebook()`, `getAllNotebooks()`, `getNotebookNotes(notebookId)`

---

## UI Changes

### Sidebar Redesign
Current sidebar layout: `[Search] [Notes List] [FAB]`

New sidebar layout:
```
┌──────────────────────┐
│  Search input         │
├──────────────────────┤
│  Notebook selector    │  ← New: dropdown or collapsible list
│  ┌─ All Notes        │
│  ├─ Notebook A       │
│  ├─ Notebook B       │
│  └─ + New Notebook   │
├──────────────────────┤
│  Notes list (filtered)│  ← Filtered by selected notebook
│                       │
│                       │
├──────────────────────┤
│              [+ FAB]  │
└──────────────────────┘
```

### Notebook List Section
- Sits between search and notes list
- Each notebook row: name + note count badge
- "All Notes" entry always at top (shows total count)
- "Uncategorized" entry below "All Notes" (notes with `notebookId: null`)
- "+ New Notebook" button at bottom of notebook list
- Clicking a notebook filters the notes list to that notebook
- Active notebook highlighted with accent color
- Collapsible via a toggle chevron to save space

### Notebook Management
- **Create**: Click "+ New Notebook" → inline editable text field, press Enter to confirm
- **Rename**: Double-click notebook name → inline edit
- **Delete**: Right-click context menu or long-press on mobile → confirm dialog; notes inside move to uncategorized (not deleted)
- **Reorder**: Drag-and-drop notebooks to reorder (update `order` field)

### Drag & Drop Notes into Notebooks
- Notes in the list become draggable (`draggable="true"`)
- Notebook entries become drop targets
- Visual feedback: notebook row highlights on dragover
- On drop: update `note.notebookId`, save, re-render list
- Mobile: long-press note → "Move to..." action sheet with notebook list

### Note Creation
- FAB creates note in the currently selected notebook
- If "All Notes" is selected, new note gets `notebookId: null`

### Editor Changes
- Show current notebook name as a subtle label above the title (clickable to change)
- Or: add a notebook selector dropdown in the editor footer

---

## Implementation Steps

### Step 1: Data Layer (`db.js`)
1. Bump IndexedDB version to 2
2. Add `notebooks` object store in `onupgradeneeded`
3. Add `notebookId` index to `notes` store
4. Migrate existing notes: set `notebookId: null`
5. Add notebook CRUD methods: `saveNotebook()`, `deleteNotebook()`, `getAllNotebooks()`
6. Add `getNotebookNotes(notebookId)` query method
7. Add `moveNoteToNotebook(noteId, notebookId)` method

### Step 2: State Management (`app.js`)
1. Add `this.notebooks` array and `this.currentNotebookId` (null = "All Notes")
2. Load notebooks on init alongside notes
3. Add methods: `createNotebook()`, `renameNotebook()`, `deleteNotebook()`, `selectNotebook()`
4. Update `renderNotesList()` to filter by `currentNotebookId`
5. Update `createNewNote()` to assign current notebook
6. Add `moveNoteToNotebook(noteId, notebookId)` method
7. Update search to scope within selected notebook (or search all with indicator)

### Step 3: Sidebar UI (`app.js` + `styles.css`)
1. Add notebook list HTML section between search and notes list
2. Render notebooks with name + count badges
3. Add "All Notes" and "Uncategorized" built-in entries
4. Add "+ New Notebook" button with inline create flow
5. Highlight active notebook
6. Add collapse/expand toggle for notebook section
7. Style notebook list to match existing sidebar aesthetic

### Step 4: Drag & Drop (`app.js` + new drag logic)
1. Add `draggable="true"` to note list items
2. Add `dragstart` handler: store `noteId` in `dataTransfer`
3. Add `dragover`/`dragenter`/`dragleave` handlers on notebook rows for visual feedback
4. Add `drop` handler: move note to target notebook, save, re-render
5. Add CSS for drag states (dragging note opacity, drop target highlight)
6. Prevent dropping on the already-assigned notebook (no-op)

### Step 5: Mobile Support
1. Long-press on note → show "Move to Notebook" option (context menu or action sheet)
2. Present notebook list as a modal/bottom sheet for selection
3. Ensure notebook section works in single-column mobile layout
4. Touch-friendly notebook row sizing (48px min touch target)

### Step 6: Notebook Context Menu
1. Right-click (desktop) or long-press (mobile) on notebook → context menu
2. Options: Rename, Delete
3. Delete confirmation: "Move X notes to Uncategorized and delete this notebook?"
4. Inline rename: replace text with input, Enter to save, Escape to cancel

### Step 7: Polish & Edge Cases
1. Persist selected notebook in state (restore on reload)
2. Update search: search within notebook or across all (with notebook label in results)
3. Handle empty notebooks (show empty state message)
4. Keyboard shortcut for new notebook (e.g., Ctrl+Shift+N)
5. Animate notebook/note transitions
6. Update export to optionally include notebook name in markdown header

---

## CSS Additions (`styles.css`)

```
/* New selectors needed */
.notebooks-section          /* Container for notebook list */
.notebooks-toggle           /* Collapse/expand header */
.notebook-item              /* Individual notebook row */
.notebook-item.active       /* Selected notebook */
.notebook-item .count       /* Note count badge */
.notebook-create            /* "+ New Notebook" button */
.notebook-create-input      /* Inline name input */
.notebook-drop-target       /* Dragover highlight state */
.note-item[draggable]       /* Draggable note styling */
.note-item.dragging         /* Note being dragged */
.move-to-notebook-modal     /* Mobile move-to modal */
```

---

## Files Changed

| File | Changes |
|------|---------|
| `db.js` | New object store, version bump, notebook CRUD, migration |
| `app.js` | Notebook state, filtering, create/rename/delete, drag-drop |
| `styles.css` | Notebook section styles, drag states, mobile modal |
| `index.html` | Notebook section HTML in sidebar |
| `search.js` | Optional: scope search to notebook |
| `export-markdown.js` | Optional: include notebook name in export |

No new files needed - all changes fit within existing architecture.

---

## Design Principles
- **Non-destructive**: Deleting a notebook never deletes its notes (moves to uncategorized)
- **Progressive**: Existing users see their notes as-is in "All Notes" after migration
- **Minimal**: No deep nesting - one level of notebooks only
- **Consistent**: Follows existing patterns (IndexedDB, inline editing, CSS variables)
- **Accessible**: Keyboard navigable, proper ARIA roles on drag-drop, touch targets >= 48px
