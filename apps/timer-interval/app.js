class IntervalTimerApp {
  constructor() {
    this.storageKey = 'marlapps-timer-interval';
    this.notificationTag = 'marlapps-timer-interval';
    this.appId = 'timer-interval';
    this.intervalTimerInterval = null;
    this.beepAudioCtx = null;
    this.notificationPermissionRequested = false;
    this.lastRuntimeSaveAt = 0;
    this.wakeLock = null;
    this.appVisible = true;
    this.lastReportedBackgroundActivity = null;
    this.activeModal = null;
    this.lastFocusedElementByModal = {};
    this.data = this.loadData();

    this.intervalState = {
      running: false,
      paused: false,
      currentRound: 0,
      phase: 'work',
      timeRemaining: 0,
      phaseEndsAt: null
    };

    this.initElements();
    this.attachEventListeners();
    this.syncThemeWithParent();
    this.restoreRuntimeState();
    this.updateIntervalDisplay();
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  loadData() {
    const defaults = {
      intervalSettings: { work: 30, rest: 10, rounds: 8 },
      runtime: { interval: null }
    };
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return defaults;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaults;
      }

      const toBoundedInt = (value, min, max, fallback) => {
        const parsedInt = Number.parseInt(value, 10);
        if (!Number.isFinite(parsedInt)) return fallback;
        return Math.min(max, Math.max(min, parsedInt));
      };

      const intervalSettingsRaw = parsed.intervalSettings && typeof parsed.intervalSettings === 'object' && !Array.isArray(parsed.intervalSettings)
        ? parsed.intervalSettings
        : {};
      const intervalSettings = {
        work: toBoundedInt(intervalSettingsRaw.work, 5, 3600, defaults.intervalSettings.work),
        rest: toBoundedInt(intervalSettingsRaw.rest, 5, 3600, defaults.intervalSettings.rest),
        rounds: toBoundedInt(intervalSettingsRaw.rounds, 1, 99, defaults.intervalSettings.rounds)
      };

      const runtimeRaw = parsed.runtime && typeof parsed.runtime === 'object' && !Array.isArray(parsed.runtime)
        ? parsed.runtime
        : {};

      let intervalRuntime = null;
      if (runtimeRaw.interval && typeof runtimeRaw.interval === 'object' && !Array.isArray(runtimeRaw.interval)) {
        const currentRound = Number.parseInt(runtimeRaw.interval.currentRound, 10);
        const timeRemaining = Number.parseInt(runtimeRaw.interval.timeRemaining, 10);
        const phaseEndsAt = Number.isFinite(runtimeRaw.interval.phaseEndsAt)
          ? runtimeRaw.interval.phaseEndsAt
          : null;

        intervalRuntime = {
          running: runtimeRaw.interval.running === true,
          paused: runtimeRaw.interval.paused === true,
          currentRound: Number.isFinite(currentRound) ? Math.max(0, currentRound) : 0,
          phase: runtimeRaw.interval.phase === 'rest' ? 'rest' : 'work',
          timeRemaining: Number.isFinite(timeRemaining) ? Math.max(0, timeRemaining) : 0,
          phaseEndsAt
        };
      }

      return {
        intervalSettings,
        runtime: { interval: intervalRuntime }
      };
    } catch {
      return defaults;
    }
  }

  saveData() {
    this.data.runtime = this.captureRuntimeState();
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    this.lastRuntimeSaveAt = Date.now();
  }

  captureRuntimeState() {
    const intervalActive = this.intervalState.running || this.intervalState.paused;
    return {
      interval: intervalActive
        ? {
          running: this.intervalState.running,
          paused: this.intervalState.paused,
          currentRound: this.intervalState.currentRound,
          phase: this.intervalState.phase,
          timeRemaining: this.intervalState.timeRemaining,
          phaseEndsAt: this.intervalState.phaseEndsAt
        }
        : null
    };
  }

  persistRuntimeData(force = false) {
    const now = Date.now();
    if (!force && now - this.lastRuntimeSaveAt < 1000) return;
    this.saveData();
  }

  restoreRuntimeState() {
    this.intervalWorkInput.value = this.data.intervalSettings.work;
    this.intervalRestInput.value = this.data.intervalSettings.rest;
    this.intervalRoundsInput.value = this.data.intervalSettings.rounds;

    const runtime = this.data.runtime && typeof this.data.runtime === 'object'
      ? this.data.runtime
      : {};

    if (runtime.interval && typeof runtime.interval === 'object') {
      const saved = runtime.interval;
      const canRun = saved.running === true && Number.isFinite(saved.phaseEndsAt);
      this.intervalState = {
        running: canRun,
        paused: saved.paused === true && !canRun,
        currentRound: Number.isFinite(saved.currentRound) ? Math.max(0, saved.currentRound) : 0,
        phase: saved.phase === 'rest' ? 'rest' : 'work',
        timeRemaining: Number.isFinite(saved.timeRemaining) ? Math.max(0, saved.timeRemaining) : 0,
        phaseEndsAt: canRun ? saved.phaseEndsAt : null
      };
    }

    if (this.intervalState.running) {
      clearInterval(this.intervalTimerInterval);
      this.tickInterval({ silent: true, persist: false });
      if (this.intervalState.running) {
        this.intervalTimerInterval = setInterval(() => this.tickInterval(), 250);
        this.acquireWakeLock();
      }
    }

    this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
    this.updateDocumentTitle();
  }

  syncThemeWithParent() {
    try {
      const savedTheme = localStorage.getItem('marlapps-theme');
      if (savedTheme) this.applyTheme(savedTheme);
    } catch (error) {
      // Ignore theme storage errors.
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        this.applyTheme(event.data.theme);
      }

      if (event.data && event.data.type === 'app-visibility') {
        this.handleAppVisibility(Boolean(event.data.visible));
      }
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  initElements() {
    this.heroRing = document.getElementById('heroRing');
    this.heroLabel = document.getElementById('heroLabel');
    this.heroValue = document.getElementById('heroValue');
    this.intervalProgressEl = document.getElementById('intervalProgress');
    this.openSettingsBtn = document.getElementById('openSettingsBtn');
    this.intervalStartBtn = document.getElementById('intervalStartBtn');
    this.intervalPauseBtn = document.getElementById('intervalPauseBtn');
    this.intervalResetBtn = document.getElementById('intervalResetBtn');

    this.settingsBackdrop = document.getElementById('settingsBackdrop');
    this.settingsPanel = document.getElementById('settingsPanel');
    this.settingsClose = document.getElementById('settingsClose');
    this.intervalWorkInput = document.getElementById('intervalWork');
    this.intervalRestInput = document.getElementById('intervalRest');
    this.intervalRoundsInput = document.getElementById('intervalRounds');
    this.applySettingsBtn = document.getElementById('applySettingsBtn');
  }

  attachEventListeners() {
    this.openSettingsBtn.addEventListener('click', () => this.openSettings());
    this.settingsClose.addEventListener('click', () => this.closeModal('settings'));
    this.settingsBackdrop.addEventListener('click', (event) => {
      if (event.target === this.settingsBackdrop) this.closeModal('settings');
    });
    this.applySettingsBtn.addEventListener('click', () => this.applySettings());

    this.intervalStartBtn.addEventListener('click', () => this.startInterval());
    this.intervalPauseBtn.addEventListener('click', () => this.pauseInterval());
    this.intervalResetBtn.addEventListener('click', () => this.resetInterval());

    [this.intervalWorkInput, this.intervalRestInput, this.intervalRoundsInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.applySettings();
        }
      });
    });

    document.addEventListener('keydown', (event) => this.handleKeyDown(event));
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    window.addEventListener('pagehide', () => this.persistRuntimeData(true));
    window.addEventListener('beforeunload', () => this.persistRuntimeData(true));
  }

  handleKeyDown(event) {
    if (!this.activeModal) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeModal(this.activeModal);
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event, this.settingsPanel);
    }
  }

  openSettings() {
    this.lastFocusedElementByModal.settings = this.getRestorableFocusedElement();
    this.settingsBackdrop.classList.add('active');
    this.settingsBackdrop.setAttribute('aria-hidden', 'false');
    this.activeModal = 'settings';
    window.setTimeout(() => this.intervalWorkInput.focus(), 50);
  }

  closeModal(name, { restoreFocus = true } = {}) {
    if (name !== 'settings') return;
    if (!this.settingsBackdrop.classList.contains('active')) return;

    this.settingsBackdrop.classList.remove('active');
    this.settingsBackdrop.setAttribute('aria-hidden', 'true');
    this.activeModal = null;

    if (restoreFocus) {
      this.restoreFocus('settings');
    }
  }

  getRestorableFocusedElement() {
    const active = document.activeElement;
    return active && typeof active.focus === 'function' ? active : null;
  }

  restoreFocus(name) {
    const element = this.lastFocusedElementByModal[name];
    if (element && typeof element.focus === 'function' && document.contains(element)) {
      element.focus();
    }
    delete this.lastFocusedElementByModal[name];
  }

  trapFocus(event, container) {
    const focusable = Array.from(container.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

    if (focusable.length === 0) {
      event.preventDefault();
      container.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  applySettings() {
    const parseIntervalSeconds = (value, fallback) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(3600, Math.max(5, parsed));
    };
    const parseRounds = (value, fallback) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(99, Math.max(1, parsed));
    };

    this.data.intervalSettings = {
      work: parseIntervalSeconds(this.intervalWorkInput.value, this.data.intervalSettings.work),
      rest: parseIntervalSeconds(this.intervalRestInput.value, this.data.intervalSettings.rest),
      rounds: parseRounds(this.intervalRoundsInput.value, this.data.intervalSettings.rounds)
    };

    this.intervalWorkInput.value = this.data.intervalSettings.work;
    this.intervalRestInput.value = this.data.intervalSettings.rest;
    this.intervalRoundsInput.value = this.data.intervalSettings.rounds;

    this.saveData();
    this.updateIntervalDisplay();
    this.closeModal('settings', { restoreFocus: false });
    window.setTimeout(() => this.openSettingsBtn.focus(), 50);
  }

  startInterval() {
    const settings = this.data.intervalSettings;
    this.maybeRequestNotificationPermission();
    clearInterval(this.intervalTimerInterval);

    if (this.intervalState.paused) {
      this.intervalState.paused = false;
      this.intervalState.phaseEndsAt = Date.now() + (this.intervalState.timeRemaining * 1000);
    } else {
      this.intervalState = {
        running: true,
        paused: false,
        currentRound: 1,
        phase: 'work',
        timeRemaining: settings.work,
        phaseEndsAt: Date.now() + (settings.work * 1000)
      };
    }

    this.intervalState.running = true;
    this.intervalTimerInterval = setInterval(() => this.tickInterval(), 250);
    this.tickInterval();
    this.acquireWakeLock();
    this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  tickInterval(options = {}) {
    const { silent = false, persist = true } = options;
    if (!this.intervalState.running || !this.intervalState.phaseEndsAt) return;

    let now = Date.now();
    while (this.intervalState.running && now >= this.intervalState.phaseEndsAt) {
      if (!silent) {
        this.playBeep(this.intervalState.phase === 'work' ? 660 : 880);
      }

      if (this.intervalState.phase === 'work') {
        this.intervalState.phase = 'rest';
        this.intervalState.phaseEndsAt += this.data.intervalSettings.rest * 1000;
      } else if (this.intervalState.currentRound >= this.data.intervalSettings.rounds) {
        if (!silent) {
          this.playBeep(1046, 0.5);
          this.showNotification('Interval timer complete', {
            body: `${this.data.intervalSettings.rounds} rounds finished.`
          });
        }
        this.resetInterval({ persist });
        return;
      } else {
        this.intervalState.currentRound += 1;
        this.intervalState.phase = 'work';
        this.intervalState.phaseEndsAt += this.data.intervalSettings.work * 1000;
      }

      now = Date.now();
    }

    this.intervalState.timeRemaining = Math.max(
      0,
      Math.ceil((this.intervalState.phaseEndsAt - now) / 1000)
    );

    this.updateIntervalDisplay();
    this.reportStatus();
    if (persist) this.persistRuntimeData();
  }

  pauseInterval() {
    this.intervalState.running = false;
    this.intervalState.paused = true;
    if (this.intervalState.phaseEndsAt) {
      this.intervalState.timeRemaining = Math.max(
        0,
        Math.ceil((this.intervalState.phaseEndsAt - Date.now()) / 1000)
      );
    }

    clearInterval(this.intervalTimerInterval);
    this.releaseWakeLock();
    this.updateIntervalDisplay();
    this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  resetInterval(options = {}) {
    const { persist = true } = options;
    clearInterval(this.intervalTimerInterval);
    this.intervalState = {
      running: false,
      paused: false,
      currentRound: 0,
      phase: 'work',
      timeRemaining: 0,
      phaseEndsAt: null
    };

    this.releaseWakeLock();
    this.updateIntervalDisplay();
    if (persist) this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  updateIntervalDisplay() {
    const state = this.intervalState;
    const isActive = state.running || state.paused;
    const phaseTotal = state.phase === 'rest'
      ? this.data.intervalSettings.rest
      : this.data.intervalSettings.work;
    const elapsed = Math.max(0, phaseTotal - state.timeRemaining);
    const progress = isActive && phaseTotal > 0
      ? Math.max(0, Math.min(100, Math.round((elapsed / phaseTotal) * 100)))
      : 0;

    this.heroRing.style.setProperty('--hero-progress', `${progress}%`);
    this.heroRing.setAttribute('aria-valuenow', String(progress));
    this.heroRing.classList.toggle('active', isActive);
    this.heroRing.classList.toggle('rest', isActive && state.phase === 'rest');

    this.heroValue.textContent = this.formatTime(state.timeRemaining);
    this.intervalProgressEl.textContent = state.currentRound > 0
      ? `Round ${state.currentRound} / ${this.data.intervalSettings.rounds}`
      : `${this.data.intervalSettings.rounds} rounds`;

    if (state.running || state.paused) {
      this.heroLabel.textContent = state.phase === 'work' ? 'Work' : 'Rest';
    } else {
      this.heroLabel.textContent = 'Ready';
    }

    this.intervalStartBtn.disabled = state.running;
    this.intervalPauseBtn.disabled = !state.running;
    this.intervalStartBtn.textContent = state.paused ? 'Resume' : 'Start';
    this.updateDocumentTitle();
  }

  hasActiveBackgroundWork() {
    return this.intervalState.running;
  }

  reportBackgroundActivity() {
    const active = this.hasActiveBackgroundWork();
    if (this.lastReportedBackgroundActivity === active) return;
    this.lastReportedBackgroundActivity = active;

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'app-background-activity',
          appId: this.appId,
          active
        }, '*');
      }
    } catch (error) {
      // Ignore postMessage failures.
    }
  }

  reportStatus() {
    try {
      if (!window.parent || window.parent === window) return;

      if (this.intervalState.running) {
        const variant = this.intervalState.phase === 'work' ? 'alert' : 'calm';
        window.parent.postMessage({
          type: 'app-status',
          appId: this.appId,
          status: {
            active: true,
            label: this.intervalState.phase,
            timeRemaining: this.intervalState.timeRemaining,
            variant
          }
        }, '*');
        return;
      }

      window.parent.postMessage({
        type: 'app-status',
        appId: this.appId,
        status: { active: false }
      }, '*');
    } catch (error) {
      // Ignore postMessage failures.
    }
  }

  updateDocumentTitle() {
    if (this.intervalState.running) {
      document.title = `${this.formatTime(this.intervalState.timeRemaining)} ${this.intervalState.phase === 'work' ? 'Work' : 'Rest'} - Timer - Interval`;
      return;
    }

    document.title = 'Timer - Interval - MarlApps';
  }

  formatTime(totalSeconds) {
    const seconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  getBeepContext() {
    if (!this.beepAudioCtx || this.beepAudioCtx.state === 'closed') {
      this.beepAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.beepAudioCtx.state === 'suspended') {
      this.beepAudioCtx.resume().catch(() => {});
    }
    return this.beepAudioCtx;
  }

  playBeep(freq = 800, duration = 0.2) {
    try {
      const ctx = this.getBeepContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (error) {
      // Ignore audio failures.
    }
  }

  async acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (!this.intervalState.running) return;
    if (!this.appVisible) return;
    if (document.visibilityState !== 'visible') return;
    if (this.wakeLock) return;

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch (error) {
      // Ignore wake lock failures.
    }
  }

  releaseWakeLock() {
    if (!this.wakeLock) return;
    this.wakeLock.release().catch(() => {});
    this.wakeLock = null;
  }

  handleVisibilityChange() {
    if (!this.appVisible) {
      this.releaseWakeLock();
      this.persistRuntimeData(true);
      return;
    }

    if (document.visibilityState === 'visible' && this.intervalState.running) {
      this.tickInterval({ silent: true });
      this.acquireWakeLock();
    } else if (document.visibilityState !== 'visible') {
      this.releaseWakeLock();
      this.persistRuntimeData(true);
    }
  }

  handleAppVisibility(visible) {
    this.appVisible = visible;
    if (!visible) this.persistRuntimeData(true);
    this.handleVisibilityChange();
  }

  maybeRequestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (this.notificationPermissionRequested) return;

    this.notificationPermissionRequested = true;
    Notification.requestPermission().catch(() => {});
  }

  showNotification(title, options = {}) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body: options.body || '',
        tag: options.tag || this.notificationTag
      });
      setTimeout(() => notification.close(), 10000);
    } catch (error) {
      // Ignore notification failures.
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new IntervalTimerApp();
});
