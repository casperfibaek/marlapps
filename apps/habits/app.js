// Habit Tracker App

class HabitTrackerApp {
  constructor() {
    this.habits = this.loadHabits();
    this.currentWeekStart = this.getWeekStart(new Date());
    this.selectedColor = '#9B59B6';

    this.initElements();
    this.initEventListeners();
    this.syncThemeWithParent();
    this.render();
  }

  initElements() {
    this.newHabitBtn = document.getElementById('newHabitBtn');
    this.habitModal = document.getElementById('habitModal');
    this.closeModalBtn = document.getElementById('closeModalBtn');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.saveHabitBtn = document.getElementById('saveHabitBtn');
    this.habitNameInput = document.getElementById('habitNameInput');
    this.habitsGrid = document.getElementById('habitsGrid');
    this.emptyState = document.getElementById('emptyState');
    this.prevWeekBtn = document.getElementById('prevWeekBtn');
    this.nextWeekBtn = document.getElementById('nextWeekBtn');
    this.todayBtn = document.getElementById('todayBtn');
    this.weekDisplay = document.getElementById('weekDisplay');
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
    this.newHabitBtn.addEventListener('click', () => this.openModal());
    this.closeModalBtn.addEventListener('click', () => this.closeModal());
    this.cancelBtn.addEventListener('click', () => this.closeModal());
    this.saveHabitBtn.addEventListener('click', () => this.saveHabit());
    this.prevWeekBtn.addEventListener('click', () => this.changeWeek(-1));
    this.nextWeekBtn.addEventListener('click', () => this.changeWeek(1));
    this.todayBtn.addEventListener('click', () => this.goToToday());

    // Close modal on overlay click
    this.habitModal.addEventListener('click', (e) => {
      if (e.target === this.habitModal) {
        this.closeModal();
      }
    });

    // Color picker
    document.querySelectorAll('.color-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
        e.target.classList.add('selected');
        this.selectedColor = e.target.dataset.color;
      });
    });

    // Enter key to save
    this.habitNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.saveHabit();
    });

    // Escape to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.habitModal.classList.contains('show')) {
        this.closeModal();
      }
    });
  }

  loadHabits() {
    const saved = localStorage.getItem('marlapps-habits');
    return saved ? JSON.parse(saved) : [];
  }

  saveHabitsToStorage() {
    localStorage.setItem('marlapps-habits', JSON.stringify(this.habits));
  }

  openModal() {
    this.habitModal.classList.add('show');
    this.habitNameInput.value = '';
    this.habitNameInput.focus();
    document.querySelector('.color-option').click();
  }

  closeModal() {
    this.habitModal.classList.remove('show');
  }

  saveHabit() {
    const name = this.habitNameInput.value.trim();
    if (!name) {
      alert('Please enter a habit name');
      return;
    }

    const habit = {
      id: Date.now().toString(),
      name: name,
      color: this.selectedColor,
      completions: {},
      createdAt: new Date().toISOString()
    };

    this.habits.push(habit);
    this.saveHabitsToStorage();
    this.closeModal();
    this.render();
  }

  deleteHabit(habitId) {
    if (!confirm('Are you sure you want to delete this habit?')) return;

    this.habits = this.habits.filter(h => h.id !== habitId);
    this.saveHabitsToStorage();
    this.render();
  }

  toggleCompletion(habitId, dateStr) {
    const habit = this.habits.find(h => h.id === habitId);
    if (!habit) return;

    if (habit.completions[dateStr]) {
      delete habit.completions[dateStr];
    } else {
      habit.completions[dateStr] = true;
    }

    this.saveHabitsToStorage();
    this.render();
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  getWeekDays() {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(this.currentWeekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  }

  changeWeek(direction) {
    const newDate = new Date(this.currentWeekStart);
    newDate.setDate(newDate.getDate() + (direction * 7));
    this.currentWeekStart = newDate;
    this.render();
  }

  goToToday() {
    this.currentWeekStart = this.getWeekStart(new Date());
    this.render();
  }

  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  isToday(date) {
    const today = new Date();
    return this.formatDate(date) === this.formatDate(today);
  }

  calculateStats() {
    const today = this.formatDate(new Date());
    const weekDays = this.getWeekDays();

    let completedToday = 0;
    let totalThisWeek = 0;
    let completedThisWeek = 0;

    this.habits.forEach(habit => {
      if (habit.completions[today]) {
        completedToday++;
      }

      weekDays.forEach(day => {
        const dayStr = this.formatDate(day);
        totalThisWeek++;
        if (habit.completions[dayStr]) {
          completedThisWeek++;
        }
      });
    });

    const completionRate = totalThisWeek > 0
      ? Math.round((completedThisWeek / totalThisWeek) * 100)
      : 0;

    // Calculate current streak
    let currentStreak = 0;
    const checkDate = new Date();

    while (true) {
      const dateStr = this.formatDate(checkDate);
      let allCompleted = this.habits.length > 0;

      this.habits.forEach(habit => {
        if (!habit.completions[dateStr]) {
          allCompleted = false;
        }
      });

      if (allCompleted) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      totalHabits: this.habits.length,
      completedToday,
      completionRate,
      currentStreak
    };
  }

  render() {
    // Update week display
    const weekDays = this.getWeekDays();
    const startDate = weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endDate = weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    this.weekDisplay.textContent = `${startDate} - ${endDate}`;

    // Show/hide empty state
    if (this.habits.length === 0) {
      this.emptyState.classList.add('show');
      this.habitsGrid.style.display = 'none';
    } else {
      this.emptyState.classList.remove('show');
      this.habitsGrid.style.display = 'flex';
      this.renderHabits();
    }

    // Update stats
    this.renderStats();
  }

  renderHabits() {
    const weekDays = this.getWeekDays();
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    this.habitsGrid.innerHTML = this.habits.map(habit => {
      const daysHtml = weekDays.map((day, index) => {
        const dateStr = this.formatDate(day);
        const isCompleted = habit.completions[dateStr];
        const isTodayClass = this.isToday(day) ? 'today' : '';
        const completedClass = isCompleted ? 'completed' : '';

        return `
          <button
            class="day-checkbox ${completedClass} ${isTodayClass}"
            data-habit-id="${habit.id}"
            data-date="${dateStr}"
            title="${day.toLocaleDateString()}"
          >
            <div class="day-label">${dayLabels[index]}</div>
            <div class="day-date">${day.getDate()}</div>
          </button>
        `;
      }).join('');

      return `
        <div class="habit-row">
          <div class="habit-info">
            <div class="habit-color" style="background: ${habit.color};"></div>
            <div class="habit-name">${this.escapeHtml(habit.name)}</div>
          </div>
          <div class="habit-days">
            ${daysHtml}
          </div>
          <div class="habit-actions">
            <button class="delete-btn" data-habit-id="${habit.id}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Add event listeners
    document.querySelectorAll('.day-checkbox').forEach(btn => {
      btn.addEventListener('click', () => {
        this.toggleCompletion(btn.dataset.habitId, btn.dataset.date);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.deleteHabit(btn.dataset.habitId);
      });
    });
  }

  renderStats() {
    const stats = this.calculateStats();
    document.getElementById('totalHabits').textContent = stats.totalHabits;
    document.getElementById('completedToday').textContent = stats.completedToday;
    document.getElementById('currentStreak').textContent = stats.currentStreak;
    document.getElementById('completionRate').textContent = `${stats.completionRate}%`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  new HabitTrackerApp();
});
