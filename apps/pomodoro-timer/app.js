// Pomodoro Timer App with localStorage persistence

class PomodoroTimer {
  constructor() {
    this.migrateStorage();
    this.settings = this.loadSettings();
    this.state = this.loadState();
    this.timerInterval = null;
    this.notificationPermissionRequested = false;

    this.initElements();
    this.attachEventListeners();
    this.updateDisplay();
    this.updateSettingsDisplay();
    this.syncThemeWithParent();

    // Auto-resume if timer was active
    if (this.state.isActive) {
      this.startTimer();
    }
  }

  initElements() {
    this.timerEl = document.getElementById('timer');
    this.sessionTypeEl = document.getElementById('sessionType');
    this.pomodoroCountEl = document.getElementById('pomodoroCount');
    this.startBtn = document.getElementById('startBtn');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.settingsToggle = document.getElementById('settingsToggle');
    this.settingsPanel = document.getElementById('settingsPanel');
    this.saveSettingsBtn = document.getElementById('saveSettings');
    this.timerDisplay = document.querySelector('.timer-display');
  }

  attachEventListeners() {
    this.startBtn.addEventListener('click', () => this.startTimer());
    this.pauseBtn.addEventListener('click', () => this.pauseTimer());
    this.resetBtn.addEventListener('click', () => this.resetTimer());
    this.settingsToggle.addEventListener('click', () => this.toggleSettings());
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

    // Listen for theme changes from parent
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        this.applyTheme(event.data.theme);
      }
    });
  }

  syncThemeWithParent() {
    // Try to get theme from parent window or localStorage
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
      if (oldSettings) merged.settings = JSON.parse(oldSettings);
      if (oldState) merged.state = JSON.parse(oldState);
      localStorage.setItem('marlapps-pomodoro-timer', JSON.stringify(merged));
      localStorage.removeItem('pomodoroSettings');
      localStorage.removeItem('pomodoroState');
    }
  }

  loadData() {
    const saved = localStorage.getItem('marlapps-pomodoro-timer');
    return saved ? JSON.parse(saved) : {};
  }

  loadSettings() {
    const defaultSettings = {
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      autoStartBreaks: false,
      soundEnabled: true
    };

    const data = this.loadData();
    return data.settings ? { ...defaultSettings, ...data.settings } : defaultSettings;
  }

  loadState() {
    const defaultState = {
      timeRemaining: 25 * 60,
      sessionType: 'work',
      pomodoroCount: 1,
      isActive: false,
      lastUpdated: Date.now(),
      targetEndAt: null
    };

    const data = this.loadData();
    if (!data.state) return defaultState;

    const state = data.state;

    if (state.isActive && typeof state.targetEndAt === 'number') {
      state.timeRemaining = Math.max(0, Math.ceil((state.targetEndAt - Date.now()) / 1000));
    } else if (state.isActive) {
      const elapsed = Math.floor((Date.now() - state.lastUpdated) / 1000);
      state.timeRemaining = Math.max(0, state.timeRemaining - elapsed);
    }

    return { ...defaultState, ...state };
  }

  saveData() {
    const data = { settings: this.settings, state: this.state };
    localStorage.setItem('marlapps-pomodoro-timer', JSON.stringify(data));
  }

  saveSettings() {
    this.settings = {
      workDuration: parseInt(document.getElementById('workDuration').value),
      shortBreakDuration: parseInt(document.getElementById('shortBreakDuration').value),
      longBreakDuration: parseInt(document.getElementById('longBreakDuration').value),
      autoStartBreaks: document.getElementById('autoStartBreaks').checked,
      soundEnabled: document.getElementById('soundEnabled').checked
    };

    this.saveData();
    this.toggleSettings();

    if (!this.state.isActive && this.state.timeRemaining === this.getDurationForSession() * 60) {
      this.resetTimer();
    }
  }

  saveState() {
    this.state.lastUpdated = Date.now();
    this.saveData();
  }

  updateSettingsDisplay() {
    document.getElementById('workDuration').value = this.settings.workDuration;
    document.getElementById('shortBreakDuration').value = this.settings.shortBreakDuration;
    document.getElementById('longBreakDuration').value = this.settings.longBreakDuration;
    document.getElementById('autoStartBreaks').checked = this.settings.autoStartBreaks;
    document.getElementById('soundEnabled').checked = this.settings.soundEnabled;
  }

  toggleSettings() {
    this.settingsPanel.classList.toggle('active');
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

  startTimer() {
    this.maybeRequestNotificationPermission();
    this.state.isActive = true;
    if (!this.state.targetEndAt) {
      this.state.targetEndAt = Date.now() + (this.state.timeRemaining * 1000);
    }
    this.startBtn.disabled = true;
    this.pauseBtn.disabled = false;
    this.timerDisplay.classList.add('active');

    if (this.state.sessionType !== 'work') {
      this.timerDisplay.classList.add('break');
    }

    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.tickTimer(), 1000);
    this.tickTimer();

    this.saveState();
  }

  tickTimer() {
    if (!this.state.isActive || !this.state.targetEndAt) return;

    this.state.timeRemaining = Math.max(0, Math.ceil((this.state.targetEndAt - Date.now()) / 1000));
    this.updateDisplay();
    this.saveState();

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
    this.startBtn.disabled = false;
    this.pauseBtn.disabled = true;
    this.timerDisplay.classList.remove('active');

    clearInterval(this.timerInterval);
    this.saveState();
  }

  resetTimer() {
    this.pauseTimer();
    this.state.timeRemaining = this.getDurationForSession() * 60;
    this.state.targetEndAt = null;
    this.updateDisplay();
    this.saveState();
  }

  completeSession() {
    this.pauseTimer();
    this.showBrowserNotification();
    this.playNotification();

    if (this.state.sessionType === 'work') {
      // Work session completed
      if (this.state.pomodoroCount % 4 === 0) {
        this.state.sessionType = 'longBreak';
      } else {
        this.state.sessionType = 'shortBreak';
      }
      this.state.pomodoroCount++;
    } else {
      // Break completed, back to work
      this.state.sessionType = 'work';
    }

    this.state.timeRemaining = this.getDurationForSession() * 60;
    this.timerDisplay.classList.remove('break');

    if (this.state.sessionType !== 'work') {
      this.timerDisplay.classList.add('break');
    }

    this.updateDisplay();
    this.saveState();

    // Auto-start break if enabled
    if (this.settings.autoStartBreaks && this.state.sessionType !== 'work') {
      setTimeout(() => this.startTimer(), 1000);
    }
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

    // Show current pomodoro cycle (1-4)
    const currentCycle = ((this.state.pomodoroCount - 1) % 4) + 1;
    this.pomodoroCountEl.textContent = `Pomodoro ${currentCycle} of 4`;

    // Update page title
    document.title = `${this.timerEl.textContent} - ${sessionNames[this.state.sessionType]}`;
  }

  playNotification() {
    if (!this.settings.soundEnabled) return;

    // Create a simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);

      // Clean up AudioContext after sound plays
      setTimeout(() => {
        audioContext.close().catch(() => {});
      }, 600);
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
      work: 'Work session complete',
      shortBreak: 'Short break complete',
      longBreak: 'Long break complete'
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
