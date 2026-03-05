class SearchManager {
  constructor(appLoader, launcher) {
    this.appLoader = appLoader;
    this.launcher = launcher;
    this.input = null;
    this.isActive = false;
    this.lastQuery = '';
  }

  init() {
    this.input = document.getElementById('globalSearch');
    if (!this.input) {
      console.warn('Search input not found');
      return this;
    }

    this.bindKeyboard();
    this.bindInput();
    return this;
  }

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'l')) {
        e.preventDefault();
        this.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (this.input === document.activeElement) {
          if (this.input.value) {
            this.clear();
          } else {
            this.blur();
          }
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (e.key === 'Enter' && this.input === document.activeElement) {
        this.openTopResult();
        e.preventDefault();
        return;
      }

      // Auto-focus search on keypress (if not already in an input)
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.length === 1 &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA'
      ) {
        this.focus();
      }
    });
  }

  bindInput() {
    let debounceTimer;
    this.input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this.search(), 150);
    });

    this.input.addEventListener('focus', () => {
      this.isActive = true;
    });

    this.input.addEventListener('blur', () => {
      this.isActive = false;
    });
  }

  focus() {
    this.input.focus();
    this.input.select();
  }

  blur() {
    this.input.blur();
  }

  clear() {
    this.input.value = '';
    this.lastQuery = '';
    this.launcher.renderApps();
  }

  search() {
    const query = this.input.value.trim();
    if (query === this.lastQuery) return;
    this.lastQuery = query;

    if (!query) {
      this.launcher.renderApps();
      return;
    }

    const results = this.appLoader.searchApps(query);
    this.launcher.renderApps(results);
  }

  openTopResult() {
    const query = this.input.value.trim();
    if (!query) return;

    const results = this.appLoader.searchApps(query);
    if (results.length > 0) {
      this.launcher.openApp(results[0].id);
      this.clear();
      this.blur();
    }
  }
}

window.SearchManager = SearchManager;
