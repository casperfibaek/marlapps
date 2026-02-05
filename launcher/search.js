/**
 * Search Manager - Handles global search functionality
 */

class SearchManager {
  constructor(appLoader, launcher) {
    this.appLoader = appLoader;
    this.launcher = launcher;
    this.input = null;
    this.isActive = false;
    this.lastQuery = '';
  }

  /**
   * Initialize search manager
   */
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

  /**
   * Bind global keyboard shortcuts
   */
  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K to focus search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.focus();
        return;
      }

      // Escape handling
      if (e.key === 'Escape') {
        if (this.input === document.activeElement) {
          if (this.input.value) {
            this.clear();
          } else {
            this.blur();
          }
          e.preventDefault();
        }
        return;
      }

      // Enter to open top result
      if (e.key === 'Enter' && this.input === document.activeElement) {
        this.openTopResult();
        e.preventDefault();
        return;
      }

      // Start typing to focus search (if not already in an input)
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

  /**
   * Bind input events
   */
  bindInput() {
    // Input change - debounced search
    let debounceTimer;
    this.input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this.search(), 150);
    });

    // Focus state
    this.input.addEventListener('focus', () => {
      this.isActive = true;
      this.input.parentElement.classList.add('focused');
    });

    this.input.addEventListener('blur', () => {
      this.isActive = false;
      this.input.parentElement.classList.remove('focused');
    });
  }

  /**
   * Focus search input
   */
  focus() {
    this.input.focus();
    this.input.select();
  }

  /**
   * Blur search input
   */
  blur() {
    this.input.blur();
  }

  /**
   * Clear search input and restore full list
   */
  clear() {
    this.input.value = '';
    this.lastQuery = '';
    this.launcher.renderApps();
  }

  /**
   * Perform search
   */
  search() {
    const query = this.input.value.trim();

    // Skip if query hasn't changed
    if (query === this.lastQuery) return;
    this.lastQuery = query;

    if (!query) {
      this.launcher.renderApps();
      return;
    }

    const results = this.appLoader.searchApps(query);
    this.launcher.renderApps(results);
  }

  /**
   * Open the top search result
   */
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

  /**
   * Get current query
   */
  getQuery() {
    return this.input ? this.input.value.trim() : '';
  }

  /**
   * Check if search is active
   */
  isSearchActive() {
    return this.isActive && this.getQuery().length > 0;
  }
}

// Export for use in other modules
window.SearchManager = SearchManager;
