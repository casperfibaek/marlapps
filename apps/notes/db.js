// db.js - IndexedDB wrapper for Notes app

const DB_NAME = 'marlapps-notes';
const NOTES_STORE = 'notes';
const NOTEBOOKS_STORE = 'notebooks';
const DB_VERSION = 2;

let dbInstance = null;

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
    if (!Array.isArray(oldNotes)) return;
  } catch {
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
    if (!note || typeof note !== 'object' || typeof note.id !== 'string') continue;

    const title = typeof note.title === 'string' ? note.title : 'Untitled Note';
    const content = typeof note.content === 'string' ? note.content : '';
    const contentHtml = content
      ? content.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('')
      : '<p><br></p>';
    const contentPlainText = content;
    const createdAt = typeof note.createdAt === 'string' ? new Date(note.createdAt).getTime() : Date.now();
    const updatedAt = typeof note.updatedAt === 'string' ? new Date(note.updatedAt).getTime() : Date.now();

    store.put({
      id: note.id,
      title,
      contentHtml,
      contentPlainText,
      createdAt,
      updatedAt,
      version: 1,
      notebookId: null
    });
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
