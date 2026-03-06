import { deleteDatabase, exportAllData, normalizeLegacyNote, replaceAllData } from './db.js';

function normalizeLegacyBackup(payload) {
  if (!payload || payload.kind !== 'localStorage' || !payload.keys || typeof payload.keys !== 'object') {
    return null;
  }

  const legacyNotes = Array.isArray(payload.keys['marlapps-notes'])
    ? payload.keys['marlapps-notes']
    : null;

  if (!legacyNotes) return null;

  return {
    notes: legacyNotes.map(note => normalizeLegacyNote(note)).filter(Boolean),
    notebooks: []
  };
}

export async function exportBackup() {
  const data = await exportAllData();
  return {
    schemaVersion: 1,
    kind: 'notes-indexeddb',
    data
  };
}

export async function importBackup(payload) {
  let data = null;

  if (payload && payload.kind === 'notes-indexeddb' && payload.data && typeof payload.data === 'object') {
    data = payload.data;
  } else {
    data = normalizeLegacyBackup(payload);
  }

  if (!data) {
    throw new Error('Unsupported Notes backup format.');
  }

  await replaceAllData(data);
}

export async function clearStorage() {
  try {
    await deleteDatabase();
  } catch (error) {
    console.warn('Notes database deletion failed, clearing stores instead:', error);
    await replaceAllData({ notes: [], notebooks: [] });
  }

  localStorage.removeItem('marlapps-notes');
}

export default {
  exportBackup,
  importBackup,
  clearStorage
};
