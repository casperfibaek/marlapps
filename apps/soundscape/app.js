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
        description: 'Steady airflow hum with soft turbulence',
        icon: '\u{1F32C}',
        generator: (ctx) => this.createFanNoise(ctx)
      },
      {
        id: 'wave-noise',
        name: 'Waves',
        description: 'Gentle ocean wash with rolling motion',
        icon: '\u{1F30A}',
        generator: (ctx) => this.createWaveNoise(ctx)
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
    return { ...defaults, ...JSON.parse(saved) };
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
    lowpass.frequency.value = 1200;
    lowpass.Q.value = 0.7;

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80;
    highpass.Q.value = 0.5;

    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 95;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.08;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;

    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    lfo.start();

    source.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(humGain);
    hum.connect(humGain);

    hum.start();

    const output = ctx.createGain();
    output.gain.value = 0.85;
    humGain.connect(output);

    const originalStop = source.stop.bind(source);
    source.stop = (...args) => {
      try { hum.stop(...args); } catch (e) {}
      try { lfo.stop(...args); } catch (e) {}
      originalStop(...args);
    };
    source.connect = output.connect.bind(output);
    source.disconnect = output.disconnect.bind(output);

    return source;
  }

  createWaveNoise(ctx) {
    const source = this.createBrownNoise(ctx);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 120;
    highpass.Q.value = 0.6;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1800;
    lowpass.Q.value = 0.8;

    const swell = ctx.createGain();
    swell.gain.value = 0.4;

    const motion = ctx.createOscillator();
    motion.type = 'sine';
    motion.frequency.value = 0.12;
    const motionGain = ctx.createGain();
    motionGain.gain.value = 0.25;
    motion.connect(motionGain);
    motionGain.connect(swell.gain);
    motion.start();

    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(swell);

    const output = ctx.createGain();
    output.gain.value = 0.9;
    swell.connect(output);

    const originalStop = source.stop.bind(source);
    source.stop = (...args) => {
      try { motion.stop(...args); } catch (e) {}
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
