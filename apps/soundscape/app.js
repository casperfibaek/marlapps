class SoundscapeApp {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.sounds = new Map();
    this.data = this.loadData();

    // Sound definitions — add new generated sounds here
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
        icon: '\u{1F30A}',
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
  }

  // ===== Data Persistence =====

  loadData() {
    const saved = localStorage.getItem('marlapps-soundscape');
    const defaults = {
      masterVolume: 80,
      sounds: {}
    };
    if (!saved) return defaults;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaults;
      }

      const masterVolumeRaw = Number.parseInt(parsed.masterVolume, 10);
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
            const volume = Number.parseInt(state.volume, 10);
            if (Number.isFinite(volume)) {
              nextState.volume = Math.min(100, Math.max(0, volume));
            }
          }

          if (Object.keys(nextState).length > 0) {
            sounds[id] = nextState;
          }
        });
      }

      return { masterVolume, sounds };
    } catch {
      return defaults;
    }
  }

  saveData() {
    localStorage.setItem('marlapps-soundscape', JSON.stringify(this.data));
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

  // ===== Audio Context =====

  ensureAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.data.masterVolume / 100;
      this.masterGain.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // ===== Noise Generators =====

  createWhiteNoise(ctx) {
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  createBrownNoise(ctx) {
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (last + 0.02 * white) / 1.02;
      last = data[i];
      data[i] *= 3.5; // boost volume
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  createFanNoise(ctx) {
    const source = this.createWhiteNoise(ctx);

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

    drone.start();
    subDrone.start();
    turbulence.start();
    droneDrift.start();
    dronePulse.start();

    const output = ctx.createGain();
    output.gain.value = 1.15;
    noiseGain.connect(output);
    droneGain.connect(output);
    subDroneGain.connect(output);

    const originalStop = source.stop.bind(source);
    source.stop = (...args) => {
      try { drone.stop(...args); } catch (e) {}
      try { subDrone.stop(...args); } catch (e) {}
      try { turbulence.stop(...args); } catch (e) {}
      try { droneDrift.stop(...args); } catch (e) {}
      try { dronePulse.stop(...args); } catch (e) {}
      originalStop(...args);
    };
    source.connect = output.connect.bind(output);
    source.disconnect = output.disconnect.bind(output);

    return source;
  }

  createWaveNoise(ctx) {
    const source = this.createBrownNoise(ctx);
    const splashSource = this.createWhiteNoise(ctx);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 90;
    highpass.Q.value = 0.7;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2200;
    lowpass.Q.value = 0.9;

    const swell = ctx.createGain();
    swell.gain.value = 0.3;

    const roll = ctx.createOscillator();
    roll.type = 'triangle';
    roll.frequency.value = 0.25;
    const rollDepth = ctx.createGain();
    rollDepth.gain.value = 0.22;

    const surge = ctx.createOscillator();
    surge.type = 'sine';
    surge.frequency.value = 0.1;
    const surgeDepth = ctx.createGain();
    surgeDepth.gain.value = 0.16;

    const bounce = ctx.createOscillator();
    bounce.type = 'sawtooth';
    bounce.frequency.value = 0.42;
    const bounceDepth = ctx.createGain();
    bounceDepth.gain.value = 0.1;

    roll.connect(rollDepth);
    rollDepth.connect(swell.gain);
    surge.connect(surgeDepth);
    surgeDepth.connect(swell.gain);
    bounce.connect(bounceDepth);
    bounceDepth.connect(swell.gain);

    const splashBand = ctx.createBiquadFilter();
    splashBand.type = 'bandpass';
    splashBand.frequency.value = 850;
    splashBand.Q.value = 0.6;

    const splashLowpass = ctx.createBiquadFilter();
    splashLowpass.type = 'lowpass';
    splashLowpass.frequency.value = 1800;
    splashLowpass.Q.value = 0.7;

    const splashGain = ctx.createGain();
    splashGain.gain.value = 0.12;

    const splashMotion = ctx.createOscillator();
    splashMotion.type = 'triangle';
    splashMotion.frequency.value = 0.36;
    const splashMotionDepth = ctx.createGain();
    splashMotionDepth.gain.value = 0.08;
    splashMotion.connect(splashMotionDepth);
    splashMotionDepth.connect(splashGain.gain);

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(swell);

    splashSource.connect(splashBand);
    splashBand.connect(splashLowpass);
    splashLowpass.connect(splashGain);

    roll.start();
    surge.start();
    bounce.start();
    splashMotion.start();

    const output = ctx.createGain();
    output.gain.value = 1;
    swell.connect(output);
    splashGain.connect(output);

    const originalStart = source.start.bind(source);
    const originalStop = source.stop.bind(source);
    source.start = (...args) => {
      try { splashSource.start(...args); } catch (e) {}
      originalStart(...args);
    };
    source.stop = (...args) => {
      try { splashSource.stop(...args); } catch (e) {}
      try { roll.stop(...args); } catch (e) {}
      try { surge.stop(...args); } catch (e) {}
      try { bounce.stop(...args); } catch (e) {}
      try { splashMotion.stop(...args); } catch (e) {}
      originalStop(...args);
    };
    source.connect = output.connect.bind(output);
    source.disconnect = output.disconnect.bind(output);

    return source;
  }

  createImpulseNoise(ctx, {
    duration = 6,
    eventsPerSecond = 12,
    ampMin = 0.08,
    ampMax = 0.6,
    decayMin = 0.002,
    decayMax = 0.02
  } = {}) {
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
        const envelope = Math.exp((-5 * j) / decaySamples);
        data[start + j] += (Math.random() * 2 - 1) * amplitude * envelope;
      }
    }

    for (let i = 0; i < bufferSize; i++) {
      if (data[i] > 1) data[i] = 1;
      else if (data[i] < -1) data[i] = -1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  createRainNoise(ctx) {
    const source = this.createWhiteNoise(ctx);
    const dropletsSource = this.createImpulseNoise(ctx, {
      duration: 7,
      eventsPerSecond: 65,
      ampMin: 0.025,
      ampMax: 0.14,
      decayMin: 0.002,
      decayMax: 0.014
    });

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

    rainMotion.start();
    dropletMotion.start();

    const output = ctx.createGain();
    output.gain.value = 1.03;
    rainGain.connect(output);
    dropletGain.connect(output);

    const originalStart = source.start.bind(source);
    const originalStop = source.stop.bind(source);
    source.start = (...args) => {
      try { dropletsSource.start(...args); } catch (e) {}
      originalStart(...args);
    };
    source.stop = (...args) => {
      try { dropletsSource.stop(...args); } catch (e) {}
      try { rainMotion.stop(...args); } catch (e) {}
      try { dropletMotion.stop(...args); } catch (e) {}
      originalStop(...args);
    };
    source.connect = output.connect.bind(output);
    source.disconnect = output.disconnect.bind(output);

    return source;
  }

  createCrackleNoise(ctx) {
    const source = this.createBrownNoise(ctx);
    const cracklesSource = this.createImpulseNoise(ctx, {
      duration: 6,
      eventsPerSecond: 18,
      ampMin: 0.15,
      ampMax: 0.95,
      decayMin: 0.001,
      decayMax: 0.02
    });
    const popsSource = this.createImpulseNoise(ctx, {
      duration: 8,
      eventsPerSecond: 4,
      ampMin: 0.22,
      ampMax: 1.2,
      decayMin: 0.006,
      decayMax: 0.045
    });

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

    crackMotion.start();
    emberSwell.start();

    const output = ctx.createGain();
    output.gain.value = 1.06;
    emberGain.connect(output);
    crackGain.connect(output);
    popGain.connect(output);

    const originalStart = source.start.bind(source);
    const originalStop = source.stop.bind(source);
    source.start = (...args) => {
      try { cracklesSource.start(...args); } catch (e) {}
      try { popsSource.start(...args); } catch (e) {}
      originalStart(...args);
    };
    source.stop = (...args) => {
      try { cracklesSource.stop(...args); } catch (e) {}
      try { popsSource.stop(...args); } catch (e) {}
      try { crackMotion.stop(...args); } catch (e) {}
      try { emberSwell.stop(...args); } catch (e) {}
      originalStop(...args);
    };
    source.connect = output.connect.bind(output);
    source.disconnect = output.disconnect.bind(output);

    return source;
  }

  // ===== DOM Init =====

  initElements() {
    this.masterToggleBtn = document.getElementById('masterToggle');
    this.masterVolumeSlider = document.getElementById('masterVolume');
    this.soundGrid = document.getElementById('soundGrid');

    this.masterVolumeSlider.value = this.data.masterVolume;
  }

  renderSoundCards() {
    this.soundGrid.innerHTML = '';

    this.soundDefs.forEach(def => {
      const savedVol = this.data.sounds[def.id]?.volume ?? 70;

      const card = document.createElement('div');
      card.className = 'sound-card';
      card.dataset.soundId = def.id;

      card.innerHTML = `
        <div class="sound-card-header">
          <div class="sound-icon">${def.icon}</div>
          <div class="sound-info">
            <div class="sound-name">${def.name}</div>
            <div class="sound-desc">${def.description}</div>
          </div>
          <button class="sound-toggle" data-sound-id="${def.id}" title="Toggle ${def.name}">
            <span class="toggle-icon">\u25B6</span>
          </button>
        </div>
        <div class="sound-volume">
          <input type="range" class="volume-slider" data-sound-id="${def.id}" min="0" max="100" value="${savedVol}">
          <span class="volume-label">${savedVol}%</span>
        </div>
      `;

      this.soundGrid.appendChild(card);
    });
  }

  attachEventListeners() {
    // Master toggle
    this.masterToggleBtn.addEventListener('click', () => this.toggleAll());

    // Master volume
    this.masterVolumeSlider.addEventListener('input', (e) => {
      this.data.masterVolume = parseInt(e.target.value);
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(this.data.masterVolume / 100, this.audioCtx.currentTime, 0.02);
      }
      this.saveData();
    });

    // Sound card toggles and volume sliders (event delegation)
    this.soundGrid.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.sound-toggle');
      if (toggleBtn) {
        this.toggleSound(toggleBtn.dataset.soundId);
      }
    });

    this.soundGrid.addEventListener('input', (e) => {
      if (e.target.classList.contains('volume-slider')) {
        const id = e.target.dataset.soundId;
        const vol = parseInt(e.target.value);
        this.setSoundVolume(id, vol);

        const label = e.target.closest('.sound-volume').querySelector('.volume-label');
        label.textContent = `${vol}%`;
      }
    });
  }

  // ===== Sound Control =====

  toggleSound(id) {
    if (this.sounds.has(id)) {
      this.stopSound(id);
    } else {
      this.startSound(id);
    }
    this.updateMasterButton();
    this.saveData();
  }

  startSound(id) {
    const def = this.soundDefs.find(d => d.id === id);
    if (!def) return;

    const ctx = this.ensureAudioContext();
    const source = def.generator(ctx);
    const gain = ctx.createGain();
    const savedVol = this.data.sounds[id]?.volume ?? 70;
    gain.gain.value = savedVol / 100;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    this.sounds.set(id, { source, gain });

    // Update data
    if (!this.data.sounds[id]) this.data.sounds[id] = {};
    this.data.sounds[id].active = true;
    if (this.data.sounds[id].volume === undefined) this.data.sounds[id].volume = savedVol;

    // Update UI
    const card = this.soundGrid.querySelector(`[data-sound-id="${id}"]`).closest('.sound-card');
    card.classList.add('active');
    card.querySelector('.toggle-icon').textContent = '\u23F8';
  }

  stopSound(id) {
    const entry = this.sounds.get(id);
    if (!entry) return;

    entry.gain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.05);
    setTimeout(() => {
      try { entry.source.stop(); } catch (e) {}
    }, 100);
    this.sounds.delete(id);

    if (this.data.sounds[id]) {
      this.data.sounds[id].active = false;
    }

    const card = this.soundGrid.querySelector(`[data-sound-id="${id}"]`).closest('.sound-card');
    card.classList.remove('active');
    card.querySelector('.toggle-icon').textContent = '\u25B6';
  }

  setSoundVolume(id, vol) {
    const entry = this.sounds.get(id);
    if (entry) {
      entry.gain.gain.setTargetAtTime(vol / 100, this.audioCtx.currentTime, 0.02);
    }
    if (!this.data.sounds[id]) this.data.sounds[id] = {};
    this.data.sounds[id].volume = vol;
    this.saveData();
  }

  toggleAll() {
    const anyPlaying = this.sounds.size > 0;

    if (anyPlaying) {
      // Stop all
      [...this.sounds.keys()].forEach(id => this.stopSound(id));
    } else {
      // Start all
      this.soundDefs.forEach(def => this.startSound(def.id));
    }
    this.updateMasterButton();
    this.saveData();
  }

  updateMasterButton() {
    const anyPlaying = this.sounds.size > 0;
    this.masterToggleBtn.textContent = anyPlaying ? 'Stop All' : 'Play All';
  }

  // ===== Restore State =====

  restoreState() {
    // Restore volume per sound card from saved data
    this.soundDefs.forEach(def => {
      const saved = this.data.sounds[def.id];
      if (saved?.volume !== undefined) {
        const slider = this.soundGrid.querySelector(`.volume-slider[data-sound-id="${def.id}"]`);
        if (slider) {
          slider.value = saved.volume;
          slider.closest('.sound-volume').querySelector('.volume-label').textContent = `${saved.volume}%`;
        }
      }
    });
    // Note: we don't auto-play on load — browsers block autoplay without user gesture
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SoundscapeApp();
});
