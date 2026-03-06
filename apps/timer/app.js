class TimerApp {
  constructor() {
    this.data = this.loadData();
    this.alarmCheckInterval = null;
    this.intervalTimerInterval = null;
    this.countdownInterval = null;
    this.ringingAudioContext = null;
    this.ringingTimeout = null;
    this.beepAudioCtx = null;
    this.lastAlarmCheckAt = Date.now();
    this.alarmFreshnessWindowMs = 90 * 1000;
    this.notificationPermissionRequested = false;
    this.lastCompletedCountdown = 0;
    this.lastRuntimeSaveAt = 0;
    this.wakeLock = null;
    this.appVisible = true;
    this.lastReportedBackgroundActivity = null;
    this.activeUtilityModal = null;
    this.activeModeView = 'alarm';
    this.lastFocusedElementByModal = {};

    this.intervalState = {
      running: false,
      paused: false,
      currentRound: 0,
      phase: 'work',
      timeRemaining: 0,
      phaseEndsAt: null
    };

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
    this.renderAlarms();
    this.renderRecentCountdowns();
    this.startAlarmChecker();
    this.restoreRuntimeState();
    this.updateModesView(this.activeModeView);
    this.updateIntervalDisplay();
    this.updateCountdownDisplay();
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  loadData() {
    const saved = localStorage.getItem('marlapps-timer');
    const defaults = {
      alarms: [],
      intervalSettings: { work: 30, rest: 10, rounds: 8 },
      activeTab: 'timer',
      recentCountdowns: [60, 300, 600],
      runtime: {
        interval: null,
        countdown: null,
        lastCompletedCountdown: 0
      }
    };

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

      const alarms = Array.isArray(parsed.alarms)
        ? parsed.alarms
          .map((alarm, index) => {
            if (!alarm || typeof alarm !== 'object') return null;
            if (typeof alarm.time !== 'string' || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(alarm.time)) {
              return null;
            }

            const days = Array.isArray(alarm.days)
              ? [...new Set(
                alarm.days
                  .map(day => Number.parseInt(day, 10))
                  .filter(day => day >= 0 && day <= 6)
              )]
              : [];

            return {
              id: typeof alarm.id === 'string' ? alarm.id : `alarm-${index}`,
              time: alarm.time,
              label: typeof alarm.label === 'string' ? alarm.label : '',
              days,
              enabled: alarm.enabled !== false,
              lastTriggered: typeof alarm.lastTriggered === 'string' ? alarm.lastTriggered : null
            };
          })
          .filter(Boolean)
        : defaults.alarms;

      const intervalSettingsRaw = parsed.intervalSettings && typeof parsed.intervalSettings === 'object' && !Array.isArray(parsed.intervalSettings)
        ? parsed.intervalSettings
        : {};
      const intervalSettings = {
        work: toBoundedInt(intervalSettingsRaw.work, 5, 3600, defaults.intervalSettings.work),
        rest: toBoundedInt(intervalSettingsRaw.rest, 5, 3600, defaults.intervalSettings.rest),
        rounds: toBoundedInt(intervalSettingsRaw.rounds, 1, 99, defaults.intervalSettings.rounds)
      };

      const recentCountdowns = Array.isArray(parsed.recentCountdowns)
        ? parsed.recentCountdowns
          .map(seconds => Number.parseInt(seconds, 10))
          .filter(seconds => Number.isFinite(seconds) && seconds > 0)
          .slice(0, 8)
        : defaults.recentCountdowns;

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

      const lastCompletedCountdown = Number.parseInt(runtimeRaw.lastCompletedCountdown, 10);

      return {
        alarms,
        intervalSettings,
        activeTab: defaults.activeTab,
        recentCountdowns: recentCountdowns.length > 0 ? recentCountdowns : defaults.recentCountdowns,
        runtime: {
          interval: intervalRuntime,
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
    this.data.activeTab = 'timer';
    this.data.runtime = this.captureRuntimeState();
    localStorage.setItem('marlapps-timer', JSON.stringify(this.data));
    this.lastRuntimeSaveAt = Date.now();
  }

  captureRuntimeState() {
    const intervalActive = this.intervalState.running || this.intervalState.paused;
    const interval = intervalActive
      ? {
        running: this.intervalState.running,
        paused: this.intervalState.paused,
        currentRound: this.intervalState.currentRound,
        phase: this.intervalState.phase,
        timeRemaining: this.intervalState.timeRemaining,
        phaseEndsAt: this.intervalState.phaseEndsAt
      }
      : null;

    const countdownDone = Boolean(this.countdownDisplay && this.countdownDisplay.classList.contains('done'));
    const countdownActive = this.countdownState.running ||
      this.countdownState.paused ||
      this.countdownState.totalTime > 0 ||
      countdownDone;
    const countdown = countdownActive
      ? {
        running: this.countdownState.running,
        paused: this.countdownState.paused,
        timeRemaining: this.countdownState.timeRemaining,
        totalTime: this.countdownState.totalTime,
        endAt: this.countdownState.endAt,
        done: countdownDone
      }
      : null;

    return {
      interval,
      countdown,
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

    if (this.intervalState.running) {
      clearInterval(this.intervalTimerInterval);
      this.tickInterval({ silent: true, persist: false });
      if (this.intervalState.running) {
        this.intervalTimerInterval = setInterval(() => this.tickInterval(), 250);
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
    } catch (e) {
      // Ignore theme read errors.
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
    this.openSetTimeButtons = document.querySelectorAll('[data-open-set-time]');
    this.countdownResetButtons = document.querySelectorAll('[data-countdown-reset]');
    this.presetButtons = document.querySelectorAll('.preset-btn');
    this.modesToggle = document.getElementById('modesToggle');

    this.setTimeBackdrop = document.getElementById('setTimeBackdrop');
    this.setTimePanel = document.getElementById('setTimePanel');
    this.setTimeClose = document.getElementById('setTimeClose');
    this.customMinutes = document.getElementById('customMinutes');
    this.customSeconds = document.getElementById('customSeconds');
    this.customSetBtn = document.getElementById('customSetBtn');
    this.recentTimerList = document.getElementById('recentTimerList');

    this.modesBackdrop = document.getElementById('modesBackdrop');
    this.modesPanel = document.getElementById('modesPanel');
    this.modesClose = document.getElementById('modesClose');
    this.modePills = document.querySelectorAll('.mode-pill');
    this.modeViews = document.querySelectorAll('.mode-view');

    this.alarmTimeInput = document.getElementById('alarmTime');
    this.alarmLabelInput = document.getElementById('alarmLabel');
    this.addAlarmBtn = document.getElementById('addAlarmBtn');
    this.alarmList = document.getElementById('alarmList');
    this.alarmEmpty = document.getElementById('alarmEmpty');
    this.dayBtns = document.querySelectorAll('.day-btn');

    this.intervalDisplay = document.getElementById('intervalDisplay');
    this.intervalPhase = document.getElementById('intervalPhase');
    this.intervalTimer = document.getElementById('intervalTimer');
    this.intervalProgressEl = document.getElementById('intervalProgress');
    this.intervalStartBtn = document.getElementById('intervalStartBtn');
    this.intervalPauseBtn = document.getElementById('intervalPauseBtn');
    this.intervalResetBtn = document.getElementById('intervalResetBtn');
    this.intervalWorkInput = document.getElementById('intervalWork');
    this.intervalRestInput = document.getElementById('intervalRest');
    this.intervalRoundsInput = document.getElementById('intervalRounds');

    this.alarmModal = document.getElementById('alarmModal');
    this.alarmModalPanel = document.getElementById('alarmModalPanel');
    this.alarmModalLabel = document.getElementById('alarmModalLabel');
    this.alarmModalTime = document.getElementById('alarmModalTime');
    this.dismissAlarmBtn = document.getElementById('dismissAlarmBtn');

    const now = new Date();
    this.alarmTimeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.intervalWorkInput.value = this.data.intervalSettings.work;
    this.intervalRestInput.value = this.data.intervalSettings.rest;
    this.intervalRoundsInput.value = this.data.intervalSettings.rounds;
  }

  attachEventListeners() {
    this.openSetTimeButtons.forEach(button => {
      button.addEventListener('click', () => this.openSetTime());
    });
    this.modesToggle.addEventListener('click', () => this.openModes());

    this.setTimeClose.addEventListener('click', () => this.closeModal('setTime'));
    this.modesClose.addEventListener('click', () => this.closeModal('modes'));
    this.setTimeBackdrop.addEventListener('click', (event) => {
      if (event.target === this.setTimeBackdrop) this.closeModal('setTime');
    });
    this.modesBackdrop.addEventListener('click', (event) => {
      if (event.target === this.modesBackdrop) this.closeModal('modes');
    });

    this.customSetBtn.addEventListener('click', () => this.setCustomCountdown());
    [this.customMinutes, this.customSeconds].forEach(input => {
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
    this.countdownResetButtons.forEach(button => {
      button.addEventListener('click', () => this.resetCountdown());
    });

    this.presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        const seconds = Number.parseInt(button.dataset.seconds, 10);
        if (Number.isFinite(seconds)) this.setCountdownDuration(seconds);
      });
    });

    this.modePills.forEach(button => {
      button.addEventListener('click', () => this.updateModesView(button.dataset.view));
      button.addEventListener('keydown', (event) => this.handleModeTabKeydown(event));
    });

    this.addAlarmBtn.addEventListener('click', () => this.addAlarm());
    this.dayBtns.forEach(button => {
      button.addEventListener('click', () => button.classList.toggle('active'));
    });
    this.alarmTimeInput.addEventListener('input', () => {
      this.alarmTimeInput.setCustomValidity('');
    });
    this.alarmTimeInput.addEventListener('blur', () => {
      const normalized = this.normalizeAlarmTimeInput(this.alarmTimeInput.value);
      if (normalized) {
        this.alarmTimeInput.value = normalized;
      }
    });

    this.intervalStartBtn.addEventListener('click', () => this.startInterval());
    this.intervalPauseBtn.addEventListener('click', () => this.pauseInterval());
    this.intervalResetBtn.addEventListener('click', () => this.resetInterval());
    [this.intervalWorkInput, this.intervalRestInput, this.intervalRoundsInput].forEach(input => {
      input.addEventListener('change', () => this.saveIntervalSettings());
    });

    this.dismissAlarmBtn.addEventListener('click', () => this.dismissAlarm());
    this.alarmModal.addEventListener('click', (event) => {
      if (event.target === this.alarmModal) this.dismissAlarm();
    });

    document.addEventListener('keydown', (event) => this.handleKeyDown(event));
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    window.addEventListener('pagehide', () => this.persistRuntimeData(true));
    window.addEventListener('beforeunload', () => this.persistRuntimeData(true));
  }

  handleKeyDown(event) {
    const topModal = this.getTopOpenModal();
    if (topModal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (topModal === 'alarm') {
          this.dismissAlarm();
        } else {
          this.closeModal(topModal);
        }
        return;
      }

      if (event.key === 'Tab') {
        this.trapFocus(event, topModal);
      }
      return;
    }
  }

  handleModeTabKeydown(event) {
    const tabs = Array.from(this.modePills);
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    this.updateModesView(nextTab.dataset.view);
    nextTab.focus();
  }

  updateModesView(view) {
    this.activeModeView = view === 'intervals' ? 'intervals' : 'alarm';
    this.modePills.forEach(button => {
      const isActive = button.dataset.view === this.activeModeView;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    });
    this.modeViews.forEach(section => {
      const isActive = section.id === `${this.activeModeView}-view`;
      section.classList.toggle('active', isActive);
      section.hidden = !isActive;
    });
    this.updateDocumentTitle();
  }

  openSetTime() {
    this.prefillSetTimeInputs();
    this.openModal('setTime', { focusTarget: this.customMinutes });
  }

  openModes(view = this.activeModeView) {
    this.updateModesView(view);
    const activeTab = Array.from(this.modePills).find(button => button.dataset.view === this.activeModeView);
    this.openModal('modes', { focusTarget: activeTab || this.modesClose });
  }

  openModal(name, { focusTarget = null } = {}) {
    if (name !== 'setTime' && name !== 'modes') return;

    const backdrop = this.getBackdrop(name);
    if (!backdrop || backdrop.classList.contains('active')) return;

    if (this.activeUtilityModal && this.activeUtilityModal !== name) {
      this.closeModal(this.activeUtilityModal, { restoreFocus: false });
    }

    this.lastFocusedElementByModal[name] = this.getRestorableFocusedElement();
    backdrop.classList.add('active');
    backdrop.setAttribute('aria-hidden', 'false');
    this.activeUtilityModal = name;

    window.setTimeout(() => {
      const target = focusTarget || this.getPanel(name);
      if (target && typeof target.focus === 'function') target.focus();
    }, 50);
  }

  closeModal(name, { restoreFocus = true } = {}) {
    const backdrop = this.getBackdrop(name);
    if (!backdrop || !backdrop.classList.contains('active')) return;

    backdrop.classList.remove('active');
    backdrop.setAttribute('aria-hidden', 'true');
    if (this.activeUtilityModal === name) {
      this.activeUtilityModal = null;
    }

    if (restoreFocus) {
      this.restoreFocus(name);
    }
  }

  getBackdrop(name) {
    if (name === 'setTime') return this.setTimeBackdrop;
    if (name === 'modes') return this.modesBackdrop;
    if (name === 'alarm') return this.alarmModal;
    return null;
  }

  getPanel(name) {
    if (name === 'setTime') return this.setTimePanel;
    if (name === 'modes') return this.modesPanel;
    if (name === 'alarm') return this.alarmModalPanel;
    return null;
  }

  getTopOpenModal() {
    if (this.alarmModal.classList.contains('active')) return 'alarm';
    const activeBackdrop = this.activeUtilityModal ? this.getBackdrop(this.activeUtilityModal) : null;
    if (this.activeUtilityModal && activeBackdrop && activeBackdrop.classList.contains('active')) {
      return this.activeUtilityModal;
    }
    return null;
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

  trapFocus(event, modalName) {
    const panel = this.getPanel(modalName);
    if (!panel) return;

    const focusable = this.getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      panel.focus();
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

  getFocusableElements(container) {
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ];
    return Array.from(container.querySelectorAll(selectors.join(',')))
      .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  }

  addAlarm() {
    const time = this.normalizeAlarmTimeInput(this.alarmTimeInput.value);
    if (!time) {
      this.alarmTimeInput.setCustomValidity('Use 24-hour format (HH:MM).');
      this.alarmTimeInput.reportValidity();
      return;
    }
    this.alarmTimeInput.setCustomValidity('');
    this.alarmTimeInput.value = time;

    this.maybeRequestNotificationPermission();

    const selectedDays = [];
    this.dayBtns.forEach(button => {
      if (button.classList.contains('active')) {
        selectedDays.push(Number.parseInt(button.dataset.day, 10));
      }
    });

    const alarm = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      time,
      label: this.alarmLabelInput.value.trim(),
      days: selectedDays,
      enabled: true,
      lastTriggered: null
    };

    this.data.alarms.push(alarm);
    this.saveData();
    this.renderAlarms();

    this.alarmLabelInput.value = '';
    this.dayBtns.forEach(button => button.classList.remove('active'));
  }

  renderAlarms() {
    this.alarmList.innerHTML = '';
    const hasAlarms = this.data.alarms.length > 0;
    this.alarmEmpty.style.display = hasAlarms ? 'none' : 'flex';

    const sorted = [...this.data.alarms].sort((a, b) => a.time.localeCompare(b.time));
    sorted.forEach(alarm => {
      const element = document.createElement('div');
      element.className = `alarm-item${alarm.enabled ? '' : ' disabled'}`;

      const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const orderedDays = this.sortDaysMondayFirst(alarm.days);
      const repeatText = alarm.days.length === 0
        ? 'Once'
        : alarm.days.length === 7
          ? 'Every day'
          : orderedDays.map(day => dayNames[day]).join(', ');

      element.innerHTML = `
        <div class="alarm-info">
          <div class="alarm-time">${this.formatAlarmTime(alarm.time)}</div>
          ${alarm.label ? `<div class="alarm-label">${this.escapeHtml(alarm.label)}</div>` : ''}
          <div class="alarm-repeat">${repeatText}</div>
        </div>
        <label class="alarm-toggle">
          <input type="checkbox" ${alarm.enabled ? 'checked' : ''} data-id="${alarm.id}">
          <span class="slider"></span>
        </label>
        <button type="button" class="alarm-delete" data-id="${alarm.id}" title="Delete" aria-label="Delete alarm">&times;</button>
      `;

      element.querySelector('.alarm-toggle input').addEventListener('change', (event) => {
        this.toggleAlarm(alarm.id, event.target.checked);
      });
      element.querySelector('.alarm-delete').addEventListener('click', () => {
        this.deleteAlarm(alarm.id);
      });

      this.alarmList.appendChild(element);
    });
  }

  formatAlarmTime(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return time24;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  normalizeAlarmTimeInput(rawTime) {
    if (typeof rawTime !== 'string') return null;
    const value = rawTime.trim();
    if (!value) return null;

    let hours = null;
    let minutes = null;

    const hhmmMatch = value.match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
    if (hhmmMatch) {
      hours = Number.parseInt(hhmmMatch[1], 10);
      minutes = Number.parseInt(hhmmMatch[2], 10);
    } else {
      const compactMatch = value.match(/^(\d{3,4})$/);
      if (compactMatch) {
        const digits = compactMatch[1];
        if (digits.length === 3) {
          hours = Number.parseInt(digits.slice(0, 1), 10);
          minutes = Number.parseInt(digits.slice(1), 10);
        } else {
          hours = Number.parseInt(digits.slice(0, 2), 10);
          minutes = Number.parseInt(digits.slice(2), 10);
        }
      }
    }

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  sortDaysMondayFirst(days) {
    const mondayFirstOrder = [1, 2, 3, 4, 5, 6, 0];
    return mondayFirstOrder.filter(day => days.includes(day));
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  toggleAlarm(id, enabled) {
    const alarm = this.data.alarms.find(item => item.id === id);
    if (!alarm) return;

    alarm.enabled = enabled;
    if (enabled) alarm.lastTriggered = null;
    this.saveData();
    this.renderAlarms();
  }

  deleteAlarm(id) {
    this.data.alarms = this.data.alarms.filter(alarm => alarm.id !== id);
    this.saveData();
    this.renderAlarms();
  }

  startAlarmChecker() {
    this.lastAlarmCheckAt = Date.now();
    this.alarmCheckInterval = setInterval(() => this.checkAlarms(), 1000);
  }

  checkAlarms() {
    const nowMs = Date.now();
    const fromMs = this.lastAlarmCheckAt;
    this.lastAlarmCheckAt = nowMs;

    const candidateTimes = [];
    const cursor = new Date(fromMs);
    cursor.setSeconds(0, 0);

    while (cursor.getTime() <= nowMs) {
      candidateTimes.push(new Date(cursor.getTime()));
      cursor.setMinutes(cursor.getMinutes() + 1);
    }

    if (candidateTimes.length === 0) return;

    let didChange = false;

    this.data.alarms.forEach(alarm => {
      if (!alarm.enabled) return;

      for (const candidate of candidateTimes) {
        const candidateTime = `${String(candidate.getHours()).padStart(2, '0')}:${String(candidate.getMinutes()).padStart(2, '0')}`;
        const candidateDay = candidate.getDay();
        const candidateDateStr = candidate.toDateString();

        if (alarm.time !== candidateTime) continue;
        if (alarm.lastTriggered === candidateDateStr) continue;
        if (alarm.days.length > 0 && !alarm.days.includes(candidateDay)) continue;

        const isFresh = nowMs - candidate.getTime() <= this.alarmFreshnessWindowMs;
        if (!isFresh) {
          if (alarm.days.length === 0) {
            alarm.enabled = false;
            didChange = true;
          }
          continue;
        }

        alarm.lastTriggered = candidateDateStr;
        didChange = true;
        if (alarm.days.length === 0) {
          alarm.enabled = false;
        }
        this.triggerAlarm(alarm);
        break;
      }
    });

    if (didChange) this.saveData();
  }

  triggerAlarm(alarm) {
    this.lastFocusedElementByModal.alarm = this.getRestorableFocusedElement();
    this.alarmModalLabel.textContent = alarm.label || 'Alarm';
    this.alarmModalTime.textContent = this.formatAlarmTime(alarm.time);
    this.alarmModal.classList.add('active');
    this.alarmModal.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => this.dismissAlarmBtn.focus(), 50);
    this.startRinging();
    this.showNotification(alarm.label ? `Alarm: ${alarm.label}` : 'Alarm', {
      body: `Time: ${this.formatAlarmTime(alarm.time)}`
    });
    this.renderAlarms();
  }

  dismissAlarm({ restoreFocus = true } = {}) {
    this.alarmModal.classList.remove('active');
    this.alarmModal.setAttribute('aria-hidden', 'true');
    this.stopRinging();
    if (restoreFocus) this.restoreFocus('alarm');
  }

  startRinging() {
    try {
      this.ringingAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.playAlarmBeepSequence();
    } catch (e) {
      // Ignore audio initialization failures.
    }
  }

  playAlarmBeepSequence() {
    if (!this.ringingAudioContext || this.ringingAudioContext.state === 'closed') return;
    if (!this.alarmModal.classList.contains('active')) return;

    const ctx = this.ringingAudioContext;
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, now + i * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.3 + 0.15);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 0.15);
    }

    this.ringingTimeout = setTimeout(() => this.playAlarmBeepSequence(), 1500);
  }

  stopRinging() {
    clearTimeout(this.ringingTimeout);
    if (this.ringingAudioContext) {
      this.ringingAudioContext.close().catch(() => {});
      this.ringingAudioContext = null;
    }
  }

  saveIntervalSettings() {
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
    if (!this.countdownState.running) this.releaseWakeLock();
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
    if (!this.countdownState.running) this.releaseWakeLock();
    this.updateIntervalDisplay();
    if (persist) this.persistRuntimeData(true);
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  updateIntervalDisplay() {
    const state = this.intervalState;
    this.intervalDisplay.classList.toggle('active', state.running);
    this.intervalDisplay.classList.toggle('work', (state.running || state.paused) && state.phase === 'work');
    this.intervalDisplay.classList.toggle('rest', (state.running || state.paused) && state.phase === 'rest');

    this.intervalTimer.textContent = this.formatTime(state.timeRemaining);
    this.intervalProgressEl.textContent = state.currentRound > 0
      ? `Round ${state.currentRound} / ${this.data.intervalSettings.rounds}`
      : `${this.data.intervalSettings.rounds} rounds`;

    if (state.running || state.paused) {
      this.intervalPhase.textContent = state.phase === 'work' ? 'Work' : 'Rest';
    } else {
      this.intervalPhase.textContent = 'Ready';
    }

    this.intervalStartBtn.disabled = state.running;
    this.intervalPauseBtn.disabled = !state.running;
    this.intervalStartBtn.textContent = state.paused ? 'Resume' : 'Start';
    this.updateDocumentTitle();
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
    if (!this.intervalState.running) this.releaseWakeLock();
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
    const withoutDupes = this.data.recentCountdowns.filter(item => item !== normalized);
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

    this.data.recentCountdowns.forEach(seconds => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-btn';
      button.textContent = this.formatShortDuration(seconds);
      button.addEventListener('click', () => {
        this.setCountdownDuration(seconds);
        const setTimeBackdrop = this.getBackdrop('setTime');
        if (setTimeBackdrop && setTimeBackdrop.classList.contains('active')) {
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
      if (!this.intervalState.running) this.releaseWakeLock();
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
    if (!this.intervalState.running) this.releaseWakeLock();
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
    if (!this.intervalState.running) this.releaseWakeLock();
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
    const displaySeconds = viewState === 'empty'
      ? 0
      : this.countdownState.timeRemaining;
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
      const isActive = state === viewState;
      group.hidden = !isActive;
    });

    this.countdownControlsState.classList.toggle('is-empty', viewState === 'empty');
    this.countdownStartBtn.disabled = viewState !== 'ready';
    this.countdownPauseBtn.disabled = viewState !== 'running';
    this.countdownResumeBtn.disabled = viewState !== 'paused';
    this.countdownAdd60Btn.disabled = viewState !== 'running';
    this.countdownRepeatBtn.disabled = viewState !== 'finished' || this.lastCompletedCountdown <= 0;
  }

  hasActiveBackgroundWork() {
    return this.intervalState.running || this.countdownState.running;
  }

  reportBackgroundActivity() {
    const active = this.hasActiveBackgroundWork();
    if (this.lastReportedBackgroundActivity === active) return;
    this.lastReportedBackgroundActivity = active;

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'app-background-activity',
          appId: 'timer',
          active
        }, '*');
      }
    } catch (e) {
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
          appId: 'timer',
          status: {
            active: true,
            label: this.intervalState.phase,
            timeRemaining: this.intervalState.timeRemaining,
            variant
          }
        }, '*');
        return;
      }

      if (this.countdownState.running) {
        window.parent.postMessage({
          type: 'app-status',
          appId: 'timer',
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
        appId: 'timer',
        status: { active: false }
      }, '*');
    } catch (e) {
      // Ignore postMessage failures.
    }
  }

  updateDocumentTitle() {
    if (this.intervalState.running) {
      document.title = `${this.formatTime(this.intervalState.timeRemaining)} ${this.intervalState.phase === 'work' ? 'Work' : 'Rest'} - Timer`;
      return;
    }

    if (this.countdownState.running) {
      document.title = `${this.formatTime(this.countdownState.timeRemaining)} - Timer`;
      return;
    }

    document.title = 'Timer - MarlApps';
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
    } catch (e) {
      // Ignore audio failures.
    }
  }

  vibrate(pattern) {
    if (!('vibrate' in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore vibration failures.
    }
  }

  async acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    if (!this.countdownState.running && !this.intervalState.running) return;
    if (!this.appVisible) return;
    if (document.visibilityState !== 'visible') return;
    if (this.wakeLock) return;

    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch (e) {
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

    if (document.visibilityState === 'visible' && this.intervalState.running) {
      this.tickInterval({ silent: true });
      this.acquireWakeLock();
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
        tag: options.tag || 'marlapps-timer'
      });
      setTimeout(() => notification.close(), 10000);
    } catch (e) {
      // Ignore notification failures.
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TimerApp();
});
