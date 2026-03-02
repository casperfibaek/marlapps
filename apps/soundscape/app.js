class SoundscapeApp {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.sounds = new Map();
    this.bufferCache = new Map();
    this.data = this.loadData();
    this.pendingAutoRestore = false;
    this.lastReportedBackgroundActivity = null;
    this.saveTimeout = null;
    this.gestureAbort = null;

    this.soundDefs = [
      {
        id: 'white-noise',
        name: 'White Noise',
        description: 'Equal energy across all frequencies',
        icon: '\u{1F4A8}',
        generator: (ctx) => this.createWhiteNoise(ctx)
      },
      {
        id: 'brown-noise',
        name: 'Brown Noise',
        description: 'Deep, rumbling low-frequency noise',
        icon: '\u{1F3B5}',
        generator: (ctx) => this.createBrownNoise(ctx)
      },
      {
        id: 'fan-noise',
        name: 'Fan',
        description: 'Steady airflow with a fuller, droning motor hum',
        icon: '\u{1F32C}',
        generator: (ctx) => this.createFanNoise(ctx)
      },
      {
        id: 'wave-noise',
        name: 'Waves',
        description: 'Rolling surf with bouncier shoreline movement',
        icon: '\u{1F30A}',
        generator: (ctx) => this.createWaveNoise(ctx)
      },
      {
        id: 'rain-noise',
        name: 'Rain',
        description: 'Steady rainfall with scattered droplets',
        icon: '\u{1F327}',
        generator: (ctx) => this.createRainNoise(ctx)
      },
      {
        id: 'crackle-noise',
        name: 'Crackle',
        description: 'Warm ember crackle with popping sparks',
        icon: '\u{1F525}',
        generator: (ctx) => this.createCrackleNoise(ctx)
      }
    ];

    this.initElements();
    this.renderSoundCards();
    this.attachEventListeners();
    this.syncThemeWithParent();
    this.restoreState();
    this.reportBackgroundActivity();
  }

  // ===== Data Persistence =====

  loadData() {
    const saved = localStorage.getItem('marlapps-soundscape');
    const defaults = {
      masterVolume: 80,
      sounds: {},
      paused: false
    };
    if (!saved) return defaults;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaults;
      }

      const masterVolumeRaw = parseInt(parsed.masterVolume, 10);
      const masterVolume = Number.isFinite(masterVolumeRaw)
        ? Math.min(100, Math.max(0, masterVolumeRaw))
        : defaults.masterVolume;

      const sounds = {};
      if (parsed.sounds && typeof parsed.sounds === 'object' && !Array.isArray(parsed.sounds)) {
        Object.entries(parsed.sounds).forEach(([id, state]) => {
          if (!state || typeof state !== 'object') return;
          const nextState = {};

          if (typeof state.active === 'boolean') {
            nextState.active = state.active;
          }

          if (state.volume !== undefined) {
            const volume = parseInt(state.volume, 10);
            if (Number.isFinite(volume)) {
              nextState.volume = Math.min(100, Math.max(0, volume));
            }
          }

          if (Object.keys(nextState).length > 0) {
            sounds[id] = nextState;
          }
        });
      }

      const paused = parsed.paused === true;

      return { masterVolume, sounds, paused };
    } catch {
      return defaults;
    }
  }

  saveData() {
    localStorage.setItem('marlapps-soundscape', JSON.stringify(this.data));
  }

  scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveData();
    }, 300);
  }

  flushSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    this.saveData();
  }

  // ===== Theme =====

  syncThemeWithParent() {
    try {
      const savedTheme = localStorage.getItem('marlapps-theme');
      if (savedTheme) {
        this.applyTheme(savedTheme);
      }
    } catch (_) {}

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

  // ===== Audio Context =====

  ensureAudioContext() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.bufferCache.clear();
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.data.masterVolume / 100;
      this.masterGain.connect(this.audioCtx.destination);
      this.removeGestureListeners();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // ===== Buffer Cache =====

  getCachedBuffer(key, ctx, generator) {
    if (this.bufferCache.has(key)) return this.bufferCache.get(key);
    const buffer = generator(ctx);
    this.bufferCache.set(key, buffer);
    return buffer;
  }

  // ===== Noise Generators =====
  // Each generator returns a SoundNode wrapper: { start(), stop(), connect(dest), disconnect() }

  createBufferSource(ctx, buffer) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  generateWhiteNoiseBuffer(ctx) {
    return this.getCachedBuffer('white', ctx, () => {
      const bufferSize = 2 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    });
  }

  generateBrownNoiseBuffer(ctx) {
    return this.getCachedBuffer('brown', ctx, () => {
      const bufferSize = 2 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * white) / 1.02;
        last = data[i];
        data[i] *= 3.5;
      }
      return buffer;
    });
  }

  generateImpulseBuffer(ctx, key, {
    duration = 6,
    eventsPerSecond = 12,
    ampMin = 0.08,
    ampMax = 0.6,
    decayMin = 0.002,
    decayMax = 0.02
  } = {}) {
    return this.getCachedBuffer(key, ctx, () => {
      const bufferSize = Math.max(1, Math.floor(duration * ctx.sampleRate));
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      const eventCount = Math.max(1, Math.floor(duration * eventsPerSecond));

      for (let i = 0; i < eventCount; i++) {
        const start = Math.floor(Math.random() * (bufferSize - 1));
        const amplitude = ampMin + (Math.random() * (ampMax - ampMin));
        const decaySeconds = decayMin + (Math.random() * (decayMax - decayMin));
        const decaySamples = Math.max(1, Math.floor(decaySeconds * ctx.sampleRate));

        for (let j = 0; j < decaySamples && (start + j) < bufferSize; j++) {
          const idx = start + j;
          const envelope = Math.exp((-5 * j) / decaySamples);
          const sample = data[idx] + (Math.random() * 2 - 1) * amplitude * envelope;
          data[idx] = sample > 1 ? 1 : sample < -1 ? -1 : sample;
        }
      }

      return buffer;
    });
  }

  createWhiteNoise(ctx) {
    const buffer = this.generateWhiteNoiseBuffer(ctx);
    const source = this.createBufferSource(ctx, buffer);
    return { sources: [source], output: source, oscillators: [] };
  }

  createBrownNoise(ctx) {
    const buffer = this.generateBrownNoiseBuffer(ctx);
    const source = this.createBufferSource(ctx, buffer);
    return { sources: [source], output: source, oscillators: [] };
  }

  createFanNoise(ctx) {
    const buffer = this.generateWhiteNoiseBuffer(ctx);
    const source = this.createBufferSource(ctx, buffer);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1700;
    lowpass.Q.value = 0.9;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 70;
    highpass.Q.value = 0.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.9;

    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 92;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.14;

    const subDrone = ctx.createOscillator();
    subDrone.type = 'sine';
    subDrone.frequency.value = 46;
    const subDroneGain = ctx.createGain();
    subDroneGain.gain.value = 0.09;

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'bandpass';
    droneFilter.frequency.value = 170;
    droneFilter.Q.value = 0.9;

    const turbulence = ctx.createOscillator();
    turbulence.type = 'triangle';
    turbulence.frequency.value = 0.13;
    const turbulenceAmount = ctx.createGain();
    turbulenceAmount.gain.value = 180;

    const droneDrift = ctx.createOscillator();
    droneDrift.type = 'sine';
    droneDrift.frequency.value = 0.07;
    const droneDriftAmount = ctx.createGain();
    droneDriftAmount.gain.value = 6;

    const dronePulse = ctx.createOscillator();
    dronePulse.type = 'sine';
    dronePulse.frequency.value = 0.09;
    const dronePulseAmount = ctx.createGain();
    dronePulseAmount.gain.value = 0.035;

    turbulence.connect(turbulenceAmount);
    turbulenceAmount.connect(lowpass.frequency);

    droneDrift.connect(droneDriftAmount);
    droneDriftAmount.connect(drone.frequency);

    dronePulse.connect(dronePulseAmount);
    dronePulseAmount.connect(droneGain.gain);

    source.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(noiseGain);

    drone.connect(droneFilter);
    droneFilter.connect(droneGain);
    subDrone.connect(subDroneGain);

    const output = ctx.createGain();
    output.gain.value = 1.15;
    noiseGain.connect(output);
    droneGain.connect(output);
    subDroneGain.connect(output);

    return {
      sources: [source],
      output,
      oscillators: [drone, subDrone, turbulence, droneDrift, dronePulse]
    };
  }

  createWaveNoise(ctx) {
    const brownBuffer = this.generateBrownNoiseBuffer(ctx);
    const whiteBuffer = this.generateWhiteNoiseBuffer(ctx);
    const source = this.createBufferSource(ctx, brownBuffer);
    const splashSource = this.createBufferSource(ctx, whiteBuffer);

    // Main wave body filtering
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 60;
    highpass.Q.value = 0.5;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1800;
    lowpass.Q.value = 0.7;

    // Swell gain — modulated by multiple LFOs for organic motion
    const swell = ctx.createGain();
    swell.gain.value = 0.25;

    // Primary roll — slow, deep wave cycle
    const roll = ctx.createOscillator();
    roll.type = 'sine';
    roll.frequency.value = 0.08;
    const rollDepth = ctx.createGain();
    rollDepth.gain.value = 0.2;

    // Secondary surge — slightly faster, overlapping rhythm
    const surge = ctx.createOscillator();
    surge.type = 'sine';
    surge.frequency.value = 0.14;
    const surgeDepth = ctx.createGain();
    surgeDepth.gain.value = 0.12;

    // Slow drift — very low frequency for long-term variation
    const drift = ctx.createOscillator();
    drift.type = 'sine';
    drift.frequency.value = 0.03;
    const driftDepth = ctx.createGain();
    driftDepth.gain.value = 0.08;

    roll.connect(rollDepth);
    rollDepth.connect(swell.gain);
    surge.connect(surgeDepth);
    surgeDepth.connect(swell.gain);
    drift.connect(driftDepth);
    driftDepth.connect(swell.gain);

    // Modulate the lowpass cutoff for tonal movement
    const filterLfo = ctx.createOscillator();
    filterLfo.type = 'sine';
    filterLfo.frequency.value = 0.06;
    const filterLfoDepth = ctx.createGain();
    filterLfoDepth.gain.value = 400;
    filterLfo.connect(filterLfoDepth);
    filterLfoDepth.connect(lowpass.frequency);

    // Shore wash — high-frequency hiss for breaking waves
    const splashBand = ctx.createBiquadFilter();
    splashBand.type = 'bandpass';
    splashBand.frequency.value = 1200;
    splashBand.Q.value = 0.4;

    const splashLowpass = ctx.createBiquadFilter();
    splashLowpass.type = 'lowpass';
    splashLowpass.frequency.value = 2400;
    splashLowpass.Q.value = 0.5;

    const splashGain = ctx.createGain();
    splashGain.gain.value = 0.06;

    // Shore wash volume modulation — synced loosely with roll
    const splashMotion = ctx.createOscillator();
    splashMotion.type = 'sine';
    splashMotion.frequency.value = 0.09;
    const splashMotionDepth = ctx.createGain();
    splashMotionDepth.gain.value = 0.05;
    splashMotion.connect(splashMotionDepth);
    splashMotionDepth.connect(splashGain.gain);

    // Splash frequency sweep for variety
    const splashFreqLfo = ctx.createOscillator();
    splashFreqLfo.type = 'triangle';
    splashFreqLfo.frequency.value = 0.12;
    const splashFreqDepth = ctx.createGain();
    splashFreqDepth.gain.value = 300;
    splashFreqLfo.connect(splashFreqDepth);
    splashFreqDepth.connect(splashBand.frequency);

    // Connect wave body
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(swell);

    // Connect shore wash
    splashSource.connect(splashBand);
    splashBand.connect(splashLowpass);
    splashLowpass.connect(splashGain);

    const output = ctx.createGain();
    output.gain.value = 1;
    swell.connect(output);
    splashGain.connect(output);

    return {
      sources: [source, splashSource],
      output,
      oscillators: [roll, surge, drift, filterLfo, splashMotion, splashFreqLfo]
    };
  }

  createRainNoise(ctx) {
    const whiteBuffer = this.generateWhiteNoiseBuffer(ctx);
    const source = this.createBufferSource(ctx, whiteBuffer);

    const dropletsBuffer = this.generateImpulseBuffer(ctx, 'rain-droplets', {
      duration: 7,
      eventsPerSecond: 65,
      ampMin: 0.025,
      ampMax: 0.14,
      decayMin: 0.002,
      decayMax: 0.014
    });
    const dropletsSource = this.createBufferSource(ctx, dropletsBuffer);

    const rainHighpass = ctx.createBiquadFilter();
    rainHighpass.type = 'highpass';
    rainHighpass.frequency.value = 500;
    rainHighpass.Q.value = 0.45;

    const rainLowpass = ctx.createBiquadFilter();
    rainLowpass.type = 'lowpass';
    rainLowpass.frequency.value = 9000;
    rainLowpass.Q.value = 0.5;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0.34;

    const rainMotion = ctx.createOscillator();
    rainMotion.type = 'triangle';
    rainMotion.frequency.value = 0.08;
    const rainMotionDepth = ctx.createGain();
    rainMotionDepth.gain.value = 0.11;
    rainMotion.connect(rainMotionDepth);
    rainMotionDepth.connect(rainGain.gain);

    const dropletBandpass = ctx.createBiquadFilter();
    dropletBandpass.type = 'bandpass';
    dropletBandpass.frequency.value = 3200;
    dropletBandpass.Q.value = 0.8;

    const dropletHighpass = ctx.createBiquadFilter();
    dropletHighpass.type = 'highpass';
    dropletHighpass.frequency.value = 1200;
    dropletHighpass.Q.value = 0.6;

    const dropletGain = ctx.createGain();
    dropletGain.gain.value = 0.28;

    const dropletMotion = ctx.createOscillator();
    dropletMotion.type = 'sine';
    dropletMotion.frequency.value = 0.19;
    const dropletMotionDepth = ctx.createGain();
    dropletMotionDepth.gain.value = 650;
    dropletMotion.connect(dropletMotionDepth);
    dropletMotionDepth.connect(dropletBandpass.frequency);

    source.connect(rainHighpass);
    rainHighpass.connect(rainLowpass);
    rainLowpass.connect(rainGain);

    dropletsSource.connect(dropletBandpass);
    dropletBandpass.connect(dropletHighpass);
    dropletHighpass.connect(dropletGain);

    const output = ctx.createGain();
    output.gain.value = 1.03;
    rainGain.connect(output);
    dropletGain.connect(output);

    return {
      sources: [source, dropletsSource],
      output,
      oscillators: [rainMotion, dropletMotion]
    };
  }

  createCrackleNoise(ctx) {
    const brownBuffer = this.generateBrownNoiseBuffer(ctx);
    const source = this.createBufferSource(ctx, brownBuffer);

    const cracklesBuffer = this.generateImpulseBuffer(ctx, 'crackle-crackles', {
      duration: 6,
      eventsPerSecond: 18,
      ampMin: 0.15,
      ampMax: 0.95,
      decayMin: 0.001,
      decayMax: 0.02
    });
    const cracklesSource = this.createBufferSource(ctx, cracklesBuffer);

    const popsBuffer = this.generateImpulseBuffer(ctx, 'crackle-pops', {
      duration: 8,
      eventsPerSecond: 4,
      ampMin: 0.22,
      ampMax: 1.2,
      decayMin: 0.006,
      decayMax: 0.045
    });
    const popsSource = this.createBufferSource(ctx, popsBuffer);

    const emberHighpass = ctx.createBiquadFilter();
    emberHighpass.type = 'highpass';
    emberHighpass.frequency.value = 70;
    emberHighpass.Q.value = 0.7;

    const emberLowpass = ctx.createBiquadFilter();
    emberLowpass.type = 'lowpass';
    emberLowpass.frequency.value = 1000;
    emberLowpass.Q.value = 0.8;

    const emberGain = ctx.createGain();
    emberGain.gain.value = 0.24;

    const crackBandpass = ctx.createBiquadFilter();
    crackBandpass.type = 'bandpass';
    crackBandpass.frequency.value = 2900;
    crackBandpass.Q.value = 2.5;

    const crackGain = ctx.createGain();
    crackGain.gain.value = 0.24;

    const popBandpass = ctx.createBiquadFilter();
    popBandpass.type = 'bandpass';
    popBandpass.frequency.value = 980;
    popBandpass.Q.value = 1.3;

    const popGain = ctx.createGain();
    popGain.gain.value = 0.2;

    const crackMotion = ctx.createOscillator();
    crackMotion.type = 'triangle';
    crackMotion.frequency.value = 0.45;
    const crackMotionDepth = ctx.createGain();
    crackMotionDepth.gain.value = 900;
    crackMotion.connect(crackMotionDepth);
    crackMotionDepth.connect(crackBandpass.frequency);

    const emberSwell = ctx.createOscillator();
    emberSwell.type = 'sine';
    emberSwell.frequency.value = 0.1;
    const emberSwellDepth = ctx.createGain();
    emberSwellDepth.gain.value = 0.08;
    emberSwell.connect(emberSwellDepth);
    emberSwellDepth.connect(emberGain.gain);

    source.connect(emberHighpass);
    emberHighpass.connect(emberLowpass);
    emberLowpass.connect(emberGain);

    cracklesSource.connect(crackBandpass);
    crackBandpass.connect(crackGain);

    popsSource.connect(popBandpass);
    popBandpass.connect(popGain);

    const output = ctx.createGain();
    output.gain.value = 1.06;
    emberGain.connect(output);
    crackGain.connect(output);
    popGain.connect(output);

    return {
      sources: [source, cracklesSource, popsSource],
      output,
      oscillators: [crackMotion, emberSwell]
    };
  }

  // ===== DOM Init =====

  initElements() {
    this.masterToggleBtn = document.getElementById('masterToggle');
    this.masterVolumeSlider = document.getElementById('masterVolume');
    this.masterVolumeLabel = document.getElementById('masterVolumeLabel');
    this.soundGrid = document.getElementById('soundGrid');
    this.activityIndicator = document.getElementById('activityIndicator');

    this.gestureHint = document.getElementById('gestureHint');

    this.masterVolumeSlider.value = this.data.masterVolume;
    this.masterVolumeLabel.textContent = `${this.data.masterVolume}%`;
    this.updateSliderFill(this.masterVolumeSlider);
  }

  updateSliderFill(slider) {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--slider-fill', `${pct}%`);
  }

  renderSoundCards() {
    this.soundGrid.innerHTML = '';

    this.soundDefs.forEach(def => {
      const savedVol = this.data.sounds[def.id]?.volume ?? 70;

      const card = document.createElement('div');
      card.className = 'sound-card';
      card.dataset.soundId = def.id;

      const header = document.createElement('div');
      header.className = 'sound-card-header';

      const iconEl = document.createElement('div');
      iconEl.className = 'sound-icon';
      iconEl.textContent = def.icon;

      const info = document.createElement('div');
      info.className = 'sound-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'sound-name';
      nameEl.textContent = def.name;
      const descEl = document.createElement('div');
      descEl.className = 'sound-desc';
      descEl.textContent = def.description;
      info.appendChild(nameEl);
      info.appendChild(descEl);

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'sound-toggle';
      toggleBtn.dataset.soundId = def.id;
      toggleBtn.setAttribute('aria-label', `Toggle ${def.name}`);
      toggleBtn.setAttribute('aria-pressed', 'false');
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'toggle-icon';
      toggleIcon.textContent = '\u25B6';
      toggleBtn.appendChild(toggleIcon);

      header.appendChild(iconEl);
      header.appendChild(info);
      header.appendChild(toggleBtn);

      const volumeRow = document.createElement('div');
      volumeRow.className = 'sound-volume';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'volume-slider';
      slider.dataset.soundId = def.id;
      slider.min = '0';
      slider.max = '100';
      slider.value = savedVol;
      slider.setAttribute('aria-label', `${def.name} volume`);
      this.updateSliderFill(slider);
      const volLabel = document.createElement('span');
      volLabel.className = 'volume-label';
      volLabel.textContent = `${savedVol}%`;
      volumeRow.appendChild(slider);
      volumeRow.appendChild(volLabel);

      card.appendChild(header);
      card.appendChild(volumeRow);

      this.soundGrid.appendChild(card);
    });
  }

  attachEventListeners() {
    this.masterToggleBtn.addEventListener('click', () => this.toggleAll());

    this.masterVolumeSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value, 10);
      this.data.masterVolume = vol;
      this.masterVolumeLabel.textContent = `${vol}%`;
      this.updateSliderFill(e.target);
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(vol / 100, this.audioCtx.currentTime, 0.02);
      }
      if (vol === 0 && this.sounds.size > 0) {
        this.pauseAll();
      }
      this.scheduleSave();
    });

    this.soundGrid.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.sound-toggle');
      if (toggleBtn) {
        this.toggleSound(toggleBtn.dataset.soundId);
      }
    });

    this.soundGrid.addEventListener('input', (e) => {
      if (e.target.classList.contains('volume-slider')) {
        const id = e.target.dataset.soundId;
        const vol = parseInt(e.target.value, 10);
        this.setSoundVolume(id, vol);
        this.updateSliderFill(e.target);

        const label = e.target.closest('.sound-volume').querySelector('.volume-label');
        label.textContent = `${vol}%`;
      }
    });

    this.setupGestureListeners();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.handleBecameVisible();
      }
    });

    window.addEventListener('pagehide', () => this.flushSave());
    window.addEventListener('beforeunload', () => this.flushSave());
  }

  setupGestureListeners() {
    this.gestureAbort = new AbortController();
    const opts = { signal: this.gestureAbort.signal };

    const resumeOnGesture = () => this.handleBecameVisible();

    document.addEventListener('pointerdown', resumeOnGesture, { ...opts, passive: true });
    document.addEventListener('keydown', resumeOnGesture, opts);
    document.addEventListener('touchstart', resumeOnGesture, { ...opts, passive: true });
  }

  removeGestureListeners() {
    if (this.gestureAbort) {
      this.gestureAbort.abort();
      this.gestureAbort = null;
    }
    if (this.gestureHint) {
      this.gestureHint.classList.remove('visible');
    }
  }

  // ===== Sound Control =====

  toggleSound(id) {
    if (this.sounds.has(id)) {
      this.stopSound(id);
    } else {
      this.startSound(id);
    }
  }

  startSound(id) {
    if (this.sounds.has(id)) return;
    const def = this.soundDefs.find(d => d.id === id);
    if (!def) return;

    try {
      const ctx = this.ensureAudioContext();
      const node = def.generator(ctx);
      const gain = ctx.createGain();
      const savedVol = this.data.sounds[id]?.volume ?? 70;
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(savedVol / 100, ctx.currentTime, 0.02);

      node.output.connect(gain);
      gain.connect(this.masterGain);

      node.sources.forEach(s => s.start());
      node.oscillators.forEach(o => o.start());

      this.sounds.set(id, { node, gain });

      if (!this.data.sounds[id]) this.data.sounds[id] = {};
      this.data.sounds[id].active = true;
      this.data.paused = false;
      if (this.data.sounds[id].volume === undefined) this.data.sounds[id].volume = savedVol;
      this.scheduleSave();

      const card = this.soundGrid.querySelector(`.sound-card[data-sound-id="${id}"]`);
      if (card) {
        card.classList.add('active');
        card.querySelector('.toggle-icon').textContent = '\u23F8';
        const btn = card.querySelector('.sound-toggle');
        if (btn) btn.setAttribute('aria-pressed', 'true');
      }

      this.updateMasterButton();
      this.updateActivityIndicator();
      this.reportBackgroundActivity();
    } catch (e) {
      // Clean up partial state on failure
      this.sounds.delete(id);
    }
  }

  // Tear down audio nodes for a sound without changing the active flag in data
  destroySound(id) {
    const entry = this.sounds.get(id);
    if (!entry) return;

    this.sounds.delete(id);
    entry.gain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.05);
    setTimeout(() => {
      try {
        entry.node.sources.forEach(s => { try { s.stop(); } catch (_) {} });
        entry.node.oscillators.forEach(o => { try { o.stop(); } catch (_) {} });
        entry.node.output.disconnect();
        entry.gain.disconnect();
      } catch (_) {}
    }, 100);

    const card = this.soundGrid.querySelector(`.sound-card[data-sound-id="${id}"]`);
    if (card) {
      card.classList.remove('active');
      card.querySelector('.toggle-icon').textContent = '\u25B6';
      const btn = card.querySelector('.sound-toggle');
      if (btn) btn.setAttribute('aria-pressed', 'false');
    }
  }

  stopSound(id) {
    this.destroySound(id);

    if (this.data.sounds[id]) {
      this.data.sounds[id].active = false;
    }
    this.scheduleSave();

    this.updateMasterButton();
    this.updateActivityIndicator();
    this.reportBackgroundActivity();
  }

  setSoundVolume(id, vol) {
    const entry = this.sounds.get(id);
    if (entry) {
      entry.gain.gain.setTargetAtTime(vol / 100, this.audioCtx.currentTime, 0.02);
    }
    if (!this.data.sounds[id]) this.data.sounds[id] = {};
    this.data.sounds[id].volume = vol;
    this.scheduleSave();
  }

  pauseAll() {
    [...this.sounds.keys()].forEach(id => this.destroySound(id));
    this.data.paused = true;
    this.scheduleSave();
    this.updateMasterButton();
    this.updateActivityIndicator();
    this.reportBackgroundActivity();
  }

  resumeAll() {
    const activeIds = this.getSavedActiveSoundIds();
    if (activeIds.length === 0) return;
    this.data.paused = false;
    this.scheduleSave();
    activeIds.forEach(id => this.startSound(id));
  }

  toggleAll() {
    if (this.sounds.size > 0) {
      this.pauseAll();
    } else {
      this.resumeAll();
    }
  }

  updateMasterButton() {
    const anyPlaying = this.sounds.size > 0;
    const hasActiveSaved = this.getSavedActiveSoundIds().length > 0;
    if (anyPlaying) {
      this.masterToggleBtn.textContent = 'Pause';
    } else if (hasActiveSaved) {
      this.masterToggleBtn.textContent = 'Resume';
    } else {
      this.masterToggleBtn.textContent = 'Play';
    }
    this.masterToggleBtn.disabled = !anyPlaying && !hasActiveSaved;
  }

  updateActivityIndicator() {
    if (this.activityIndicator) {
      this.activityIndicator.classList.toggle('visible', this.sounds.size > 0);
    }
  }

  resumeAudioContext() {
    if (!this.audioCtx) return;
    if (this.audioCtx.state !== 'suspended') return;
    this.audioCtx.resume().catch(() => {});
  }

  getSavedActiveSoundIds() {
    return this.soundDefs
      .filter(def => this.data.sounds[def.id]?.active === true)
      .map(def => def.id);
  }

  restoreActiveSounds() {
    const activeIds = this.getSavedActiveSoundIds();
    this.pendingAutoRestore = false;

    if (activeIds.length === 0 || this.data.paused) {
      this.updateMasterButton();
      return;
    }

    activeIds.forEach((id) => {
      if (this.sounds.has(id)) return;
      this.startSound(id);
    });

    this.pendingAutoRestore = activeIds.some(id => !this.sounds.has(id));
    if (this.pendingAutoRestore && this.gestureHint) {
      this.gestureHint.classList.add('visible');
    }
  }

  handleAppVisibility(visible) {
    if (!visible) return;
    this.handleBecameVisible();
  }

  handleBecameVisible() {
    this.resumeAudioContext();
    if (this.pendingAutoRestore) {
      this.restoreActiveSounds();
    }
  }

  reportBackgroundActivity() {
    const active = this.sounds.size > 0;
    if (this.lastReportedBackgroundActivity === active) return;
    this.lastReportedBackgroundActivity = active;

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'app-background-activity',
          appId: 'soundscape',
          active
        }, '*');
      }
    } catch (e) {
      // Ignore postMessage failures.
    }
  }

  // ===== Restore State =====

  restoreState() {
    this.soundDefs.forEach(def => {
      const saved = this.data.sounds[def.id];
      if (saved?.volume !== undefined) {
        const slider = this.soundGrid.querySelector(`.volume-slider[data-sound-id="${def.id}"]`);
        if (slider) {
          slider.value = saved.volume;
          this.updateSliderFill(slider);
          slider.closest('.sound-volume').querySelector('.volume-label').textContent = `${saved.volume}%`;
        }
      }
    });
    this.restoreActiveSounds();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SoundscapeApp();
});
