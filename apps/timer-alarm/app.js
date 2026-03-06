class AlarmTimerApp {
  constructor() {
    this.storageKey = 'marlapps-timer-alarm';
    this.notificationTag = 'marlapps-timer-alarm';
    this.appId = 'timer-alarm';
    this.alarmCheckInterval = null;
    this.ringingAudioContext = null;
    this.ringingTimeout = null;
    this.notificationPermissionRequested = false;
    this.lastAlarmCheckAt = Date.now();
    this.alarmFreshnessWindowMs = 90 * 1000;
    this.activeModal = null;
    this.lastFocusedElementByModal = {};
    this.lastReportedBackgroundActivity = null;
    this.data = this.loadData();

    this.initElements();
    this.attachEventListeners();
    this.syncThemeWithParent();
    this.renderAlarms();
    this.updateHeroDisplay();
    this.startAlarmChecker();
    this.reportBackgroundActivity();
    this.reportStatus();
  }

  loadData() {
    const defaults = { alarms: [] };
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return defaults;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaults;
      }

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
                  .map((day) => Number.parseInt(day, 10))
                  .filter((day) => day >= 0 && day <= 6)
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

      return { alarms };
    } catch {
      return defaults;
    }
  }

  saveData() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
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
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  initElements() {
    this.heroRing = document.getElementById('heroRing');
    this.heroLabel = document.getElementById('heroLabel');
    this.heroValue = document.getElementById('heroValue');
    this.openAlarmComposerBtn = document.getElementById('openAlarmComposerBtn');
    this.alarmList = document.getElementById('alarmList');
    this.alarmEmpty = document.getElementById('alarmEmpty');

    this.alarmComposerBackdrop = document.getElementById('alarmComposerBackdrop');
    this.alarmComposerPanel = document.getElementById('alarmComposerPanel');
    this.alarmComposerClose = document.getElementById('alarmComposerClose');
    this.alarmTimeInput = document.getElementById('alarmTime');
    this.alarmLabelInput = document.getElementById('alarmLabel');
    this.addAlarmBtn = document.getElementById('addAlarmBtn');
    this.dayBtns = document.querySelectorAll('.day-btn');

    this.alarmModal = document.getElementById('alarmModal');
    this.alarmModalPanel = document.getElementById('alarmModalPanel');
    this.alarmModalLabel = document.getElementById('alarmModalLabel');
    this.alarmModalTime = document.getElementById('alarmModalTime');
    this.dismissAlarmBtn = document.getElementById('dismissAlarmBtn');

    const now = new Date();
    this.alarmTimeInput.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  attachEventListeners() {
    this.openAlarmComposerBtn.addEventListener('click', () => this.openComposer());
    this.alarmComposerClose.addEventListener('click', () => this.closeModal('composer'));
    this.alarmComposerBackdrop.addEventListener('click', (event) => {
      if (event.target === this.alarmComposerBackdrop) this.closeModal('composer');
    });

    this.addAlarmBtn.addEventListener('click', () => this.addAlarm());
    this.dayBtns.forEach((button) => {
      button.addEventListener('click', () => button.classList.toggle('active'));
    });

    this.alarmTimeInput.addEventListener('input', () => {
      this.alarmTimeInput.setCustomValidity('');
    });
    this.alarmTimeInput.addEventListener('blur', () => {
      const normalized = this.normalizeAlarmTimeInput(this.alarmTimeInput.value);
      if (normalized) this.alarmTimeInput.value = normalized;
    });
    [this.alarmTimeInput, this.alarmLabelInput].forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.addAlarm();
        }
      });
    });

    this.dismissAlarmBtn.addEventListener('click', () => this.dismissAlarm());
    this.alarmModal.addEventListener('click', (event) => {
      if (event.target === this.alarmModal) this.dismissAlarm();
    });

    document.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('beforeunload', () => this.stopRinging());
  }

  handleKeyDown(event) {
    const topModal = this.getTopOpenModal();
    if (!topModal) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (topModal === 'alarm') {
        this.dismissAlarm();
      } else {
        this.closeModal('composer');
      }
      return;
    }

    if (event.key === 'Tab') {
      this.trapFocus(event, topModal === 'alarm' ? this.alarmModalPanel : this.alarmComposerPanel);
    }
  }

  openComposer() {
    this.lastFocusedElementByModal.composer = this.getRestorableFocusedElement();
    this.alarmComposerBackdrop.classList.add('active');
    this.alarmComposerBackdrop.setAttribute('aria-hidden', 'false');
    this.activeModal = 'composer';

    window.setTimeout(() => this.alarmTimeInput.focus(), 50);
  }

  closeModal(name, { restoreFocus = true } = {}) {
    if (name !== 'composer') return;
    if (!this.alarmComposerBackdrop.classList.contains('active')) return;

    this.alarmComposerBackdrop.classList.remove('active');
    this.alarmComposerBackdrop.setAttribute('aria-hidden', 'true');
    this.activeModal = null;

    if (restoreFocus) this.restoreFocus('composer');
  }

  getTopOpenModal() {
    if (this.alarmModal.classList.contains('active')) return 'alarm';
    if (this.activeModal === 'composer' && this.alarmComposerBackdrop.classList.contains('active')) return 'composer';
    return null;
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
    this.dayBtns.forEach((button) => {
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
    this.updateHeroDisplay();

    this.alarmLabelInput.value = '';
    this.dayBtns.forEach((button) => button.classList.remove('active'));
    this.closeModal('composer', { restoreFocus: false });
    window.setTimeout(() => this.openAlarmComposerBtn.focus(), 50);
  }

  renderAlarms() {
    this.alarmList.innerHTML = '';
    const hasAlarms = this.data.alarms.length > 0;
    this.alarmEmpty.style.display = hasAlarms ? 'none' : 'flex';

    const sorted = [...this.data.alarms].sort((a, b) => a.time.localeCompare(b.time));
    sorted.forEach((alarm) => {
      const element = document.createElement('div');
      element.className = `alarm-item${alarm.enabled ? '' : ' disabled'}`;

      const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
      const orderedDays = this.sortDaysMondayFirst(alarm.days);
      const repeatText = alarm.days.length === 0
        ? 'Once'
        : alarm.days.length === 7
          ? 'Every day'
          : orderedDays.map((day) => dayNames[day]).join(', ');

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

  updateHeroDisplay() {
    const nextAlarm = this.findNextAlarm();
    this.heroRing.classList.toggle('has-alarm', Boolean(nextAlarm));
    this.heroLabel.textContent = nextAlarm ? 'Next' : 'Alarm';
    this.heroValue.textContent = nextAlarm ? this.formatAlarmTime(nextAlarm.time) : '--:--';
    this.updateDocumentTitle(nextAlarm);
  }

  findNextAlarm() {
    const now = new Date();
    const enabledAlarms = this.data.alarms.filter((alarm) => alarm.enabled);
    if (enabledAlarms.length === 0) return null;

    let best = null;

    enabledAlarms.forEach((alarm) => {
      const timestamp = this.getNextOccurrenceTimestamp(alarm, now);
      if (!Number.isFinite(timestamp)) return;

      if (!best || timestamp < best.timestamp) {
        best = {
          alarm,
          timestamp,
          time: alarm.time
        };
      }
    });

    return best;
  }

  getNextOccurrenceTimestamp(alarm, fromDate) {
    const [hours, minutes] = alarm.time.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

    if (!Array.isArray(alarm.days) || alarm.days.length === 0) {
      const candidate = new Date(fromDate);
      candidate.setHours(hours, minutes, 0, 0);
      if (candidate.getTime() <= fromDate.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
      }
      return candidate.getTime();
    }

    let best = null;
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = new Date(fromDate);
      candidate.setDate(candidate.getDate() + offset);
      candidate.setHours(hours, minutes, 0, 0);
      if (!alarm.days.includes(candidate.getDay())) continue;
      if (candidate.getTime() <= fromDate.getTime()) continue;
      if (best === null || candidate.getTime() < best) {
        best = candidate.getTime();
      }
    }

    if (best !== null) return best;

    const fallback = new Date(fromDate);
    fallback.setDate(fallback.getDate() + 7);
    fallback.setHours(hours, minutes, 0, 0);
    return fallback.getTime();
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
    return mondayFirstOrder.filter((day) => days.includes(day));
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  toggleAlarm(id, enabled) {
    const alarm = this.data.alarms.find((item) => item.id === id);
    if (!alarm) return;

    alarm.enabled = enabled;
    if (enabled) alarm.lastTriggered = null;
    this.saveData();
    this.renderAlarms();
    this.updateHeroDisplay();
  }

  deleteAlarm(id) {
    this.data.alarms = this.data.alarms.filter((alarm) => alarm.id !== id);
    this.saveData();
    this.renderAlarms();
    this.updateHeroDisplay();
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

    this.data.alarms.forEach((alarm) => {
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

    if (didChange) {
      this.saveData();
      this.renderAlarms();
      this.updateHeroDisplay();
    }
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
    } catch (error) {
      // Ignore audio initialization failures.
    }
  }

  playAlarmBeepSequence() {
    if (!this.ringingAudioContext || this.ringingAudioContext.state === 'closed') return;
    if (!this.alarmModal.classList.contains('active')) return;

    const ctx = this.ringingAudioContext;
    const now = ctx.currentTime;

    for (let index = 0; index < 3; index += 1) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, now + index * 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.3 + 0.15);
      osc.start(now + index * 0.3);
      osc.stop(now + index * 0.3 + 0.15);
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

  reportBackgroundActivity() {
    if (this.lastReportedBackgroundActivity === false) return;
    this.lastReportedBackgroundActivity = false;

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'app-background-activity',
          appId: this.appId,
          active: false
        }, '*');
      }
    } catch (error) {
      // Ignore postMessage failures.
    }
  }

  reportStatus() {
    try {
      if (!window.parent || window.parent === window) return;
      window.parent.postMessage({
        type: 'app-status',
        appId: this.appId,
        status: { active: false }
      }, '*');
    } catch (error) {
      // Ignore postMessage failures.
    }
  }

  updateDocumentTitle(nextAlarm = this.findNextAlarm()) {
    if (nextAlarm) {
      document.title = `${this.formatAlarmTime(nextAlarm.time)} - Timer - Alarm`;
      return;
    }

    document.title = 'Timer - Alarm - MarlApps';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AlarmTimerApp();
});
