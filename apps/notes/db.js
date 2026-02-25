// db.js - IndexedDB wrapper for Notes app

const DB_NAME = 'marlapps-notes';
const STORE_NAME = 'notes';
const DB_VERSION = 1;

let dbInstance = null;

export async function openDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = async (event) => {
      dbInstance = event.target.result;
      await migrateFromLocalStorage(dbInstance);
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
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (count > 0) return;

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

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
      version: 1
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

export async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('updatedAt');
    const request = index.getAll();
    request.onsuccess = () => {
      // Sort descending by updatedAt
      const notes = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(notes);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveNote(note) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(note);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
