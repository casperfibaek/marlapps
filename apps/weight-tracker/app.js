class WeightTrackerApp {
  constructor() {
    this.STORAGE_KEY = 'marlapps-weight-tracker';
    this.KG_PER_LB = 0.45359237;
    this.LB_PER_KG = 2.20462262;

    this.data = this.loadData();
    this.editingId = null;
    this.chartRange = 30;

    this.initElements();
    this.initEventListeners();
    this.syncThemeWithParent();
    this.render();
  }

  // --- Data ---

  loadData() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    const defaults = { entries: [], unit: 'imperial' };
    if (!saved) return defaults;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaults;
      }

      const unit = parsed.unit === 'metric' || parsed.unit === 'imperial'
        ? parsed.unit
        : defaults.unit;

      const entries = Array.isArray(parsed.entries)
        ? parsed.entries
          .map((entry, index) => {
            if (!entry || typeof entry !== 'object') return null;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return null;

            const storedKg = Number.parseFloat(entry.weightKg);
            const legacyWeight = Number.parseFloat(entry.weight);
            const weightKg = Number.isFinite(storedKg) && storedKg > 0
              ? storedKg
              : (Number.isFinite(legacyWeight) && legacyWeight > 0
                ? this.toKilograms(legacyWeight, unit)
                : NaN);
            if (!Number.isFinite(weightKg) || weightKg <= 0) return null;

            return {
              id: typeof entry.id === 'string'
                ? entry.id
                : `${entry.date}-${index}`,
              date: entry.date,
              weightKg: this.roundKg(weightKg),
              note: typeof entry.note === 'string' ? entry.note : ''
            };
          })
          .filter(Boolean)
        : [];

      return { entries, unit };
    } catch {
      return defaults;
    }
  }

  saveData() {
    const payload = {
      unit: this.data.unit,
      entries: this.data.entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        weightKg: this.roundKg(entry.weightKg),
        // Legacy compatibility for older app versions that still read `weight`.
        weight: Math.round(this.toDisplay(entry.weightKg) * 10) / 10,
        note: entry.note
      }))
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
  }

  getSortedEntries() {
    return [...this.data.entries].sort((a, b) => a.date.localeCompare(b.date));
  }

  // Weights are stored in kg and converted for display/input using current unit.
  toDisplay(weightKg) {
    if (!Number.isFinite(weightKg)) return NaN;
    return this.data.unit === 'metric'
      ? weightKg
      : weightKg * this.LB_PER_KG;
  }

  toKilograms(weight, unit = this.data.unit) {
    if (!Number.isFinite(weight)) return NaN;
    return unit === 'metric'
      ? weight
      : weight * this.KG_PER_LB;
  }

  roundKg(weightKg) {
    return Math.round(weightKg * 10000) / 10000;
  }

  unitLabel() {
    return this.data.unit === 'metric' ? 'kg' : 'lbs';
  }

  formatWeight(weightKg) {
    if (weightKg == null || !Number.isFinite(weightKg)) return '—';
    return this.toDisplay(weightKg).toFixed(1) + ' ' + this.unitLabel();
  }

  // --- Elements ---

  initElements() {
    this.addBtn = document.getElementById('addEntryBtn');
    this.modal = document.getElementById('entryModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalUnit = document.getElementById('modalUnit');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.modalCancelBtn = document.getElementById('modalCancelBtn');
    this.modalSaveBtn = document.getElementById('modalSaveBtn');
    this.modalDeleteBtn = document.getElementById('modalDeleteBtn');
    this.dateInput = document.getElementById('entryDate');
    this.weightInput = document.getElementById('entryWeight');
    this.noteInput = document.getElementById('entryNote');
    this.entriesList = document.getElementById('entriesList');
    this.emptyState = document.getElementById('emptyState');
    this.chartCanvas = document.getElementById('weightChart');
    this.chartEmpty = document.getElementById('chartEmpty');
    this.avgWeek = document.getElementById('avgWeek');
    this.avgMonth = document.getElementById('avgMonth');
    this.avgYear = document.getElementById('avgYear');
    this.avgAll = document.getElementById('avgAll');
    this.statCurrent = document.getElementById('statCurrent');
    this.statLowest = document.getElementById('statLowest');
    this.statHighest = document.getElementById('statHighest');
    this.statChange = document.getElementById('statChange');
    this.unitBtns = document.querySelectorAll('.unit-btn');
    this.rangeBtns = document.querySelectorAll('.range-btn');
  }

  initEventListeners() {
    this.addBtn.addEventListener('click', () => this.openModal());
    this.modalCloseBtn.addEventListener('click', () => this.closeModal());
    this.modalCancelBtn.addEventListener('click', () => this.closeModal());
    this.modalSaveBtn.addEventListener('click', () => this.saveEntry());
    this.modalDeleteBtn.addEventListener('click', () => this.deleteEntry());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    this.unitBtns.forEach(btn => {
      btn.addEventListener('click', () => this.setUnit(btn.dataset.unit));
    });

    this.rangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.chartRange = parseInt(btn.dataset.range, 10);
        this.rangeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderChart();
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  }

  // --- Unit switching ---

  setUnit(unit) {
    if (unit !== 'metric' && unit !== 'imperial') return;
    if (unit === this.data.unit) return;
    this.data.unit = unit;
    this.saveData();
    this.unitBtns.forEach(b => b.classList.toggle('active', b.dataset.unit === unit));
    this.render();
  }

  // --- Modal ---

  openModal(entry = null) {
    this.editingId = entry ? entry.id : null;
    this.modalTitle.textContent = entry ? 'Edit Entry' : 'Log Weight';
    this.modalUnit.textContent = this.unitLabel();
    this.modalDeleteBtn.style.display = entry ? '' : 'none';

    if (entry) {
      this.dateInput.value = entry.date;
      this.weightInput.value = this.toDisplay(entry.weightKg).toFixed(1);
      this.noteInput.value = entry.note || '';
    } else {
      this.dateInput.value = this.todayStr();
      this.weightInput.value = '';
      this.noteInput.value = '';
    }

    this.modal.classList.add('active');
    this.weightInput.focus();
  }

  closeModal() {
    this.modal.classList.remove('active');
    this.editingId = null;
  }

  todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  toLocalDateKey(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  // --- CRUD ---

  saveEntry() {
    const date = this.dateInput.value;
    const weight = Number.parseFloat(this.weightInput.value);
    const note = this.noteInput.value.trim();
    const weightKg = this.toKilograms(weight);

    if (!date || !Number.isFinite(weightKg) || weightKg <= 0) return;

    if (this.editingId) {
      const entry = this.data.entries.find(e => e.id === this.editingId);
      if (entry) {
        entry.date = date;
        entry.weightKg = this.roundKg(weightKg);
        entry.note = note;
      }
    } else {
      this.data.entries.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date,
        weightKg: this.roundKg(weightKg),
        note
      });
    }

    this.saveData();
    this.closeModal();
    this.render();
  }

  deleteEntry() {
    if (!this.editingId) return;
    this.data.entries = this.data.entries.filter(e => e.id !== this.editingId);
    this.saveData();
    this.closeModal();
    this.render();
  }

  // --- Averages & Stats ---

  calcAverage(entries) {
    if (!entries.length) return null;
    const sum = entries.reduce((s, e) => s + e.weightKg, 0);
    return sum / entries.length;
  }

  getEntriesInRange(sorted, startDate) {
    const start = this.toLocalDateKey(startDate);
    return sorted.filter(e => e.date >= start);
  }

  updateAverages() {
    const sorted = this.getSortedEntries();
    const now = new Date();

    // This week (Monday start)
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = day === 0 ? 6 : day - 1;
    weekStart.setDate(weekStart.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);

    // This month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // This year
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const weekEntries = this.getEntriesInRange(sorted, weekStart);
    const monthEntries = this.getEntriesInRange(sorted, monthStart);
    const yearEntries = this.getEntriesInRange(sorted, yearStart);

    this.avgWeek.textContent = this.formatWeight(this.calcAverage(weekEntries));
    this.avgMonth.textContent = this.formatWeight(this.calcAverage(monthEntries));
    this.avgYear.textContent = this.formatWeight(this.calcAverage(yearEntries));
    this.avgAll.textContent = this.formatWeight(this.calcAverage(sorted));
  }

  updateStats() {
    const sorted = this.getSortedEntries();
    if (!sorted.length) {
      this.statCurrent.textContent = '—';
      this.statLowest.textContent = '—';
      this.statHighest.textContent = '—';
      this.statChange.textContent = '—';
      this.statChange.className = 'stat-value';
      return;
    }

    const current = sorted[sorted.length - 1].weightKg;
    const lowest = Math.min(...sorted.map(e => e.weightKg));
    const highest = Math.max(...sorted.map(e => e.weightKg));
    const change = current - sorted[0].weightKg;

    this.statCurrent.textContent = this.formatWeight(current);
    this.statLowest.textContent = this.formatWeight(lowest);
    this.statHighest.textContent = this.formatWeight(highest);

    if (sorted.length > 1) {
      const displayChange = this.toDisplay(change);
      const sign = change > 0 ? '+' : '';
      this.statChange.textContent = sign + displayChange.toFixed(1) + ' ' + this.unitLabel();
      this.statChange.className = 'stat-value' + (change > 0 ? ' positive' : change < 0 ? ' negative' : '');
    } else {
      this.statChange.textContent = '—';
      this.statChange.className = 'stat-value';
    }
  }

  // --- Entries List ---

  renderEntries() {
    const sorted = this.getSortedEntries().reverse();
    const hasEntries = sorted.length > 0;

    this.emptyState.classList.toggle('hidden', hasEntries);
    this.entriesList.innerHTML = '';

    if (!hasEntries) return;

    sorted.forEach((entry, i) => {
      const item = document.createElement('div');
      item.className = 'entry-item';

      const prevEntry = sorted[i + 1]; // previous chronologically (next in reversed)
      let diffHtml = '';
      if (prevEntry) {
        const d = this.toDisplay(entry.weightKg) - this.toDisplay(prevEntry.weightKg);
        const sign = d > 0 ? '+' : '';
        const cls = d < 0 ? 'loss' : d > 0 ? 'gain' : 'same';
        diffHtml = `<span class="entry-diff ${cls}">${sign}${d.toFixed(1)}</span>`;
      }

      const noteHtml = entry.note ? `<span class="entry-note">${this.escapeHtml(entry.note)}</span>` : '';
      const displayWeight = this.toDisplay(entry.weightKg);

      item.innerHTML = `
        <div class="entry-left">
          <span class="entry-date">${this.formatDate(entry.date)}</span>
          ${noteHtml}
        </div>
        <div class="entry-right">
          ${diffHtml}
          <span class="entry-weight">${displayWeight.toFixed(1)} ${this.unitLabel()}</span>
        </div>
      `;

      item.addEventListener('click', () => this.openModal(entry));
      this.entriesList.appendChild(item);
    });
  }

  formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Chart ---

  renderChart() {
    const sorted = this.getSortedEntries();
    let entries = sorted;

    if (this.chartRange > 0 && entries.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.chartRange);
      const cutoffStr = this.toLocalDateKey(cutoff);
      entries = entries.filter(e => e.date >= cutoffStr);
    }

    if (entries.length < 2) {
      this.chartEmpty.classList.remove('hidden');
      const ctx = this.chartCanvas.getContext('2d');
      ctx.clearRect(0, 0, this.chartCanvas.width, this.chartCanvas.height);
      return;
    }

    this.chartEmpty.classList.add('hidden');
    this.drawChart(entries);
  }

  drawChart(entries) {
    const canvas = this.chartCanvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const pad = { top: 20, right: 16, bottom: 30, left: 50 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    ctx.clearRect(0, 0, W, H);

    const weights = entries.map(e => this.toDisplay(e.weightKg));
    let minW = Math.min(...weights);
    let maxW = Math.max(...weights);
    if (minW === maxW) {
      minW -= 1;
      maxW += 1;
    }
    const rangeW = maxW - minW;
    const padW = rangeW * 0.1;
    minW -= padW;
    maxW += padW;

    const dates = entries.map(e => new Date(e.date + 'T00:00:00').getTime());
    const minD = dates[0];
    const maxD = dates[dates.length - 1];
    const rangeD = maxD - minD || 1;

    const toX = (d) => pad.left + ((d - minD) / rangeD) * plotW;
    const toY = (w) => pad.top + plotH - ((w - minW) / (maxW - minW)) * plotH;

    // Get theme-aware colors
    const style = getComputedStyle(document.documentElement);
    const textColor = style.getPropertyValue('--app-text-secondary').trim() || '#888';
    const gridColor = style.getPropertyValue('--app-border-light').trim() || 'rgba(255,255,255,0.08)';
    const accentColor = style.getPropertyValue('--app-accent').trim() || '#2ECC71';

    // Grid lines
    const gridLines = 5;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (plotH / gridLines) * i;
      const val = maxW - ((maxW - minW) / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), pad.left - 6, y + 4);
    }

    // Date labels
    ctx.textAlign = 'center';
    const labelCount = Math.min(entries.length, Math.floor(plotW / 70));
    const step = Math.max(1, Math.floor(entries.length / labelCount));
    for (let i = 0; i < entries.length; i += step) {
      const x = toX(dates[i]);
      const d = new Date(entries[i].date + 'T00:00:00');
      const label = (d.getMonth() + 1) + '/' + d.getDate();
      ctx.fillText(label, x, H - pad.bottom + 18);
    }

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradient.addColorStop(0, accentColor + '40');
    gradient.addColorStop(1, accentColor + '05');

    ctx.beginPath();
    ctx.moveTo(toX(dates[0]), pad.top + plotH);
    entries.forEach((e, i) => ctx.lineTo(toX(dates[i]), toY(this.toDisplay(e.weightKg))));
    ctx.lineTo(toX(dates[dates.length - 1]), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    entries.forEach((e, i) => {
      const x = toX(dates[i]);
      const y = toY(this.toDisplay(e.weightKg));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Data points
    entries.forEach((e, i) => {
      const x = toX(dates[i]);
      const y = toY(this.toDisplay(e.weightKg));
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
      ctx.strokeStyle = style.getPropertyValue('--app-bg-secondary').trim() || '#1a1a2e';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  // --- Theme ---

  syncThemeWithParent() {
    try {
      const savedTheme = localStorage.getItem('marlapps-theme');
      if (savedTheme) this.applyTheme(savedTheme);
    } catch (e) { /* ignore */ }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        this.applyTheme(event.data.theme);
      }
    });
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Re-render chart with new theme colors
    requestAnimationFrame(() => this.renderChart());
  }

  // --- Render ---

  render() {
    this.unitBtns.forEach(b => b.classList.toggle('active', b.dataset.unit === this.data.unit));
    this.modalUnit.textContent = this.unitLabel();
    this.updateAverages();
    this.updateStats();
    this.renderEntries();
    this.renderChart();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new WeightTrackerApp();

  // Redraw chart on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => app.renderChart(), 150);
  });
});
