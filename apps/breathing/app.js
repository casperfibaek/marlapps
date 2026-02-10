class BreathingApp {
  constructor() {
    this.storageKey = 'marlapps-breathing';
    this.tickInterval = null;

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
    this.startBtn = document.getElementById('startBtn');
    this.pauseBtn = document.getElementById('pauseBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.techniqueSelect = document.getElementById('techniqueSelect');
    this.cyclesInput = document.getElementById('cyclesInput');
    this.inhaleInput = document.getElementById('inhaleInput');
    this.holdInInput = document.getElementById('holdInInput');
    this.exhaleInput = document.getElementById('exhaleInput');
    this.holdOutInput = document.getElementById('holdOutInput');
    this.cycleProgress = document.getElementById('cycleProgress');
    this.sessionRemaining = document.getElementById('sessionRemaining');
  }

  attachEventListeners() {
    this.startBtn.addEventListener('click', () => {
      if (this.session.paused) {
        this.resumeSession();
      } else {
        this.startSession();
      }
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

    this.techniqueSelect.addEventListener('change', () => {
      this.data.technique = this.techniqueSelect.value;
      this.applyTechniqueToInputs(this.data.technique);
      this.saveData();
      if (!this.session.active) this.refreshIdleDisplay();
    });

    const onDurationChange = () => {
      this.data.cycles = this.coerceInt(this.cyclesInput.value, 1, 60, this.data.cycles);
      this.data.durations = this.readDurationsFromInputs();
      this.saveData();
      if (!this.session.active) this.refreshIdleDisplay();
    };

    [this.cyclesInput, this.inhaleInput, this.holdInInput, this.exhaleInput, this.holdOutInput].forEach(input => {
      input.addEventListener('change', onDurationChange);
    });
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
    this.cyclesInput.value = this.data.cycles;
    this.inhaleInput.value = this.data.durations.inhale;
    this.holdInInput.value = this.data.durations.holdIn;
    this.exhaleInput.value = this.data.durations.exhale;
    this.holdOutInput.value = this.data.durations.holdOut;
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

  hasActiveDuration(durations) {
    return Object.values(durations).some((value) => value > 0);
  }

  startSession() {
    const durations = this.readDurationsFromInputs();
    const totalCycles = this.coerceInt(this.cyclesInput.value, 1, 60, this.data.cycles);

    if (!this.hasActiveDuration(durations)) {
      this.phaseHint.textContent = 'Set at least one phase duration above 0 seconds.';
      return;
    }

    this.data.cycles = totalCycles;
    this.data.durations = durations;
    this.saveData();

    const cycleSeconds = durations.inhale + durations.holdIn + durations.exhale + durations.holdOut;
    const totalMs = cycleSeconds * totalCycles * 1000;
    if (totalMs <= 0) {
      this.phaseHint.textContent = 'Session length is 0. Increase one or more phase durations.';
      return;
    }

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

    this.session = this.createIdleSession();
    this.updateControls();
  }

  refreshIdleDisplay() {
    this.phaseLabel.textContent = 'Ready';
    this.phaseTime.textContent = '--';
    const technique = this.techniques[this.techniqueSelect.value] || this.techniques.box;
    this.phaseHint.textContent = technique.hint;
    this.setOrbPhaseClass('phase-ready', 0.4);
    this.cycleProgress.textContent = `0 / ${this.coerceInt(this.cyclesInput.value, 1, 60, this.data.cycles)}`;

    const durations = this.readDurationsFromInputs();
    const totalSeconds = (durations.inhale + durations.holdIn + durations.exhale + durations.holdOut)
      * this.coerceInt(this.cyclesInput.value, 1, 60, this.data.cycles);
    this.sessionRemaining.textContent = this.formatDuration(totalSeconds);
  }

  startTicker() {
    this.clearTicker();
    this.tickInterval = window.setInterval(() => this.tick(), 100);
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

    if (now >= this.session.phaseEndsAt) {
      const next = this.getNextPhase(this.session.cycle, this.session.phaseIndex);
      if (!next) {
        this.completeSession();
        return;
      }

      this.session.cycle = next.cycle;
      this.enterPhase(next.phaseIndex);
    }

    this.updateDisplay();
  }

  enterPhase(phaseIndex) {
    const phase = this.phases[phaseIndex];
    const seconds = this.session.durations[phase.key];

    this.session.phaseIndex = phaseIndex;
    this.session.phaseEndsAt = Date.now() + seconds * 1000;

    this.phaseLabel.textContent = phase.label;
    this.phaseHint.textContent = phase.hint;
    this.setOrbPhaseClass(phase.className, Math.max(0.4, seconds));
    this.updateDisplay();
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

  setOrbPhaseClass(className, durationSeconds) {
    this.breathOrb.classList.remove('phase-ready', 'phase-inhale', 'phase-hold-in', 'phase-exhale', 'phase-hold-out');
    this.breathOrb.classList.add(className);
    this.breathOrb.style.setProperty('--phase-duration', `${durationSeconds}s`);
  }

  updateDisplay() {
    if (!this.session.active) return;

    const now = Date.now();
    const phaseSeconds = Math.max(0, Math.ceil((this.session.phaseEndsAt - now) / 1000));
    const sessionSeconds = Math.max(0, Math.ceil((this.session.sessionEndsAt - now) / 1000));

    this.phaseTime.textContent = String(phaseSeconds).padStart(2, '0');
    this.sessionRemaining.textContent = this.formatDuration(sessionSeconds);
    this.cycleProgress.textContent = `${this.session.cycle} / ${this.session.totalCycles}`;
  }

  formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  updateControls() {
    if (this.session.active && !this.session.paused) {
      this.startBtn.disabled = true;
      this.startBtn.textContent = 'Start';
      this.pauseBtn.disabled = false;
      this.pauseBtn.textContent = 'Pause';
      return;
    }

    if (this.session.active && this.session.paused) {
      this.startBtn.disabled = false;
      this.startBtn.textContent = 'Resume';
      this.pauseBtn.disabled = true;
      this.pauseBtn.textContent = 'Pause';
      return;
    }

    this.startBtn.disabled = false;
    this.startBtn.textContent = 'Start';
    this.pauseBtn.disabled = true;
    this.pauseBtn.textContent = 'Pause';
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
