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
    this.fillMode = false;

    this.initElements();
    this.initEventListeners();
    this.updateFlipButtonState();
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
    this.fillToggleBtn = document.getElementById('fillToggleBtn');
    this.gallerySection = document.getElementById('gallerySection');
    this.galleryGrid = document.getElementById('galleryGrid');
    this.photoCount = document.getElementById('photoCount');
    this.zoomSlider = document.getElementById('zoomSlider');
    this.zoomValue = document.getElementById('zoomValue');
    this.brightnessSlider = document.getElementById('brightnessSlider');
    this.brightnessValue = document.getElementById('brightnessValue');
    this.contrastSlider = document.getElementById('contrastSlider');
    this.contrastValue = document.getElementById('contrastValue');
    this.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    this.controlsToggle = document.getElementById('controlsToggle');
    this.controlPanel = document.getElementById('controlPanel');
    this.flashOverlay = document.getElementById('flashOverlay');
    this.lightbox = document.getElementById('lightbox');
    this.lightboxImg = document.getElementById('lightboxImg');
    this.lightboxClose = document.getElementById('lightboxClose');
    this.confirmDialog = document.getElementById('confirmDialog');
    this.confirmYes = document.getElementById('confirmYes');
    this.confirmNo = document.getElementById('confirmNo');
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

    // Fill/contain toggle
    this.fillToggleBtn.addEventListener('click', () => {
      this.fillMode = !this.fillMode;
      this.updateFillMode();
    });

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

    // Gallery event delegation
    this.galleryGrid.addEventListener('click', (e) => {
      const item = e.target.closest('.gallery-item');
      if (!item) return;
      const photoId = item.dataset.photoId;

      if (e.target.closest('.gallery-item-delete')) {
        this.confirmDelete(photoId);
      } else if (e.target.closest('.gallery-item-download')) {
        this.downloadPhoto(photoId);
      } else if (e.target.closest('img')) {
        this.openLightbox(photoId);
      }
    });

    // Lightbox close
    this.lightboxClose.addEventListener('click', () => this.closeLightbox());
    this.lightbox.addEventListener('click', (e) => {
      if (e.target === this.lightbox) this.closeLightbox();
    });

    // Confirm dialog
    this.confirmNo.addEventListener('click', () => this.closeConfirmDialog());
  }

  updateFillMode() {
    this.videoElement.classList.toggle('fill-mode', this.fillMode);
    this.fillToggleBtn.title = this.fillMode ? 'Fit to screen' : 'Fill screen';
    this.fillToggleBtn.setAttribute('aria-label', this.fillToggleBtn.title);
    this.fillToggleBtn.querySelector('span').textContent = this.fillMode ? '⊡' : '⊞';
  }

  async startCamera() {
    try {
      this.errorScreen.style.display = 'none';
      const stream = await this.requestCameraStream(this.facingMode);
      this.setStream(stream);
      this.isMirrored = this.facingMode === 'user';

      this.startScreen.style.display = 'none';
      this.updateFlipButtonState();
      this.applyFilters();
      return true;

    } catch (error) {
      console.error('Error accessing camera:', error);
      this.showError(error);
      return false;
    }
  }

  buildCameraConstraints(facingMode) {
    return {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };
  }

  requestCameraStream(facingMode) {
    return navigator.mediaDevices.getUserMedia(this.buildCameraConstraints(facingMode));
  }

  setStream(stream) {
    if (this.stream && this.stream !== stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.stream = stream;
    this.videoElement.srcObject = stream;
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  async flipCamera() {
    const previousMode = this.facingMode;
    const nextMode = this.facingMode === 'user' ? 'environment' : 'user';

    this.facingMode = nextMode;
    this.isMirrored = nextMode === 'user';
    this.updateFlipButtonState();

    if (!this.stream) {
      this.applyFilters();
      return;
    }

    try {
      const stream = await this.requestCameraStream(nextMode);
      this.setStream(stream);
      this.errorScreen.style.display = 'none';
      this.applyFilters();
    } catch (error) {
      console.warn('Unable to switch camera, keeping current stream:', error);
      this.facingMode = previousMode;
      this.isMirrored = previousMode === 'user';
      this.updateFlipButtonState();
      this.applyFilters();
    }
  }

  updateFlipButtonState() {
    if (!this.flipBtn) return;
    const nextCamera = this.facingMode === 'user' ? 'rear' : 'front';
    const label = `Switch to ${nextCamera} camera`;
    this.flipBtn.title = label;
    this.flipBtn.setAttribute('aria-label', label);
  }

  buildFilterString() {
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

    return filterStr;
  }

  applyFilters() {
    this.videoElement.style.filter = this.buildFilterString();
    const scaleX = this.isMirrored ? -1 : 1;
    this.videoElement.style.transform = `scaleX(${scaleX}) scale(${this.zoom})`;
  }

  resetFilters() {
    this.zoom = 1;
    this.brightness = 1;
    this.contrast = 1;
    this.currentFilter = 'none';
    this.isMirrored = this.facingMode === 'user';

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

    const maxPhotos = 20;
    if (this.photos.length >= maxPhotos) {
      this.photos.pop();
    }

    // Set canvas size to video size
    this.canvas.width = this.videoElement.videoWidth;
    this.canvas.height = this.videoElement.videoHeight;

    const ctx = this.canvas.getContext('2d');

    // Apply filters to the draw operation
    ctx.filter = this.buildFilterString();

    // Apply horizontal mirroring if enabled, plus zoom
    ctx.save();

    const scaleX = this.isMirrored ? -1 : 1;
    if (this.isMirrored) {
      ctx.translate(this.canvas.width, 0);
    }

    // Calculate zoom crop
    const zoomWidth = this.canvas.width * this.zoom;
    const zoomHeight = this.canvas.height * this.zoom;
    const offsetX = (zoomWidth - this.canvas.width) / 2;
    const offsetY = (zoomHeight - this.canvas.height) / 2;

    // When mirrored, the coordinate system is flipped so offset direction reverses
    const drawX = this.isMirrored ? offsetX : -offsetX;

    ctx.scale(scaleX, 1);
    ctx.drawImage(
      this.videoElement,
      drawX,
      -offsetY,
      zoomWidth,
      zoomHeight
    );

    ctx.restore();
    ctx.filter = 'none';

    // Convert to data URL (JPEG for smaller size)
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.85);

    // Save photo
    const photo = {
      id: Date.now().toString(),
      dataUrl: dataUrl,
      timestamp: new Date().toISOString()
    };

    this.photos.unshift(photo);
    this.savePhotos();
    this.renderGallery();

    // Visual feedback - white flash
    this.flashOverlay.classList.add('flash');
    this.flashOverlay.addEventListener('animationend', () => {
      this.flashOverlay.classList.remove('flash');
    }, { once: true });
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
    // Limit to 20 photos
    if (this.photos.length > 20) {
      this.photos = this.photos.slice(0, 20);
    }
    localStorage.setItem('marlapps-mirror', JSON.stringify(this.photos));
  }

  confirmDelete(photoId) {
    this.pendingDeleteId = photoId;
    this.confirmDialog.classList.add('visible');
    this.confirmYes.onclick = () => {
      this.deletePhoto(this.pendingDeleteId);
      this.closeConfirmDialog();
    };
  }

  closeConfirmDialog() {
    this.confirmDialog.classList.remove('visible');
    this.pendingDeleteId = null;
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
    link.download = `mirror-${photoId}.jpg`;
    link.click();
  }

  openLightbox(photoId) {
    const photo = this.photos.find(p => p.id === photoId);
    if (!photo) return;
    this.lightboxImg.src = photo.dataUrl;
    this.lightbox.classList.add('visible');
  }

  closeLightbox() {
    this.lightbox.classList.remove('visible');
    this.lightboxImg.src = '';
  }

  renderGallery() {
    const maxPhotos = 20;
    this.photoCount.textContent = `${this.photos.length}/${maxPhotos}`;

    if (this.photos.length === 0) {
      this.gallerySection.classList.add('empty');
      this.galleryGrid.innerHTML = '';
      return;
    }

    this.gallerySection.classList.remove('empty');
    this.galleryGrid.innerHTML = this.photos.map(photo => {
      return `
        <div class="gallery-item" data-photo-id="${photo.id}">
          <img src="${photo.dataUrl}" alt="Captured photo">
          <button class="gallery-item-delete" title="Delete">&times;</button>
          <button class="gallery-item-download" title="Download">⬇</button>
        </div>
      `;
    }).join('');
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

// Pause/resume camera when page visibility changes (mobile optimization)
document.addEventListener('visibilitychange', () => {
  if (!mirrorAppInstance) return;

  if (document.hidden) {
    if (mirrorAppInstance.stream) {
      mirrorAppInstance.wasRunning = true;
      mirrorAppInstance.stopCamera();
    }
  } else {
    if (mirrorAppInstance.wasRunning) {
      mirrorAppInstance.wasRunning = false;
      mirrorAppInstance.startCamera();
    }
  }
});
