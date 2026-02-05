/**
 * PWA Install Handler
 * Manages the "Add to Home Screen" prompt functionality
 */

class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.banner = null;
    this.installBtn = null;
    this.dismissBtn = null;
    this.isInstalled = false;

    // Check if already installed
    this.checkInstallStatus();
  }

  /**
   * Initialize the PWA install manager
   */
  init() {
    this.banner = document.getElementById('pwaInstallBanner');
    this.installBtn = document.getElementById('pwaInstallBtn');
    this.dismissBtn = document.getElementById('pwaInstallDismiss');

    if (!this.banner || !this.installBtn || !this.dismissBtn) {
      console.warn('PWA Install: Banner elements not found');
      return;
    }

    this.bindEvents();
    console.log('PWA Install Manager initialized');
  }

  /**
   * Check if app is already installed
   */
  checkInstallStatus() {
    // Check if running in standalone mode (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      this.isInstalled = true;
      console.log('PWA: Running in standalone mode (installed)');
      return;
    }

    // Check for iOS standalone
    if (window.navigator.standalone === true) {
      this.isInstalled = true;
      console.log('PWA: Running in iOS standalone mode (installed)');
      return;
    }

    // Check localStorage for dismissed state
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Show again after 7 days
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissedTime < sevenDays) {
        console.log('PWA: Install prompt dismissed recently');
        return;
      }
    }
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();

      // Store the event for later use
      this.deferredPrompt = e;

      // Show the install banner if not dismissed recently and not installed
      if (!this.isInstalled) {
        this.showBanner();
      }

      console.log('PWA: beforeinstallprompt event captured');
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      this.isInstalled = true;
      this.hideBanner();
      this.deferredPrompt = null;

      // Clear dismissed state
      localStorage.removeItem('pwa-install-dismissed');

      console.log('PWA: App was installed');
    });

    // Install button click
    this.installBtn.addEventListener('click', () => {
      this.promptInstall();
    });

    // Dismiss button click
    this.dismissBtn.addEventListener('click', () => {
      this.dismissBanner();
    });
  }

  /**
   * Show the install banner
   */
  showBanner() {
    if (this.banner && this.deferredPrompt) {
      this.banner.classList.remove('hidden');
      this.banner.classList.add('show');
    }
  }

  /**
   * Hide the install banner
   */
  hideBanner() {
    if (this.banner) {
      this.banner.classList.remove('show');
      this.banner.classList.add('hidden');
    }
  }

  /**
   * Dismiss the banner and remember the choice
   */
  dismissBanner() {
    this.hideBanner();
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    console.log('PWA: Install prompt dismissed');
  }

  /**
   * Prompt the user to install the app
   */
  async promptInstall() {
    if (!this.deferredPrompt) {
      console.warn('PWA: No deferred prompt available');
      return;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await this.deferredPrompt.userChoice;

    console.log(`PWA: User response to install prompt: ${outcome}`);

    // Clear the deferred prompt
    this.deferredPrompt = null;

    // Hide the banner regardless of outcome
    this.hideBanner();

    if (outcome === 'dismissed') {
      // User dismissed, remember for later
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    }
  }

  /**
   * Check if the app can be installed
   */
  canInstall() {
    return this.deferredPrompt !== null && !this.isInstalled;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.pwaInstallManager = new PWAInstallManager();
  window.pwaInstallManager.init();
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registered:', registration.scope);
      })
      .catch(error => {
        console.log('ServiceWorker registration failed:', error);
      });
  });
}
