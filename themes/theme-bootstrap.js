(function bootstrapTheme() {
  var fallbackConfig = {
    storageKey: 'marlapps-theme',
    defaultTheme: 'dark',
    themes: [
      { id: 'dark', label: 'Dark', themeColor: '#0a0a0f' },
      { id: 'light', label: 'Light', themeColor: '#e8e8ed' },
      { id: 'futuristic', label: 'Futuristic', themeColor: '#020108' },
      { id: 'amalfi', label: 'Amalfi', themeColor: '#f5ebe0' }
    ]
  };
  var existingConfig = window.MARLAPPS_THEME_CONFIG;
  var config = existingConfig && typeof existingConfig === 'object' ? existingConfig : {};
  var themeEntries = Array.isArray(config.themes) && config.themes.length
    ? config.themes
    : fallbackConfig.themes;
  var storageKey = typeof config.storageKey === 'string'
    ? config.storageKey
    : fallbackConfig.storageKey;
  var defaultTheme = typeof config.defaultTheme === 'string'
    ? config.defaultTheme
    : fallbackConfig.defaultTheme;
  var supportedThemes = themeEntries
    .map(function mapTheme(theme) {
      return theme && typeof theme.id === 'string' ? theme.id : null;
    })
    .filter(Boolean);
  if (supportedThemes.length === 0) {
    supportedThemes = fallbackConfig.themes.map(function mapFallback(theme) {
      return theme.id;
    });
  }
  window.MARLAPPS_THEME_CONFIG = {
    storageKey: storageKey,
    defaultTheme: defaultTheme,
    themes: themeEntries
  };
  var theme = defaultTheme;

  function getOSPreference() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
    } catch (e) {
      return defaultTheme;
    }
  }

  try {
    var stored = localStorage.getItem(storageKey);
    if (stored && supportedThemes.indexOf(stored) !== -1) {
      theme = stored;
    } else {
      theme = getOSPreference();
    }
  } catch (e) {
    theme = getOSPreference();
  }

  document.documentElement.setAttribute('data-theme', theme);
})();
