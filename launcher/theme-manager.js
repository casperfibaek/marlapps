/**
 * Theme Manager - Handles theme switching and persistence
 */

class ThemeManager {
  constructor() {
    this.storageKey = 'marlapps-theme';
    this.defaultTheme = 'dark';
    this.supportedThemes = ['dark', 'light'];
    this.currentTheme = null;
  }

  /**
   * Initialize theme manager
   */
  init() {
    const saved = localStorage.getItem(this.storageKey);
    const osPreference = this.getOSPreference();
    const theme = saved || osPreference || this.defaultTheme;
    this.apply(theme);
    this.watchOSPreference();
    return this;
  }

  /**
   * Get OS color scheme preference
   */
  getOSPreference() {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  /**
   * Watch for OS preference changes
   */
  watchOSPreference() {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      // Only apply if user hasn't explicitly set a preference
      if (!localStorage.getItem(this.storageKey)) {
        this.apply(e.matches ? 'dark' : 'light');
        this.dispatchChange();
      }
    });
  }

  /**
   * Apply a theme
   */
  apply(theme) {
    if (!this.supportedThemes.includes(theme)) {
      theme = this.defaultTheme;
    }

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.storageKey, theme);
    this.currentTheme = theme;

    // Update meta theme-color for PWA
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.content = theme === 'dark' ? '#0a0a0f' : '#e8e8ed';
    }

    return this;
  }

  /**
   * Toggle between themes
   */
  toggle() {
    const next = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.apply(next);
    this.dispatchChange();
    return this;
  }

  /**
   * Reset to default/OS preference
   */
  reset() {
    localStorage.removeItem(this.storageKey);
    const theme = this.getOSPreference() || this.defaultTheme;
    this.apply(theme);
    this.dispatchChange();
    return this;
  }

  /**
   * Get current theme
   */
  getTheme() {
    return this.currentTheme;
  }

  /**
   * Check if dark theme is active
   */
  isDark() {
    return this.currentTheme === 'dark';
  }

  /**
   * Dispatch theme change event
   */
  dispatchChange() {
    window.dispatchEvent(new CustomEvent('themechange', {
      detail: { theme: this.currentTheme }
    }));
  }
}

// Export for use in other modules
window.ThemeManager = ThemeManager;
