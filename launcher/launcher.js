class Launcher {
  constructor() {
    this.themeManager = new ThemeManager();
    this.appLoader = new AppLoader();
    this.searchManager = null;
    this.settingsManager = null;
    this.currentCategory = 'all';
    this.currentSort = 'recent';
    this.currentApp = null;
    this.keepAliveFrames = new Map();
    this.keepAliveContainer = null;
  }

  async init() {
    this.themeManager.init();
    await this.appLoader.init();

    this.searchManager = new SearchManager(this.appLoader, this);
    this.searchManager.init();

    this.settingsManager = new SettingsManager(this.themeManager, this.appLoader);
    this.settingsManager.init();

    this.bindEvents();
    this.renderRecents();
    this.renderApps();

    document.body.classList.add('loaded');

    // Check for updates on startup (respects user preference)
    this.settingsManager.autoCheckForUpdates();

    // Handle ?app= shortcut parameter (from PWA manifest shortcuts)
    const params = new URLSearchParams(window.location.search);
    const appParam = params.get('app');
    if (appParam && this.appLoader.getAppById(appParam)) {
      this.openApp(appParam);
      // Clean URL without reloading
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  bindEvents() {
    const appGrid = document.getElementById('appGrid');
    if (appGrid) {
      appGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.app-card[data-app-id]');
        if (card) this.openApp(card.dataset.appId);
      });
    }

    const recentsScroller = document.getElementById('recentsScroller');
    if (recentsScroller) {
      recentsScroller.addEventListener('click', (e) => {
        const tile = e.target.closest('.recent-tile[data-app-id]');
        if (tile) this.openApp(tile.dataset.appId);
      });
    }

    const homeBtn = document.getElementById('homeBtn');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => {
        if (this.currentApp) this.closeApp();
        this.setCategory('all');
        this.closeMobileOverlays();
      });
    }

    const topbarSearchBtn = document.getElementById('topbarSearchBtn');
    if (topbarSearchBtn) {
      topbarSearchBtn.addEventListener('click', () => this.openMobileSearch());
    }

    document.querySelectorAll('.nav-item[data-category]').forEach(item => {
      item.addEventListener('click', () => this.setCategory(item.dataset.category));
    });

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        if (window.innerWidth <= 768) this.openMobileSearch();
        return;
      }

      if (e.key === 'Escape') {
        const mobileSearchOverlay = document.getElementById('mobileSearchOverlay');
        if (mobileSearchOverlay && !mobileSearchOverlay.classList.contains('hidden')) {
          this.closeMobileSearch();
          e.preventDefault();
          return;
        }

        const mobileCategoriesSheet = document.getElementById('mobileCategoriesSheet');
        if (mobileCategoriesSheet && !mobileCategoriesSheet.classList.contains('hidden')) {
          this.closeMobileCategoriesSheet();
          e.preventDefault();
          return;
        }

        if (this.currentApp && !this.settingsManager.isOpen) {
          this.closeApp();
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
      const iframe = document.querySelector('.app-iframe');
      if (iframe) this.syncThemeToIframe(iframe);
    });

    const topbarSettingsBtn = document.getElementById('topbarSettingsBtn');
    if (topbarSettingsBtn) {
      topbarSettingsBtn.addEventListener('click', () => {
        if (this.settingsManager) this.settingsManager.open();
      });
    }

    this.bindMobileEvents();
  }

  bindMobileEvents() {
    const mobileNavHome = document.getElementById('mobileNavHome');
    const mobileNavSearch = document.getElementById('mobileNavSearch');
    const mobileNavCategories = document.getElementById('mobileNavCategories');
    const mobileNavSettings = document.getElementById('mobileNavSettings');

    if (mobileNavHome) {
      mobileNavHome.addEventListener('click', () => {
        if (this.currentApp) this.closeApp();
        this.closeMobileOverlays();
        this.setMobileNavActive('home');
      });
    }

    if (mobileNavSearch) {
      mobileNavSearch.addEventListener('click', () => {
        this.openMobileSearch();
        this.setMobileNavActive('search');
      });
    }

    if (mobileNavCategories) {
      mobileNavCategories.addEventListener('click', () => {
        this.openMobileCategoriesSheet();
        this.setMobileNavActive('categories');
      });
    }

    if (mobileNavSettings) {
      mobileNavSettings.addEventListener('click', () => {
        if (this.settingsManager) this.settingsManager.open();
        this.setMobileNavActive('settings');
      });
    }

    const mobileSearchCancel = document.getElementById('mobileSearchCancel');
    const mobileSearchInput = document.getElementById('mobileSearchInput');

    if (mobileSearchCancel) {
      mobileSearchCancel.addEventListener('click', () => this.closeMobileSearch());
    }

    if (mobileSearchInput) {
      let debounceTimer;
      mobileSearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => this.handleMobileSearch(), 150);
      });
    }

    const mobileCategoriesClose = document.getElementById('mobileCategoriesClose');
    if (mobileCategoriesClose) {
      mobileCategoriesClose.addEventListener('click', () => this.closeMobileCategoriesSheet());
    }

    document.querySelectorAll('.mobile-category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setCategory(btn.dataset.category);
        this.updateMobileCategoryActive(btn.dataset.category);
        this.closeMobileCategoriesSheet();
        this.setMobileNavActive('home');
      });
    });

    window.addEventListener('settingsClosed', () => this.setMobileNavActive('home'));
  }

  setMobileNavActive(nav) {
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === nav);
    });
  }

  openMobileSearch() {
    const overlay = document.getElementById('mobileSearchOverlay');
    const input = document.getElementById('mobileSearchInput');
    if (overlay) {
      overlay.classList.remove('hidden');
      if (input) {
        input.focus();
        input.value = '';
      }
    }
  }

  closeMobileSearch() {
    const overlay = document.getElementById('mobileSearchOverlay');
    const results = document.getElementById('mobileSearchResults');
    if (overlay) overlay.classList.add('hidden');
    if (results) results.innerHTML = '';
    this.setMobileNavActive('home');
  }

  handleMobileSearch() {
    const input = document.getElementById('mobileSearchInput');
    const results = document.getElementById('mobileSearchResults');
    if (!input || !results) return;

    const query = input.value.trim();
    if (!query) {
      results.innerHTML = '';
      return;
    }

    const apps = this.appLoader.searchApps(query);
    if (apps.length === 0) {
      results.innerHTML = '<p class="no-results" role="status">No apps found</p>';
      return;
    }

    const cardsHtml = apps.map(app => `
      <div class="app-card" data-app-id="${app.id}" tabindex="0" role="listitem" aria-label="Open ${this.escapeHtml(app.name)}">
        <img class="app-icon" src="${this.appLoader.getAppIconUrl(app)}" alt="" loading="lazy">
        <div class="app-info">
          <span class="app-name">${this.escapeHtml(app.name)}</span>
          <span class="app-description">${this.escapeHtml(app.description)}</span>
        </div>
      </div>
    `).join('');
    results.innerHTML = `<div class="search-results-list">${cardsHtml}</div>`;

    results.querySelectorAll('.app-card').forEach(card => {
      card.addEventListener('click', () => {
        this.openApp(card.dataset.appId);
        this.closeMobileSearch();
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
    this.setMobileNavActive('home');
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
    this.closeMobileSearch();
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
    this.currentCategory = category;

    document.querySelectorAll('.nav-item[data-category]').forEach(item => {
      const isActive = item.dataset.category === category;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const title = document.querySelector('.toolbar-title');
    if (title) {
      title.textContent = category === 'all'
        ? 'All apps'
        : category.charAt(0).toUpperCase() + category.slice(1);
    }

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

  renderRecents() {
    const container = document.getElementById('recentsScroller');
    if (!container) return;

    const recents = this.appLoader.getRecentApps(5);

    if (recents.length === 0) {
      container.innerHTML = '<p class="no-recents">No recent apps. Open an app to see it here.</p>';
      return;
    }

    container.innerHTML = recents.map(app => `
      <div class="recent-tile" data-app-id="${app.id}" tabindex="0" role="listitem" aria-label="Open ${this.escapeHtml(app.name)}">
        <img class="recent-icon" src="${this.appLoader.getAppIconUrl(app)}" alt="" loading="lazy">
        <div class="recent-info">
          <span class="recent-name">${this.escapeHtml(app.name)}</span>
          <span class="recent-meta">Last opened ${this.formatRelativeTime(app.lastOpened)}</span>
        </div>
      </div>
    `).join('');
  }

  renderApps(apps = null) {
    const container = document.getElementById('appGrid');
    if (!container) return;

    if (!apps) {
      apps = this.appLoader.getAppsByCategory(this.currentCategory);
    }

    apps = this.sortApps(apps);

    const cardsHtml = apps.map(app => {
      const category = app.categories?.[0] || '';
      const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
      return `
      <div class="app-card" data-app-id="${app.id}" tabindex="0" role="listitem" aria-label="Open ${this.escapeHtml(app.name)}">
        <img class="app-icon" src="${this.appLoader.getAppIconUrl(app)}" alt="" loading="lazy">
        <div class="app-info">
          <span class="app-name">${this.escapeHtml(app.name)}</span>
          <span class="app-description">${this.escapeHtml(app.description)}</span>
        </div>
        <span class="app-category-badge">${this.escapeHtml(categoryLabel)}</span>
      </div>
    `;
    }).join('');

    container.innerHTML = cardsHtml;
  }

  shouldKeepAliveApp(app) {
    return Boolean(app && app.keepAliveOnClose);
  }

  getKeepAliveContainer() {
    if (this.keepAliveContainer && document.body.contains(this.keepAliveContainer)) {
      return this.keepAliveContainer;
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

    this.keepAliveContainer = container;
    return container;
  }

  createAppIframe(app) {
    const iframe = document.createElement('iframe');
    iframe.src = this.appLoader.getAppEntryUrl(app);
    iframe.className = 'app-iframe';
    iframe.title = app.name;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads');
    return iframe;
  }

  openApp(appId) {
    const app = this.appLoader.getAppById(appId);
    if (!app) {
      console.warn(`App not found: ${appId}`);
      return;
    }

    if (this.currentApp && this.currentApp.id === appId) {
      return;
    }
    if (this.currentApp && this.currentApp.id !== appId) {
      this.closeApp();
    }

    this.appLoader.recordAppOpen(appId);
    this.currentApp = app;

    const workspace = document.getElementById('appWorkspace');
    const content = document.getElementById('workspaceContent');
    const mainContent = document.getElementById('mainContent');
    if (!workspace || !content || !mainContent) return;

    content.innerHTML = '';
    let iframe = this.keepAliveFrames.get(app.id);

    if (iframe) {
      this.keepAliveFrames.delete(app.id);
      content.appendChild(iframe);
      this.syncThemeToIframe(iframe);
      iframe.classList.add('loaded');
    } else {
      iframe = this.createAppIframe(app);
      content.appendChild(iframe);
      iframe.addEventListener('load', () => {
        this.syncThemeToIframe(iframe);
        iframe.classList.add('loaded');
      });
    }

    mainContent.classList.add('hidden');
    workspace.classList.remove('hidden');
    document.body.classList.add('app-open');
    document.title = `${app.name} - MarlApps`;
  }

  closeApp() {
    const workspace = document.getElementById('appWorkspace');
    const content = document.getElementById('workspaceContent');
    const mainContent = document.getElementById('mainContent');
    if (!workspace || !content || !mainContent) return;

    const app = this.currentApp;
    const iframe = content.querySelector('.app-iframe');

    if (app && iframe && this.shouldKeepAliveApp(app)) {
      const keepAliveContainer = this.getKeepAliveContainer();
      this.keepAliveFrames.set(app.id, iframe);
      keepAliveContainer.appendChild(iframe);
    } else {
      content.innerHTML = '';
    }

    workspace.classList.add('hidden');
    mainContent.classList.remove('hidden');
    document.body.classList.remove('app-open');
    this.currentApp = null;
    document.title = 'MarlApps';
    this.renderRecents();
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
