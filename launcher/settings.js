class SettingsManager {
  constructor(themeManager, appLoader, launcher = null) {
    this.themeManager = themeManager;
    this.appLoader = appLoader;
    this.launcher = launcher;
    this.drawer = null;
    this.overlay = null;
    this.isOpen = false;

    this.appStorageMap = {};
    this.storageAdapterCache = new Map();
    this.launcherStorageKeys = [
      'marlapps-recents',
      'marlapps-theme',
      'marlapps-active-app',
      'marlapps-auto-update-check'
    ];
    this.nonNamespacedStorageKeys = ['pwa-installed', 'pwa-install-dismissed'];
    this.managedLocalStorageKeys = [];
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
    this.renderThemeOptions();
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
    const uniqueKeys = new Set([
      ...this.launcherStorageKeys,
      ...this.nonNamespacedStorageKeys
    ]);
    this.appStorageMap = {};

    for (const app of this.appLoader.apps) {
      const localStorageKeys = this.getAppLocalStorageKeys(app);
      const legacyStorageKeys = this.getAppLegacyStorageKeys(app);
      const managedLocalStorageKeys = [...new Set([...localStorageKeys, ...legacyStorageKeys])];
      const hasAdapter = this.hasStorageAdapter(app);

      if (!hasAdapter && managedLocalStorageKeys.length === 0) continue;

      this.appStorageMap[app.id] = {
        app,
        id: app.id,
        name: app.name,
        folder: app.folder,
        hasAdapter,
        localStorageKeys,
        managedLocalStorageKeys
      };

      managedLocalStorageKeys.forEach(key => uniqueKeys.add(key));
    }

    this.managedLocalStorageKeys = [...uniqueKeys];
  }

  populateDeleteDropdown() {
    const select = document.getElementById('deleteAppSelect');
    if (!select) return;

    // Remove existing options except the placeholder
    while (select.options.length > 1) {
      select.remove(1);
    }

    this.getManagedApps().forEach((appInfo) => {
      const option = document.createElement('option');
      option.value = appInfo.id;
      option.textContent = appInfo.name;
      select.appendChild(option);
    });
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
        e.stopPropagation();
      }
    });

    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
      themeSelector.addEventListener('click', (event) => {
        const btn = event.target.closest('.theme-option[data-theme]');
        if (!btn || !themeSelector.contains(btn)) return;
        this.themeManager.apply(btn.dataset.theme);
        this.updateThemeSelector();
      });
    }

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

    this._focusTrapHandler = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = this.drawer.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    this.drawer.addEventListener('keydown', this._focusTrapHandler);

    const firstFocusable = this.drawer.querySelector('button, input');
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }

  close() {
    if (this._focusTrapHandler) {
      this.drawer.removeEventListener('keydown', this._focusTrapHandler);
      this._focusTrapHandler = null;
    }

    this.drawer.classList.remove('open');
    this.overlay.classList.remove('visible');
    this.drawer.setAttribute('aria-hidden', 'true');
    this.isOpen = false;

    const trigger = document.getElementById('topbarSettingsBtn');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  }

  renderThemeOptions() {
    const container = document.getElementById('themeSelector');
    if (!container) return;

    const themes = typeof this.themeManager.getThemeDefinitions === 'function'
      ? this.themeManager.getThemeDefinitions()
      : [];

    container.innerHTML = '';
    const knownPreviewThemes = new Set(['dark', 'light', 'futuristic', 'amalfi']);

    themes.forEach((theme) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-option';
      btn.dataset.theme = theme.id;

      const preview = document.createElement('span');
      preview.className = `theme-preview ${theme.id}`;
      if (!knownPreviewThemes.has(theme.id) && theme.themeColor) {
        preview.style.background = `linear-gradient(135deg, ${theme.themeColor} 0%, ${theme.themeColor} 100%)`;
      }

      const label = document.createElement('span');
      label.textContent = theme.label;

      btn.appendChild(preview);
      btn.appendChild(label);
      container.appendChild(btn);
    });
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

  getManagedApps() {
    return Object.values(this.appStorageMap);
  }

  getStorageConfig(app) {
    return app && app.storage && typeof app.storage === 'object' && !Array.isArray(app.storage)
      ? app.storage
      : {};
  }

  hasStorageAdapter(app) {
    const storage = this.getStorageConfig(app);
    return typeof storage.adapter === 'string' && storage.adapter.trim().length > 0;
  }

  getAppLocalStorageKeys(app) {
    return [...new Set(
      (Array.isArray(app && app.storageKeys) ? app.storageKeys : [])
        .filter(key => typeof key === 'string' && key.trim())
    )];
  }

  getAppLegacyStorageKeys(app) {
    const storage = this.getStorageConfig(app);
    return [...new Set(
      (Array.isArray(storage.legacyKeys) ? storage.legacyKeys : [])
        .filter(key => typeof key === 'string' && key.trim())
    )];
  }

  isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  normalizeImportedAppValue(value) {
    let normalized = value;

    if (typeof normalized === 'string') {
      try {
        normalized = JSON.parse(normalized);
      } catch {
        return normalized;
      }
    }

    return normalized;
  }

  readStoredValue(key) {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  buildLocalStorageBackup(keys) {
    const values = {};

    keys.forEach((key) => {
      const value = this.readStoredValue(key);
      if (value !== undefined) {
        values[key] = value;
      }
    });

    if (Object.keys(values).length === 0) return null;

    return {
      schemaVersion: 1,
      kind: 'localStorage',
      keys: values
    };
  }

  async getStorageAdapter(appInfo) {
    if (!appInfo || !appInfo.hasAdapter) return null;

    const cacheKey = appInfo.id;
    if (this.storageAdapterCache.has(cacheKey)) {
      return this.storageAdapterCache.get(cacheKey);
    }

    const storage = this.getStorageConfig(appInfo.app);
    const moduleUrl = new URL(`./apps/${appInfo.folder}/${storage.adapter}`, window.location.href).href;

    const adapterPromise = import(moduleUrl).then((module) => {
      const adapter = module && module.default && typeof module.default === 'object'
        ? { ...module, ...module.default }
        : module;

      if (typeof adapter.exportBackup !== 'function'
        || typeof adapter.importBackup !== 'function'
        || typeof adapter.clearStorage !== 'function') {
        throw new Error(`Storage adapter for ${appInfo.id} is missing required methods.`);
      }

      return adapter;
    });

    this.storageAdapterCache.set(cacheKey, adapterPromise);
    return adapterPromise;
  }

  async exportAppBackup(appInfo) {
    if (appInfo.hasAdapter) {
      const adapter = await this.getStorageAdapter(appInfo);
      return adapter.exportBackup();
    }

    return this.buildLocalStorageBackup(appInfo.localStorageKeys);
  }

  normalizeAppsPayload(appsPayload) {
    const appPayloads = new Map();
    let skippedEntries = 0;

    if (!this.isPlainObject(appsPayload)) {
      return { appPayloads, skippedEntries };
    }

    Object.entries(appsPayload).forEach(([appId, payload]) => {
      const appInfo = this.appStorageMap[appId];
      if (!appInfo || !this.isPlainObject(payload)) {
        skippedEntries++;
        return;
      }
      appPayloads.set(appId, payload);
    });

    return { appPayloads, skippedEntries };
  }

  buildLegacyImportPayloads(appData) {
    const appPayloads = new Map();
    let skippedEntries = 0;
    const keyToApp = new Map();

    this.getManagedApps().forEach((appInfo) => {
      appInfo.managedLocalStorageKeys.forEach((key) => {
        if (!keyToApp.has(key)) {
          keyToApp.set(key, appInfo);
        }
      });
    });

    if (!this.isPlainObject(appData)) {
      return { appPayloads, skippedEntries };
    }

    Object.entries(appData).forEach(([key, rawValue]) => {
      const appInfo = keyToApp.get(key);
      if (!appInfo) {
        skippedEntries++;
        return;
      }

      const normalized = this.normalizeImportedAppValue(rawValue);
      if (normalized === undefined) {
        skippedEntries++;
        return;
      }

      if (!appPayloads.has(appInfo.id)) {
        appPayloads.set(appInfo.id, {
          schemaVersion: 1,
          kind: 'localStorage',
          keys: {}
        });
      }

      appPayloads.get(appInfo.id).keys[key] = normalized;
    });

    return { appPayloads, skippedEntries };
  }

  buildImportPlan(data) {
    const normalizedApps = this.normalizeAppsPayload(data.apps);
    const legacyApps = this.buildLegacyImportPayloads(data.appData);
    const appPayloads = new Map(legacyApps.appPayloads);

    normalizedApps.appPayloads.forEach((payload, appId) => {
      appPayloads.set(appId, payload);
    });

    return {
      appPayloads,
      skippedEntries: normalizedApps.skippedEntries + legacyApps.skippedEntries
    };
  }

  clearLauncherLocalStorage() {
    this.managedLocalStorageKeys.forEach((key) => {
      localStorage.removeItem(key);
    });

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('marlapps-')) {
        localStorage.removeItem(key);
      }
    });

    this.nonNamespacedStorageKeys.forEach((key) => {
      localStorage.removeItem(key);
    });
  }

  discardAppRuntime(appId) {
    const launcher = this.launcher || window.launcher;
    if (!launcher || typeof launcher.discardAppInstance !== 'function') {
      return false;
    }

    try {
      return launcher.discardAppInstance(appId);
    } catch (error) {
      console.warn(`Failed to discard app runtime for ${appId}:`, error);
      return false;
    }
  }

  discardAllAppRuntimes() {
    const launcher = this.launcher || window.launcher;
    if (!launcher || typeof launcher.discardAllAppInstances !== 'function') {
      return false;
    }

    try {
      launcher.discardAllAppInstances();
      return true;
    } catch (error) {
      console.warn('Failed to discard app runtimes:', error);
      return false;
    }
  }

  async clearAppStorage(appInfo, options = {}) {
    if (!appInfo) return;

    const { clearCachedFiles = false } = options;

    this.discardAppRuntime(appInfo.id);

    if (appInfo.hasAdapter) {
      const adapter = await this.getStorageAdapter(appInfo);
      await adapter.clearStorage();
    }

    appInfo.managedLocalStorageKeys.forEach((key) => {
      localStorage.removeItem(key);
    });

    if (clearCachedFiles) {
      await this.clearCachedAppFiles(appInfo.folder);
    }
  }

  async clearAllManagedData(options = {}) {
    const { clearCachedFiles = false } = options;

    this.discardAllAppRuntimes();

    for (const appInfo of this.getManagedApps()) {
      await this.clearAppStorage(appInfo, { clearCachedFiles });
    }

    this.clearLauncherLocalStorage();
  }

  async exportData() {
    let recents = [];
    try {
      const parsedRecents = JSON.parse(localStorage.getItem('marlapps-recents') || '[]');
      recents = this.sanitizeRecents(parsedRecents);
    } catch {}

    const data = {
      version: '2.0.0',
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      theme: this.themeManager.getTheme(),
      recents,
      apps: {}
    };

    try {
      for (const appInfo of this.getManagedApps()) {
        const payload = await this.exportAppBackup(appInfo);
        if (payload) {
          data.apps[appInfo.id] = payload;
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Failed to export data: ${error.message}`);
      return;
    }

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

      if (data.appData && !this.isPlainObject(data.appData)) {
        throw new Error('Invalid app data payload');
      }

      if (data.apps && !this.isPlainObject(data.apps)) {
        throw new Error('Invalid app backup payload');
      }

      const safeRecents = this.sanitizeRecents(data.recents);
      const hasRecentsPayload = Object.prototype.hasOwnProperty.call(data, 'recents');
      const safeTheme = typeof data.theme === 'string' &&
        this.themeManager.supportedThemes.includes(data.theme)
        ? data.theme
        : null;
      const { appPayloads, skippedEntries } = this.buildImportPlan(data);

      const changes = [];
      if (safeTheme) changes.push(`Theme: ${safeTheme}`);
      if (hasRecentsPayload) changes.push(`Recent apps: ${safeRecents.length}`);
      if (appPayloads.size > 0) changes.push(`Apps with backup data: ${appPayloads.size}`);
      if (skippedEntries > 0) changes.push(`Skipped invalid entries: ${skippedEntries}`);

      if (!safeTheme && !hasRecentsPayload && appPayloads.size === 0) {
        throw new Error('Backup file does not contain any supported MarlApps data');
      }

      const message = [
        `Import data from ${exportedAt.toLocaleDateString()}?`,
        '',
        'This will replace your current MarlApps data:',
        ...changes.map(c => `• ${c}`),
        '',
        'This action cannot be undone.'
      ].join('\n');

      if (!confirm(message)) return;

      await this.clearAllManagedData();

      if (safeTheme) {
        this.themeManager.apply(safeTheme);
      }

      if (hasRecentsPayload) {
        localStorage.setItem('marlapps-recents', JSON.stringify(safeRecents));
      }

      for (const [appId, payload] of appPayloads.entries()) {
        const appInfo = this.appStorageMap[appId];
        if (!appInfo) continue;

        if (appInfo.hasAdapter) {
          const adapter = await this.getStorageAdapter(appInfo);
          await adapter.importBackup(payload);
          continue;
        }

        if (payload.kind !== 'localStorage' || !this.isPlainObject(payload.keys)) {
          throw new Error(`Unsupported backup payload for ${appInfo.name}`);
        }

        Object.entries(payload.keys).forEach(([key, value]) => {
          localStorage.setItem(key, JSON.stringify(value));
        });
      }

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

  async clearCachedAppFiles(appFolder) {
    if (!appFolder || !('caches' in window)) return 0;

    const folderPath = `/apps/${appFolder}/`;
    let removedCount = 0;

    try {
      const cacheNames = await caches.keys();

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();

        for (const request of requests) {
          let pathname = '';
          try {
            pathname = new URL(request.url).pathname;
          } catch {
            continue;
          }

          if (!pathname.includes(folderPath)) continue;

          const removed = await cache.delete(request, { ignoreSearch: true });
          if (removed) removedCount++;
        }
      }
    } catch (error) {
      console.warn(`Failed to clear cache for app ${appFolder}:`, error);
    }

    return removedCount;
  }

  async deleteAppData(appId) {
    const appInfo = this.appStorageMap[appId];
    if (!appInfo) return;

    if (!confirm(`Delete all data for ${appInfo.name}? This cannot be undone.`)) return;

    try {
      await this.clearAppStorage(appInfo, { clearCachedFiles: true });
    } catch (error) {
      console.error(`Failed to delete data for ${appInfo.name}:`, error);
      alert(`Failed to delete ${appInfo.name} data: ${error.message}`);
      return;
    }

    const select = document.getElementById('deleteAppSelect');
    if (select) select.value = '';

    this.showNotification(`${appInfo.name} data and cached files deleted.`);
  }

  async resetData() {
    const message = [
      'Are you sure you want to reset all local data?',
      '',
      'This will permanently delete:',
      '• All app data from installed apps',
      '• Your preferences and settings',
      '• Recent apps history',
      '',
      'This action cannot be undone.'
    ].join('\n');

    if (!confirm(message)) return;
    if (!confirm('This is your last chance. Delete ALL data?')) return;

    try {
      await this.clearAllManagedData({ clearCachedFiles: true });
    } catch (error) {
      console.error('Reset failed:', error);
      alert(`Failed to reset data: ${error.message}`);
      return;
    }

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

      // Tell the new SW to activate immediately.
      // The controllerchange handler in pwa-install.js will reload the page.
      // Fallback reload in case controllerchange was not registered (first visit).
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => window.location.reload(), 3000);

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
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
    }, 2500);
  }
}

window.SettingsManager = SettingsManager;
