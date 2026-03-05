// Pomodoro Timer App with localStorage persistence

class PomodoroTimer {
  constructor() {
    this.migrateStorage();
    const data = this.loadData();
    this.settings = this.loadSettings(data);
    this.state = this.loadState(data);
    this.history = this.loadHistory(data);
    this.timerInterval = null;
    this.notificationPermissionRequested = false;
    this.lastReportedBackgroundActivity = null;
    this.completionTimeout = null;
    this.lastSaveTime = 0;
    this.lastRenderedDotState = null;
    this.audioContext = null;
    this.autoStartTimeout = null;

    this.checkDailyReset();
    this.initElements();
    this.attachEventListeners();
    this.updateControlsVisibility();
    this.updateDisplay();
    this.updateSettingsDisplay();
    this.updateHistoryDisplay();
    this.syncThemeWithParent();

    // Auto-resume if timer was active
    if (this.state.isActive) {
      this.startTimer();
    }

    this.reportBackgroundActivity();
    this.reportStatus();
  }

  initElements() {
    this.timerEl = document.getElementById('timer');
    this.sessionTypeEl = document.getElementById('sessionType');
    this.pomodoroDotsEl = document.getElementById('pomodoroDots');
    this.controlsIdle = document.getElementById('controlsIdle');
    this.controlsActive = document.getElementById('controlsActive');
    this.startWorkBtn = document.getElementById('startWorkBtn');
    this.startBreakBtn = document.getElementById('startBreakBtn');
    this.skipBtn = document.getElementById('skipBtn');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.settingsToggle = document.getElementById('settingsToggle');
    this.historyToggle = document.getElementById('historyToggle');
    this.settingsBackdrop = document.getElementById('settingsBackdrop');
    this.historyBackdrop = document.getElementById('historyBackdrop');
    this.resetBackdrop = document.getElementById('resetBackdrop');
    this.saveSettingsBtn = document.getElementById('saveSettings');
    this.historyDateInput = document.getElementById('historyDate');
    this.historyCountEl = document.getElementById('historyCount');
    this.historyListEl = document.getElementById('historyList');
    this.resetTodayBtn = document.getElementById('resetTodayBtn');
    this.timerDisplay = document.querySelector('.timer-display');
    this.progressRing = document.getElementById('progressRing');
    this.completionFlash = document.getElementById('completionFlash');
    this.completionText = document.getElementById('completionText');

    // Calculate progress ring circumference
    const radius = 152;
    this.ringCircumference = 2 * Math.PI * radius;
    this.progressRing.style.strokeDasharray = this.ringCircumference;
  }

