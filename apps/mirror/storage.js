const DB_NAME = 'marlapps-mirror';
const STORE_NAME = 'photos';
const DB_VERSION = 1;
export const MAX_PHOTOS = 20;

let dbPromise = null;
let migrationPromise = null;

function parseTimestamp(value) {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return Date.now();
}

function normalizePhotoRecord(photo) {
  if (!photo || typeof photo !== 'object' || !(photo.blob instanceof Blob)) {
    return null;
  }

  return {
    id: typeof photo.id === 'string' && photo.id ? photo.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    blob: photo.blob,
    timestamp: new Date(parseTimestamp(photo.timestamp)).toISOString()
  };
}

function sortNewestFirst(a, b) {
  return parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp);
}

function clearLegacyStorageKeys() {
  localStorage.removeItem('marlapps-mirror');
  localStorage.removeItem('marlapps-mirror-photos');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read blob.'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }

  const parts = dataUrl.split(',');
  if (parts.length !== 2) return null;

  const meta = parts[0];
  const base64 = parts[1];
  const mimeMatch = meta.match(/^data:([^;]+);base64$/);
  if (!mimeMatch) return null;

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeMatch[1] || 'image/jpeg' });
  } catch {
    return null;
  }
}

function normalizeImportedPhoto(photo) {
  if (!photo || typeof photo !== 'object') return null;

  if (photo.blob instanceof Blob) {
    return normalizePhotoRecord(photo);
  }

  const blob = dataUrlToBlob(photo.dataUrl);
  if (!blob) return null;

  return normalizePhotoRecord({
    id: photo.id,
    blob,
    timestamp: photo.timestamp
  });
}

function readLegacyPhotosFromStorage() {
  const raw = localStorage.getItem('marlapps-mirror')
    || localStorage.getItem('marlapps-mirror-photos');
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(photo => normalizeImportedPhoto(photo)).filter(Boolean);
  } catch {
    return [];
  }
}

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function countPhotos() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteDatabase() {
  const db = await openDB();
  db.close();
  dbPromise = null;

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Mirror photo database deletion is blocked by another open tab.'));
  });
}

async function ensureMigrated() {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const legacyPhotos = readLegacyPhotosFromStorage();
    if (legacyPhotos.length === 0) {
      clearLegacyStorageKeys();
      return;
    }

    const existingCount = await countPhotos();
    if (existingCount === 0) {
      await replaceAllPhotos(legacyPhotos, { skipMigration: true });
    }

    clearLegacyStorageKeys();
  })().catch((error) => {
    migrationPromise = null;
    throw error;
  });

  return migrationPromise;
}

export async function loadPhotos(options = {}) {
  if (!options.skipMigration) {
    await ensureMigrated();
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      resolve(request.result.sort(sortNewestFirst));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function savePhoto(photo, options = {}) {
  await ensureMigrated();

  const normalized = normalizePhotoRecord(photo);
  if (!normalized) {
    throw new Error('Invalid photo payload.');
  }

  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit)) : MAX_PHOTOS;
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const removedIds = [];

    store.put(normalized);

    const request = store.getAll();
    request.onsuccess = () => {
      const sorted = request.result.sort(sortNewestFirst);
      sorted.slice(limit).forEach((entry) => {
        removedIds.push(entry.id);
        store.delete(entry.id);
      });
    };

    tx.oncomplete = () => resolve({ removedIds });
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePhotoById(photoId) {
  await ensureMigrated();
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(photoId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceAllPhotos(photos, options = {}) {
  if (!options.skipMigration) {
    await ensureMigrated();
  }

  const normalizedPhotos = Array.isArray(photos)
    ? photos.map(photo => normalizeImportedPhoto(photo)).filter(Boolean).sort(sortNewestFirst).slice(0, MAX_PHOTOS)
    : [];

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    normalizedPhotos.forEach((photo) => {
      store.put(photo);
    });
    tx.oncomplete = () => {
      clearLegacyStorageKeys();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

function normalizeBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (payload.kind === 'mirror-indexeddb' && Array.isArray(payload.photos)) {
    return payload.photos;
  }

  if (payload.kind === 'localStorage' && payload.keys && typeof payload.keys === 'object') {
    const legacyPhotos = Array.isArray(payload.keys['marlapps-mirror'])
      ? payload.keys['marlapps-mirror']
      : Array.isArray(payload.keys['marlapps-mirror-photos'])
        ? payload.keys['marlapps-mirror-photos']
        : null;

    if (legacyPhotos) return legacyPhotos;
  }

  return null;
}

export async function exportBackup() {
  const photos = await loadPhotos();
  return {
    schemaVersion: 1,
    kind: 'mirror-indexeddb',
    photos: await Promise.all(
      photos.map(async (photo) => ({
        id: photo.id,
        timestamp: photo.timestamp,
        dataUrl: await blobToDataUrl(photo.blob)
      }))
    )
  };
}

export async function importBackup(payload) {
  const photos = normalizeBackupPayload(payload);
  if (!photos) {
    throw new Error('Unsupported Mirror backup format.');
  }

  await replaceAllPhotos(photos);
}

export async function clearStorage() {
  try {
    await deleteDatabase();
  } catch (error) {
    console.warn('Mirror photo database deletion failed, clearing store instead:', error);
    await replaceAllPhotos([], { skipMigration: true });
  }

  clearLegacyStorageKeys();
}

export default {
  clearStorage,
  deletePhotoById,
  exportBackup,
  importBackup,
  loadPhotos,
  replaceAllPhotos,
  savePhoto
};
