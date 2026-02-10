class TimerApp {
  constructor() {
    this.data = this.loadData();
    this.alarmCheckInterval = null;
    this.intervalTimerInterval = null;
    this.countdownInterval = null;
    this.ringingAudioContext = null;
    this.ringingOscillator = null;
    this.lastAlarmCheckAt = Date.now();
    this.notificationPermissionRequested = false;
    this.lastCompletedCountdown = 0;
    this.lastRuntimeSaveAt = 0;
    this.wakeLock = null;
    this.appVisible = true;

    // Interval timer runtime state
    this.intervalState = {
      running: false,
      paused: false,
      currentRound: 0,
      phase: 'work', // 'work' or 'rest'
      timeRemaining: 0,
      phaseEndsAt: null
    };

    // Countdown state
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
    this.startAlarmChecker();
    this.renderRecentCountdowns();
    this.restoreRuntimeState();
    this.updateIntervalDisplay();
    this.updateCountdownDisplay();
  }

  // ===== Data Persistence =====

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
              lastTriggered: Number.isFinite(alarm.lastTriggered) ? alarm.lastTriggered : null
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

      const activeTab = ['timer', 'alarm', 'intervals'].includes(parsed.activeTab)
        ? parsed.activeTab
        : defaults.activeTab;

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
        activeTab,
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
      this.intervalStartBtn.disabled = true;
      this.intervalPauseBtn.disabled = false;
      this.intervalDisplay.classList.add('active');
      this.intervalDisplay.classList.toggle('work', this.intervalState.phase === 'work');
      this.intervalDisplay.classList.toggle('rest', this.intervalState.phase === 'rest');
      clearInterval(this.intervalTimerInterval);
      this.tickInterval({ silent: true, persist: false });
      if (this.intervalState.running) {
        this.intervalTimerInterval = setInterval(() => this.tickInterval(), 250);
      }
    } else if (this.intervalState.paused) {
      this.intervalStartBtn.disabled = false;
      this.intervalPauseBtn.disabled = true;
      this.intervalDisplay.classList.remove('active');
      this.intervalDisplay.classList.toggle('work', this.intervalState.phase === 'work');
      this.intervalDisplay.classList.toggle('rest', this.intervalState.phase === 'rest');
    } else {
      this.intervalDisplay.classList.remove('active', 'work', 'rest');
    }

    if (this.countdownState.running) {
      this.countdownStartBtn.disabled = true;
      this.countdownPauseBtn.disabled = false;
      this.countdownRepeatBtn.disabled = true;
      this.countdownDisplay.classList.add('running');
      clearInterval(this.countdownInterval);
      this.tickCountdown({ silent: true, persist: false });
      if (this.countdownState.running) {
        this.countdownInterval = setInterval(() => this.tickCountdown(), 250);
        this.acquireWakeLock();
      }
    } else {
      clearInterval(this.countdownInterval);
      this.countdownPauseBtn.disabled = true;
      this.countdownDisplay.classList.remove('running');
      if (this.countdownState.paused) {
        this.countdownStartBtn.disabled = false;
      } else if (this.countdownDisplay.classList.contains('done')) {
        this.countdownStartBtn.disabled = true;
      } else {
        this.countdownStartBtn.disabled = this.countdownState.totalTime <= 0;
      }
      this.countdownRepeatBtn.disabled = this.lastCompletedCountdown <= 0;
    }

    this.persistRuntimeData(true);
  }

  // ===== Theme =====

  syncThemeWithParent() {
    try {
      const savedTheme = localStorage.getItem('marlapps-theme');
      if (savedTheme) this.applyTheme(savedTheme);
    } catch (e) {}

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

  // ===== DOM Init =====

  initElements() {
    // Tabs
    this.tabs = document.querySelectorAll('.tab');
    this.tabContents = document.querySelectorAll('.tab-content');

    // Alarm
    this.alarmTimeInput = document.getElementById('alarmTime');
    this.alarmLabelInput = document.getElementById('alarmLabel');
    this.addAlarmBtn = document.getElementById('addAlarmBtn');
    this.alarmList = document.getElementById('alarmList');
    this.alarmEmpty = document.getElementById('alarmEmpty');
    this.dayBtns = document.querySelectorAll('.day-btn');
    this.alarmModal = document.getElementById('alarmModal');
    this.alarmModalLabel = document.getElementById('alarmModalLabel');
    this.alarmModalTime = document.getElementById('alarmModalTime');
    this.dismissAlarmBtn = document.getElementById('dismissAlarmBtn');

    // Intervals
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

    // Countdown
    this.countdownDisplay = document.getElementById('countdownDisplay');
    this.countdownRing = document.getElementById('countdownRing');
    this.countdownTimerEl = document.getElementById('countdownTimer');
    this.countdownSubtitle = document.getElementById('countdownSubtitle');
    this.countdownStartBtn = document.getElementById('countdownStartBtn');
    this.countdownPauseBtn = document.getElementById('countdownPauseBtn');
    this.countdownResetBtn = document.getElementById('countdownResetBtn');
    this.countdownAdd60Btn = document.getElementById('countdownAdd60Btn');
    this.countdownAdd300Btn = document.getElementById('countdownAdd300Btn');
    this.countdownRepeatBtn = document.getElementById('countdownRepeatBtn');
    this.customMinutes = document.getElementById('customMinutes');
    this.customSeconds = document.getElementById('customSeconds');
    this.customSetBtn = document.getElementById('customSetBtn');
    this.recentTimerList = document.getElementById('recentTimerList');

    // Set default alarm time to now
    const now = new Date();
    this.alarmTimeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Restore interval settings
    this.intervalWorkInput.value = this.data.intervalSettings.work;
    this.intervalRestInput.value = this.data.intervalSettings.rest;
    this.intervalRoundsInput.value = this.data.intervalSettings.rounds;

    // Restore last-open tab on load
    this.switchTab(this.data.activeTab, { persist: false });
  }

  attachEventListeners() {
    // Tab switching
    this.tabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Alarm
    this.addAlarmBtn.addEventListener('click', () => this.addAlarm());
    this.dayBtns.forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });
    this.dismissAlarmBtn.addEventListener('click', () => this.dismissAlarm());

    // Intervals
    this.intervalStartBtn.addEventListener('click', () => this.startInterval());
    this.intervalPauseBtn.addEventListener('click', () => this.pauseInterval());
    this.intervalResetBtn.addEventListener('click', () => this.resetInterval());

    // Save interval settings on change
    [this.intervalWorkInput, this.intervalRestInput, this.intervalRoundsInput].forEach(input => {
      input.addEventListener('change', () => this.saveIntervalSettings());
    });

    // Countdown
    this.countdownStartBtn.addEventListener('click', () => this.startCountdown());
    this.countdownPauseBtn.addEventListener('click', () => this.pauseCountdown());
    this.countdownResetBtn.addEventListener('click', () => this.resetCountdown());
    this.customSetBtn.addEventListener('click', () => this.setCustomCountdown());
    this.countdownAdd60Btn.addEventListener('click', () => this.addCountdownTime(60));
    this.countdownAdd300Btn.addEventListener('click', () => this.addCountdownTime(300));
    this.countdownRepeatBtn.addEventListener('click', () => this.repeatLastCountdown());
    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    window.addEventListener('pagehide', () => this.persistRuntimeData(true));
    window.addEventListener('beforeunload', () => this.persistRuntimeData(true));

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const seconds = parseInt(btn.dataset.seconds);
        this.setCountdownDuration(seconds);
      });
    });
  }

  // ===== Tab Switching =====

  switchTab(tabId, options = {}) {
    const { persist = true } = options;
    this.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    this.tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `${tabId}-tab`));
    this.data.activeTab = tabId;
    if (persist) this.saveData();
  }

  // ===== Alarm Functions =====

  addAlarm() {
    const time = this.alarmTimeInput.value;
    if (!time) return;

    this.maybeRequestNotificationPermission();

    const selectedDays = [];
    this.dayBtns.forEach(btn => {
      if (btn.classList.contains('active')) {
        selectedDays.push(parseInt(btn.dataset.day));
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

    // Reset form
    this.alarmLabelInput.value = '';
    this.dayBtns.forEach(btn => btn.classList.remove('active'));
  }

  renderAlarms() {
    this.alarmList.innerHTML = '';
    const hasAlarms = this.data.alarms.length > 0;
    this.alarmEmpty.style.display = hasAlarms ? 'none' : 'flex';

    // Sort alarms by time
    const sorted = [...this.data.alarms].sort((a, b) => a.time.localeCompare(b.time));

    sorted.forEach(alarm => {
      const el = document.createElement('div');
      el.className = `alarm-item${alarm.enabled ? '' : ' disabled'}`;

      const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const orderedDays = this.sortDaysMondayFirst(alarm.days);
      const repeatText = alarm.days.length === 0
        ? 'Once'
        : alarm.days.length === 7
          ? 'Every day'
          : orderedDays.map(d => dayNames[d]).join(', ');

      el.innerHTML = `
        <div class="alarm-info">
          <div class="alarm-time">${this.formatAlarmTime(alarm.time)}</div>
          ${alarm.label ? `<div class="alarm-label">${this.escapeHtml(alarm.label)}</div>` : ''}
          <div class="alarm-repeat">${repeatText}</div>
        </div>
        <label class="alarm-toggle">
          <input type="checkbox" ${alarm.enabled ? 'checked' : ''} data-id="${alarm.id}">
          <span class="slider"></span>
        </label>
        <button class="alarm-delete" data-id="${alarm.id}" title="Delete">&times;</button>
      `;

      el.querySelector('.alarm-toggle input').addEventListener('change', (e) => {
        this.toggleAlarm(alarm.id, e.target.checked);
      });

      el.querySelector('.alarm-delete').addEventListener('click', () => {
        this.deleteAlarm(alarm.id);
      });

      this.alarmList.appendChild(el);
    });
  }

  formatAlarmTime(time24) {
    const [h, m] = time24.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return time24;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    const alarm = this.data.alarms.find(a => a.id === id);
    if (alarm) {
      alarm.enabled = enabled;
      if (enabled) alarm.lastTriggered = null;
      this.saveData();
      this.renderAlarms();
    }
  }

  deleteAlarm(id) {
    this.data.alarms = this.data.alarms.filter(a => a.id !== id);
    this.saveData();
    this.renderAlarms();
  }

  startAlarmChecker() {
    // Check alarms every second
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

        // Check day filter
        if (alarm.days.length > 0 && !alarm.days.includes(candidateDay)) continue;

        alarm.lastTriggered = candidateDateStr;
        didChange = true;

        // If non-repeating, disable after trigger
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
    this.alarmModalLabel.textContent = alarm.label || 'Alarm';
    this.alarmModalTime.textContent = this.formatAlarmTime(alarm.time);
    this.alarmModal.classList.add('active');
    this.startRinging();
    this.showNotification(alarm.label ? `Alarm: ${alarm.label}` : 'Alarm', {
      body: `Time: ${this.formatAlarmTime(alarm.time)}`
    });
    this.renderAlarms();
  }

  dismissAlarm() {
    this.alarmModal.classList.remove('active');
    this.stopRinging();
  }

  startRinging() {
    try {
      this.ringingAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.playAlarmBeepSequence();
    } catch (e) {}
  }

  playAlarmBeepSequence() {
    if (!this.ringingAudioContext || this.ringingAudioContext.state === 'closed') return;
    if (!this.alarmModal.classList.contains('active')) return;

    const ctx = this.ringingAudioContext;
    const now = ctx.currentTime;

    // Play a sequence of beeps
    for (let i = 0; i < 3; i++) {
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

    // Repeat after a pause
    this.ringingTimeout = setTimeout(() => this.playAlarmBeepSequence(), 1500);
  }

  stopRinging() {
    clearTimeout(this.ringingTimeout);
    if (this.ringingAudioContext) {
      this.ringingAudioContext.close().catch(() => {});
      this.ringingAudioContext = null;
    }
  }

  // ===== Interval Timer Functions =====

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
  }

  startInterval() {
    const settings = this.data.intervalSettings;
    this.maybeRequestNotificationPermission();
    clearInterval(this.intervalTimerInterval);

    if (this.intervalState.paused) {
      // Resume
      this.intervalState.paused = false;
      this.intervalState.phaseEndsAt = Date.now() + (this.intervalState.timeRemaining * 1000);
    } else {
      // Fresh start
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
    this.intervalStartBtn.disabled = true;
    this.intervalPauseBtn.disabled = false;
    this.intervalDisplay.classList.add('active');
    this.intervalDisplay.classList.toggle('work', this.intervalState.phase === 'work');
    this.intervalDisplay.classList.toggle('rest', this.intervalState.phase === 'rest');

    this.intervalTimerInterval = setInterval(() => this.tickInterval(), 250);
    this.tickInterval();
    this.persistRuntimeData(true);
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
        // Switch to rest
        this.intervalState.phase = 'rest';
        this.intervalState.phaseEndsAt += this.data.intervalSettings.rest * 1000;
        this.intervalDisplay.classList.remove('work');
        this.intervalDisplay.classList.add('rest');
      } else {
        // Rest done, next round or finish
        if (this.intervalState.currentRound >= this.data.intervalSettings.rounds) {
          // All rounds done
          if (!silent) {
            this.playBeep(1046, 0.5);
            this.showNotification('Interval timer complete', {
              body: `${this.data.intervalSettings.rounds} rounds finished.`
            });
          }
          this.resetInterval({ persist });
          return;
        }
        this.intervalState.currentRound++;
        this.intervalState.phase = 'work';
        this.intervalState.phaseEndsAt += this.data.intervalSettings.work * 1000;
        this.intervalDisplay.classList.remove('rest');
        this.intervalDisplay.classList.add('work');
      }

      now = Date.now();
    }

    this.intervalState.timeRemaining = Math.max(
      0,
      Math.ceil((this.intervalState.phaseEndsAt - now) / 1000)
    );

    this.updateIntervalDisplay();
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
    this.intervalStartBtn.disabled = false;
    this.intervalPauseBtn.disabled = true;
    this.intervalDisplay.classList.remove('active');
    clearInterval(this.intervalTimerInterval);
    this.persistRuntimeData(true);
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
    this.intervalStartBtn.disabled = false;
    this.intervalPauseBtn.disabled = true;
    this.intervalDisplay.classList.remove('active', 'work', 'rest');
    this.updateIntervalDisplay();
    if (persist) this.persistRuntimeData(true);
  }

  updateIntervalDisplay() {
    const s = this.intervalState;
    this.intervalTimer.textContent = this.formatTime(s.timeRemaining);
    this.intervalProgressEl.textContent = s.currentRound > 0
      ? `Round ${s.currentRound} / ${this.data.intervalSettings.rounds}`
      : `${this.data.intervalSettings.rounds} rounds`;

    if (s.running || s.paused) {
      this.intervalPhase.textContent = s.phase === 'work' ? 'Work' : 'Rest';
    } else {
      this.intervalPhase.textContent = 'Ready';
    }

    // Update title when intervals tab is active
    if (this.data.activeTab === 'intervals' && s.running) {
      document.title = `${this.formatTime(s.timeRemaining)} ${s.phase === 'work' ? 'Work' : 'Rest'} - Timer`;
    }
  }

  // ===== Countdown Timer Functions =====

  setCustomCountdown() {
    const mins = parseInt(this.customMinutes.value) || 0;
    const secs = parseInt(this.customSeconds.value) || 0;
    const total = mins * 60 + secs;
    if (total <= 0) return;

    this.setCountdownDuration(total);
  }

  setCountdownDuration(totalSeconds) {
    this.countdownState.timeRemaining = totalSeconds;
    this.countdownState.totalTime = totalSeconds;
    this.countdownState.running = false;
    this.countdownState.paused = false;
    this.countdownState.endAt = null;
    this.countdownStartBtn.disabled = false;
    this.countdownPauseBtn.disabled = true;
    this.countdownRepeatBtn.disabled = this.lastCompletedCountdown <= 0;
    clearInterval(this.countdownInterval);
    this.releaseWakeLock();
    this.countdownDisplay.classList.remove('running', 'done');
    this.addRecentCountdown(totalSeconds);
    this.updateCountdownDisplay();
    this.persistRuntimeData(true);
  }

  addRecentCountdown(seconds) {
    const normalized = Math.max(1, Math.floor(seconds));
    const withoutDupes = this.data.recentCountdowns.filter(s => s !== normalized);
    this.data.recentCountdowns = [normalized, ...withoutDupes].slice(0, 8);
    this.saveData();
    this.renderRecentCountdowns();
  }

  renderRecentCountdowns() {
    if (!this.recentTimerList) return;
    this.recentTimerList.innerHTML = '';

    if (!this.data.recentCountdowns || this.data.recentCountdowns.length === 0) {
      this.recentTimerList.textContent = 'No recent timers yet';
      return;
    }

    this.data.recentCountdowns.forEach(seconds => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-btn';
      btn.textContent = this.formatShortDuration(seconds);
      btn.addEventListener('click', () => this.setCountdownDuration(seconds));
      this.recentTimerList.appendChild(btn);
    });
  }

  formatShortDuration(totalSeconds) {
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
  }

  addCountdownTime(seconds) {
    if (seconds <= 0) return;

    this.countdownState.timeRemaining += seconds;
    this.countdownState.totalTime += seconds;

    if (this.countdownState.running && this.countdownState.endAt) {
      this.countdownState.endAt += seconds * 1000;
    }

    this.updateCountdownDisplay();
    if (!this.countdownState.running) {
      this.countdownStartBtn.disabled = false;
    }
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
    this.countdownStartBtn.disabled = true;
    this.countdownPauseBtn.disabled = false;
    this.countdownRepeatBtn.disabled = true;
    this.countdownDisplay.classList.add('running');
    this.countdownDisplay.classList.remove('done');

    clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(() => this.tickCountdown(), 250);
    this.acquireWakeLock();
    this.tickCountdown();
    this.persistRuntimeData(true);
  }

  tickCountdown(options = {}) {
    const { silent = false, persist = true } = options;
    if (!this.countdownState.running || !this.countdownState.endAt) return;
    this.countdownState.timeRemaining = Math.max(
      0,
      Math.ceil((this.countdownState.endAt - Date.now()) / 1000)
    );
    this.updateCountdownDisplay();

    // Update title when timer tab is active
    if (this.data.activeTab === 'timer') {
      document.title = `${this.formatTime(this.countdownState.timeRemaining)} - Timer`;
    }
    if (persist) this.persistRuntimeData();

    if (this.countdownState.timeRemaining <= 0) {
      clearInterval(this.countdownInterval);
      this.countdownState.running = false;
      this.countdownState.endAt = null;
      this.lastCompletedCountdown = this.countdownState.totalTime;
      this.countdownStartBtn.disabled = true;
      this.countdownPauseBtn.disabled = true;
      this.countdownRepeatBtn.disabled = false;
      this.countdownDisplay.classList.remove('running');
      this.countdownDisplay.classList.add('done');
      if (!silent) {
        this.playBeep(880, 0.3);
        setTimeout(() => this.playBeep(1046, 0.4), 400);
        this.vibrate([200, 120, 240]);
        this.showNotification('Countdown finished', {
          body: 'Your timer has reached zero.'
        });
      }
      this.releaseWakeLock();
      document.title = 'Timer - MarlApps';
      if (persist) this.persistRuntimeData(true);
    }
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
    this.countdownStartBtn.disabled = false;
    this.countdownPauseBtn.disabled = true;
    this.countdownRepeatBtn.disabled = this.lastCompletedCountdown <= 0;
    this.countdownDisplay.classList.remove('running');
    clearInterval(this.countdownInterval);
    this.releaseWakeLock();
    this.updateCountdownDisplay();
    this.persistRuntimeData(true);
  }

  resetCountdown() {
    clearInterval(this.countdownInterval);
    this.countdownState.timeRemaining = this.countdownState.totalTime;
    this.countdownState.running = false;
    this.countdownState.paused = false;
    this.countdownState.endAt = null;
    this.countdownStartBtn.disabled = this.countdownState.totalTime <= 0;
    this.countdownPauseBtn.disabled = true;
    this.countdownRepeatBtn.disabled = this.lastCompletedCountdown <= 0;
    this.countdownDisplay.classList.remove('running', 'done');
    this.releaseWakeLock();
    this.updateCountdownDisplay();
    document.title = 'Timer - MarlApps';
    this.persistRuntimeData(true);
  }

  updateCountdownDisplay() {
    this.countdownTimerEl.textContent = this.formatTime(this.countdownState.timeRemaining);
    const total = Math.max(1, this.countdownState.totalTime);
    const elapsed = Math.max(0, total - this.countdownState.timeRemaining);
    const progress = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
    if (this.countdownRing) {
      this.countdownRing.style.setProperty('--countdown-progress', `${progress}%`);
    }

    if (this.countdownSubtitle) {
      if (this.countdownState.running) {
        this.countdownSubtitle.textContent = `Running - ${progress}% complete`;
      } else if (this.countdownDisplay.classList.contains('done')) {
        this.countdownSubtitle.textContent = 'Finished';
      } else if (this.countdownState.timeRemaining > 0) {
        this.countdownSubtitle.textContent = 'Ready';
      } else {
        this.countdownSubtitle.textContent = 'Set a timer';
      }
    }
  }

  // ===== Shared Helpers =====

  formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  playBeep(freq = 800, duration = 0.2) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
      setTimeout(() => ctx.close().catch(() => {}), (duration + 0.1) * 1000);
    } catch (e) {}
  }

  vibrate(pattern) {
    if (!('vibrate' in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
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
    } catch (e) {}
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
    } catch (e) {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TimerApp();
});
