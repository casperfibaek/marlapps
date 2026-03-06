// db.js - IndexedDB wrapper for Notes app

const DB_NAME = 'marlapps-notes';
const NOTES_STORE = 'notes';
const NOTEBOOKS_STORE = 'notebooks';
const DB_VERSION = 2;
const EMPTY_NOTE_HTML = '<p><br></p>';

let dbInstance = null;

function generateId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeStoredNote(note) {
  if (!note || typeof note !== 'object') return null;

  return {
    id: typeof note.id === 'string' && note.id ? note.id : generateId('note'),
    title: typeof note.title === 'string' ? note.title : 'Untitled Note',
    contentHtml: typeof note.contentHtml === 'string' ? note.contentHtml : EMPTY_NOTE_HTML,
    contentPlainText: typeof note.contentPlainText === 'string' ? note.contentPlainText : '',
    createdAt: normalizeTimestamp(note.createdAt),
    updatedAt: normalizeTimestamp(note.updatedAt),
    version: typeof note.version === 'number' && Number.isFinite(note.version) ? note.version : 1,
    notebookId: typeof note.notebookId === 'string' && note.notebookId ? note.notebookId : null,
    order: typeof note.order === 'number' && Number.isFinite(note.order) ? note.order : undefined
  };
}

function normalizeStoredNotebook(notebook, fallbackOrder = 0) {
  if (!notebook || typeof notebook !== 'object') return null;

  return {
    id: typeof notebook.id === 'string' && notebook.id ? notebook.id : generateId('notebook'),
    name: typeof notebook.name === 'string' ? notebook.name : 'Unnamed',
    color: typeof notebook.color === 'string' ? notebook.color : null,
    order: typeof notebook.order === 'number' && Number.isFinite(notebook.order) ? notebook.order : fallbackOrder,
    createdAt: normalizeTimestamp(notebook.createdAt),
    updatedAt: normalizeTimestamp(notebook.updatedAt)
  };
}

function normalizeLegacyNote(note) {
  if (!note || typeof note !== 'object' || typeof note.id !== 'string') return null;

  const title = typeof note.title === 'string' ? note.title : 'Untitled Note';
  const content = typeof note.content === 'string' ? note.content : '';
  const contentHtml = content
    ? content.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('')
    : EMPTY_NOTE_HTML;

  return {
    id: note.id,
    title,
    contentHtml,
    contentPlainText: content,
    createdAt: normalizeTimestamp(note.createdAt),
    updatedAt: normalizeTimestamp(note.updatedAt),
    version: 1,
    notebookId: null
  };
}

export async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // V1: Create notes store
      if (oldVersion < 1) {
        const store = db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // V2: Add notebooks store + notebookId index on notes
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(NOTEBOOKS_STORE)) {
          const notebooksStore = db.createObjectStore(NOTEBOOKS_STORE, { keyPath: 'id' });
          notebooksStore.createIndex('order', 'order', { unique: false });
        }

        // Add notebookId index to existing notes store
        const tx = event.target.transaction;
        const notesStore = tx.objectStore(NOTES_STORE);
        if (!notesStore.indexNames.contains('notebookId')) {
          notesStore.createIndex('notebookId', 'notebookId', { unique: false });
        }
      }
    };

    request.onblocked = () => {
      console.warn('Notes DB upgrade blocked - close other tabs with this app');
    };

    request.onsuccess = async (event) => {
      dbInstance = event.target.result;
      try {
        await migrateFromLocalStorage(dbInstance);
      } catch (err) {
        console.error('Migration failed:', err);
      }
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

async function migrateFromLocalStorage(db) {
  const raw = localStorage.getItem('marlapps-notes');
  if (!raw) return;

  let oldNotes;
  try {
    oldNotes = JSON.parse(raw);
    if (!Array.isArray(oldNotes)) {
      console.warn('Notes migration: localStorage data is not an array, skipping');
      return;
    }
  } catch (err) {
    console.warn('Notes migration: corrupted localStorage data, skipping:', err);
    return;
  }

  // Only migrate if the IndexedDB store is empty
  const count = await new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readonly');
    const store = tx.objectStore(NOTES_STORE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (count > 0) return;

  const tx = db.transaction(NOTES_STORE, 'readwrite');
  const store = tx.objectStore(NOTES_STORE);

  for (const note of oldNotes) {
    const normalized = normalizeLegacyNote(note);
    if (!normalized) continue;
    store.put(normalized);
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      localStorage.removeItem('marlapps-notes');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ── Notes CRUD ──

export async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readonly');
    const store = tx.objectStore(NOTES_STORE);
    const index = store.index('updatedAt');
    const request = index.getAll();
    request.onsuccess = () => {
      const notes = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(notes);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveNote(note) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);
    store.put(note);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveAllNotes(notes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTES_STORE, 'readwrite');
    const store = tx.objectStore(NOTES_STORE);
    for (const note of notes) {
      store.put(note);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Notebooks CRUD ──

export async function getAllNotebooks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOKS_STORE, 'readonly');
    const store = tx.objectStore(NOTEBOOKS_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const notebooks = request.result.sort((a, b) => a.order - b.order);
      resolve(notebooks);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveNotebook(notebook) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOKS_STORE, 'readwrite');
    const store = tx.objectStore(NOTEBOOKS_STORE);
    store.put(notebook);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveAllNotebooks(notebooks) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTEBOOKS_STORE, 'readwrite');
    const store = tx.objectStore(NOTEBOOKS_STORE);
    for (const nb of notebooks) {
      store.put(nb);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNotebook(id) {
  const db = await openDB();

  // Move all notes in this notebook to uncategorized, then delete notebook
  const tx = db.transaction([NOTES_STORE, NOTEBOOKS_STORE], 'readwrite');
  const notesStore = tx.objectStore(NOTES_STORE);
  const notebooksStore = tx.objectStore(NOTEBOOKS_STORE);

  // Get all notes with this notebookId and set to null
  const index = notesStore.index('notebookId');
  const request = index.getAll(id);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      for (const note of request.result) {
        note.notebookId = null;
        notesStore.put(note);
      }
      notebooksStore.delete(id);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function exportAllData() {
  const [notes, notebooks] = await Promise.all([
    getAllNotes(),
    getAllNotebooks()
  ]);

  return {
    notes: notes.map(note => normalizeStoredNote(note)).filter(Boolean),
    notebooks: notebooks.map((notebook, index) => normalizeStoredNotebook(notebook, index)).filter(Boolean)
  };
}

export async function replaceAllData(data = {}) {
  const db = await openDB();
  const notes = Array.isArray(data.notes)
    ? data.notes.map(note => normalizeStoredNote(note)).filter(Boolean)
    : [];
  const notebooks = Array.isArray(data.notebooks)
    ? data.notebooks.map((notebook, index) => normalizeStoredNotebook(notebook, index)).filter(Boolean)
    : [];

  return new Promise((resolve, reject) => {
    const tx = db.transaction([NOTES_STORE, NOTEBOOKS_STORE], 'readwrite');
    const notesStore = tx.objectStore(NOTES_STORE);
    const notebooksStore = tx.objectStore(NOTEBOOKS_STORE);

    notesStore.clear();
    notebooksStore.clear();

    notebooks.forEach((notebook) => {
      notebooksStore.put(notebook);
    });

    notes.forEach((note) => {
      notesStore.put(note);
    });

    tx.oncomplete = () => {
      localStorage.removeItem('marlapps-notes');
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Notes database deletion is blocked by another open tab.'));
  });
}

export { DB_NAME, NOTES_STORE, NOTEBOOKS_STORE, normalizeLegacyNote };