  attachEventListeners() {
    this.startWorkBtn.addEventListener('click', () => this.startWorkSession());
    this.startBreakBtn.addEventListener('click', () => this.startBreakSession());
    this.skipBtn.addEventListener('click', () => this.skipToNext());
    this.pauseBtn.addEventListener('click', () => this.togglePause());
    this.stopBtn.addEventListener('click', () => this.handleReset());
    this.settingsToggle.addEventListener('click', () => this.openModal('settings'));
    this.historyToggle.addEventListener('click', () => this.openModal('history'));
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    this.historyDateInput.addEventListener('change', () => this.updateHistoryDisplay());
    this.resetTodayBtn.addEventListener('click', () => this.resetTodayCount());
    document.addEventListener('visibilitychange', () => this.handleDocumentVisibility());
    window.addEventListener('pagehide', () => this.saveState());
    window.addEventListener('beforeunload', () => this.saveState());

    // Modal close buttons
    document.getElementById('settingsClose').addEventListener('click', () => this.closeModal('settings'));
    document.getElementById('historyClose').addEventListener('click', () => this.closeModal('history'));
    document.getElementById('resetClose').addEventListener('click', () => this.closeModal('reset'));
    document.getElementById('resetCancel').addEventListener('click', () => this.closeModal('reset'));
    document.getElementById('resetConfirm').addEventListener('click', () => {
      this.closeModal('reset');
      this.resetTimer();
    });

    // Close modals on backdrop click
    this.settingsBackdrop.addEventListener('click', (e) => {
      if (e.target === this.settingsBackdrop) this.closeModal('settings');
    });
    this.historyBackdrop.addEventListener('click', (e) => {
      if (e.target === this.historyBackdrop) this.closeModal('history');
    });
    this.resetBackdrop.addEventListener('click', (e) => {
      if (e.target === this.resetBackdrop) this.closeModal('reset');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Listen for theme changes from parent
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        this.applyTheme(event.data.theme);
      }
      if (event.data && event.data.type === 'app-visibility') {
        this.handleAppVisibility(Boolean(event.data.visible));
      }
    });
  }

  handleKeyDown(e) {
    // Don't handle shortcuts when a modal is open or input is focused
    const anyModalOpen = this.settingsBackdrop.classList.contains('active')
      || this.historyBackdrop.classList.contains('active')
      || this.resetBackdrop.classList.contains('active');

    if (e.key === 'Escape' && anyModalOpen) {
      this.closeModal('settings');
      this.closeModal('history');
      this.closeModal('reset');
      return;
    }

    if (anyModalOpen) return;

    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (this.state.isActive) {
          this.pauseTimer();
        } else if (this.state.sessionStarted) {
          // Resume a paused session
          this.startTimer();
        } else if (this.state.sessionType !== 'work') {
          this.startBreakSession();
        } else {
          this.startWorkSession();
        }
        break;
      case 'r':
      case 'R':
        this.handleReset();
        break;
      case 's':
      case 'S':
        this.openModal('settings');
        break;
      case 'h':
      case 'H':
        this.openModal('history');
        break;
    }
  }

  // Modal management
  openModal(name) {
    const backdrop = this.getBackdrop(name);
    if (!backdrop) return;
    backdrop.classList.add('active');

    if (name === 'settings') {
      this.updateSettingsDisplay();
    } else if (name === 'history') {
      this.updateHistoryDisplay();
    }

    // Focus the close button for accessibility
    const closeBtn = backdrop.querySelector('.modal-close');
    if (closeBtn) setTimeout(() => closeBtn.focus(), 50);
  }

  closeModal(name) {
    const backdrop = this.getBackdrop(name);
    if (!backdrop) return;
    backdrop.classList.remove('active');
  }

  getBackdrop(name) {
    if (name === 'settings') return this.settingsBackdrop;
    if (name === 'history') return this.historyBackdrop;
    if (name === 'reset') return this.resetBackdrop;
    return null;
  }

  syncThemeWithParent() {
    try {
      const savedTheme = localStorage.getItem('marlapps-theme');
      if (savedTheme) {
        this.applyTheme(savedTheme);
      }
    } catch (e) {
      // Fail silently if can't access localStorage
    }
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  migrateStorage() {
    const oldSettings = localStorage.getItem('pomodoroSettings');
    const oldState = localStorage.getItem('pomodoroState');
    if (oldSettings || oldState) {
      const merged = {};
      if (oldSettings) {
        try {
          const parsedSettings = JSON.parse(oldSettings);
          if (parsedSettings && typeof parsedSettings === 'object' && !Array.isArray(parsedSettings)) {
            merged.settings = parsedSettings;
          }
        } catch {}
      }
      if (oldState) {
        try {
          const parsedState = JSON.parse(oldState);
          if (parsedState && typeof parsedState === 'object' && !Array.isArray(parsedState)) {
            merged.state = parsedState;
          }
        } catch {}
      }
      localStorage.setItem('marlapps-pomodoro-timer', JSON.stringify(merged));
      localStorage.removeItem('pomodoroSettings');
      localStorage.removeItem('pomodoroState');
    }
  }

  loadData() {
    const saved = localStorage.getItem('marlapps-pomodoro-timer');
    if (!saved) return {};

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch {
      return {};
    }
  }

  loadSettings(data) {
    const defaultSettings = {
      longBreakInterval: 4,
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      autoStartBreaks: false,
      autoStartWork: false,
      soundEnabled: true
    };

    data = data || this.loadData();
    if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      return defaultSettings;
    }

    const settings = { ...defaultSettings, ...data.settings };

    // Migrate old targetPomodoros setting
    if (!('longBreakInterval' in data.settings) && 'targetPomodoros' in data.settings) {
      settings.longBreakInterval = data.settings.targetPomodoros;
    }
    delete settings.targetPomodoros;

    return settings;
  }

  loadState(data) {
    const defaultState = {
      timeRemaining: 25 * 60,
      sessionType: 'work',
      pomodoroCount: 1,
      totalWorkSessions: 0,
      isActive: false,
      lastUpdated: Date.now(),
      targetEndAt: null,
      sessionStarted: false
    };

    data = data || this.loadData();
    if (!data.state || typeof data.state !== 'object' || Array.isArray(data.state)) {
      return defaultState;
    }

    const state = data.state;

    if (state.isActive && typeof state.targetEndAt === 'number') {
      state.timeRemaining = Math.max(0, Math.ceil((state.targetEndAt - Date.now()) / 1000));
    } else if (state.isActive) {
      const elapsed = Math.floor((Date.now() - state.lastUpdated) / 1000);
      state.timeRemaining = Math.max(0, state.timeRemaining - elapsed);
    }

    const merged = { ...defaultState, ...state };
    if (!Number.isFinite(merged.pomodoroCount) || merged.pomodoroCount < 1) {
      merged.pomodoroCount = 1;
    }
    if (!Number.isFinite(merged.totalWorkSessions) || merged.totalWorkSessions < 0) {
      // Don't derive from pomodoroCount since they use different scales
      // (pomodoroCount wraps modulo interval, totalWorkSessions is cumulative)
      merged.totalWorkSessions = 0;
    }

    return merged;
  }

  loadHistory(data) {
    data = data || this.loadData();
    if (!data.history || typeof data.history !== 'object' || Array.isArray(data.history)) return {};
    return data.history;
  }

  checkDailyReset() {
    const today = this.getDateKey();
    const lastDate = this.state.lastSessionDate;

    if (lastDate && lastDate !== today) {
      // Always reset the long break counters on a new day
      this.state.pomodoroCount = 1;
      this.state.totalWorkSessions = 0;

      // Only reset the session state if not actively running
      if (!this.state.isActive) {
        this.state.sessionType = 'work';
        this.state.timeRemaining = this.settings.workDuration * 60;
        this.state.targetEndAt = null;
      }
    }

    this.state.lastSessionDate = today;
  }

  saveData() {
    const data = { settings: this.settings, state: this.state, history: this.history };
    localStorage.setItem('marlapps-pomodoro-timer', JSON.stringify(data));
  }

  saveSettings() {
    this.settings = {
      longBreakInterval: this.clampValue(parseInt(document.getElementById('longBreakInterval').value, 10), 1, 30, 4),
      workDuration: this.clampValue(parseInt(document.getElementById('workDuration').value, 10), 1, 60, 25),
      shortBreakDuration: this.clampValue(parseInt(document.getElementById('shortBreakDuration').value, 10), 1, 30, 5),
      longBreakDuration: this.clampValue(parseInt(document.getElementById('longBreakDuration').value, 10), 1, 60, 15),
      autoStartBreaks: document.getElementById('autoStartBreaks').checked,
      autoStartWork: document.getElementById('autoStartWork').checked,
      soundEnabled: document.getElementById('soundEnabled').checked
    };

    const interval = this.getLongBreakInterval();
    this.state.pomodoroCount = ((Math.max(1, this.state.pomodoroCount) - 1) % interval) + 1;

    this.saveData();
    this.closeModal('settings');

    // Update idle timer to reflect new duration if not mid-session
    if (!this.state.isActive && !this.state.sessionStarted) {
      this.state.timeRemaining = this.getDurationForSession() * 60;
      this.state.targetEndAt = null;
    }

    this.updateDisplay();
  }

  saveState() {
    this.state.lastUpdated = Date.now();
    this.saveData();
  }

  syncStateWithClock() {
    if (!this.state.isActive) return;

    if (typeof this.state.targetEndAt === 'number') {
      this.state.timeRemaining = Math.max(0, Math.ceil((this.state.targetEndAt - Date.now()) / 1000));
    } else {
      const elapsed = Math.max(0, Math.floor((Date.now() - this.state.lastUpdated) / 1000));
      this.state.timeRemaining = Math.max(0, this.state.timeRemaining - elapsed);
      this.state.targetEndAt = Date.now() + (this.state.timeRemaining * 1000);
    }

    if (this.state.timeRemaining <= 0) {
      this.completeSession();
      return;
    }

    this.updateDisplay();
    this.saveState();
  }

  handleDocumentVisibility() {
    if (document.visibilityState === 'hidden') {
      this.saveState();
      return;
    }
    this.syncStateWithClock();
  }

  handleAppVisibility(visible) {
    if (!visible) {
      this.saveState();
      return;
    }
    this.syncStateWithClock();
  }

  updateSettingsDisplay() {
    document.getElementById('longBreakInterval').value = this.getLongBreakInterval();
    document.getElementById('workDuration').value = this.settings.workDuration;
    document.getElementById('shortBreakDuration').value = this.settings.shortBreakDuration;
    document.getElementById('longBreakDuration').value = this.settings.longBreakDuration;
    document.getElementById('autoStartBreaks').checked = this.settings.autoStartBreaks;
    document.getElementById('autoStartWork').checked = this.settings.autoStartWork || false;
    document.getElementById('soundEnabled').checked = this.settings.soundEnabled;
  }

  clampValue(value, min, max, fallback = min) {
    const safe = Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, safe));
  }

  getLongBreakInterval() {
    return this.clampValue(this.settings.longBreakInterval, 1, 30, 4);
  }

  getDurationForSession() {
    if (this.state.sessionType === 'work') {
      return this.settings.workDuration;
    } else if (this.state.sessionType === 'shortBreak') {
      return this.settings.shortBreakDuration;
    } else {
      return this.settings.longBreakDuration;
    }
  }

  handleReset() {
    // Show confirmation if timer is actively running or partially elapsed
    const fullDuration = this.getDurationForSession() * 60;
    if (this.state.isActive || this.state.timeRemaining < fullDuration) {
      this.openModal('reset');
    } else {
      this.resetTimer();
    }
  }

  startWorkSession() {
    if (this.state.sessionType !== 'work') {
      this.state.sessionType = 'work';
      this.state.timeRemaining = this.settings.workDuration * 60;
      this.state.targetEndAt = null;
      this.timerDisplay.classList.remove('break');
    }
    this.startTimer();
  }

  startBreakSession() {
    if (this.state.sessionType === 'work') {
      // Determine break type: long break only if the last completed cycle warrants it
      const interval = this.getLongBreakInterval();
      if (this.state.totalWorkSessions > 0 && this.state.totalWorkSessions % interval === 0) {
        this.state.sessionType = 'longBreak';
      } else {
        this.state.sessionType = 'shortBreak';
      }
      this.state.timeRemaining = this.getDurationForSession() * 60;
      this.state.targetEndAt = null;
      this.timerDisplay.classList.add('break');
    }
    this.startTimer();
  }

  skipToNext() {
    this.pauseTimer();
    if (this.state.sessionType === 'work') {
      // Skip work -> go to short break (skipped work doesn't count toward long break)
      this.state.sessionType = 'shortBreak';
    } else {
      // Skip break -> go to work
      this.state.sessionType = 'work';
    }
    this.state.timeRemaining = this.getDurationForSession() * 60;
    this.state.targetEndAt = null;
    this.state.sessionStarted = false;
    this.timerDisplay.classList.toggle('break', this.state.sessionType !== 'work');
    this.updateControlsVisibility();
    this.updateDisplay();
    this.saveState();
  }

  startTimer() {
    if (this.autoStartTimeout) {
      clearTimeout(this.autoStartTimeout);
      this.autoStartTimeout = null;
    }
    this.maybeRequestNotificationPermission();
    this.state.isActive = true;
    this.state.sessionStarted = true;
    if (!this.state.targetEndAt) {
      this.state.targetEndAt = Date.now() + (this.state.timeRemaining * 1000);
    }
    this.timerDisplay.classList.add('active');

    if (this.state.sessionType !== 'work') {
      this.timerDisplay.classList.add('break');
    }

    this.updateControlsVisibility();

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.tickTimer(), 1000);
    this.tickTimer();

    this.saveState();
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  tickTimer() {
    if (!this.state.isActive || !this.state.targetEndAt) return;

    this.state.timeRemaining = Math.max(0, Math.ceil((this.state.targetEndAt - Date.now()) / 1000));
    this.updateDisplay();
    this.reportStatus();

    // Throttle localStorage writes to every 5 seconds (saves are also forced on pause/visibility change)
    const now = Date.now();
    if (now - this.lastSaveTime >= 5000) {
      this.lastSaveTime = now;
      this.saveState();
    }

    if (this.state.timeRemaining <= 0) {
      this.completeSession();
    }
  }

  pauseTimer() {
    this.state.isActive = false;
    if (this.state.targetEndAt) {
      this.state.timeRemaining = Math.max(0, Math.ceil((this.state.targetEndAt - Date.now()) / 1000));
    }
    this.state.targetEndAt = null;
    this.timerDisplay.classList.remove('active');
    this.updateControlsVisibility();

    clearInterval(this.timerInterval);
    this.saveState();
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  resetTimer() {
    if (this.autoStartTimeout) {
      clearTimeout(this.autoStartTimeout);
      this.autoStartTimeout = null;
    }
    this.pauseTimer();
    this.state.sessionType = 'work';
    this.state.timeRemaining = this.getDurationForSession() * 60;
    this.state.targetEndAt = null;
    this.state.sessionStarted = false;
    this.timerDisplay.classList.remove('break');
    this.updateControlsVisibility();
    this.updateDisplay();
    this.saveState();
  }

  completeSession() {
    // Guard against double-completion from syncStateWithClock + tickTimer race
    if (!this.state.isActive && !this.state.sessionStarted) return;
    this.pauseTimer();
    this.playNotification();
    this.showBrowserNotification();

    // Reset counters if day changed while app was open
    this.checkDailyReset();

    const completedType = this.state.sessionType;

    if (completedType === 'work') {
      this.recordPomodoroCompletion();
      this.state.totalWorkSessions += 1;
      this.showCompletionFlash('Work session complete!');

      if (this.state.totalWorkSessions % this.getLongBreakInterval() === 0) {
        this.state.sessionType = 'longBreak';
      } else {
        this.state.sessionType = 'shortBreak';
      }
      const interval = this.getLongBreakInterval();
      this.state.pomodoroCount = (this.state.pomodoroCount % interval) + 1;
    } else {
      this.showCompletionFlash('Break complete! Time to focus.');
      this.state.sessionType = 'work';
    }

    this.state.timeRemaining = this.getDurationForSession() * 60;
    this.state.sessionStarted = false;
    this.timerDisplay.classList.toggle('break', this.state.sessionType !== 'work');
    this.updateControlsVisibility();

    this.updateDisplay();
    this.saveState();

    // Auto-start next session if enabled
    if (this.settings.autoStartBreaks && this.state.sessionType !== 'work') {
      this.autoStartTimeout = setTimeout(() => { this.autoStartTimeout = null; this.startTimer(); }, 1500);
    } else if (this.settings.autoStartWork && this.state.sessionType === 'work') {
      this.autoStartTimeout = setTimeout(() => { this.autoStartTimeout = null; this.startTimer(); }, 1500);
    }
  }

  showCompletionFlash(message) {
    if (this.completionTimeout) {
      clearTimeout(this.completionTimeout);
    }
    this.completionFlash.classList.remove('active', 'fade-out');
    this.completionText.textContent = message;

    // Force reflow to restart animation
    void this.completionFlash.offsetWidth;
    this.completionFlash.classList.add('active');

    this.completionTimeout = setTimeout(() => {
      this.completionFlash.classList.add('fade-out');
      // Remove after fade-out animation completes
      this.completionTimeout = setTimeout(() => {
        this.completionFlash.classList.remove('active', 'fade-out');
        this.completionTimeout = null;
      }, 400);
    }, 1800);
  }

  updateDisplay() {
    const minutes = Math.floor(this.state.timeRemaining / 60);
    const seconds = this.state.timeRemaining % 60;
    this.timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const sessionNames = {
      work: 'Work Session',
      shortBreak: 'Short Break',
      longBreak: 'Long Break'
    };
    this.sessionTypeEl.textContent = sessionNames[this.state.sessionType];

    // Update progress ring
    this.updateProgressRing();

    // Update pomodoro dots
    this.updatePomodoroDots();

    // Update page title
    document.title = `${this.timerEl.textContent} - ${sessionNames[this.state.sessionType]}`;
  }

  updateProgressRing() {
    const totalDuration = this.getDurationForSession() * 60;
    const elapsed = totalDuration - this.state.timeRemaining;
    const progress = totalDuration > 0 ? elapsed / totalDuration : 0;
    const offset = this.ringCircumference * (1 - progress);
    this.progressRing.style.strokeDashoffset = offset;
  }

  updatePomodoroDots() {
    const target = this.getLongBreakInterval();
    const currentPomodoro = this.clampValue(this.state.pomodoroCount, 1, target, 1);
    const dotKey = `${target}-${currentPomodoro}-${this.state.sessionType}`;

    // Skip rebuild if nothing changed
    if (this.lastRenderedDotState === dotKey) return;
    this.lastRenderedDotState = dotKey;

    let html = '';
    for (let i = 1; i <= target; i++) {
      let cls = 'pomodoro-dot';
      if (i < currentPomodoro) {
        cls += ' completed';
      } else if (i === currentPomodoro && this.state.sessionType === 'work') {
        cls += ' current';
      } else if (i === currentPomodoro && this.state.sessionType !== 'work') {
        // Just completed this one, show as completed during break
        cls += ' completed';
      }
      html += `<span class="${cls}" aria-label="Pomodoro ${i}${i < currentPomodoro ? ' completed' : i === currentPomodoro ? ' current' : ''}"></span>`;
    }
    this.pomodoroDotsEl.innerHTML = html;
  }

  updateControlsVisibility() {
    const fullDuration = this.getDurationForSession() * 60;
    const isPausedMidSession = !this.state.isActive && (this.state.timeRemaining < fullDuration || this.state.sessionStarted);

    if (this.state.isActive || isPausedMidSession) {
      this.controlsIdle.style.display = 'none';
      this.controlsActive.style.display = '';
    } else {
      this.controlsIdle.style.display = '';
      this.controlsActive.style.display = 'none';
    }

    // Toggle Pause/Resume button appearance
    this.updatePauseButton();
  }

  updatePauseButton() {
    if (this.state.isActive) {
      this.pauseBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
      this.pauseBtn.setAttribute('aria-label', 'Pause timer');
      this.pauseBtn.className = 'btn btn-icon btn-pause-action';
    } else {
      this.pauseBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      this.pauseBtn.setAttribute('aria-label', 'Resume timer');
      this.pauseBtn.className = 'btn btn-icon btn-resume-action';
    }
  }

  togglePause() {
    if (this.state.isActive) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  }

  reportBackgroundActivity() {
    const active = this.state.isActive;
    if (this.lastReportedBackgroundActivity === active) return;
    this.lastReportedBackgroundActivity = active;

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'app-background-activity',
          appId: 'pomodoro-timer',
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

      if (!this.state.isActive) {
        window.parent.postMessage({
          type: 'app-status',
          appId: 'pomodoro-timer',
          status: { active: false }
        }, '*');
        return;
      }

      const labelMap = { work: 'work', shortBreak: 'short break', longBreak: 'long break' };
      const variant = this.state.sessionType === 'work' ? 'alert' : 'calm';

      window.parent.postMessage({
        type: 'app-status',
        appId: 'pomodoro-timer',
        status: {
          active: true,
          label: labelMap[this.state.sessionType] || 'work',
          timeRemaining: this.state.timeRemaining,
          variant
        }
      }, '*');
    } catch (e) {
      // Ignore postMessage failures.
    }
  }

  getDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatHistoryDate(dateKey) {
    const parsed = new Date(`${dateKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateKey;
    return parsed.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  recordPomodoroCompletion() {
    const today = this.getDateKey();
    if (!this.history[today] || typeof this.history[today] === 'number') {
      // Migrate old count-only format to new format
      const oldCount = (typeof this.history[today] === 'number') ? this.history[today] : 0;
      this.history[today] = {
        count: oldCount,
        timestamps: []
      };
    }
    this.history[today].count += 1;
    this.history[today].timestamps.push(Date.now());
    this.pruneOldHistory();
    this.saveData();
    this.updateHistoryDisplay();
  }

  pruneOldHistory() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const cutoffKey = this.getDateKey(cutoff);
    for (const key of Object.keys(this.history)) {
      if (key < cutoffKey) delete this.history[key];
    }
  }

  getHistoryCount(dateKey) {
    const entry = this.history[dateKey];
    if (!entry) return 0;
    if (typeof entry === 'number') return entry;
    return entry.count || 0;
  }

  getHistoryTimestamps(dateKey) {
    const entry = this.history[dateKey];
    if (!entry || typeof entry === 'number') return [];
    return entry.timestamps || [];
  }

  updateHistoryDisplay() {
    if (!this.historyDateInput || !this.historyCountEl) return;

    const today = this.getDateKey();
    this.historyDateInput.max = today;

    if (!this.historyDateInput.value) {
      this.historyDateInput.value = today;
    }

    const selectedDate = this.historyDateInput.value;
    const completed = this.getHistoryCount(selectedDate);
    this.historyCountEl.textContent = `${completed} pomodoro${completed === 1 ? '' : 's'} completed`;

    // Only show reset button when there are completions to reset
    if (this.resetTodayBtn) {
      this.resetTodayBtn.style.display = completed > 0 ? 'inline-flex' : 'none';
    }

    this.renderHistoryList(selectedDate);
  }

  resetTodayCount() {
    const selectedDate = this.historyDateInput.value || this.getDateKey();
    const count = this.getHistoryCount(selectedDate);
    if (count === 0) return;

    const today = this.getDateKey();
    const label = selectedDate === today ? "today's" : this.formatHistoryDate(selectedDate) + "'s";
    if (!confirm(`Reset ${label} ${count} pomodoro${count === 1 ? '' : 's'}? This cannot be undone.`)) return;

    // Clear the selected date's history
    delete this.history[selectedDate];

    // Reset daily session counters if clearing today
    if (selectedDate === today) {
      this.state.totalWorkSessions = 0;
      this.state.pomodoroCount = 1;
    }

    this.saveData();
    this.updateDisplay();
    this.updateHistoryDisplay();
  }

  renderHistoryList(selectedDate) {
    if (!this.historyListEl) return;

    const allEntries = Object.entries(this.history)
      .sort((a, b) => b[0].localeCompare(a[0]));

    // Ensure selected date is included even if outside the top 30
    const entries = allEntries.slice(0, 30);
    if (selectedDate && this.history[selectedDate] && !entries.some(([d]) => d === selectedDate)) {
      entries.push([selectedDate, this.history[selectedDate]]);
    }

    if (entries.length === 0) {
      this.historyListEl.innerHTML = '<div class="history-empty">No completed pomodoros yet.</div>';
      return;
    }

    this.historyListEl.innerHTML = entries.map(([date, data]) => {
      const count = typeof data === 'number' ? data : data.count || 0;
      return `
      <div class="history-row${date === selectedDate ? ' active' : ''}">
        <span>${this.formatHistoryDate(date)}</span>
        <span>${count}</span>
      </div>`;
    }).join('');
  }

  getAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  playNotification() {
    if (!this.settings.soundEnabled) return;

    // Multi-tone ascending chime using Web Audio API
    try {
      const ctx = this.getAudioContext();
      const tones = [523, 659, 784]; // C5, E5, G5 - major chord

      tones.forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = freq;
        oscillator.type = 'sine';

        const startTime = ctx.currentTime + (i * 0.18);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.04);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.45);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.45);
      });
    } catch (e) {
      // Audio notification not available - fail silently
    }
  }

  maybeRequestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (this.notificationPermissionRequested) return;

    this.notificationPermissionRequested = true;
    Notification.requestPermission().catch(() => {});
  }

  showBrowserNotification() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const sessionNames = {
      work: 'Work session complete! Time for a break.',
      shortBreak: 'Short break over. Ready to focus!',
      longBreak: 'Long break over. Ready to focus!'
    };

    try {
      const notification = new Notification('Pomodoro Timer', {
        body: sessionNames[this.state.sessionType] || 'Session complete',
        tag: 'marlapps-pomodoro'
      });
      setTimeout(() => notification.close(), 10000);
    } catch (e) {}
  }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  new PomodoroTimer();
});
