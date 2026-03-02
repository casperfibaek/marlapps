// autosave.js - Debounced autosave with status tracking and retry

const IDLE_DELAY = 2000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

export function createAutosaver(saveFn, onStatusChange) {
  let timer = null;
  let dirty = false;
  let retryCount = 0;

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
      retryCount = 0;
      setStatus('saved');
    } catch (err) {
      console.error('Autosave failed:', err);

      if (retryCount < MAX_RETRIES) {
        retryCount++;
        const delay = RETRY_BASE_MS * Math.pow(2, retryCount - 1);
        setStatus('unsaved');
        timer = setTimeout(doSave, delay);
      } else {
        retryCount = 0;
        setStatus('failed');
      }
    }
  }

  function scheduleSave() {
    dirty = true;
    retryCount = 0;
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

  function reset() {
    dirty = false;
    retryCount = 0;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { scheduleSave, flushSave, reset };
}
