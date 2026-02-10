// Mirror App - Webcam mirror application

class MirrorApp {
  constructor() {
    this.migrateStorage();
    this.stream = null;
    this.facingMode = 'user';
    this.photos = this.loadPhotos();
    this.currentFilter = 'none';
    this.zoom = 1;
    this.brightness = 1;
    this.contrast = 1;
    this.isMirrored = true;

    this.initElements();
    this.initEventListeners();
    this.syncThemeWithParent();
    this.renderGallery();
  }

  initElements() {
    this.videoElement = document.getElementById('videoElement');
    this.canvas = document.getElementById('canvas');
    this.startScreen = document.getElementById('startScreen');
    this.errorScreen = document.getElementById('errorScreen');
    this.errorMessage = document.getElementById('errorMessage');
    this.startBtn = document.getElementById('startBtn');
    this.retryBtn = document.getElementById('retryBtn');
    this.captureBtn = document.getElementById('captureBtn');
    this.flipBtn = document.getElementById('flipBtn');
    this.galleryGrid = document.getElementById('galleryGrid');
    this.zoomSlider = document.getElementById('zoomSlider');
    this.zoomValue = document.getElementById('zoomValue');
    this.brightnessSlider = document.getElementById('brightnessSlider');
    this.brightnessValue = document.getElementById('brightnessValue');
    this.contrastSlider = document.getElementById('contrastSlider');
    this.contrastValue = document.getElementById('contrastValue');
    this.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    this.controlsToggle = document.getElementById('controlsToggle');
    this.controlPanel = document.getElementById('controlPanel');
  }

