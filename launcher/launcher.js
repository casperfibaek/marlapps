class BackgroundAppHost {
  constructor() {
    this.frames = new Map();
    this.container = null;
  }

  shouldKeepAliveApp(app) {
    if (!app) return false;

    // Legacy fallback to keep old manifests working.
    if (app.keepAliveOnClose === true) return true;

    const background = app.background;
    if (!background || typeof background !== 'object' || Array.isArray(background)) {
      return false;
    }

    return background.mode === 'keep-alive' || background.keepAlive === true;
  }

  getContainer() {
    if (this.container && document.body.contains(this.container)) {
      return this.container;
    }

    let container = document.getElementById('keepAliveWorkspace');
    if (!container) {
      container = document.createElement('div');
      container.id = 'keepAliveWorkspace';
      container.setAttribute('aria-hidden', 'true');
      container.style.position = 'absolute';
      container.style.width = '0';
      container.style.height = '0';
      container.style.overflow = 'hidden';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    this.container = container;
    return container;
  }

  stashFrame(appId, iframe) {
    if (!appId || !iframe) return;
    this.frames.set(appId, iframe);
    this.getContainer().appendChild(iframe);
  }

  restoreFrame(appId) {
    const iframe = this.frames.get(appId);
    if (!iframe) return null;
    this.frames.delete(appId);
    return iframe;
  }

  discardFrame(appId) {
    const iframe = this.frames.get(appId);
    if (!iframe) return false;

    this.frames.delete(appId);
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return true;
  }

  hasFrame(appId) {
    return this.frames.has(appId);
  }

  forEachFrame(cb) {
    this.frames.forEach((iframe, appId) => cb(iframe, appId));
  }
}

class Launcher {
  constructor() {
    this.themeManager = new ThemeManager();
    this.appLoader = new AppLoader();
    this.searchManager = null;
    this.settingsManager = null;
    this.categories = [];
    this.currentCategory = 'all';
    this.currentSort = 'recent';
    this.currentApp = null;
    this.backgroundHost = new BackgroundAppHost();
    this.backgroundActivity = new Map();
    this.activeAppStorageKey = 'marlapps-active-app';
  }

  async init() {
    this.themeManager.init();
    await this.appLoader.init();
    this.renderCategoryControls();

    this.searchManager = new SearchManager(this.appLoader, this);
    this.searchManager.init();

    this.settingsManager = new SettingsManager(this.themeManager, this.appLoader, this);
    this.settingsManager.init();

    this.bindEvents();
    this.renderApps();

    document.body.classList.add('loaded');

    // Check for updates on startup (respects user preference)
    this.settingsManager.autoCheckForUpdates();

    // Always return to launcher on browser reload (including hard reload).
    // Deep-links and persisted app state only apply to fresh navigations.
    const params = new URLSearchParams(window.location.search);
    const appParam = params.get('app');
    if (this.isReloadNavigation()) {
      this.clearPersistedActiveApp();
      if (appParam) this.clearAppQueryParam();
      return;
    }

    // Restore active app from URL (shortcut deep-link) or last-opened state.
    const startupAppId = this.getStartupAppId(appParam);

    if (!startupAppId && appParam) {
      this.clearAppQueryParam();
    }

    if (startupAppId) {
      this.openApp(startupAppId);
    }
  }

  isReloadNavigation() {
    try {
      const navigationEntries = performance.getEntriesByType('navigation');
      const navigationEntry = navigationEntries[0];
      if (navigationEntry && typeof navigationEntry.type === 'string') {
        return navigationEntry.type === 'reload';
      }

      if (performance.navigation && typeof performance.navigation.type === 'number') {
        return performance.navigation.type === 1;
      }
    } catch (e) {
      // Ignore navigation API errors.
    }

    return false;
  }

  isActivationKey(key) {
    return key === 'Enter' || key === ' ' || key === 'Spacebar';
  }

  normalizeCategory(category) {
    return String(category || '').trim().toLowerCase();
  }

  getCategoryDefinitions() {
    const categoryMap = new Map();

    this.appLoader.apps.forEach((app) => {
      if (!Array.isArray(app.categories)) return;
      app.categories.forEach((category) => {
        if (typeof category !== 'string') return;
        const label = category.trim();
        if (!label) return;
        const key = this.normalizeCategory(label);
        if (!categoryMap.has(key)) {
          categoryMap.set(key, label);
        }
      });
    });

    const categories = [...categoryMap.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) => ({ key, label }));

    return [{ key: 'all', label: 'All apps' }, ...categories];
  }

  getCategoryLabel(category, fallback = 'All apps') {
    const normalized = this.normalizeCategory(category);
    const match = this.categories.find(item => item.key === normalized);
    return match ? match.label : fallback;
  }

  getCategoryIcon(category) {
    const iconMap = {
      all: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
      focus: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
      planning: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
      notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>',
      tracking: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      tools: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>'
    };
    return iconMap[this.normalizeCategory(category)]
      || '<path d="M20 7h-9a2 2 0 0 1 0-4h9a2 2 0 0 1 0 4z"/><path d="M4 12h16"/><path d="M4 17h16"/><path d="M4 22h16"/>';
  }

  renderCategoryControls() {
    this.categories = this.getCategoryDefinitions();
    const validCategories = new Set(this.categories.map(item => item.key));
    if (!validCategories.has(this.currentCategory)) {
      this.currentCategory = 'all';
    }

    const dropdown = document.getElementById('categoryDropdown');
    if (dropdown) {
      dropdown.innerHTML = this.categories.map((category) => {
        const isActive = category.key === this.currentCategory;
        return `
          <button class="category-dropdown-item${isActive ? ' active' : ''}" data-category="${this.escapeHtml(category.key)}" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              ${this.getCategoryIcon(category.key)}
            </svg>
            <span>${this.escapeHtml(category.label)}</span>
          </button>
        `;
      }).join('');
    }

    const mobileList = document.getElementById('mobileCategoryList');
    if (mobileList) {
      mobileList.innerHTML = this.categories.map((category) => {
        const isActive = category.key === this.currentCategory;
        return `
          <button class="mobile-category-btn${isActive ? ' active' : ''}" data-category="${this.escapeHtml(category.key)}">
            ${this.escapeHtml(category.label)}
          </button>
        `;
      }).join('');
    }

    this.updateCategoryLabels();
  }

  updateCategoryLabels() {
    const label = this.getCategoryLabel(this.currentCategory);

    const toolbarLabel = document.getElementById('toolbarCategoryLabel');
    if (toolbarLabel) toolbarLabel.textContent = label;
  }

  bindEvents() {
    const appGrid = document.getElementById('appGrid');
    if (appGrid) {
      appGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.app-card[data-app-id]');
        if (card) this.openApp(card.dataset.appId);
      });
      appGrid.addEventListener('keydown', (e) => {
        if (!this.isActivationKey(e.key)) return;
        const card = e.target.closest('.app-card[data-app-id]');
        if (!card) return;
        e.preventDefault();
        this.openApp(card.dataset.appId);
      });
    }

    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => {
        if (this.currentApp) this.closeApp('home');
        this.setCategory('all');
        this.closeMobileOverlays();
      });
    }

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.currentSort = e.target.value;
        this.renderApps();
      });
    }

    const toolbarCategoriesBtn = document.getElementById('toolbarCategoriesBtn');
    if (toolbarCategoriesBtn) {
      toolbarCategoriesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCategoryDropdown();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const mobileCategoriesSheet = document.getElementById('mobileCategoriesSheet');
        if (mobileCategoriesSheet && !mobileCategoriesSheet.classList.contains('hidden')) {
          this.closeMobileCategoriesSheet();
          e.preventDefault();
          return;
        }

        if (this.currentApp && !this.settingsManager.isOpen) {
          this.closeApp('home');
          e.preventDefault();
          return;
        }

        if (this.currentCategory !== 'all' && !this.settingsManager.isOpen) {
          this.setCategory('all');
          e.preventDefault();
          return;
        }
      }
    });

    window.addEventListener('themechange', () => {
      const iframe = document.querySelector('#workspaceContent .app-iframe');
      if (iframe) this.syncThemeToIframe(iframe);
      this.backgroundHost.forEachFrame((frame) => this.syncThemeToIframe(frame));
    });

    window.addEventListener('message', (event) => {
      this.handleAppBackgroundActivityMessage(event);
    });

    const notifyUnload = () => {
      this.notifyManagedAppVisibility(false, 'launcher-unload');
    };
    window.addEventListener('pagehide', notifyUnload);
    window.addEventListener('beforeunload', notifyUnload);

    const topbarSettingsBtn = document.getElementById('topbarSettingsBtn');
    if (topbarSettingsBtn) {
      topbarSettingsBtn.addEventListener('click', () => {
        if (this.settingsManager) this.settingsManager.open();
      });
    }

    this.bindMobileEvents();
  }

  bindMobileEvents() {
    const mobileCategoriesClose = document.getElementById('mobileCategoriesClose');
    if (mobileCategoriesClose) {
      mobileCategoriesClose.addEventListener('click', () => this.closeMobileCategoriesSheet());
    }

    document.querySelectorAll('.mobile-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setCategory(btn.dataset.category);
        this.updateMobileCategoryActive(btn.dataset.category);
        this.closeMobileCategoriesSheet();
      });
    });
  }

  openMobileCategoriesSheet() {
    const sheet = document.getElementById('mobileCategoriesSheet');
    if (sheet) sheet.classList.remove('hidden');
    this.showMobileBackdrop(() => this.closeMobileCategoriesSheet());
  }

  closeMobileCategoriesSheet() {
    const sheet = document.getElementById('mobileCategoriesSheet');
    if (sheet) sheet.classList.add('hidden');
    this.hideMobileBackdrop();
  }

  updateMobileCategoryActive(category) {
    document.querySelectorAll('.mobile-category-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
  }

  showMobileBackdrop(onClose) {
    let backdrop = document.querySelector('.mobile-sheet-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'mobile-sheet-backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.classList.remove('hidden');
    backdrop.onclick = onClose;
  }

  hideMobileBackdrop() {
    const backdrop = document.querySelector('.mobile-sheet-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
  }

  closeMobileOverlays() {
    this.closeMobileCategoriesSheet();
  }

  toggleCategoryDropdown() {
    const dropdown = document.getElementById('categoryDropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      dropdown.classList.remove('hidden');
      dropdown.querySelectorAll('.category-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.category === this.currentCategory);
      });
      const closeHandler = (e) => {
        if (!dropdown.contains(e.target) && e.target.id !== 'toolbarCategoriesBtn') {
          this.closeCategoryDropdown();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
      dropdown.querySelectorAll('.category-dropdown-item').forEach(item => {
        item.onclick = () => {
          this.setCategory(item.dataset.category);
          this.closeCategoryDropdown();
        };
      });
    } else {
      this.closeCategoryDropdown();
    }
  }

  closeCategoryDropdown() {
    const dropdown = document.getElementById('categoryDropdown');
    if (dropdown) dropdown.classList.add('hidden');
  }

  setCategory(category) {
    const normalizedCategory = this.normalizeCategory(category);
    const validCategories = new Set(this.categories.map(item => item.key));
    this.currentCategory = validCategories.has(normalizedCategory) ? normalizedCategory : 'all';

    document.querySelectorAll('.category-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.dataset.category === this.currentCategory);
    });

    this.updateMobileCategoryActive(this.currentCategory);
    this.updateCategoryLabels();

    if (this.searchManager) this.searchManager.clear();
    this.renderApps();
  }

  sortApps(apps) {
    const sorted = [...apps];

    switch (this.currentSort) {
      case 'alpha':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;

      case 'category':
        sorted.sort((a, b) => {
          const catA = a.categories?.[0] || 'zzz';
          const catB = b.categories?.[0] || 'zzz';
          return catA.localeCompare(catB);
        });
        break;

      case 'recent':
      default:
        const recents = this.appLoader.recents;
        sorted.sort((a, b) => {
          const aRecent = recents.find(r => r.id === a.id)?.timestamp || 0;
          const bRecent = recents.find(r => r.id === b.id)?.timestamp || 0;
          if (bRecent !== aRecent) return bRecent - aRecent;
          return a.order - b.order;
        });
        break;
    }

    return sorted;
  }

  renderApps(apps = null) {
    const container = document.getElementById('appGrid');
    if (!container) return;

    if (!apps) {
      apps = this.appLoader.getAppsByCategory(this.currentCategory);
      apps = this.sortApps(apps);
    }

    const cardsHtml = apps.map((app) => {
      const category = app.categories?.[0] || '';
      const categoryKey = this.normalizeCategory(category);
      const categoryLabel = category
        ? this.getCategoryLabel(categoryKey, category)
        : '';
      const isBackgroundRunning = this.isAppRunningInBackground(app.id);
      const ariaLabel = this.escapeHtml(this.getLauncherItemAriaLabel(app.name, isBackgroundRunning));
      return `
      <div class="app-card${isBackgroundRunning ? ' is-background-running' : ''}" data-app-id="${app.id}" tabindex="0" role="listitem" aria-label="${ariaLabel}">
        <span class="app-icon-wrap">
          <span class="background-running-frame" aria-hidden="true"></span>
          <img class="app-icon" src="${this.appLoader.getAppIconUrl(app)}" alt="" loading="lazy">
        </span>
        <div class="app-info">
          <span class="app-name">${this.escapeHtml(app.name)}</span>
          <span class="app-description">${this.escapeHtml(app.description)}</span>
        </div>
        <span class="app-category-badge">${this.escapeHtml(categoryLabel)}</span>
      </div>
    `;
    }).join('');

    container.innerHTML = cardsHtml;
    this.refreshBackgroundIndicators();
  }

  shouldKeepAliveApp(app) {
    return this.backgroundHost.shouldKeepAliveApp(app);
  }

  isAppRunningInBackground(appId) {
    return this.backgroundHost.hasFrame(appId) && this.backgroundActivity.get(appId) === true;
  }

  getLauncherItemAriaLabel(appName, isBackgroundRunning = false) {
    const openLabel = `Open ${appName}`;
    if (!isBackgroundRunning) return openLabel;
    return `${openLabel}. Running in background.`;
  }

  refreshBackgroundIndicators() {
    const launcherItems = document.querySelectorAll('.app-card[data-app-id]');
    launcherItems.forEach((item) => {
      const appId = item.dataset.appId;
      const app = this.appLoader.getAppById(appId);
      const appName = app && typeof app.name === 'string' ? app.name : 'app';
      const isBackgroundRunning = this.isAppRunningInBackground(appId);

      item.classList.toggle('is-background-running', isBackgroundRunning);
      item.setAttribute('aria-label', this.getLauncherItemAriaLabel(appName, isBackgroundRunning));
    });
  }

  getAppIdForContentWindow(contentWindow) {
    if (!contentWindow) return null;

    const activeIframe = document.querySelector('#workspaceContent .app-iframe');
    if (activeIframe && activeIframe.contentWindow === contentWindow) {
      return activeIframe.dataset.appId || null;
    }

    let matchedAppId = null;
    this.backgroundHost.forEachFrame((frame, appId) => {
      if (!matchedAppId && frame.contentWindow === contentWindow) {
        matchedAppId = appId;
      }
    });

    return matchedAppId;
  }

  setAppBackgroundActivity(appId, isActive) {
    if (!appId || !this.appLoader.getAppById(appId)) return;
    this.backgroundActivity.set(appId, Boolean(isActive));
    this.refreshBackgroundIndicators();
  }

  handleAppBackgroundActivityMessage(event) {
    const data = event && event.data;
    if (!data || data.type !== 'app-background-activity') return;

    const sourceAppId = this.getAppIdForContentWindow(event.source);
    const messageAppId = typeof data.appId === 'string' ? data.appId : null;
    const appId = sourceAppId || messageAppId;
    if (!appId) return;
    if (sourceAppId && messageAppId && sourceAppId !== messageAppId) return;

    this.setAppBackgroundActivity(appId, data.active === true);
  }

  notifyAppVisibility(iframe, visible, reason = '') {
    if (!iframe || !iframe.contentWindow) return;

    try {
      iframe.contentWindow.postMessage({
        type: 'app-visibility',
        visible: Boolean(visible),
        reason
      }, '*');
    } catch (e) {
      // Ignore
    }
  }

  notifyManagedAppVisibility(visible, reason = '') {
    const activeIframe = document.querySelector('#workspaceContent .app-iframe');
    if (activeIframe) this.notifyAppVisibility(activeIframe, visible, reason);
    this.backgroundHost.forEachFrame((frame) => this.notifyAppVisibility(frame, visible, reason));
  }

  invalidateAppInstance(appId) {
    const app = this.appLoader.getAppById(appId);
    if (!app) return false;

    const removedBackgroundFrame = this.backgroundHost.discardFrame(appId);
    if (removedBackgroundFrame) {
      this.backgroundActivity.delete(appId);
    }

    if (!this.currentApp || this.currentApp.id !== appId) {
      if (removedBackgroundFrame) this.refreshBackgroundIndicators();
      return false;
    }

    const content = document.getElementById('workspaceContent');
    if (!content) return false;

    content.innerHTML = '';
    const iframe = this.createAppIframe(app);
    content.appendChild(iframe);
    iframe.addEventListener('load', () => {
      this.syncThemeToIframe(iframe);
      this.notifyAppVisibility(iframe, true, 'workspace-open');
      iframe.classList.add('loaded');
    });
    this.refreshBackgroundIndicators();
    return true;
  }

  createAppIframe(app) {
    const iframe = document.createElement('iframe');
    iframe.src = this.appLoader.getAppEntryUrl(app);
    iframe.className = 'app-iframe';
    iframe.dataset.appId = app.id;
    iframe.title = app.name;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads');
    this.backgroundActivity.set(app.id, false);
    return iframe;
  }

  getPersistedActiveAppId() {
    try {
      const appId = localStorage.getItem(this.activeAppStorageKey);
      if (!appId) return null;
      if (this.appLoader.getAppById(appId)) return appId;
      localStorage.removeItem(this.activeAppStorageKey);
      return null;
    } catch (e) {
      return null;
    }
  }

  persistActiveApp(appId) {
    if (!appId) return;
    try {
      localStorage.setItem(this.activeAppStorageKey, appId);
    } catch (e) {
      // Ignore storage errors
    }
  }

  clearPersistedActiveApp() {
    try {
      localStorage.removeItem(this.activeAppStorageKey);
    } catch (e) {
      // Ignore storage errors
    }
  }

  setAppQueryParam(appId) {
    try {
      const url = new URL(window.location.href);
      if (appId) {
        url.searchParams.set('app', appId);
      } else {
        url.searchParams.delete('app');
      }
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (e) {
      // Ignore URL update errors
    }
  }

  clearAppQueryParam() {
    this.setAppQueryParam(null);
  }

  getStartupAppId(appParam) {
    if (appParam && this.appLoader.getAppById(appParam)) {
      return appParam;
    }
    return this.getPersistedActiveAppId();
  }

  openApp(appId) {
    const app = this.appLoader.getAppById(appId);
    if (!app) {
      console.warn(`App not found: ${appId}`);
      return;
    }

    if (this.currentApp && this.currentApp.id === appId) {
      this.persistActiveApp(app.id);
      this.setAppQueryParam(app.id);
      return;
    }
    if (this.currentApp && this.currentApp.id !== appId) {
      this.closeApp('switch');
    }

    this.appLoader.recordAppOpen(appId);
    this.currentApp = app;

    const workspace = document.getElementById('appWorkspace');
    const content = document.getElementById('workspaceContent');
    const mainContent = document.getElementById('mainContent');
    if (!workspace || !content || !mainContent) return;

    this.persistActiveApp(app.id);
    this.setAppQueryParam(app.id);

    content.innerHTML = '';
    let iframe = this.backgroundHost.restoreFrame(app.id);

    if (iframe) {
      content.appendChild(iframe);
      this.syncThemeToIframe(iframe);
      this.notifyAppVisibility(iframe, true, 'workspace-open');
      iframe.classList.add('loaded');
    } else {
      iframe = this.createAppIframe(app);
      content.appendChild(iframe);
      iframe.addEventListener('load', () => {
        this.syncThemeToIframe(iframe);
        this.notifyAppVisibility(iframe, true, 'workspace-open');
        iframe.classList.add('loaded');
      });
    }

    mainContent.classList.add('hidden');
    workspace.classList.remove('hidden');
    document.body.classList.add('app-open');
    document.title = app.name;
    this.refreshBackgroundIndicators();
  }

  closeApp(reason = 'home') {
    const workspace = document.getElementById('appWorkspace');
    const content = document.getElementById('workspaceContent');
    const mainContent = document.getElementById('mainContent');
    if (!workspace || !content || !mainContent) return;

    const app = this.currentApp;
    const iframe = content.querySelector('.app-iframe');
    const isSwitch = reason === 'switch';
    const hiddenReason = isSwitch ? 'app-switch' : 'launcher-home';
    const closeReason = isSwitch ? 'app-switch' : 'app-closed';

    if (app && iframe && this.shouldKeepAliveApp(app)) {
      this.notifyAppVisibility(iframe, false, hiddenReason);
      this.backgroundHost.stashFrame(app.id, iframe);
    } else {
      if (iframe) this.notifyAppVisibility(iframe, false, closeReason);
      content.innerHTML = '';
      if (app) this.backgroundActivity.delete(app.id);
    }

    workspace.classList.add('hidden');
    mainContent.classList.remove('hidden');
    document.body.classList.remove('app-open');
    this.currentApp = null;
    document.title = 'MarlApps';

    if (!isSwitch) {
      this.clearPersistedActiveApp();
      this.clearAppQueryParam();
    }

    this.refreshBackgroundIndicators();
  }

  syncThemeToIframe(iframe) {
    const theme = this.themeManager.getTheme();

    // Direct DOM access (same-origin iframes)
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.documentElement.setAttribute('data-theme', theme);
      }
    } catch (e) {
      // Cross-origin or sandbox restriction
    }

    // postMessage fallback
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'theme-change', theme }, '*');
      }
    } catch (e) {
      // Ignore
    }
  }

  formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString();
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.launcher = new Launcher();
  window.launcher.init();
});
