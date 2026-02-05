/**
 * Settings Manager - Handles settings drawer and data management
 */

class SettingsManager {
  constructor(themeManager, appLoader) {
    this.themeManager = themeManager;
    this.appLoader = appLoader;
    this.drawer = null;
    this.overlay = null;
    this.isOpen = false;

    // Storage keys for all app data
    this.storageKeys = [
      'todoList',
      'kanbanBoard',
      'pomodoroSettings',
      'pomodoroState',
      'marlapps-notes',
      'marlapps-habits',
      'marlapps-mirror-photos',
      'marlapps-recents',
      'marlapps-theme'
    ];
  }

  /**
   * Initialize settings manager
   */
  init() {
    this.drawer = document.getElementById('settingsDrawer');
    this.overlay = document.getElementById('drawerOverlay');

    if (!this.drawer || !this.overlay) {
      console.warn('Settings drawer elements not found');
      return this;
    }

    this.bindEvents();
    this.updateThemeSelector();
    return this;
  }

  /**
   * Bind all event listeners
   */
  bindEvents() {
    // Open drawer
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.open());
    }

    // Close drawer
    const closeBtn = document.getElementById('closeSettingsBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Overlay click to close
    this.overlay.addEventListener('click', () => this.close());

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
        e.preventDefault();
      }
    });

    // Theme selection
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.themeManager.apply(btn.dataset.theme);
        this.updateThemeSelector();
      });
    });

    // Reset theme
    const resetThemeBtn = document.getElementById('resetThemeBtn');
    if (resetThemeBtn) {
      resetThemeBtn.addEventListener('click', () => {
        this.themeManager.reset();
        this.updateThemeSelector();
      });
    }

    // Export data
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportData());
    }

    // Import data
    const importBtn = document.getElementById('importBtn');
    const importInput = document.getElementById('importFileInput');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          this.importData(e.target.files[0]);
          e.target.value = ''; // Reset input
        }
      });
    }

    // Reset data
    const resetDataBtn = document.getElementById('resetDataBtn');
    if (resetDataBtn) {
      resetDataBtn.addEventListener('click', () => this.resetData());
    }
  }

  /**
   * Open settings drawer
   */
  open() {
    this.drawer.classList.add('open');
    this.overlay.classList.add('visible');
    this.isOpen = true;

    // Focus trap - focus first interactive element
    const firstFocusable = this.drawer.querySelector('button, input');
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }
  }

  /**
   * Close settings drawer
   */
  close() {
    this.drawer.classList.remove('open');
    this.overlay.classList.remove('visible');
    this.isOpen = false;

    // Dispatch event for mobile nav to reset state
    window.dispatchEvent(new CustomEvent('settingsClosed'));
  }

  /**
   * Toggle drawer
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Update theme selector UI
   */
  updateThemeSelector() {
    const currentTheme = this.themeManager.getTheme();
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === currentTheme);
    });
  }

  /**
   * Export all data to JSON file
   */
  exportData() {
    const data = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      theme: this.themeManager.getTheme(),
      recents: JSON.parse(localStorage.getItem('marlapps-recents') || '[]'),
      appData: {}
    };

    // Collect all app-specific data
    this.storageKeys.forEach(key => {
      if (key === 'marlapps-theme' || key === 'marlapps-recents') return;

      const value = localStorage.getItem(key);
      if (value) {
        try {
          data.appData[key] = JSON.parse(value);
        } catch {
          data.appData[key] = value;
        }
      }
    });

    // Create and download file
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

  /**
   * Import data from JSON file
   */
  async importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (!data.version || !data.exportedAt) {
        throw new Error('Invalid backup file format');
      }

      // Calculate what will change
      const changes = [];
      if (data.theme) changes.push(`Theme: ${data.theme}`);
      if (data.recents?.length) changes.push(`Recent apps: ${data.recents.length}`);
      if (data.appData) {
        const appDataCount = Object.keys(data.appData).length;
        if (appDataCount > 0) changes.push(`App data entries: ${appDataCount}`);
      }

      // Show confirmation with preview
      const message = [
        `Import data from ${new Date(data.exportedAt).toLocaleDateString()}?`,
        '',
        'This will overwrite your current data:',
        ...changes.map(c => `• ${c}`),
        '',
        'This action cannot be undone.'
      ].join('\n');

      if (!confirm(message)) return;

      // Apply imported data
      if (data.theme) {
        this.themeManager.apply(data.theme);
      }

      if (data.recents) {
        localStorage.setItem('marlapps-recents', JSON.stringify(data.recents));
      }

      if (data.appData) {
        Object.entries(data.appData).forEach(([key, value]) => {
          const serialized = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, serialized);
        });
      }

      this.showNotification('Data imported successfully. Reloading...');
      setTimeout(() => location.reload(), 1500);

    } catch (error) {
      console.error('Import failed:', error);
      alert(`Failed to import data: ${error.message}`);
    }
  }

  /**
   * Reset all local data
   */
  resetData() {
    const message = [
      'Are you sure you want to reset all local data?',
      '',
      'This will permanently delete:',
      '• All app data (todos, notes, habits, etc.)',
      '• Your preferences and settings',
      '• Recent apps history',
      '',
      'This action cannot be undone.'
    ].join('\n');

    if (!confirm(message)) return;

    // Double confirmation
    if (!confirm('This is your last chance. Delete ALL data?')) return;

    // Clear all storage
    this.storageKeys.forEach(key => localStorage.removeItem(key));

    // Also clear any other marlapps keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('marlapps-')) {
        localStorage.removeItem(key);
      }
    });

    this.showNotification('All data has been reset. Reloading...');
    setTimeout(() => location.reload(), 1500);
  }

  /**
   * Show temporary notification
   */
  showNotification(message) {
    // Simple alert for now - could be enhanced with toast UI
    console.log(message);
  }
}

// Export for use in other modules
window.SettingsManager = SettingsManager;
