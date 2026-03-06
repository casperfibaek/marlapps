class BreathingApp {
  constructor() {
    this.storageKey = 'marlapps-breathing';
    this.tickInterval = null;
    this.tickIntervalMs = 250;
    this.lastFocusedElement = null;

    this.techniques = {
      box: {
        inhale: 4,
        holdIn: 4,
        exhale: 4,
        holdOut: 4,
        hint: 'Classic box breathing. Keep each phase steady and controlled.'
      },
      balanced: {
        inhale: 5,
        holdIn: 5,
        exhale: 5,
        holdOut: 5,
        hint: 'Balanced pacing to build calm focus with equal breath segments.'
      },
      'four-seven-eight': {
        inhale: 4,
        holdIn: 7,
        exhale: 8,
        holdOut: 0,
        hint: 'Long exhales support relaxation. Keep the pace gentle.'
      }
    };

    this.phases = [
      { key: 'inhale', label: 'Inhale', className: 'phase-inhale', hint: 'Breathe in slowly through your nose.' },
      { key: 'holdIn', label: 'Hold', className: 'phase-hold-in', hint: 'Hold softly with relaxed shoulders.' },
      { key: 'exhale', label: 'Exhale', className: 'phase-exhale', hint: 'Breathe out in a slow, smooth stream.' },
      { key: 'holdOut', label: 'Hold', className: 'phase-hold-out', hint: 'Pause comfortably before the next inhale.' }
    ];

    this.data = this.loadData();
    this.session = this.createIdleSession();

    this.initElements();
    this.syncThemeWithParent();
    this.attachEventListeners();
    this.populateFormFromData();
    this.refreshIdleDisplay();
  }

  createIdleSession() {
    return {
      active: false,
      paused: false,
      cycle: 0,
      totalCycles: 0,
      phaseIndex: -1,
      phaseEndsAt: 0,
      sessionEndsAt: 0,
      phaseRemainingMs: 0,
      sessionRemainingMs: 0,
      durations: null
    };
  }

  initElements() {
    this.breathOrb = document.getElementById('breathOrb');
    this.phaseLabel = document.getElementById('phaseLabel');
    this.phaseTime = document.getElementById('phaseTime');
    this.phaseHint = document.getElementById('phaseHint');
    this.cycleDots = document.getElementById('cycleDots');
    this.startBtn = document.getElementById('startBtn');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.controlsIdle = document.getElementById('controlsIdle');
    this.controlsActive = document.getElementById('controlsActive');
    this.techniqueSelect = document.getElementById('techniqueSelect');
    this.cyclesInput = document.getElementById('cyclesInput');
    this.inhaleInput = document.getElementById('inhaleInput');
    this.holdInInput = document.getElementById('holdInInput');
    this.exhaleInput = document.getElementById('exhaleInput');
    this.holdOutInput = document.getElementById('holdOutInput');
    this.cycleProgress = document.getElementById('cycleProgress');
    this.sessionRemaining = document.getElementById('sessionRemaining');
    this.settingsToggle = document.getElementById('settingsToggle');
    this.settingsBackdrop = document.getElementById('settingsBackdrop');
    this.settingsPanel = document.getElementById('settingsPanel');
    this.settingsClose = document.getElementById('settingsClose');
  }

  attachEventListeners() {
    this.startBtn.addEventListener('click', () => {
      this.startSession();
    });

    this.pauseBtn.addEventListener('click', () => {
      if (!this.session.active) return;
      if (this.session.paused) {
        this.resumeSession();
      } else {
        this.pauseSession();
      }
    });

    this.resetBtn.addEventListener('click', () => this.resetSession());

    // Settings modal
    this.settingsToggle.addEventListener('click', () => this.openSettings());
    this.settingsClose.addEventListener('click', () => this.closeSettings());
    this.settingsBackdrop.addEventListener('click', (e) => {
      if (e.target === this.settingsBackdrop) this.closeSettings();
    });
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.handleVisibility(true, 'document-visible');
    });

    this.techniqueSelect.addEventListener('change', () => {
      this.data.technique = this.techniqueSelect.value;
      this.applyTechniqueToInputs(this.data.technique);
      this.saveData();
      if (!this.session.active) this.refreshIdleDisplay();
    });

    const onDurationChange = () => {
      this.data.cycles = this.coerceInt(this.cyclesInput.value, 1, 60, this.data.cycles);
      this.data.durations = this.readDurationsFromInputs();
      this.syncDurationInputs(this.data.cycles, this.data.durations);
      this.saveData();
      if (!this.session.active) this.refreshIdleDisplay();
    };

    [this.cyclesInput, this.inhaleInput, this.holdInInput, this.exhaleInput, this.holdOutInput].forEach(input => {
      input.addEventListener('change', onDurationChange);
    });
  }

  openSettings() {
    if (this.isSettingsOpen()) return;

    this.lastFocusedElement = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : null;
    this.settingsBackdrop.classList.add('active');
    this.settingsBackdrop.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => {
      if (this.settingsClose) this.settingsClose.focus();
    }, 50);
  }

  closeSettings({ restoreFocus = true } = {}) {
    if (!this.isSettingsOpen()) return;

    this.settingsBackdrop.classList.remove('active');
    this.settingsBackdrop.setAttribute('aria-hidden', 'true');

    if (
      restoreFocus &&
      this.lastFocusedElement &&
      typeof this.lastFocusedElement.focus === 'function' &&
      document.contains(this.lastFocusedElement)
    ) {
      this.lastFocusedElement.focus();
    }
    this.lastFocusedElement = null;
  }

  syncThemeWithParent() {
    try {
      const savedTheme = localStorage.getItem('marlapps-theme');
      if (savedTheme) this.applyTheme(savedTheme);
    } catch (e) {
      // Ignore theme read errors
    }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        this.applyTheme(event.data.theme);
      }

      if (event.data && event.data.type === 'app-visibility') {
        this.handleVisibility(Boolean(event.data.visible), event.data.reason || '');
      }
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  loadData() {
    const fallback = {
      technique: 'box',
      cycles: 8,
      durations: { inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 }
    };

    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return fallback;

    try {
      const parsed = JSON.parse(saved);
      const technique = Object.prototype.hasOwnProperty.call(this.techniques, parsed.technique)
        ? parsed.technique
        : fallback.technique;

      const cycles = this.coerceInt(parsed.cycles, 1, 60, fallback.cycles);
      const sourceDurations = parsed.durations && typeof parsed.durations === 'object'
        ? parsed.durations
        : this.techniques[technique];

      const durations = {
        inhale: this.coerceInt(sourceDurations.inhale, 1, 30, fallback.durations.inhale),
        holdIn: this.coerceInt(sourceDurations.holdIn, 0, 30, fallback.durations.holdIn),
        exhale: this.coerceInt(sourceDurations.exhale, 1, 30, fallback.durations.exhale),
        holdOut: this.coerceInt(sourceDurations.holdOut, 0, 30, fallback.durations.holdOut)
      };

      return { technique, cycles, durations };
    } catch {
      return fallback;
    }
  }

  saveData() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
  }

  coerceInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  populateFormFromData() {
    this.techniqueSelect.value = this.data.technique;
    this.syncDurationInputs(this.data.cycles, this.data.durations);
  }

  syncDurationInputs(cycles, durations) {
    this.cyclesInput.value = cycles;
    this.inhaleInput.value = durations.inhale;
    this.holdInInput.value = durations.holdIn;
    this.exhaleInput.value = durations.exhale;
    this.holdOutInput.value = durations.holdOut;
  }

  applyTechniqueToInputs(techniqueKey) {
    const preset = this.techniques[techniqueKey] || this.techniques.box;
    this.inhaleInput.value = preset.inhale;
    this.holdInInput.value = preset.holdIn;
    this.exhaleInput.value = preset.exhale;
    this.holdOutInput.value = preset.holdOut;
    this.data.durations = this.readDurationsFromInputs();
  }

  readDurationsFromInputs() {
    return {
      inhale: this.coerceInt(this.inhaleInput.value, 1, 30, 4),
      holdIn: this.coerceInt(this.holdInInput.value, 0, 30, 4),
      exhale: this.coerceInt(this.exhaleInput.value, 1, 30, 4),
      holdOut: this.coerceInt(this.holdOutInput.value, 0, 30, 4)
    };
  }

  renderCycleDots(totalCycles, currentCycle) {
    const maxDots = Math.min(totalCycles, 12);
    this.cycleDots.innerHTML = '';
    for (let i = 1; i <= maxDots; i++) {
      const dot = document.createElement('span');
      dot.className = 'cycle-dot';
      if (i < currentCycle) dot.classList.add('completed');
      else if (i === currentCycle) dot.classList.add('current');
      this.cycleDots.appendChild(dot);
    }
  }

  setOrbPhaseClass(className, durationSeconds) {
    this.breathOrb.classList.remove('phase-ready', 'phase-inhale', 'phase-hold-in', 'phase-exhale', 'phase-hold-out');
    this.breathOrb.classList.add(className);
    this.breathOrb.style.setProperty('--phase-duration', `${durationSeconds}s`);
  }

  startSession() {
    const durations = this.readDurationsFromInputs();
    const totalCycles = this.coerceInt(this.cyclesInput.value, 1, 60, this.data.cycles);
    this.syncDurationInputs(totalCycles, durations);

    this.data.cycles = totalCycles;
    this.data.durations = durations;
    this.saveData();

    const cycleSeconds = durations.inhale + durations.holdIn + durations.exhale + durations.holdOut;
    const totalMs = cycleSeconds * totalCycles * 1000;

    this.clearTicker();
    this.session = this.createIdleSession();
    this.session.active = true;
    this.session.totalCycles = totalCycles;
    this.session.cycle = 1;
    this.session.durations = durations;
    this.session.sessionEndsAt = Date.now() + totalMs;

    const initialPhaseIndex = this.findFirstPhaseIndex(durations);
    if (initialPhaseIndex === -1) {
      this.phaseHint.textContent = 'Unable to start session. Check phase durations.';
      this.session = this.createIdleSession();
      return;
    }

    this.renderCycleDots(totalCycles, 1);
    this.enterPhase(initialPhaseIndex);
    this.startTicker();
    this.updateControls();
    this.updateDisplay();
  }

  pauseSession() {
    if (!this.session.active || this.session.paused) return;

    const now = Date.now();
    this.session.phaseRemainingMs = Math.max(0, this.session.phaseEndsAt - now);
    this.session.sessionRemainingMs = Math.max(0, this.session.sessionEndsAt - now);
    this.session.paused = true;

    this.clearTicker();
    this.phaseHint.textContent = 'Paused. Resume when you are ready.';
    this.updateControls();
  }

  resumeSession() {
    if (!this.session.active || !this.session.paused) return;

    const now = Date.now();
    this.session.phaseEndsAt = now + this.session.phaseRemainingMs;
    this.session.sessionEndsAt = now + this.session.sessionRemainingMs;
    this.session.paused = false;

    // Restore the current phase hint immediately
    const phase = this.phases[this.session.phaseIndex];
    if (phase) {
      this.phaseHint.textContent = phase.hint;
    }

    this.startTicker();
    this.updateControls();
    this.updateDisplay();
  }

  resetSession() {
    this.clearTicker();
    this.session = this.createIdleSession();
    this.refreshIdleDisplay();
    this.updateControls();
  }

  completeSession() {
    this.clearTicker();
    const totalCycles = this.session.totalCycles;

    this.phaseLabel.textContent = 'Complete';
    this.phaseTime.textContent = '00';
    this.phaseHint.textContent = 'Session complete. Great focus.';
    this.setOrbPhaseClass('phase-ready', 0.5);
    this.cycleProgress.textContent = `${totalCycles} / ${totalCycles}`;
    this.sessionRemaining.textContent = '00:00';
    this.renderCycleDots(totalCycles, totalCycles + 1);

    this.session = this.createIdleSession();
    this.updateControls();
  }

  refreshIdleDisplay() {
    this.setText(this.phaseLabel, 'Ready');
    this.setText(this.phaseTime, '--');
    const technique = this.techniques[this.techniqueSelect.value] || this.techniques.box;
    this.setText(this.phaseHint, technique.hint);
    this.setOrbPhaseClass('phase-ready', 0.4);

    const cycles = this.coerceInt(this.cyclesInput.value, 1, 60, this.data.cycles);
    this.setText(this.cycleProgress, `0 / ${cycles}`);
    this.renderCycleDots(cycles, 0);

    const durations = this.readDurationsFromInputs();
    const totalSeconds = (durations.inhale + durations.holdIn + durations.exhale + durations.holdOut) * cycles;
    this.setText(this.sessionRemaining, this.formatDuration(totalSeconds));
  }

  startTicker() {
    this.clearTicker();
    this.tickInterval = window.setInterval(() => this.tick(), this.tickIntervalMs);
  }

  clearTicker() {
    if (this.tickInterval) {
      window.clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  tick() {
    if (!this.session.active || this.session.paused) return;

    const now = Date.now();
    if (!this.advanceSessionToNow(now)) return;
    this.updateDisplay(now);
  }

  advanceSessionToNow(now = Date.now()) {
    while (this.session.active && !this.session.paused && now >= this.session.phaseEndsAt) {
      const next = this.getNextPhase(this.session.cycle, this.session.phaseIndex);
      if (!next) {
        this.completeSession();
        return false;
      }

      const nextPhaseStartAt = this.session.phaseEndsAt;
      this.session.cycle = next.cycle;
      this.renderCycleDots(this.session.totalCycles, this.session.cycle);
      this.enterPhase(next.phaseIndex, nextPhaseStartAt, false);
    }

    return this.session.active;
  }

  enterPhase(phaseIndex, phaseStartAt = Date.now(), shouldUpdateDisplay = true) {
    const phase = this.phases[phaseIndex];
    const seconds = this.session.durations[phase.key];

    this.session.phaseIndex = phaseIndex;
    this.session.phaseEndsAt = phaseStartAt + (seconds * 1000);

    this.setText(this.phaseLabel, phase.label);
    this.setText(this.phaseHint, phase.hint);
    this.setOrbPhaseClass(phase.className, Math.max(0.4, seconds));

    if (shouldUpdateDisplay) {
      this.updateDisplay(phaseStartAt);
    }
  }

  findFirstPhaseIndex(durations) {
    for (let i = 0; i < this.phases.length; i += 1) {
      if (durations[this.phases[i].key] > 0) return i;
    }
    return -1;
  }

  getNextPhase(cycle, phaseIndex) {
    for (let step = 0; step < this.phases.length * 2; step += 1) {
      let nextCycle = cycle;
      let nextIndex = phaseIndex + step + 1;

      while (nextIndex >= this.phases.length) {
        nextIndex -= this.phases.length;
        nextCycle += 1;
      }

      if (nextCycle > this.session.totalCycles) {
        return null;
      }

      const nextPhase = this.phases[nextIndex];
      if (this.session.durations[nextPhase.key] > 0) {
        return { cycle: nextCycle, phaseIndex: nextIndex };
      }
    }

    return null;
  }

  updateDisplay(now = Date.now()) {
    if (!this.session.active) return;

    const phaseSeconds = Math.max(0, Math.ceil((this.session.phaseEndsAt - now) / 1000));
    const sessionSeconds = Math.max(0, Math.ceil((this.session.sessionEndsAt - now) / 1000));

    this.setText(this.phaseTime, String(phaseSeconds).padStart(2, '0'));
    this.setText(this.sessionRemaining, this.formatDuration(sessionSeconds));
    this.setText(this.cycleProgress, `${this.session.cycle} / ${this.session.totalCycles}`);
  }

  formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  updateControls() {
    if (this.session.active) {
      this.controlsIdle.style.display = 'none';
      this.controlsActive.style.display = 'flex';

      if (this.session.paused) {
        this.pauseBtn.classList.remove('btn-pause-action');
        this.pauseBtn.classList.add('btn-resume-action');
        this.pauseBtn.setAttribute('aria-label', 'Resume session');
        this.pauseBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>';
      } else {
        this.pauseBtn.classList.remove('btn-resume-action');
        this.pauseBtn.classList.add('btn-pause-action');
        this.pauseBtn.setAttribute('aria-label', 'Pause session');
        this.pauseBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    } else {
      this.controlsIdle.style.display = 'flex';
      this.controlsActive.style.display = 'none';
    }
  }

  isSettingsOpen() {
    return this.settingsBackdrop.classList.contains('active');
  }

  handleKeyDown(e) {
    if (!this.isSettingsOpen()) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.closeSettings();
      return;
    }

    if (e.key === 'Tab') {
      this.trapSettingsFocus(e);
    }
  }

  trapSettingsFocus(e) {
    const focusable = this.getSettingsFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      this.settingsPanel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (e.shiftKey && activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  getSettingsFocusableElements() {
    if (!this.settingsPanel) return [];

    return [...this.settingsPanel.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.offsetParent !== null);
  }

  handleVisibility(visible) {
    if (!visible) return;
    if (!this.session.active || this.session.paused) return;

    const now = Date.now();
    if (!this.advanceSessionToNow(now)) return;
    this.updateDisplay(now);
  }

  setText(element, value) {
    if (!element) return;
    if (element.textContent !== value) {
      element.textContent = value;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new BreathingApp();

  window.addEventListener('beforeunload', () => {
    app.clearTicker();
  });

  window.addEventListener('pagehide', () => {
    app.clearTicker();
  });
});
