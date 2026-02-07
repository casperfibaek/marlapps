class TimerApp {
  constructor() {
    this.data = this.loadData();
    this.alarmCheckInterval = null;
    this.intervalTimerInterval = null;
    this.countdownInterval = null;
    this.ringingAudioContext = null;
    this.ringingOscillator = null;

    // Interval timer state (not persisted while running — too fast)
    this.intervalState = {
      running: false,
      paused: false,
      currentRound: 0,
      phase: 'work', // 'work' or 'rest'
      timeRemaining: 0
    };

    // Countdown state
    this.countdownState = {
      running: false,
      paused: false,
      timeRemaining: 0,
      totalTime: 0
    };

    this.initElements();
    this.attachEventListeners();
    this.syncThemeWithParent();
    this.renderAlarms();
    this.startAlarmChecker();
    this.updateIntervalDisplay();
    this.updateCountdownDisplay();
  }

  // ===== Data Persistence =====

  loadData() {
    const saved = localStorage.getItem('marlapps-timer');
    const defaults = {
      alarms: [],
      intervalSettings: { work: 30, rest: 10, rounds: 8 },
      activeTab: 'alarm'
    };
    if (!saved) return defaults;
    const parsed = JSON.parse(saved);
    return { ...defaults, ...parsed };
  }

  saveData() {
    localStorage.setItem('marlapps-timer', JSON.stringify(this.data));
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
    this.countdownTimerEl = document.getElementById('countdownTimer');
    this.countdownStartBtn = document.getElementById('countdownStartBtn');
    this.countdownPauseBtn = document.getElementById('countdownPauseBtn');
    this.countdownResetBtn = document.getElementById('countdownResetBtn');
    this.customMinutes = document.getElementById('customMinutes');
    this.customSeconds = document.getElementById('customSeconds');
    this.customSetBtn = document.getElementById('customSetBtn');

    // Set default alarm time to now
    const now = new Date();
    this.alarmTimeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Restore interval settings
    this.intervalWorkInput.value = this.data.intervalSettings.work;
    this.intervalRestInput.value = this.data.intervalSettings.rest;
    this.intervalRoundsInput.value = this.data.intervalSettings.rounds;

    // Restore active tab
    if (this.data.activeTab) {
      this.switchTab(this.data.activeTab);
    }
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

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const seconds = parseInt(btn.dataset.seconds);
        this.countdownState.timeRemaining = seconds;
        this.countdownState.totalTime = seconds;
        this.countdownState.running = false;
        this.countdownState.paused = false;
        this.countdownStartBtn.disabled = false;
        this.countdownPauseBtn.disabled = true;
        clearInterval(this.countdownInterval);
        this.countdownDisplay.classList.remove('running', 'done');
        this.updateCountdownDisplay();
      });
    });
  }

  // ===== Tab Switching =====

  switchTab(tabId) {
    this.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    this.tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `${tabId}-tab`));
    this.data.activeTab = tabId;
    this.saveData();
  }

  // ===== Alarm Functions =====

  addAlarm() {
    const time = this.alarmTimeInput.value;
    if (!time) return;

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
      const repeatText = alarm.days.length === 0
        ? 'Once'
        : alarm.days.length === 7
          ? 'Every day'
          : alarm.days.map(d => dayNames[d]).join(', ');

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
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
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
    this.alarmCheckInterval = setInterval(() => this.checkAlarms(), 1000);
  }

  checkAlarms() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay();
    const todayStr = now.toDateString();

    this.data.alarms.forEach(alarm => {
      if (!alarm.enabled) return;
      if (alarm.time !== currentTime) return;
      if (alarm.lastTriggered === todayStr) return;

      // Check day filter
      if (alarm.days.length > 0 && !alarm.days.includes(currentDay)) return;

      // Trigger alarm
      alarm.lastTriggered = todayStr;

      // If non-repeating, disable after trigger
      if (alarm.days.length === 0) {
        alarm.enabled = false;
      }

      this.saveData();
      this.triggerAlarm(alarm);
    });
  }

  triggerAlarm(alarm) {
    this.alarmModalLabel.textContent = alarm.label || 'Alarm';
    this.alarmModalTime.textContent = this.formatAlarmTime(alarm.time);
    this.alarmModal.classList.add('active');
    this.startRinging();
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
    this.data.intervalSettings = {
      work: Math.max(1, parseInt(this.intervalWorkInput.value) || 30),
      rest: Math.max(1, parseInt(this.intervalRestInput.value) || 10),
      rounds: Math.max(1, parseInt(this.intervalRoundsInput.value) || 8)
    };
    this.saveData();
  }

  startInterval() {
    const settings = this.data.intervalSettings;

    if (this.intervalState.paused) {
      // Resume
      this.intervalState.paused = false;
    } else {
      // Fresh start
      this.intervalState = {
        running: true,
        paused: false,
        currentRound: 1,
        phase: 'work',
        timeRemaining: settings.work
      };
    }

    this.intervalState.running = true;
    this.intervalStartBtn.disabled = true;
    this.intervalPauseBtn.disabled = false;
    this.intervalDisplay.classList.add('active', 'work');
    this.intervalDisplay.classList.remove('rest');

    this.intervalTimerInterval = setInterval(() => this.tickInterval(), 1000);
    this.updateIntervalDisplay();
  }

  tickInterval() {
    this.intervalState.timeRemaining--;

    if (this.intervalState.timeRemaining <= 0) {
      this.playBeep(this.intervalState.phase === 'work' ? 660 : 880);

      if (this.intervalState.phase === 'work') {
        // Switch to rest
        this.intervalState.phase = 'rest';
        this.intervalState.timeRemaining = this.data.intervalSettings.rest;
        this.intervalDisplay.classList.remove('work');
        this.intervalDisplay.classList.add('rest');
      } else {
        // Rest done, next round or finish
        if (this.intervalState.currentRound >= this.data.intervalSettings.rounds) {
          // All rounds done
          this.playBeep(1046, 0.5);
          this.resetInterval();
          return;
        }
        this.intervalState.currentRound++;
        this.intervalState.phase = 'work';
        this.intervalState.timeRemaining = this.data.intervalSettings.work;
        this.intervalDisplay.classList.remove('rest');
        this.intervalDisplay.classList.add('work');
      }
    }

    this.updateIntervalDisplay();
  }

  pauseInterval() {
    this.intervalState.running = false;
    this.intervalState.paused = true;
    this.intervalStartBtn.disabled = false;
    this.intervalPauseBtn.disabled = true;
    this.intervalDisplay.classList.remove('active');
    clearInterval(this.intervalTimerInterval);
  }

  resetInterval() {
    clearInterval(this.intervalTimerInterval);
    this.intervalState = {
      running: false,
      paused: false,
      currentRound: 0,
      phase: 'work',
      timeRemaining: 0
    };
    this.intervalStartBtn.disabled = false;
    this.intervalPauseBtn.disabled = true;
    this.intervalDisplay.classList.remove('active', 'work', 'rest');
    this.updateIntervalDisplay();
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

    this.countdownState.timeRemaining = total;
    this.countdownState.totalTime = total;
    this.countdownState.running = false;
    this.countdownState.paused = false;
    this.countdownStartBtn.disabled = false;
    this.countdownPauseBtn.disabled = true;
    clearInterval(this.countdownInterval);
    this.countdownDisplay.classList.remove('running', 'done');
    this.updateCountdownDisplay();
  }

  startCountdown() {
    if (this.countdownState.timeRemaining <= 0 && !this.countdownState.paused) return;

    this.countdownState.running = true;
    this.countdownState.paused = false;
    this.countdownStartBtn.disabled = true;
    this.countdownPauseBtn.disabled = false;
    this.countdownDisplay.classList.add('running');
    this.countdownDisplay.classList.remove('done');

    this.countdownInterval = setInterval(() => this.tickCountdown(), 1000);
  }

  tickCountdown() {
    this.countdownState.timeRemaining--;
    this.updateCountdownDisplay();

    // Update title when timer tab is active
    if (this.data.activeTab === 'timer') {
      document.title = `${this.formatTime(this.countdownState.timeRemaining)} - Timer`;
    }

    if (this.countdownState.timeRemaining <= 0) {
      clearInterval(this.countdownInterval);
      this.countdownState.running = false;
      this.countdownStartBtn.disabled = true;
      this.countdownPauseBtn.disabled = true;
      this.countdownDisplay.classList.remove('running');
      this.countdownDisplay.classList.add('done');
      this.playBeep(880, 0.3);
      setTimeout(() => this.playBeep(1046, 0.4), 400);
      document.title = 'Timer - MarlApps';
    }
  }

  pauseCountdown() {
    this.countdownState.running = false;
    this.countdownState.paused = true;
    this.countdownStartBtn.disabled = false;
    this.countdownPauseBtn.disabled = true;
    this.countdownDisplay.classList.remove('running');
    clearInterval(this.countdownInterval);
  }

  resetCountdown() {
    clearInterval(this.countdownInterval);
    this.countdownState.timeRemaining = this.countdownState.totalTime;
    this.countdownState.running = false;
    this.countdownState.paused = false;
    this.countdownStartBtn.disabled = this.countdownState.totalTime <= 0;
    this.countdownPauseBtn.disabled = true;
    this.countdownDisplay.classList.remove('running', 'done');
    this.updateCountdownDisplay();
    document.title = 'Timer - MarlApps';
  }

  updateCountdownDisplay() {
    this.countdownTimerEl.textContent = this.formatTime(this.countdownState.timeRemaining);
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
}

document.addEventListener('DOMContentLoaded', () => {
  new TimerApp();
});
