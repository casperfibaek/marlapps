// autosave.js - Debounced autosave with status tracking

const IDLE_DELAY = 2000;

export function createAutosaver(saveFn, onStatusChange) {
  let timer = null;
  let dirty = false;

  function setStatus(status) {
    if (onStatusChange) onStatusChange(status);
  }

  async function doSave() {
    timer = null;
    if (!dirty) return;

    setStatus('saving');
    try {
      await saveFn();
      dirty = false;
      setStatus('saved');
    } catch (err) {
      console.error('Autosave failed:', err);
      setStatus('failed');
    }
  }

  function scheduleSave() {
    dirty = true;
    setStatus('unsaved');
    if (timer) clearTimeout(timer);
    timer = setTimeout(doSave, IDLE_DELAY);
  }

  async function flushSave() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (dirty) {
      await doSave();
    }
  }

  function isDirty() {
    return dirty;
  }

  function reset() {
    dirty = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { scheduleSave, flushSave, isDirty, reset };
}
