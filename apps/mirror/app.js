import { MAX_PHOTOS, deletePhotoById, loadPhotos, savePhoto } from './storage.js';

class MirrorApp {
  constructor() {
    this.stream = null;
    this.facingMode = 'user';
    this.photos = [];
    this.photoObjectUrls = new Map();
    this.currentFilter = 'none';
    this.zoom = 1;
    this.brightness = 1;
    this.contrast = 1;
    this.isMirrored = true;
    this.fillMode = false;
    this.storageStatusTimer = null;

    this.initElements();
    this.initEventListeners();
    this.updateFlipButtonState();
    this.syncThemeWithParent();
    this.renderGallery();
  }

  async init() {
    try {
      const storedPhotos = await loadPhotos();
      this.replacePhotoModels(storedPhotos);
      this.renderGallery();
    } catch (error) {
      console.error('Failed to load saved photos:', error);
      this.showStorageStatus('Saved photos could not be loaded.', 'error');
    }
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
    this.storageStatus = document.getElementById('storageStatus');
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
      // Fail silently.
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

  initEventListeners() {
    this.startBtn.addEventListener('click', () => this.startCamera());
    this.retryBtn.addEventListener('click', () => this.startCamera());
    this.captureBtn.addEventListener('click', () => this.capturePhoto());
    this.flipBtn.addEventListener('click', () => this.flipCamera());

    this.fillToggleBtn.addEventListener('click', () => {
      this.fillMode = !this.fillMode;
      this.updateFillMode();
    });

    this.controlsToggle.addEventListener('click', () => {
      this.controlPanel.classList.toggle('hidden');
    });

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        document.querySelectorAll('.filter-btn').forEach(filterBtn => filterBtn.classList.remove('active'));
        event.currentTarget.classList.add('active');
        this.currentFilter = event.currentTarget.dataset.filter;
        this.applyFilters();
      });
    });

    this.zoomSlider.addEventListener('input', (event) => {
      this.zoom = Number.parseFloat(event.target.value);
      this.zoomValue.textContent = `${this.zoom.toFixed(1)}x`;
      this.applyFilters();
    });

    this.brightnessSlider.addEventListener('input', (event) => {
      this.brightness = Number.parseFloat(event.target.value);
      this.brightnessValue.textContent = `${Math.round(this.brightness * 100)}%`;
      this.applyFilters();
    });

    this.contrastSlider.addEventListener('input', (event) => {
      this.contrast = Number.parseFloat(event.target.value);
      this.contrastValue.textContent = `${Math.round(this.contrast * 100)}%`;
      this.applyFilters();
    });

    this.resetFiltersBtn.addEventListener('click', () => this.resetFilters());

    this.galleryGrid.addEventListener('click', (event) => {
      const item = event.target.closest('.gallery-item');
      if (!item) return;
      const photoId = item.dataset.photoId;

      if (event.target.closest('.gallery-item-delete')) {
        this.confirmDelete(photoId);
      } else if (event.target.closest('.gallery-item-download')) {
        this.downloadPhoto(photoId);
      } else if (event.target.closest('img')) {
        this.openLightbox(photoId);
      }
    });

    this.lightboxClose.addEventListener('click', () => this.closeLightbox());
    this.lightbox.addEventListener('click', (event) => {
      if (event.target === this.lightbox) this.closeLightbox();
    });

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
      default:
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

    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filter === 'none');
    });

    this.applyFilters();
  }

  async capturePhoto() {
    if (!this.stream) return;

    this.canvas.width = this.videoElement.videoWidth;
    this.canvas.height = this.videoElement.videoHeight;

    const ctx = this.canvas.getContext('2d');
    ctx.filter = this.buildFilterString();
    ctx.save();

    const scaleX = this.isMirrored ? -1 : 1;
    if (this.isMirrored) {
      ctx.translate(this.canvas.width, 0);
    }

    const zoomWidth = this.canvas.width * this.zoom;
    const zoomHeight = this.canvas.height * this.zoom;
    const offsetX = (zoomWidth - this.canvas.width) / 2;
    const offsetY = (zoomHeight - this.canvas.height) / 2;
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

    const blob = await this.canvasToBlob('image/jpeg', 0.85);
    if (!blob) {
      this.showStorageStatus('Photo not saved. Image encoding failed.', 'error');
      return;
    }

    const record = {
      id: Date.now().toString(),
      blob,
      timestamp: new Date().toISOString()
    };

    try {
      const { removedIds } = await savePhoto(record, { limit: MAX_PHOTOS });
      this.photos.unshift(this.createPhotoModel(record));
      removedIds.forEach(photoId => this.removePhotoFromMemory(photoId));
      this.photos = this.photos.slice(0, MAX_PHOTOS);
      this.showStorageStatus('');
      this.renderGallery();
    } catch (error) {
      console.error('Failed to save photo:', error);
      const message = this.isQuotaError(error)
        ? 'Photo not saved. Browser storage is full.'
        : 'Photo not saved. Please try again.';
      this.showStorageStatus(message, 'error');
      return;
    }

    this.flashOverlay.classList.add('flash');
    this.flashOverlay.addEventListener('animationend', () => {
      this.flashOverlay.classList.remove('flash');
    }, { once: true });
  }

  canvasToBlob(type, quality) {
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => resolve(blob), type, quality);
    });
  }

  replacePhotoModels(records) {
    const nextIds = new Set(records.map(record => record.id));
    this.photoObjectUrls.forEach((url, photoId) => {
      if (!nextIds.has(photoId)) {
        URL.revokeObjectURL(url);
        this.photoObjectUrls.delete(photoId);
      }
    });

    this.photos = records.map(record => this.createPhotoModel(record));
  }

  createPhotoModel(record) {
    const existingUrl = this.photoObjectUrls.get(record.id);
    if (existingUrl) {
      URL.revokeObjectURL(existingUrl);
    }

    const objectUrl = URL.createObjectURL(record.blob);
    this.photoObjectUrls.set(record.id, objectUrl);

    return {
      id: record.id,
      blob: record.blob,
      timestamp: record.timestamp,
      objectUrl
    };
  }

  revokePhotoUrl(photoId) {
    const objectUrl = this.photoObjectUrls.get(photoId);
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    this.photoObjectUrls.delete(photoId);
  }

  removePhotoFromMemory(photoId) {
    this.revokePhotoUrl(photoId);
    this.photos = this.photos.filter(photo => photo.id !== photoId);
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

  async deletePhoto(photoId) {
    try {
      await deletePhotoById(photoId);
      this.removePhotoFromMemory(photoId);
      this.renderGallery();
      this.showStorageStatus('');
    } catch (error) {
      console.error('Failed to delete photo:', error);
      this.showStorageStatus('Photo could not be deleted.', 'error');
    }
  }

  downloadPhoto(photoId) {
    const photo = this.photos.find(item => item.id === photoId);
    if (!photo) return;

    const link = document.createElement('a');
    link.href = photo.objectUrl;
    link.download = `mirror-${photoId}.jpg`;
    link.click();
  }

  openLightbox(photoId) {
    const photo = this.photos.find(item => item.id === photoId);
    if (!photo) return;
    this.lightboxImg.src = photo.objectUrl;
    this.lightbox.classList.add('visible');
  }

  closeLightbox() {
    this.lightbox.classList.remove('visible');
    this.lightboxImg.src = '';
  }

  renderGallery() {
    this.photoCount.textContent = `${this.photos.length}/${MAX_PHOTOS}`;
    const hasStatusMessage = Boolean(this.storageStatus && this.storageStatus.textContent);

    if (this.photos.length === 0) {
      this.gallerySection.classList.toggle('empty', !hasStatusMessage);
      this.galleryGrid.innerHTML = '';
      return;
    }

    this.gallerySection.classList.remove('empty');
    this.galleryGrid.innerHTML = this.photos.map(photo => `
      <div class="gallery-item" data-photo-id="${photo.id}">
        <img src="${photo.objectUrl}" alt="Captured photo">
        <button class="gallery-item-delete" title="Delete">&times;</button>
        <button class="gallery-item-download" title="Download">⬇</button>
      </div>
    `).join('');
  }

  showStorageStatus(message, variant = '') {
    if (!this.storageStatus) return;

    clearTimeout(this.storageStatusTimer);
    this.storageStatus.textContent = message || '';

    if (variant) {
      this.storageStatus.dataset.variant = variant;
    } else {
      delete this.storageStatus.dataset.variant;
    }

    if (message) {
      this.gallerySection.classList.remove('empty');
    } else if (this.photos.length === 0) {
      this.gallerySection.classList.add('empty');
    }

    if (!message) return;

    this.storageStatusTimer = setTimeout(() => {
      this.storageStatus.textContent = '';
      delete this.storageStatus.dataset.variant;
      if (this.photos.length === 0) {
        this.gallerySection.classList.add('empty');
      }
    }, 4000);
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

  isQuotaError(error) {
    const message = String(error && error.message ? error.message : error || '').toLowerCase();
    return error && error.name === 'QuotaExceededError'
      || message.includes('quota')
      || message.includes('storage');
  }

  releasePhotoUrls() {
    this.photoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.photoObjectUrls.clear();
  }

  destroy() {
    clearTimeout(this.storageStatusTimer);
    this.stopCamera();
    this.closeLightbox();
    this.releasePhotoUrls();
  }
}

let mirrorAppInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  mirrorAppInstance = new MirrorApp();
  await mirrorAppInstance.init();
});

window.addEventListener('beforeunload', () => {
  if (mirrorAppInstance) {
    mirrorAppInstance.destroy();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!mirrorAppInstance) return;

  if (document.hidden) {
    if (mirrorAppInstance.stream) {
      mirrorAppInstance.wasRunning = true;
      mirrorAppInstance.stopCamera();
    }
  } else if (mirrorAppInstance.wasRunning) {
    mirrorAppInstance.wasRunning = false;
    mirrorAppInstance.startCamera();
  }
});
