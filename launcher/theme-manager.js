class ThemeManager {
  constructor() {
    const config = this.getThemeConfig();
    this.storageKey = config.storageKey;
    this.defaultTheme = config.defaultTheme;
    this.themes = config.themes;
    this.supportedThemes = this.themes.map(theme => theme.id);
    this.currentTheme = null;
  }

  getThemeConfig() {
    const fallback = {
      storageKey: 'marlapps-theme',
      defaultTheme: 'dark',
      themes: [
        { id: 'dark', label: 'Dark', themeColor: '#0a0a0f' }
      ]
    };
    const raw = window.MARLAPPS_THEME_CONFIG && typeof window.MARLAPPS_THEME_CONFIG === 'object'
      ? window.MARLAPPS_THEME_CONFIG
      : {};
    const normalizedThemes = Array.isArray(raw.themes) && raw.themes.length
      ? raw.themes
        .map((theme) => {
          if (!theme || typeof theme.id !== 'string') return null;
          return {
            id: theme.id,
            label: typeof theme.label === 'string' && theme.label.trim()
              ? theme.label
              : theme.id.charAt(0).toUpperCase() + theme.id.slice(1),
            themeColor: typeof theme.themeColor === 'string' && theme.themeColor.trim()
              ? theme.themeColor
              : null
          };
        })
        .filter(Boolean)
      : fallback.themes;
    const themeIds = new Set(normalizedThemes.map(theme => theme.id));
    const defaultTheme = typeof raw.defaultTheme === 'string' && themeIds.has(raw.defaultTheme)
      ? raw.defaultTheme
      : fallback.defaultTheme;
    const storageKey = typeof raw.storageKey === 'string' && raw.storageKey.trim()
      ? raw.storageKey
      : fallback.storageKey;
    window.MARLAPPS_THEME_CONFIG = {
      storageKey,
      defaultTheme,
      themes: normalizedThemes
    };
    return window.MARLAPPS_THEME_CONFIG;
  }

  init() {
    const saved = this.getStoredTheme();
    const osPreference = this.getOSPreference();
    const theme = saved || osPreference || this.defaultTheme;
    // Do not persist when theme comes from OS/default - this keeps OS-follow behavior.
    this.apply(theme, { persist: false });
    this.watchOSPreference();
    return this;
  }

  getStoredTheme() {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return null;
    if (!this.supportedThemes.includes(saved)) {
      localStorage.removeItem(this.storageKey);
      return null;
    }
    return saved;
  }

  hasUserPreference() {
    return Boolean(this.getStoredTheme());
  }

  getOSPreference() {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  watchOSPreference() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (!this.hasUserPreference()) {
        this.apply(e.matches ? 'dark' : 'light', { persist: false });
      }
    });
  }

  apply(theme, options = {}) {
    const persist = options.persist !== false;

    if (!this.supportedThemes.includes(theme)) {
      theme = this.defaultTheme;
    }

    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      localStorage.setItem(this.storageKey, theme);
    }
    this.currentTheme = theme;

    const themeDef = this.themes.find(item => item.id === theme);
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.content = (themeDef && themeDef.themeColor) || '#0a0a0f';
    }

    this.dispatchChange();
    return this;
  }

  reset() {
    localStorage.removeItem(this.storageKey);
    const theme = this.getOSPreference() || this.defaultTheme;
    this.apply(theme, { persist: false });
    return this;
  }

  getTheme() {
    return this.currentTheme;
  }

  getThemeDefinitions() {
    return [...this.themes];
  }

  dispatchChange() {
    window.dispatchEvent(new CustomEvent('themechange', {
      detail: { theme: this.currentTheme }
    }));
  }
}

window.ThemeManager = ThemeManager;
