class AppLoader {
  constructor() {
    this.registryPath = './registry/apps.json';
    this.appsBasePath = './apps';
    this.apps = [];
    this.registry = null;
    this.recentsKey = 'marlapps-recents';
    this.recents = this.loadRecents();
  }

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

  async loadRegistry() {
    const response = await fetch(this.registryPath);
    if (!response.ok) {
      throw new Error(`Failed to load registry: ${response.status}`);
    }
    return response.json();
  }

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

    return apps.sort((a, b) => a.order - b.order);
  }

  getAppById(id) {
    return this.apps.find(app => app.id === id);
  }

  getAppsByCategory(category) {
    if (category === 'all') return this.apps;

    return this.apps.filter(app =>
      app.categories && app.categories.some(c =>
        String(c).trim().toLowerCase() === String(category).trim().toLowerCase()
      )
    );
  }

  // Damerau-Levenshtein distance for fuzzy search
  damerauLevenshtein(a, b) {
    const lenA = a.length;
    const lenB = b.length;

    if (lenA === 0) return lenB;
    if (lenB === 0) return lenA;

    const d = Array(lenA + 1).fill(null).map(() => Array(lenB + 1).fill(0));

    for (let i = 0; i <= lenA; i++) d[i][0] = i;
    for (let j = 0; j <= lenB; j++) d[0][j] = j;

    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;

        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + cost
        );

        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
        }
      }
    }

    return d[lenA][lenB];
  }

  // Returns 0 for perfect/substring match, higher = worse match
  getFuzzyScore(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();

    if (t.includes(q)) return 0;

    const words = t.split(/\s+/);
    let bestScore = Infinity;

    for (const word of words) {
      const distance = this.damerauLevenshtein(q, word);
      const normalizedScore = distance / Math.max(q.length, word.length);
      bestScore = Math.min(bestScore, normalizedScore);
    }

    const fullDistance = this.damerauLevenshtein(q, t.substring(0, q.length + 2));
    const fullNormalized = fullDistance / Math.max(q.length, t.length);
    bestScore = Math.min(bestScore, fullNormalized);

    return bestScore;
  }

  searchApps(query) {
    if (!query || !query.trim()) return this.apps;

    const normalizedQuery = query.toLowerCase().trim();
    const threshold = 0.25;

    const scored = this.apps.map(app => {
      const nameScore = this.getFuzzyScore(normalizedQuery, app.name);
      const descScore = this.getFuzzyScore(normalizedQuery, app.description);
      const catScore = app.categories
        ? Math.min(...app.categories.map(c => this.getFuzzyScore(normalizedQuery, c)))
        : Infinity;

      const bestScore = Math.min(nameScore, descScore * 1.5, catScore * 1.2);

      return { app, score: bestScore };
    });

    return scored
      .filter(item => item.score <= threshold)
      .sort((a, b) => a.score - b.score)
      .map(item => item.app);
  }

  getRecentApps(limit = 5) {
    return this.recents
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
      .map(r => {
        const app = this.getAppById(r.id);
        if (!app) return null;
        return { ...app, lastOpened: r.timestamp };
      })
      .filter(app => app !== null);
  }

  recordAppOpen(appId) {
    const existingIndex = this.recents.findIndex(r => r.id === appId);

    if (existingIndex >= 0) {
      this.recents[existingIndex].timestamp = Date.now();
    } else {
      this.recents.push({ id: appId, timestamp: Date.now() });
    }

    if (this.recents.length > 20) {
      this.recents.sort((a, b) => b.timestamp - a.timestamp);
      this.recents = this.recents.slice(0, 20);
    }

    this.saveRecents();
  }

  loadRecents() {
    try {
      const saved = localStorage.getItem(this.recentsKey);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to load recents:', error);
      return [];
    }
  }

  saveRecents() {
    try {
      localStorage.setItem(this.recentsKey, JSON.stringify(this.recents));
    } catch (error) {
      console.warn('Failed to save recents:', error);
    }
  }

  getAppEntryUrl(app) {
    return `${this.appsBasePath}/${app.folder}/${app.entry}`;
  }

  getAppIconUrl(app) {
    return `${this.appsBasePath}/${app.folder}/${app.icon}`;
  }
}

window.AppLoader = AppLoader;
