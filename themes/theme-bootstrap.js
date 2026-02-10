(function bootstrapTheme() {
  var storageKey = 'marlapps-theme';
  var defaultTheme = 'dark';
  var supportedThemes = ['dark', 'light', 'futuristic', 'amalfi'];
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
