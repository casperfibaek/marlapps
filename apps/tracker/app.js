import { drawChart } from './chart.js';

class TrackerApp {
  constructor() {
    this.STORAGE_KEY = 'marlapps-tracker';
    this.data = this.loadData();
    this.currentView = 'list'; // 'list' or 'detail'
    this.activeTrackerId = null;
    this.editingTrackerId = null; // for tracker modal in edit mode
    this.editingEntryDate = null; // for entry modal in edit mode
    this.chartRange = 30;
    this.currentWeekStart = this.getWeekStart(new Date());
    this.selectedType = 'numeric';
    this.selectedColor = '#1ABC9C';

    this.initElements();
    this.initEventListeners();
    this.syncThemeWithParent();
    this.render();
  }

  // ==================== DATA ====================

  loadData() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    const defaults = { trackers: [] };
    if (!saved) return defaults;
    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.trackers)) return defaults;
      parsed.trackers = parsed.trackers.filter(t =>
        t && typeof t === 'object' &&
        typeof t.id === 'string' &&
        typeof t.name === 'string' &&
        (t.type === 'numeric' || t.type === 'boolean')
      ).map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        color: typeof t.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(t.color) ? t.color : '#1ABC9C',
        unit: typeof t.unit === 'string' ? t.unit : '',
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
        entries: this.validateEntries(t.entries, t.type)
      }));
      return parsed;
    } catch {
      return defaults;
    }
  }

  validateEntries(entries, type) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return {};
    const valid = {};
    for (const [date, val] of Object.entries(entries)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (type === 'boolean' && val === true) {
        valid[date] = true;
      } else if (type === 'numeric' && typeof val === 'number' && Number.isFinite(val)) {
        valid[date] = val;
      }
    }
    return valid;
  }

  saveData() {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
  }

  getTracker(id) {
    return this.data.trackers.find(t => t.id === id) || null;
  }

  getActiveTracker() {
    return this.getTracker(this.activeTrackerId);
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  toDateKey(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
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

  sanitizeColor(color) {
    return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#1ABC9C';
  }

  // ==================== ELEMENTS ====================

  initElements() {
    // Views
    this.listView = document.getElementById('listView');
    this.detailView = document.getElementById('detailView');

    // List view
    this.addTrackerBtn = document.getElementById('addTrackerBtn');
    this.trackerList = document.getElementById('trackerList');
    this.emptyState = document.getElementById('emptyState');

    // Detail view
    this.backBtn = document.getElementById('backBtn');
    this.detailTitle = document.getElementById('detailTitle');
    this.editTrackerBtn = document.getElementById('editTrackerBtn');
    this.deleteTrackerBtn = document.getElementById('deleteTrackerBtn');
    this.quickEntry = document.getElementById('quickEntry');
    this.chartSection = document.getElementById('chartSection');
    this.chartCanvas = document.getElementById('trackerChart');
    this.chartEmpty = document.getElementById('chartEmpty');
    this.calendarSection = document.getElementById('calendarSection');
    this.calendarGrid = document.getElementById('calendarGrid');
    this.prevWeekBtn = document.getElementById('prevWeekBtn');
    this.nextWeekBtn = document.getElementById('nextWeekBtn');
    this.todayBtn = document.getElementById('todayBtn');
    this.weekDisplay = document.getElementById('weekDisplay');
    this.statsGrid = document.getElementById('statsGrid');
    this.entriesList = document.getElementById('entriesList');
    this.entriesEmpty = document.getElementById('entriesEmpty');
    this.rangeBtns = document.querySelectorAll('.range-btn');

    // Tracker modal
    this.trackerModal = document.getElementById('trackerModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.modalCancelBtn = document.getElementById('modalCancelBtn');
    this.modalSaveBtn = document.getElementById('modalSaveBtn');
    this.trackerNameInput = document.getElementById('trackerName');
    this.trackerUnitInput = document.getElementById('trackerUnit');
    this.unitGroup = document.getElementById('unitGroup');
    this.typeBtns = document.querySelectorAll('.type-btn');
    this.colorBtns = document.querySelectorAll('.color-option');

    // Entry modal
    this.entryModal = document.getElementById('entryModal');
    this.entryModalTitle = document.getElementById('entryModalTitle');
    this.entryModalCloseBtn = document.getElementById('entryModalCloseBtn');
    this.entryModalCancelBtn = document.getElementById('entryModalCancelBtn');
    this.entryModalSaveBtn = document.getElementById('entryModalSaveBtn');
    this.entryModalDeleteBtn = document.getElementById('entryModalDeleteBtn');
    this.entryDateInput = document.getElementById('entryDate');
    this.entryValueInput = document.getElementById('entryValue');
    this.entryValueGroup = document.getElementById('entryValueGroup');
  }

  // ==================== EVENTS ====================

  initEventListeners() {
    // List view
    this.addTrackerBtn.addEventListener('click', () => this.openTrackerModal());

    // Detail view
    this.backBtn.addEventListener('click', () => this.showList());
    this.editTrackerBtn.addEventListener('click', () => this.openTrackerModal(this.activeTrackerId));
    this.deleteTrackerBtn.addEventListener('click', () => this.deleteTracker());
    this.prevWeekBtn.addEventListener('click', () => this.changeWeek(-1));
    this.nextWeekBtn.addEventListener('click', () => this.changeWeek(1));
    this.todayBtn.addEventListener('click', () => this.goToToday());

    this.rangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.chartRange = parseInt(btn.dataset.range, 10);
        this.rangeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderChart();
      });
    });

    // Tracker modal
    this.modalCloseBtn.addEventListener('click', () => this.closeTrackerModal());
    this.modalCancelBtn.addEventListener('click', () => this.closeTrackerModal());
    this.modalSaveBtn.addEventListener('click', () => this.saveTracker());
    this.trackerModal.addEventListener('click', (e) => {
      if (e.target === this.trackerModal) this.closeTrackerModal();
    });

    this.typeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedType = btn.dataset.type;
        this.typeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === this.selectedType));
        this.unitGroup.classList.toggle('hidden', this.selectedType === 'boolean');
      });
    });

    this.colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.colorBtns.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedColor = btn.dataset.color;
      });
    });

    this.trackerNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.saveTracker();
    });

    // Entry modal
    this.entryModalCloseBtn.addEventListener('click', () => this.closeEntryModal());
    this.entryModalCancelBtn.addEventListener('click', () => this.closeEntryModal());
    this.entryModalSaveBtn.addEventListener('click', () => this.saveEntry());
    this.entryModalDeleteBtn.addEventListener('click', () => this.deleteEntry());
    this.entryModal.addEventListener('click', (e) => {
      if (e.target === this.entryModal) this.closeEntryModal();
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.entryModal.classList.contains('active')) this.closeEntryModal();
        else if (this.trackerModal.classList.contains('active')) this.closeTrackerModal();
      }
    });
  }

  // ==================== NAVIGATION ====================

  showList() {
    this.currentView = 'list';
    this.activeTrackerId = null;
    this.listView.classList.remove('hidden');
    this.detailView.classList.add('hidden');
    this.renderList();
  }

  showDetail(trackerId) {
    const tracker = this.getTracker(trackerId);
    if (!tracker) return;
    this.currentView = 'detail';
    this.activeTrackerId = trackerId;
    this.chartRange = 30;
    this.currentWeekStart = this.getWeekStart(new Date());
    this.rangeBtns.forEach(b => b.classList.toggle('active', b.dataset.range === '30'));
    this.listView.classList.add('hidden');
    this.detailView.classList.remove('hidden');
    this.renderDetail();
  }

  // ==================== TRACKER MODAL ====================

  openTrackerModal(editId = null) {
    this.editingTrackerId = editId;
    const tracker = editId ? this.getTracker(editId) : null;

    this.modalTitle.textContent = tracker ? 'Edit Tracker' : 'New Tracker';

    if (tracker) {
      this.trackerNameInput.value = tracker.name;
      this.trackerUnitInput.value = tracker.unit;
      this.selectedType = tracker.type;
      this.selectedColor = tracker.color;
      // Disable type change for existing tracker (would break data)
      this.typeBtns.forEach(b => b.disabled = true);
    } else {
      this.trackerNameInput.value = '';
      this.trackerUnitInput.value = '';
      this.selectedType = 'numeric';
      this.selectedColor = '#1ABC9C';
      this.typeBtns.forEach(b => b.disabled = false);
    }

    this.typeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === this.selectedType));
    this.unitGroup.classList.toggle('hidden', this.selectedType === 'boolean');
    this.colorBtns.forEach(b => {
      b.classList.toggle('selected', b.dataset.color === this.selectedColor);
    });

    this.trackerModal.classList.add('active');
    this.trackerNameInput.focus();
  }

  closeTrackerModal() {
    this.trackerModal.classList.remove('active');
    this.editingTrackerId = null;
  }

  saveTracker() {
    const name = this.trackerNameInput.value.trim();
    if (!name) return;

    if (this.editingTrackerId) {
      const tracker = this.getTracker(this.editingTrackerId);
      if (tracker) {
        tracker.name = name;
        tracker.unit = this.trackerUnitInput.value.trim();
        tracker.color = this.selectedColor;
      }
    } else {
      this.data.trackers.push({
        id: this.generateId(),
        name,
        type: this.selectedType,
        color: this.selectedColor,
        unit: this.selectedType === 'numeric' ? this.trackerUnitInput.value.trim() : '',
        createdAt: new Date().toISOString(),
        entries: {}
      });
    }

    this.saveData();
    this.closeTrackerModal();
    this.render();
  }

  deleteTracker() {
    if (!confirm('Delete this tracker and all its data?')) return;
    this.data.trackers = this.data.trackers.filter(t => t.id !== this.activeTrackerId);
    this.saveData();
    this.showList();
  }

  // ==================== ENTRY MODAL ====================

  openEntryModal(dateStr = null) {
    const tracker = this.getActiveTracker();
    if (!tracker || tracker.type !== 'numeric') return;

    this.editingEntryDate = dateStr;
    this.entryModalTitle.textContent = dateStr ? 'Edit Entry' : 'Log Value';
    this.entryModalDeleteBtn.classList.toggle('hidden', !dateStr);

    if (dateStr && tracker.entries[dateStr] !== undefined) {
      this.entryDateInput.value = dateStr;
      this.entryValueInput.value = tracker.entries[dateStr];
    } else {
      this.entryDateInput.value = this.todayStr();
      this.entryValueInput.value = '';
    }

    this.entryModal.classList.add('active');
    this.entryValueInput.focus();
  }

  closeEntryModal() {
    this.entryModal.classList.remove('active');
    this.editingEntryDate = null;
  }

  saveEntry() {
    const tracker = this.getActiveTracker();
    if (!tracker) return;

    const date = this.entryDateInput.value;
    const value = parseFloat(this.entryValueInput.value);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) return;

    // If editing, remove old date entry if date changed
    if (this.editingEntryDate && this.editingEntryDate !== date) {
      delete tracker.entries[this.editingEntryDate];
    }

    tracker.entries[date] = Math.round(value * 10000) / 10000;
    this.saveData();
    this.closeEntryModal();
    this.renderDetail();
  }

  deleteEntry() {
    const tracker = this.getActiveTracker();
    if (!tracker || !this.editingEntryDate) return;
    delete tracker.entries[this.editingEntryDate];
    this.saveData();
    this.closeEntryModal();
    this.renderDetail();
  }

  // ==================== BOOLEAN (CALENDAR) ====================

  getWeekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Sunday start
    return d;
  }

  getWeekDays() {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }

  changeWeek(dir) {
    this.currentWeekStart.setDate(this.currentWeekStart.getDate() + dir * 7);
    this.renderCalendar();
  }

  goToToday() {
    this.currentWeekStart = this.getWeekStart(new Date());
    this.renderCalendar();
  }

  toggleBoolean(dateStr) {
    const tracker = this.getActiveTracker();
    if (!tracker || tracker.type !== 'boolean') return;
    if (tracker.entries[dateStr]) {
      delete tracker.entries[dateStr];
    } else {
      tracker.entries[dateStr] = true;
    }
    this.saveData();
    this.renderDetail();
  }

  // ==================== STATS ====================

  getNumericStats(tracker) {
    const sorted = Object.entries(tracker.entries)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!sorted.length) {
      return [
        { label: 'Current', value: '—' },
        { label: 'Average', value: '—' },
        { label: 'Min', value: '—' },
        { label: 'Max', value: '—' }
      ];
    }

    const values = sorted.map(e => e.value);
    const current = sorted[sorted.length - 1].value;
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    let min = values[0];
    let max = values[0];
    for (let i = 1; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    const u = tracker.unit ? ' ' + tracker.unit : '';

    const stats = [
      { label: 'Current', value: current.toFixed(1) + u },
      { label: 'Average', value: avg.toFixed(1) + u },
      { label: 'Min', value: min.toFixed(1) + u },
      { label: 'Max', value: max.toFixed(1) + u }
    ];

    if (sorted.length > 1) {
      const change = current - sorted[0].value;
      const sign = change > 0 ? '+' : '';
      stats.push({
        label: 'Total Change',
        value: sign + change.toFixed(1) + u,
        cls: change > 0 ? 'positive' : change < 0 ? 'negative' : ''
      });
    }

    return stats;
  }

  getBooleanStats(tracker) {
    const dates = Object.keys(tracker.entries).sort();

    // Current streak
    let streak = 0;
    const check = new Date();
    check.setHours(0, 0, 0, 0);
    while (tracker.entries[this.toDateKey(check)]) {
      streak++;
      check.setDate(check.getDate() - 1);
    }

    // Longest streak
    let longest = 0;
    let run = 0;
    if (dates.length > 0) {
      const first = new Date(dates[0] + 'T00:00:00');
      const last = new Date(dates[dates.length - 1] + 'T00:00:00');
      const iter = new Date(first);
      while (iter <= last) {
        if (tracker.entries[this.toDateKey(iter)]) {
          run++;
          if (run > longest) longest = run;
        } else {
          run = 0;
        }
        iter.setDate(iter.getDate() + 1);
      }
    }

    // This week %
    const weekDays = this.getWeekDays();
    let weekDone = 0;
    weekDays.forEach(d => { if (tracker.entries[this.toDateKey(d)]) weekDone++; });

    // This month %
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthTotal = 0;
    let monthDone = 0;
    const iter = new Date(monthStart);
    while (iter <= now) {
      monthTotal++;
      if (tracker.entries[this.toDateKey(iter)]) monthDone++;
      iter.setDate(iter.getDate() + 1);
    }

    return [
      { label: 'Current Streak', value: streak + 'd' },
      { label: 'Best Streak', value: longest + 'd' },
      { label: 'This Week', value: Math.round((weekDone / 7) * 100) + '%' },
      { label: 'This Month', value: monthTotal > 0 ? Math.round((monthDone / monthTotal) * 100) + '%' : '0%' }
    ];
  }

  // ==================== CHART ====================

  renderChart() {
    const tracker = this.getActiveTracker();
    if (!tracker || tracker.type !== 'numeric') return;

    let dataPoints = Object.entries(tracker.entries)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (this.chartRange > 0 && dataPoints.length > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.chartRange);
      const cutoffStr = this.toDateKey(cutoff);
      dataPoints = dataPoints.filter(d => d.date >= cutoffStr);
    }

    if (dataPoints.length < 2) {
      this.chartEmpty.classList.remove('hidden');
      const ctx = this.chartCanvas.getContext('2d');
      ctx.clearRect(0, 0, this.chartCanvas.width, this.chartCanvas.height);
      return;
    }

    this.chartEmpty.classList.add('hidden');
    drawChart(this.chartCanvas, dataPoints, this.sanitizeColor(tracker.color));
  }

  // ==================== RENDER ====================

  render() {
    if (this.currentView === 'list') {
      this.renderList();
    } else {
      this.renderDetail();
    }
  }

  renderList() {
    const trackers = this.data.trackers;
    const hasTrackers = trackers.length > 0;
    this.emptyState.classList.toggle('hidden', hasTrackers);
    this.trackerList.innerHTML = '';

    if (!hasTrackers) return;

    const today = this.todayStr();

    trackers.forEach(tracker => {
      const card = document.createElement('div');
      card.className = 'tracker-card';

      const todayValue = tracker.entries[today];
      let quickHtml = '';

      if (tracker.type === 'boolean') {
        const checked = todayValue === true;
        quickHtml = `<button class="quick-toggle ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</button>`;
      } else {
        const hasToday = todayValue !== undefined;
        quickHtml = `
          <span class="tracker-card-meta">${hasToday ? todayValue + (tracker.unit ? ' ' + this.escapeHtml(tracker.unit) : '') : ''}</span>
        `;
      }

      card.innerHTML = `
        <div class="tracker-color-bar" style="background: ${this.sanitizeColor(tracker.color)};"></div>
        <div class="tracker-card-info">
          <div class="tracker-card-name">${this.escapeHtml(tracker.name)}</div>
          <span class="type-badge">${tracker.type === 'boolean' ? 'yes/no' : this.escapeHtml(tracker.unit || 'numeric')}</span>
        </div>
        <div class="tracker-card-quick">${quickHtml}</div>
      `;

      // Toggle boolean without navigating
      const toggleBtn = card.querySelector('.quick-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (tracker.entries[today]) {
            delete tracker.entries[today];
          } else {
            tracker.entries[today] = true;
          }
          this.saveData();
          this.renderList();
        });
      }

      // Click card to go to detail
      card.addEventListener('click', () => this.showDetail(tracker.id));
      this.trackerList.appendChild(card);
    });
  }

  renderDetail() {
    const tracker = this.getActiveTracker();
    if (!tracker) return this.showList();

    this.detailTitle.textContent = tracker.name;

    // Quick entry
    this.renderQuickEntry(tracker);

    // Show correct visualization
    const isNumeric = tracker.type === 'numeric';
    this.chartSection.classList.toggle('hidden', !isNumeric);
    this.calendarSection.classList.toggle('hidden', isNumeric);

    if (isNumeric) {
      this.renderChart();
    } else {
      this.renderCalendar();
    }

    // Stats
    const stats = isNumeric ? this.getNumericStats(tracker) : this.getBooleanStats(tracker);
    this.statsGrid.innerHTML = stats.map(s => `
      <div class="stat-card">
        <span class="stat-label">${s.label}</span>
        <span class="stat-value ${s.cls || ''}">${s.value}</span>
      </div>
    `).join('');

    // Entries
    this.renderEntries(tracker);
  }

  renderQuickEntry(tracker) {
    const today = this.todayStr();

    if (tracker.type === 'boolean') {
      const checked = tracker.entries[today] === true;
      this.quickEntry.innerHTML = `
        <div class="quick-entry-card">
          <label for="detailToggle">Today</label>
          <button class="quick-toggle ${checked ? 'checked' : ''}" id="detailToggle"
            style="width:44px;height:44px;font-size:1.3rem;">${checked ? '✓' : ''}</button>
        </div>
      `;
      document.getElementById('detailToggle').addEventListener('click', () => {
        this.toggleBoolean(today);
      });
    } else {
      const todayVal = tracker.entries[today];
      this.quickEntry.innerHTML = `
        <div class="quick-entry-card">
          <label for="quickNumInput">Log today</label>
          <input type="number" id="quickNumInput" class="form-input quick-input" step="any"
            placeholder="Value" value="${todayVal !== undefined ? todayVal : ''}">
          <span class="unit-label">${this.escapeHtml(tracker.unit)}</span>
          <button class="btn btn-primary quick-save-btn" id="quickSaveBtn">Save</button>
        </div>
      `;
      const input = document.getElementById('quickNumInput');
      document.getElementById('quickSaveBtn').addEventListener('click', () => {
        const val = parseFloat(input.value);
        if (!Number.isFinite(val)) return;
        tracker.entries[today] = Math.round(val * 10000) / 10000;
        this.saveData();
        this.renderDetail();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('quickSaveBtn').click();
      });
    }
  }

  renderCalendar() {
    const tracker = this.getActiveTracker();
    if (!tracker) return;

    const weekDays = this.getWeekDays();
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = this.todayStr();

    const startStr = weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endStr = weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    this.weekDisplay.textContent = `${startStr} - ${endStr}`;

    this.calendarGrid.innerHTML = weekDays.map((day, i) => {
      const dateStr = this.toDateKey(day);
      const completed = tracker.entries[dateStr] === true;
      const isToday = dateStr === today;
      return `
        <button class="day-cell ${completed ? 'completed' : ''} ${isToday ? 'today' : ''}"
          data-date="${dateStr}">
          <div class="day-label">${dayLabels[i]}</div>
          <div class="day-date">${day.getDate()}</div>
        </button>
      `;
    }).join('');

    this.calendarGrid.querySelectorAll('.day-cell').forEach(btn => {
      btn.addEventListener('click', () => this.toggleBoolean(btn.dataset.date));
    });
  }

  renderEntries(tracker) {
    const entries = Object.entries(tracker.entries)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => b.date.localeCompare(a.date)); // newest first

    const hasEntries = entries.length > 0;
    this.entriesEmpty.classList.toggle('hidden', hasEntries);
    this.entriesList.innerHTML = '';

    if (!hasEntries) return;

    // For numeric, precompute diffs using a Map for O(n) lookup
    const sorted = [...entries].reverse(); // oldest first for diff calc
    const diffMap = new Map();
    if (tracker.type === 'numeric') {
      for (let i = 1; i < sorted.length; i++) {
        diffMap.set(sorted[i].date, sorted[i].value - sorted[i - 1].value);
      }
    }

    entries.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'entry-item';

      if (tracker.type === 'numeric') {
        let diffHtml = '';
        const diff = diffMap.get(entry.date);
        if (diff !== undefined) {
          const sign = diff > 0 ? '+' : '';
          const cls = diff > 0 ? 'positive' : diff < 0 ? 'negative' : '';
          diffHtml = `<span class="entry-diff ${cls}">${sign}${diff.toFixed(1)}</span>`;
        }
        const u = tracker.unit ? ' ' + this.escapeHtml(tracker.unit) : '';
        item.innerHTML = `
          <span class="entry-date">${this.formatDate(entry.date)}</span>
          <div class="entry-right">
            ${diffHtml}
            <span class="entry-value">${entry.value.toFixed(1)}${u}</span>
          </div>
        `;
        item.addEventListener('click', () => this.openEntryModal(entry.date));
      } else {
        item.innerHTML = `
          <span class="entry-date">${this.formatDate(entry.date)}</span>
          <span class="entry-check">✓</span>
        `;
        item.addEventListener('click', () => this.toggleBoolean(entry.date));
      }

      this.entriesList.appendChild(item);
    });
  }

  // ==================== THEME ====================

  syncThemeWithParent() {
    try {
      const saved = localStorage.getItem('marlapps-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    } catch { /* ignore */ }

    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'theme-change') {
        document.documentElement.setAttribute('data-theme', event.data.theme);
        const tracker = this.getActiveTracker();
        if (this.currentView === 'detail' && tracker && tracker.type === 'numeric') {
          requestAnimationFrame(() => this.renderChart());
        }
      }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const tracker = this.getActiveTracker();
        if (this.currentView === 'detail' && tracker && tracker.type === 'numeric') {
          this.renderChart();
        }
      }, 150);
    });

    window.addEventListener('beforeunload', () => {
      this.saveData();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TrackerApp();
});