  syncThemeWithParent() {
    try {
      const savedTheme = localStorage.getItem('marlapps-theme');
      if (savedTheme) {
        this.applyTheme(savedTheme);
      }
    } catch (e) {
      // Fail silently
    }

    // Listen for theme changes from parent
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        this.applyTheme(event.data.theme);
      }
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  initEventListeners() {
    this.startBtn.addEventListener('click', () => this.startCamera());
    this.retryBtn.addEventListener('click', () => this.startCamera());
    this.captureBtn.addEventListener('click', () => this.capturePhoto());
    this.flipBtn.addEventListener('click', () => this.flipCamera());

    // Toggle controls panel
    this.controlsToggle.addEventListener('click', () => {
      this.controlPanel.classList.toggle('hidden');
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentFilter = e.target.dataset.filter;
        this.applyFilters();
      });
    });

    // Sliders
    this.zoomSlider.addEventListener('input', (e) => {
      this.zoom = parseFloat(e.target.value);
      this.zoomValue.textContent = `${this.zoom.toFixed(1)}x`;
      this.applyFilters();
    });

    this.brightnessSlider.addEventListener('input', (e) => {
      this.brightness = parseFloat(e.target.value);
      this.brightnessValue.textContent = `${Math.round(this.brightness * 100)}%`;
      this.applyFilters();
    });

    this.contrastSlider.addEventListener('input', (e) => {
      this.contrast = parseFloat(e.target.value);
      this.contrastValue.textContent = `${Math.round(this.contrast * 100)}%`;
      this.applyFilters();
    });

    this.resetFiltersBtn.addEventListener('click', () => this.resetFilters());
  }

  async startCamera() {
    try {
      this.errorScreen.style.display = 'none';

      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;

      this.startScreen.style.display = 'none';
      this.applyFilters();

    } catch (error) {
      console.error('Error accessing camera:', error);
      this.showError(error);
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  flipCamera() {
    // Toggle horizontal mirroring
    this.isMirrored = !this.isMirrored;
    this.applyFilters();
  }

  applyFilters() {
    let filterStr = `brightness(${this.brightness}) contrast(${this.contrast})`;

    switch (this.currentFilter) {
      case 'grayscale':
        filterStr += ' grayscale(100%)';
        break;
      case 'sepia':
        filterStr += ' sepia(100%)';
        break;
      case 'invert':
        filterStr += ' invert(100%)';
        break;
    }

    this.videoElement.style.filter = filterStr;
    const scaleX = this.isMirrored ? -1 : 1;
    this.videoElement.style.transform = `scaleX(${scaleX}) scale(${this.zoom})`;
  }

  resetFilters() {
    this.zoom = 1;
    this.brightness = 1;
    this.contrast = 1;
    this.currentFilter = 'none';
    this.isMirrored = true;

    this.zoomSlider.value = 1;
    this.zoomValue.textContent = '1.0x';
    this.brightnessSlider.value = 1;
    this.brightnessValue.textContent = '100%';
    this.contrastSlider.value = 1;
    this.contrastValue.textContent = '100%';

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === 'none');
    });

    this.applyFilters();
  }

  capturePhoto() {
    if (!this.stream) return;

    // Set canvas size to video size
    this.canvas.width = this.videoElement.videoWidth;
    this.canvas.height = this.videoElement.videoHeight;

    const ctx = this.canvas.getContext('2d');

    // Apply horizontal mirroring if enabled, plus zoom
    ctx.save();
    if (this.isMirrored) {
      ctx.translate(this.canvas.width, 0);
      ctx.scale(-1, 1);
    }

    // Apply zoom
    const zoomWidth = this.canvas.width * this.zoom;
    const zoomHeight = this.canvas.height * this.zoom;
    const offsetX = (zoomWidth - this.canvas.width) / 2;
    const offsetY = (zoomHeight - this.canvas.height) / 2;

    ctx.drawImage(
      this.videoElement,
      -offsetX,
      -offsetY,
      zoomWidth,
      zoomHeight
    );

    ctx.restore();

    // Apply filters to captured image
    if (this.brightness !== 1 || this.contrast !== 1 || this.currentFilter !== 'none') {
      let filterStr = `brightness(${this.brightness}) contrast(${this.contrast})`;

      switch (this.currentFilter) {
        case 'grayscale':
          filterStr += ' grayscale(100%)';
          break;
        case 'sepia':
          filterStr += ' sepia(100%)';
          break;
        case 'invert':
          filterStr += ' invert(100%)';
          break;
      }

      ctx.filter = filterStr;
      ctx.drawImage(this.canvas, 0, 0);
      ctx.filter = 'none';
    }

    // Convert to data URL
    const dataUrl = this.canvas.toDataURL('image/png');

    // Save photo
    const photo = {
      id: Date.now().toString(),
      dataUrl: dataUrl,
      timestamp: new Date().toISOString()
    };

    this.photos.unshift(photo);
    this.savePhotos();
    this.renderGallery();

    // Visual feedback
    this.videoElement.style.opacity = '0.5';
    setTimeout(() => {
      this.videoElement.style.opacity = '1';
    }, 100);
  }

  migrateStorage() {
    const old = localStorage.getItem('marlapps-mirror-photos');
    if (old) {
      localStorage.setItem('marlapps-mirror', old);
      localStorage.removeItem('marlapps-mirror-photos');
    }
  }

  loadPhotos() {
    const saved = localStorage.getItem('marlapps-mirror');
    if (!saved) return [];

    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map(photo => {
          if (!photo || typeof photo !== 'object') return null;
          if (typeof photo.id !== 'string' || typeof photo.dataUrl !== 'string') return null;

          return {
            id: photo.id,
            dataUrl: photo.dataUrl,
            timestamp: typeof photo.timestamp === 'string' ? photo.timestamp : new Date().toISOString()
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  savePhotos() {
    // Limit to 20 photos to avoid storage issues
    if (this.photos.length > 20) {
      this.photos = this.photos.slice(0, 20);
    }
    localStorage.setItem('marlapps-mirror', JSON.stringify(this.photos));
  }

  deletePhoto(photoId) {
    this.photos = this.photos.filter(p => p.id !== photoId);
    this.savePhotos();
    this.renderGallery();
  }

  downloadPhoto(photoId) {
    const photo = this.photos.find(p => p.id === photoId);
    if (!photo) return;

    const link = document.createElement('a');
    link.href = photo.dataUrl;
    link.download = `mirror-${photoId}.png`;
    link.click();
  }

  renderGallery() {
    if (this.photos.length === 0) {
      this.galleryGrid.innerHTML = `<div style="padding: 1rem; color: var(--mirror-text-tertiary);">No photos captured yet</div>`;
      return;
    }

    this.galleryGrid.innerHTML = this.photos.map(photo => {
      return `
        <div class="gallery-item" data-photo-id="${photo.id}">
          <img src="${photo.dataUrl}" alt="Captured photo">
          <button class="gallery-item-delete" title="Delete">&times;</button>
          <button class="gallery-item-download" title="Download">⬇</button>
        </div>
      `;
    }).join('');

    // Add event listeners
    document.querySelectorAll('.gallery-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const photoId = e.target.closest('.gallery-item').dataset.photoId;
        this.deletePhoto(photoId);
      });
    });

    document.querySelectorAll('.gallery-item-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const photoId = e.target.closest('.gallery-item').dataset.photoId;
        this.downloadPhoto(photoId);
      });
    });

    // Click to view full size
    document.querySelectorAll('.gallery-item img').forEach(img => {
      img.addEventListener('click', (e) => {
        window.open(e.target.src, '_blank');
      });
    });
  }

  showError(error) {
    this.startScreen.style.display = 'none';
    this.errorScreen.style.display = 'flex';

    let message = 'Unable to access camera. ';

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      message += 'Please allow camera access in your browser settings.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      message += 'No camera found on your device.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      message += 'Camera is already in use by another application.';
    } else {
      message += error.message || 'Unknown error occurred.';
    }

    this.errorMessage.textContent = message;
  }
}

// Initialize the app and store reference for cleanup
let mirrorAppInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  mirrorAppInstance = new MirrorApp();
});

// Cleanup on page unload to release camera resources
window.addEventListener('beforeunload', () => {
  if (mirrorAppInstance && mirrorAppInstance.stream) {
    mirrorAppInstance.stopCamera();
  }
});

// Also cleanup when page visibility changes (mobile optimization)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mirrorAppInstance && mirrorAppInstance.stream) {
    mirrorAppInstance.stopCamera();
  }
});
