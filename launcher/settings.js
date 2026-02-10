class SettingsManager {
  constructor(themeManager, appLoader) {
    this.themeManager = themeManager;
    this.appLoader = appLoader;
    this.drawer = null;
    this.overlay = null;
    this.isOpen = false;

    this.appStorageMap = {};
    this.storageKeys = ['marlapps-recents', 'marlapps-theme'];
  }

  init() {
    this.drawer = document.getElementById('settingsDrawer');
    this.overlay = document.getElementById('drawerOverlay');

    if (!this.drawer || !this.overlay) {
      console.warn('Settings drawer elements not found');
      return this;
    }

    this.buildStorageMaps();
    this.populateDeleteDropdown();
    this.bindEvents();
    this.updateThemeSelector();
    this.initUpdateSection();
    this.updateAboutVersion();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this.updateAboutVersion();
      });
    }
    return this;
  }

  buildStorageMaps() {
    const uniqueKeys = new Set(this.storageKeys);

    for (const app of this.appLoader.apps) {
      if (app.storageKeys && app.storageKeys.length) {
        this.appStorageMap[app.id] = { name: app.name, keys: app.storageKeys };
        app.storageKeys.forEach(key => uniqueKeys.add(key));
      }
    }

    this.storageKeys = [...uniqueKeys];
  }

  populateDeleteDropdown() {
    const select = document.getElementById('deleteAppSelect');
    if (!select) return;

    // Remove existing options except the placeholder
    while (select.options.length > 1) {
      select.remove(1);
    }

    for (const app of this.appLoader.apps) {
      if (app.storageKeys && app.storageKeys.length) {
        const option = document.createElement('option');
        option.value = app.id;
        option.textContent = app.name;
        select.appendChild(option);
      }
    }
  }

  bindEvents() {
    const closeBtn = document.getElementById('closeSettingsBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    this.overlay.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
        e.preventDefault();
      }
    });

    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.themeManager.apply(btn.dataset.theme);
        this.updateThemeSelector();
      });
    });

    const resetThemeBtn = document.getElementById('resetThemeBtn');
    if (resetThemeBtn) {
      resetThemeBtn.addEventListener('click', () => {
        this.themeManager.reset();
        this.updateThemeSelector();
      });
    }

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportData());
    }

    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importFileInput');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          this.importData(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    const resetDataBtn = document.getElementById('resetDataBtn');
    if (resetDataBtn) {
      resetDataBtn.addEventListener('click', () => this.resetData());
    }

    const deleteAppSelect = document.getElementById('deleteAppSelect');
    const deleteAppBtn = document.getElementById('deleteAppBtn');
    if (deleteAppSelect && deleteAppBtn) {
      deleteAppBtn.addEventListener('click', () => {
        const appId = deleteAppSelect.value;
        if (appId) {
          this.deleteAppData(appId);
        }
      });
    }
  }

  open() {
    this.updateAboutVersion();
    this.drawer.classList.add('open');
    this.overlay.classList.add('visible');
    this.drawer.setAttribute('aria-hidden', 'false');
    this.isOpen = true;

    const trigger = document.getElementById('topbarSettingsBtn');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');

    const firstFocusable = this.drawer.querySelector('button, input');
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }

  close() {
    this.drawer.classList.remove('open');
    this.overlay.classList.remove('visible');
    this.drawer.setAttribute('aria-hidden', 'true');
    this.isOpen = false;

    const trigger = document.getElementById('topbarSettingsBtn');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');

    window.dispatchEvent(new CustomEvent('settingsClosed'));
  }

  updateThemeSelector() {
    const currentTheme = this.themeManager.getTheme();
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });
  }

  sanitizeRecents(recents) {
    if (!Array.isArray(recents)) return [];

    return recents
      .map(item => {
        if (!item || typeof item !== 'object') return null;
        const id = typeof item.id === 'string' ? item.id : null;
        const timestamp = Number.parseInt(item.timestamp, 10);
        if (!id || !Number.isFinite(timestamp)) return null;
        return { id, timestamp };
      })
      .filter(Boolean)
      .slice(0, 20);
  }

  getImportableAppKeys() {
    return new Set(
      this.storageKeys.filter(key => key !== 'marlapps-theme' && key !== 'marlapps-recents')
    );
  }

  normalizeImportedAppValue(value) {
    let normalized = value;

    if (typeof normalized === 'string') {
      try {
        normalized = JSON.parse(normalized);
      } catch {
        return undefined;
      }
    }

    if (!normalized || typeof normalized !== 'object') {
      return undefined;
    }

    return normalized;
  }

  exportData() {
    let recents = [];
    try {
      const parsedRecents = JSON.parse(localStorage.getItem('marlapps-recents') || '[]');
      recents = this.sanitizeRecents(parsedRecents);
    } catch {}

    const data = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      theme: this.themeManager.getTheme(),
      recents,
      appData: {}
    };

    this.storageKeys.forEach(key => {
      if (key === 'marlapps-theme' || key === 'marlapps-recents') return;

      const value = localStorage.getItem(key);
      if (value) {
        try {
          data.appData[key] = JSON.parse(value);
        } catch {
          data.appData[key] = value;
        }
      }
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marlapps-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showNotification('Data exported successfully');
  }

  async importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Invalid backup file format');
      }

      if (!data.version || !data.exportedAt) {
        throw new Error('Invalid backup file format');
      }

      const exportedAt = new Date(data.exportedAt);
      if (Number.isNaN(exportedAt.getTime())) {
        throw new Error('Invalid export timestamp');
      }

      if (data.appData && (typeof data.appData !== 'object' || Array.isArray(data.appData))) {
        throw new Error('Invalid app data payload');
      }

      const importableKeys = this.getImportableAppKeys();
      const importedEntries = [];
      let skippedEntries = 0;

      if (data.appData) {
        for (const [key, rawValue] of Object.entries(data.appData)) {
          if (!importableKeys.has(key)) {
            skippedEntries++;
            continue;
          }
          const normalized = this.normalizeImportedAppValue(rawValue);
          if (normalized === undefined) {
            skippedEntries++;
            continue;
          }
          importedEntries.push([key, normalized]);
        }
      }

      const safeRecents = this.sanitizeRecents(data.recents);
      const hasRecentsPayload = Object.prototype.hasOwnProperty.call(data, 'recents');
      const safeTheme = typeof data.theme === 'string' &&
        this.themeManager.supportedThemes.includes(data.theme)
        ? data.theme
        : null;

      const changes = [];
      if (safeTheme) changes.push(`Theme: ${safeTheme}`);
      if (hasRecentsPayload) changes.push(`Recent apps: ${safeRecents.length}`);
      if (importedEntries.length > 0) changes.push(`App data entries: ${importedEntries.length}`);
      if (skippedEntries > 0) changes.push(`Skipped invalid entries: ${skippedEntries}`);

      const message = [
        `Import data from ${exportedAt.toLocaleDateString()}?`,
        '',
        'This will overwrite your current data:',
        ...changes.map(c => `• ${c}`),
        '',
        'This action cannot be undone.'
      ].join('\n');

      if (!confirm(message)) return;

      if (safeTheme) {
        this.themeManager.apply(safeTheme);
      }

      if (hasRecentsPayload) {
        localStorage.setItem('marlapps-recents', JSON.stringify(safeRecents));
      }

      importedEntries.forEach(([key, value]) => {
        localStorage.setItem(key, JSON.stringify(value));
      });

      const importMessage = skippedEntries > 0
        ? `Data imported (${skippedEntries} invalid entries skipped). Reloading...`
        : 'Data imported successfully. Reloading...';
      this.showNotification(importMessage);
      setTimeout(() => location.reload(), 1500);

    } catch (error) {
      console.error('Import failed:', error);
      alert(`Failed to import data: ${error.message}`);
    }
  }

  deleteAppData(appId) {
    const appInfo = this.appStorageMap[appId];
    if (!appInfo) return;

    if (!confirm(`Delete all data for ${appInfo.name}? This cannot be undone.`)) return;

    appInfo.keys.forEach(key => localStorage.removeItem(key));

    const select = document.getElementById('deleteAppSelect');
    if (select) select.value = '';

    this.showNotification(`${appInfo.name} data deleted.`);
  }

  resetData() {
    const message = [
      'Are you sure you want to reset all local data?',
      '',
      'This will permanently delete:',
      '• All app data (todos, notes, habits, etc.)',
      '• Your preferences and settings',
      '• Recent apps history',
      '',
      'This action cannot be undone.'
    ].join('\n');

    if (!confirm(message)) return;
    if (!confirm('This is your last chance. Delete ALL data?')) return;

    this.storageKeys.forEach(key => localStorage.removeItem(key));

    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('marlapps-')) {
        localStorage.removeItem(key);
      }
    });

    this.showNotification('All data has been reset. Reloading...');
    setTimeout(() => location.reload(), 1500);
  }

  // --- Updates ---

  initUpdateSection() {
    const autoCheckToggle = document.getElementById('autoUpdateCheck');
    const checkBtn = document.getElementById('checkUpdateBtn');

    if (autoCheckToggle) {
      const saved = localStorage.getItem('marlapps-auto-update-check');
      autoCheckToggle.checked = saved !== 'false';
      autoCheckToggle.addEventListener('change', () => {
        localStorage.setItem('marlapps-auto-update-check', autoCheckToggle.checked ? 'true' : 'false');
      });
    }

    if (checkBtn) {
      checkBtn.addEventListener('click', () => this.checkForUpdates(true));
    }
  }

  getVersionFromWorker(worker) {
    if (!worker) return Promise.resolve(null);

    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timeoutId = setTimeout(() => resolve(null), 2000);

      channel.port1.onmessage = (e) => {
        clearTimeout(timeoutId);
        const version = Number.parseInt(e?.data?.version, 10);
        resolve(Number.isFinite(version) ? version : null);
      };

      try {
        worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
      } catch {
        clearTimeout(timeoutId);
        resolve(null);
      }
    });
  }

  async getInstalledVersion() {
    if (!navigator.serviceWorker) return null;

    const controllerVersion = await this.getVersionFromWorker(navigator.serviceWorker.controller);
    if (controllerVersion !== null) return controllerVersion;

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const worker = registration?.active || registration?.waiting || registration?.installing;
      const registrationVersion = await this.getVersionFromWorker(worker);
      if (registrationVersion !== null) return registrationVersion;
    } catch {}

    return new Promise((resolve) => {
      let settled = false;

      const finish = (version) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(version);
      };

      const onControllerChange = async () => {
        const version = await this.getVersionFromWorker(navigator.serviceWorker.controller);
        finish(version);
      };

      const timeoutId = setTimeout(() => finish(null), 2000);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    });
  }

  async checkForUpdates(showStatus) {
    const statusEl = document.getElementById('updateStatus');
    const textEl = document.getElementById('updateStatusText');
    if (!statusEl || !textEl) return;

    if (showStatus) {
      statusEl.className = 'update-status checking';
      textEl.innerHTML = '<span class="update-spinner"></span>Checking...';
    }

    try {
      const response = await fetch('./version.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch version');
      const remote = await response.json();
      const remoteVersion = Number.parseInt(remote?.version, 10);
      if (!Number.isFinite(remoteVersion)) throw new Error('Invalid remote version');
      const installed = await this.getInstalledVersion();

      if (installed === null) {
        if (showStatus) {
          statusEl.className = 'update-status';
          textEl.textContent = 'Could not determine installed version';
        }
        return;
      }

      if (remoteVersion > installed) {
        statusEl.className = 'update-status available';
        textEl.textContent = `Update available (build ${remoteVersion})`;
        // Add install button if not already present
        if (!statusEl.querySelector('.update-install-btn')) {
          const btn = document.createElement('button');
          btn.className = 'update-install-btn';
          btn.textContent = 'Install';
          btn.addEventListener('click', () => this.installUpdate());
          statusEl.appendChild(btn);
        }
        return { updateAvailable: true, remoteVersion };
      } else {
        if (showStatus) {
          statusEl.className = 'update-status up-to-date';
          textEl.textContent = `Up to date (build ${installed})`;
          // Remove install button if present
          const btn = statusEl.querySelector('.update-install-btn');
          if (btn) btn.remove();
        } else {
          statusEl.className = 'update-status hidden';
        }
        return { updateAvailable: false };
      }
    } catch (e) {
      if (showStatus) {
        statusEl.className = 'update-status';
        textEl.textContent = 'Could not check for updates';
      }
      return null;
    }
  }

  async installUpdate() {
    const statusEl = document.getElementById('updateStatus');
    const textEl = document.getElementById('updateStatusText');
    if (statusEl && textEl) {
      statusEl.className = 'update-status checking';
      textEl.innerHTML = '<span class="update-spinner"></span>Installing update...';
      const btn = statusEl.querySelector('.update-install-btn');
      if (btn) btn.remove();
    }

    try {
      const reg = window.__swRegistration;
      if (!reg) {
        this.showNotification('Service worker not available. Try reloading.');
        return;
      }

      let newWorker = reg.waiting;

      if (!newWorker) {
        // Force the browser to check for a new service worker
        await reg.update();

        // Wait for the new SW to be found and installed
        newWorker = await new Promise((resolve, reject) => {
          if (reg.waiting) {
            resolve(reg.waiting);
            return;
          }
          if (reg.installing) {
            resolve(reg.installing);
            return;
          }

          reg.addEventListener('updatefound', () => {
            if (reg.installing) {
              resolve(reg.installing);
            } else if (reg.waiting) {
              resolve(reg.waiting);
            } else {
              reject(new Error('No installing worker found'));
            }
          }, { once: true });

          // Timeout after 15s
          setTimeout(() => reject(new Error('Update check timed out')), 15000);
        });
      }

      // Wait for it to finish installing
      if (newWorker.state !== 'installed') {
        await new Promise((resolve, reject) => {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') resolve();
            if (newWorker.state === 'redundant') reject(new Error('Update failed'));
          });
          setTimeout(() => reject(new Error('Install timed out')), 30000);
        });
      }

      const waitingWorker = reg.waiting || newWorker;
      if (!waitingWorker) {
        throw new Error('No waiting service worker');
      }

      // Tell the new SW to activate immediately
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });

      // Reload once the new SW takes over
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      }, { once: true });

    } catch (e) {
      // Fallback: just clear caches and reload
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      this.showNotification('Updating... Page will reload.');
      setTimeout(() => window.location.reload(), 1000);
    }
  }

  async autoCheckForUpdates() {
    const autoCheck = localStorage.getItem('marlapps-auto-update-check');
    if (autoCheck === 'false') return;

    // Small delay to not block startup
    await new Promise(r => setTimeout(r, 2000));

    const result = await this.checkForUpdates(false);
    if (result && result.updateAvailable) {
      this.showNotification('A new update is available — open Settings to install.');
    }
  }

  async updateAboutVersion() {
    const versionEl = document.getElementById('appVersion');
    if (!versionEl) return;

    const versionMatch = versionEl.textContent.match(/Version\s+([^\s(]+)/i);
    const appVersion = versionMatch ? versionMatch[1] : '2.0.0';
    const installed = await this.getInstalledVersion();
    if (installed !== null) {
      versionEl.textContent = `Version ${appVersion} (build ${installed})`;
    }
  }

  showNotification(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
      toast.classList.remove('visible');
      toast.addEventListener('transitionend', () => toast.remove());
    }, 2500);
  }
}

window.SettingsManager = SettingsManager;
