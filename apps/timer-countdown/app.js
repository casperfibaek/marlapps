class CountdownTimerApp {
  constructor() {
    this.storageKey = 'marlapps-timer-countdown';
    this.notificationTag = 'marlapps-timer-countdown';
    this.appId = 'timer-countdown';
    this.countdownInterval = null;
    this.beepAudioCtx = null;
    this.notificationPermissionRequested = false;
    this.lastCompletedCountdown = 0;
    this.lastRuntimeSaveAt = 0;
    this.wakeLock = null;
    this.appVisible = true;
    this.lastReportedBackgroundActivity = null;
    this.activeModal = null;
    this.lastFocusedElementByModal = {};
    this.data = this.loadData();

    this.countdownState = {
      running: false,
      paused: false,
      timeRemaining: 0,
      totalTime: 0,
      endAt: null
    };

    this.initElements();
    this.attachEventListeners();
    this.syncThemeWithParent();
    this.renderRecentCountdowns();
    this.restoreRuntimeState();
    this.updateCountdownDisplay();
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  loadData() {
    const defaults = {
      recentCountdowns: [60, 300, 600],
      runtime: {
        countdown: null,
        lastCompletedCountdown: 0
      }
    };
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return defaults;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaults;
      }

      const runtimeRaw = parsed.runtime && typeof parsed.runtime === 'object' && !Array.isArray(parsed.runtime)
        ? parsed.runtime
        : {};

      let countdownRuntime = null;
      if (runtimeRaw.countdown && typeof runtimeRaw.countdown === 'object' && !Array.isArray(runtimeRaw.countdown)) {
        const timeRemaining = Number.parseInt(runtimeRaw.countdown.timeRemaining, 10);
        const totalTime = Number.parseInt(runtimeRaw.countdown.totalTime, 10);
        const endAt = Number.isFinite(runtimeRaw.countdown.endAt)
          ? runtimeRaw.countdown.endAt
          : null;
        countdownRuntime = {
          running: runtimeRaw.countdown.running === true,
          paused: runtimeRaw.countdown.paused === true,
          timeRemaining: Number.isFinite(timeRemaining) ? Math.max(0, timeRemaining) : 0,
          totalTime: Number.isFinite(totalTime) ? Math.max(0, totalTime) : 0,
          endAt,
          done: runtimeRaw.countdown.done === true
        };
      }

      const recentCountdowns = Array.isArray(parsed.recentCountdowns)
        ? parsed.recentCountdowns
          .map((seconds) => Number.parseInt(seconds, 10))
          .filter((seconds) => Number.isFinite(seconds) && seconds > 0)
          .slice(0, 8)
        : defaults.recentCountdowns;

      const lastCompletedCountdown = Number.parseInt(runtimeRaw.lastCompletedCountdown, 10);

      return {
        recentCountdowns: recentCountdowns.length > 0 ? recentCountdowns : defaults.recentCountdowns,
        runtime: {
          countdown: countdownRuntime,
          lastCompletedCountdown: Number.isFinite(lastCompletedCountdown)
            ? Math.max(0, lastCompletedCountdown)
            : defaults.runtime.lastCompletedCountdown
        }
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
    const countdownDone = this.countdownDisplay.classList.contains('done');
    const countdownActive = this.countdownState.running ||
      this.countdownState.paused ||
      this.countdownState.totalTime > 0 ||
      countdownDone;

    return {
      countdown: countdownActive
        ? {
          running: this.countdownState.running,
          paused: this.countdownState.paused,
          timeRemaining: this.countdownState.timeRemaining,
          totalTime: this.countdownState.totalTime,
          endAt: this.countdownState.endAt,
          done: countdownDone
        }
        : null,
      lastCompletedCountdown: this.lastCompletedCountdown
    };
  }

  persistRuntimeData(force = false) {
    const now = Date.now();
    if (!force && now - this.lastRuntimeSaveAt < 1000) return;
    this.saveData();
  }

  restoreRuntimeState() {
    const runtime = this.data.runtime && typeof this.data.runtime === 'object'
      ? this.data.runtime
      : {};

    if (Number.isFinite(runtime.lastCompletedCountdown)) {
      this.lastCompletedCountdown = Math.max(0, runtime.lastCompletedCountdown);
    }

    if (runtime.countdown && typeof runtime.countdown === 'object') {
      const saved = runtime.countdown;
      const canRun = saved.running === true && Number.isFinite(saved.endAt);
      this.countdownState = {
        running: canRun,
        paused: saved.paused === true && !canRun,
        timeRemaining: Number.isFinite(saved.timeRemaining) ? Math.max(0, saved.timeRemaining) : 0,
        totalTime: Number.isFinite(saved.totalTime) ? Math.max(0, saved.totalTime) : 0,
        endAt: canRun ? saved.endAt : null
      };

      if (saved.done === true) {
        this.countdownDisplay.classList.add('done');
      }
    }

    if (this.countdownState.running) {
      clearInterval(this.countdownInterval);
      this.tickCountdown({ silent: true, persist: false });
      if (this.countdownState.running) {
        this.countdownInterval = setInterval(() => this.tickCountdown(), 250);
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
    this.countdownDisplay = document.getElementById('countdownDisplay');
    this.countdownRing = document.getElementById('countdownRing');
    this.countdownLabel = document.getElementById('countdownLabel');
    this.countdownTimerEl = document.getElementById('countdownTimer');
    this.countdownEditBtn = document.getElementById('countdownEditBtn');
    this.countdownControlsState = document.querySelector('.controls-state');
    this.countdownControlsEmpty = document.getElementById('countdownControlsEmpty');
    this.countdownControlsReady = document.getElementById('countdownControlsReady');
    this.countdownControlsRunning = document.getElementById('countdownControlsRunning');
    this.countdownControlsPaused = document.getElementById('countdownControlsPaused');
    this.countdownControlsFinished = document.getElementById('countdownControlsFinished');
    this.countdownControlGroups = {
      empty: this.countdownControlsEmpty,
      ready: this.countdownControlsReady,
      running: this.countdownControlsRunning,
      paused: this.countdownControlsPaused,
      finished: this.countdownControlsFinished
    };
    this.countdownStartBtn = document.getElementById('countdownStartBtn');
    this.countdownPauseBtn = document.getElementById('countdownPauseBtn');
    this.countdownResumeBtn = document.getElementById('countdownResumeBtn');
    this.countdownAdd60Btn = document.getElementById('countdownAdd60Btn');
    this.countdownRepeatBtn = document.getElementById('countdownRepeatBtn');
    this.countdownResetButtons = document.querySelectorAll('[data-countdown-reset]');
    this.openSetTimeButtons = document.querySelectorAll('[data-open-set-time]');
    this.presetButtons = document.querySelectorAll('.preset-btn');

    this.setTimeBackdrop = document.getElementById('setTimeBackdrop');
    this.setTimePanel = document.getElementById('setTimePanel');
    this.setTimeClose = document.getElementById('setTimeClose');
    this.customMinutes = document.getElementById('customMinutes');
    this.customSeconds = document.getElementById('customSeconds');
    this.customSetBtn = document.getElementById('customSetBtn');
    this.recentTimerList = document.getElementById('recentTimerList');
  }

  attachEventListeners() {
    this.openSetTimeButtons.forEach((button) => {
      button.addEventListener('click', () => this.openSetTime());
    });
    this.setTimeClose.addEventListener('click', () => this.closeModal('setTime'));
    this.setTimeBackdrop.addEventListener('click', (event) => {
      if (event.target === this.setTimeBackdrop) this.closeModal('setTime');
    });

    this.customSetBtn.addEventListener('click', () => this.setCustomCountdown());
    [this.customMinutes, this.customSeconds].forEach((input) => {
      input.addEventListener('input', () => this.clearCustomCountdownValidity());
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.setCustomCountdown();
        }
      });
    });

    this.countdownStartBtn.addEventListener('click', () => this.startCountdown());
    this.countdownPauseBtn.addEventListener('click', () => this.pauseCountdown());
    this.countdownResumeBtn.addEventListener('click', () => this.startCountdown());
    this.countdownAdd60Btn.addEventListener('click', () => this.addCountdownTime(60));
    this.countdownRepeatBtn.addEventListener('click', () => this.repeatLastCountdown());
    this.countdownResetButtons.forEach((button) => {
      button.addEventListener('click', () => this.resetCountdown());
    });

    this.presetButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const seconds = Number.parseInt(button.dataset.seconds, 10);
        if (Number.isFinite(seconds)) this.setCountdownDuration(seconds);
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
      this.trapFocus(event, this.setTimePanel);
    }
  }

  openSetTime() {
    this.prefillSetTimeInputs();
    this.openModal('setTime', this.customMinutes);
  }

  openModal(name, focusTarget = null) {
    if (name !== 'setTime') return;
    if (this.setTimeBackdrop.classList.contains('active')) return;

    this.lastFocusedElementByModal[name] = this.getRestorableFocusedElement();
    this.setTimeBackdrop.classList.add('active');
    this.setTimeBackdrop.setAttribute('aria-hidden', 'false');
    this.activeModal = name;

    window.setTimeout(() => {
      const target = focusTarget || this.setTimePanel;
      if (target && typeof target.focus === 'function') target.focus();
    }, 50);
  }

  closeModal(name, { restoreFocus = true } = {}) {
    if (name !== 'setTime') return;
    if (!this.setTimeBackdrop.classList.contains('active')) return;

    this.setTimeBackdrop.classList.remove('active');
    this.setTimeBackdrop.setAttribute('aria-hidden', 'true');
    this.activeModal = null;

    if (restoreFocus) {
      this.restoreFocus(name);
    }
  }

  getRestorableFocusedElement() {
    const active = document.activeElement;
    return active && typeof active.focus === 'function' ? active : null;
  }

  restoreFocus(name) {
    const lastFocusedElement = this.lastFocusedElementByModal[name];
    if (
      lastFocusedElement &&
      typeof lastFocusedElement.focus === 'function' &&
      document.contains(lastFocusedElement)
    ) {
      lastFocusedElement.focus();
    }
    delete this.lastFocusedElementByModal[name];
  }

  trapFocus(event, container) {
    const selectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];
    const focusable = Array.from(container.querySelectorAll(selectors.join(',')))
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

  clearCustomCountdownValidity() {
    this.customMinutes.setCustomValidity('');
    this.customSeconds.setCustomValidity('');
  }

  prefillSetTimeInputs() {
    const sourceSeconds = (this.countdownState.running || this.countdownState.paused)
      ? this.countdownState.timeRemaining
      : this.countdownState.totalTime;

    if (sourceSeconds > 0) {
      this.customMinutes.value = Math.floor(sourceSeconds / 60);
      this.customSeconds.value = sourceSeconds % 60;
    } else {
      this.customMinutes.value = '';
      this.customSeconds.value = '';
    }
    this.clearCustomCountdownValidity();
  }

  readCustomCountdownInput() {
    const minutes = this.coerceInt(this.customMinutes.value, 0, 1440, 0);
    const seconds = this.coerceInt(this.customSeconds.value, 0, 59, 0);
    this.customMinutes.value = minutes === 0 ? '' : String(minutes);
    this.customSeconds.value = seconds === 0 ? '' : String(seconds);

    return {
      minutes,
      seconds,
      total: (minutes * 60) + seconds
    };
  }

  setCustomCountdown() {
    const { total } = this.readCustomCountdownInput();
    if (total <= 0) {
      this.customSeconds.setCustomValidity('Enter a timer greater than zero.');
      this.customSeconds.reportValidity();
      return false;
    }

    this.clearCustomCountdownValidity();
    this.setCountdownDuration(total);
    this.closeModal('setTime', { restoreFocus: false });
    window.setTimeout(() => this.countdownStartBtn.focus(), 50);
    return true;
  }

  setCountdownDuration(totalSeconds) {
    this.countdownState.timeRemaining = totalSeconds;
    this.countdownState.totalTime = totalSeconds;
    this.countdownState.running = false;
    this.countdownState.paused = false;
    this.countdownState.endAt = null;
    clearInterval(this.countdownInterval);
    this.releaseWakeLock();
    this.countdownDisplay.classList.remove('running', 'paused', 'done');
    this.countdownRing.classList.remove('running', 'paused', 'done');
    this.addRecentCountdown(totalSeconds);
    this.updateCountdownDisplay();
    this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  addRecentCountdown(seconds) {
    const normalized = Math.max(1, Math.floor(seconds));
    const withoutDupes = this.data.recentCountdowns.filter((item) => item !== normalized);
    this.data.recentCountdowns = [normalized, ...withoutDupes].slice(0, 8);
    this.saveData();
    this.renderRecentCountdowns();
  }

  renderRecentCountdowns() {
    this.recentTimerList.innerHTML = '';

    if (!this.data.recentCountdowns || this.data.recentCountdowns.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'recent-empty';
      empty.textContent = 'No recent timers yet';
      this.recentTimerList.appendChild(empty);
      return;
    }

    this.data.recentCountdowns.forEach((seconds) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-btn';
      button.textContent = this.formatShortDuration(seconds);
      button.addEventListener('click', () => {
        this.setCountdownDuration(seconds);
        if (this.setTimeBackdrop.classList.contains('active')) {
          this.closeModal('setTime', { restoreFocus: false });
          window.setTimeout(() => this.countdownStartBtn.focus(), 50);
        }
      });
      this.recentTimerList.appendChild(button);
    });
  }

  formatShortDuration(totalSeconds) {
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  addCountdownTime(seconds) {
    if (seconds <= 0) return;

    this.countdownState.timeRemaining += seconds;
    this.countdownState.totalTime += seconds;

    if (this.countdownState.running && this.countdownState.endAt) {
      this.countdownState.endAt += seconds * 1000;
    }

    this.countdownDisplay.classList.remove('done');
    this.countdownRing.classList.remove('done');
    this.updateCountdownDisplay();
    this.persistRuntimeData(true);
  }

  repeatLastCountdown() {
    if (this.lastCompletedCountdown <= 0) return;
    this.setCountdownDuration(this.lastCompletedCountdown);
    this.startCountdown();
  }

  startCountdown() {
    if (this.countdownState.timeRemaining <= 0 && !this.countdownState.paused) return;
    this.maybeRequestNotificationPermission();

    this.countdownState.running = true;
    this.countdownState.paused = false;
    this.countdownState.endAt = Date.now() + (this.countdownState.timeRemaining * 1000);
    this.countdownDisplay.classList.remove('done', 'paused');
    this.countdownRing.classList.remove('done', 'paused');

    clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(() => this.tickCountdown(), 250);
    this.acquireWakeLock();
    this.tickCountdown();
    this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  tickCountdown(options = {}) {
    const { silent = false, persist = true } = options;
    if (!this.countdownState.running || !this.countdownState.endAt) return;

    this.countdownState.timeRemaining = Math.max(
      0,
      Math.ceil((this.countdownState.endAt - Date.now()) / 1000)
    );

    if (this.countdownState.timeRemaining <= 0) {
      clearInterval(this.countdownInterval);
      this.countdownState.running = false;
      this.countdownState.paused = false;
      this.countdownState.endAt = null;
      this.lastCompletedCountdown = this.countdownState.totalTime;
      this.countdownDisplay.classList.remove('running', 'paused');
      this.countdownDisplay.classList.add('done');
      this.countdownRing.classList.remove('running', 'paused');
      this.countdownRing.classList.add('done');

      if (!silent) {
        this.playBeep(880, 0.3);
        setTimeout(() => this.playBeep(1046, 0.4), 400);
        this.vibrate([200, 120, 240]);
        this.showNotification('Countdown finished', {
          body: 'Your timer has reached zero.'
        });
      }

      this.releaseWakeLock();
      if (persist) this.persistRuntimeData(true);
    } else if (persist) {
      this.persistRuntimeData();
    }

    this.updateCountdownDisplay();
    this.reportStatus();
    this.reportBackgroundActivity();
  }

  pauseCountdown() {
    this.countdownState.running = false;
    this.countdownState.paused = true;
    if (this.countdownState.endAt) {
      this.countdownState.timeRemaining = Math.max(
        0,
        Math.ceil((this.countdownState.endAt - Date.now()) / 1000)
      );
    }
    this.countdownState.endAt = null;
    clearInterval(this.countdownInterval);
    this.releaseWakeLock();
    this.updateCountdownDisplay();
    this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  resetCountdown() {
    clearInterval(this.countdownInterval);
    this.countdownState.timeRemaining = this.countdownState.totalTime;
    this.countdownState.running = false;
    this.countdownState.paused = false;
    this.countdownState.endAt = null;
    this.countdownDisplay.classList.remove('running', 'paused', 'done');
    this.countdownRing.classList.remove('running', 'paused', 'done');
    this.releaseWakeLock();
    this.updateCountdownDisplay();
    this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  getCountdownViewState() {
    if (this.countdownState.running) return 'running';
    if (this.countdownState.paused) return 'paused';
    if (this.countdownDisplay.classList.contains('done')) return 'finished';
    if (this.countdownState.totalTime > 0) return 'ready';
    return 'empty';
  }

  updateCountdownDisplay() {
    const viewState = this.getCountdownViewState();
    const displaySeconds = viewState === 'empty' ? 0 : this.countdownState.timeRemaining;
    this.countdownTimerEl.textContent = this.formatTime(displaySeconds);

    const total = Math.max(1, this.countdownState.totalTime);
    const elapsed = Math.max(0, total - this.countdownState.timeRemaining);
    const progress = this.countdownState.totalTime > 0
      ? Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)))
      : 0;

    this.countdownRing.style.setProperty('--countdown-progress', `${progress}%`);
    this.countdownRing.setAttribute('aria-valuenow', String(progress));

    this.countdownDisplay.classList.toggle('running', viewState === 'running');
    this.countdownDisplay.classList.toggle('paused', viewState === 'paused');
    this.countdownDisplay.classList.toggle('done', viewState === 'finished');
    this.countdownRing.classList.toggle('running', viewState === 'running');
    this.countdownRing.classList.toggle('paused', viewState === 'paused');
    this.countdownRing.classList.toggle('done', viewState === 'finished');

    if (viewState === 'running') {
      this.countdownLabel.textContent = 'Running';
    } else if (viewState === 'paused') {
      this.countdownLabel.textContent = 'Paused';
    } else if (viewState === 'finished') {
      this.countdownLabel.textContent = 'Done';
    } else if (viewState === 'ready') {
      this.countdownLabel.textContent = 'Ready';
    } else {
      this.countdownLabel.textContent = 'Timer';
    }

    this.countdownEditBtn.textContent = viewState === 'empty' ? 'Set time' : 'Edit';
    this.countdownEditBtn.setAttribute('aria-label', viewState === 'empty' ? 'Set timer' : 'Edit timer');

    this.updateCountdownControls(viewState);
    this.updateDocumentTitle();
  }

  updateCountdownControls(viewState) {
    Object.entries(this.countdownControlGroups).forEach(([state, group]) => {
      group.hidden = state !== viewState;
    });

    this.countdownControlsState.classList.toggle('is-empty', viewState === 'empty');
    this.countdownStartBtn.disabled = viewState !== 'ready';
    this.countdownPauseBtn.disabled = viewState !== 'running';
    this.countdownResumeBtn.disabled = viewState !== 'paused';
    this.countdownAdd60Btn.disabled = viewState !== 'running';
    this.countdownRepeatBtn.disabled = viewState !== 'finished' || this.lastCompletedCountdown <= 0;
  }

  hasActiveBackgroundWork() {
    return this.countdownState.running;
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

      if (this.countdownState.running) {
        window.parent.postMessage({
          type: 'app-status',
          appId: this.appId,
          status: {
            active: true,
            label: 'countdown',
            timeRemaining: this.countdownState.timeRemaining,
            variant: 'alert'
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
    if (this.countdownState.running) {
      document.title = `${this.formatTime(this.countdownState.timeRemaining)} - Timer - Countdown`;
      return;
    }

    document.title = 'Timer - Countdown - MarlApps';
  }

  formatTime(totalSeconds) {
    const seconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  coerceInt(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
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

  vibrate(pattern) {
    if (!('vibrate' in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch (error) {
      // Ignore vibration failures.
    }
  }

  async acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (!this.countdownState.running) return;
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

    if (document.visibilityState === 'visible' && this.countdownState.running) {
      this.tickCountdown({ silent: true });
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
  new CountdownTimerApp();
});
