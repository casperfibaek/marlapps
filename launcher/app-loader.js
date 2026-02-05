/**
 * App Loader - Handles app registry and manifest loading
 */

class AppLoader {
  constructor() {
    this.registryPath = '/registry/apps.json';
    this.appsBasePath = '/apps';
    this.apps = [];
    this.registry = null;
    this.recentsKey = 'marlapps-recents';
    this.recents = this.loadRecents();
  }

  /**
   * Initialize app loader - load registry and all app manifests
   */
  async init() {
    try {
      this.registry = await this.loadRegistry();
      this.apps = await this.loadAppManifests(this.registry.apps);
      return this.apps;
    } catch (error) {
      console.error('Failed to initialize app loader:', error);
      return [];
    }
  }

  /**
   * Load the main app registry
   */
  async loadRegistry() {
    const response = await fetch(this.registryPath);
    if (!response.ok) {
      throw new Error(`Failed to load registry: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Load manifests for all registered apps
   */
  async loadAppManifests(registryApps) {
    const apps = [];

    for (const entry of registryApps) {
      if (entry.hidden) continue;

      const manifestPath = `${this.appsBasePath}/${entry.folder}/manifest.json`;

      try {
        const response = await fetch(manifestPath);
        if (!response.ok) {
          console.warn(`Failed to load manifest for ${entry.folder}: ${response.status}`);
          continue;
        }

        const manifest = await response.json();
        apps.push({
          ...manifest,
          folder: entry.folder,
          pinned: entry.pinned || false,
          order: entry.order || 999
        });
      } catch (error) {
        console.warn(`Failed to load manifest for ${entry.folder}:`, error);
      }
    }

    // Sort by order
    return apps.sort((a, b) => a.order - b.order);
  }

  /**
   * Get app by ID
   */
  getAppById(id) {
    return this.apps.find(app => app.id === id);
  }

  /**
   * Get apps filtered by category
   */
  getAppsByCategory(category) {
    if (category === 'all') return this.apps;

    return this.apps.filter(app =>
      app.categories && app.categories.some(c =>
        c.toLowerCase() === category.toLowerCase()
      )
    );
  }

  /**
   * Search apps by query
   */
  searchApps(query) {
    if (!query || !query.trim()) return this.apps;

    const normalizedQuery = query.toLowerCase().trim();

    return this.apps.filter(app =>
      app.name.toLowerCase().includes(normalizedQuery) ||
      app.description.toLowerCase().includes(normalizedQuery) ||
      (app.categories && app.categories.some(c =>
        c.toLowerCase().includes(normalizedQuery)
      ))
    );
  }

  /**
   * Get recently opened apps
   */
  getRecentApps(limit = 5) {
    return this.recents
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(r => {
        const app = this.getAppById(r.id);
        if (!app) return null;
        return {
          ...app,
          lastOpened: r.timestamp
        };
      })
      .filter(app => app !== null);
  }

  /**
   * Record app open event
   */
  recordAppOpen(appId) {
    const existingIndex = this.recents.findIndex(r => r.id === appId);

    if (existingIndex >= 0) {
      this.recents[existingIndex].timestamp = Date.now();
    } else {
      this.recents.push({
        id: appId,
        timestamp: Date.now()
      });
    }

    // Keep only last 20 entries
    if (this.recents.length > 20) {
      this.recents.sort((a, b) => b.timestamp - a.timestamp);
      this.recents = this.recents.slice(0, 20);
    }

    this.saveRecents();
  }

  /**
   * Load recents from storage
   */
  loadRecents() {
    try {
      const saved = localStorage.getItem(this.recentsKey);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load recents:', error);
      return [];
    }
  }

  /**
   * Save recents to storage
   */
  saveRecents() {
    try {
      localStorage.setItem(this.recentsKey, JSON.stringify(this.recents));
    } catch (error) {
      console.warn('Failed to save recents:', error);
    }
  }

  /**
   * Get full entry URL for an app
   */
  getAppEntryUrl(app) {
    return `${this.appsBasePath}/${app.folder}/${app.entry}`;
  }

  /**
   * Get icon URL for an app
   */
  getAppIconUrl(app) {
    return `${this.appsBasePath}/${app.folder}/${app.icon}`;
  }

  /**
   * Get all unique categories from loaded apps
   */
  getAllCategories() {
    const categories = new Set();
    this.apps.forEach(app => {
      if (app.categories) {
        app.categories.forEach(c => categories.add(c));
      }
    });
    return Array.from(categories).sort();
  }
}

// Export for use in other modules
window.AppLoader = AppLoader;
