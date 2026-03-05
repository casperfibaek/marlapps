class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.banner = null;
    this.installBtn = null;
    this.dismissBtn = null;
    this.isInstalled = false;
    this.bannerSuppressed = false;
    this.checkInstallStatus();
  }

  init() {
    this.banner = document.getElementById('pwaInstallBanner');
    this.installBtn = document.getElementById('pwaInstallBtn');
    this.dismissBtn = document.getElementById('pwaInstallDismiss');

    if (!this.banner || !this.installBtn || !this.dismissBtn) {
      console.warn('PWA Install: Banner elements not found');
      return;
    }

    this.bindEvents();
  }

  checkInstallStatus() {
    this.isInstalled = false;
    this.bannerSuppressed = false;

    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true;
      return;
    }

    if (window.navigator.standalone === true) {
      this.isInstalled = true;
      return;
    }

    if (localStorage.getItem('pwa-installed') === 'true') {
      this.isInstalled = true;
      return;
    }

    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Number.isFinite(dismissedTime) && (Date.now() - dismissedTime < sevenDays)) {
        this.bannerSuppressed = true;
      }
    }
  }

  bindEvents() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;

      if (!this.isInstalled && !this.bannerSuppressed) {
        this.showBanner();
      }
    });

    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.hideBanner();
      this.deferredPrompt = null;
      localStorage.setItem('pwa-installed', 'true');
      localStorage.removeItem('pwa-install-dismissed');
    });

    this.installBtn.addEventListener('click', () => this.promptInstall());
    this.dismissBtn.addEventListener('click', () => this.dismissBanner());
  }

  showBanner() {
    if (this.banner && this.deferredPrompt) {
      this.banner.classList.remove('hidden');
      this.banner.classList.add('show');
    }
  }

  hideBanner() {
    if (this.banner) {
      this.banner.classList.remove('show');
      this.banner.classList.add('hidden');
    }
  }

  dismissBanner() {
    this.hideBanner();
    this.bannerSuppressed = true;
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }

  async promptInstall() {
    if (!this.deferredPrompt) {
      console.warn('PWA: No deferred prompt available');
      return;
    }

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;

    this.deferredPrompt = null;
    this.hideBanner();

    if (outcome === 'dismissed') {
      this.bannerSuppressed = true;
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.pwaInstallManager = new PWAInstallManager();
  window.pwaInstallManager.init();
});

if ('serviceWorker' in navigator) {
  // If a SW already controls this page, reload when a new one takes over.
  // This is skipped on first visit (controller is null) to avoid an unnecessary reload.
  if (navigator.serviceWorker.controller) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      window.__swRegistration = reg;
    }).catch(() => {});
  });
}
