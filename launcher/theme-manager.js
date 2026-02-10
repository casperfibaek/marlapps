class ThemeManager {
  constructor() {
    this.storageKey = 'marlapps-theme';
    this.defaultTheme = 'dark';
    this.supportedThemes = ['dark', 'light', 'futuristic', 'amalfi'];
    this.currentTheme = null;
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

    const themeColors = {
      dark: '#0a0a0f',
      light: '#e8e8ed',
      futuristic: '#020108',
      amalfi: '#f5ebe0'
    };
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.content = themeColors[theme] || themeColors.dark;
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

  dispatchChange() {
    window.dispatchEvent(new CustomEvent('themechange', {
      detail: { theme: this.currentTheme }
    }));
  }
}

window.ThemeManager = ThemeManager;
