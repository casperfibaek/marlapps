// Todo List App with localStorage persistence

class TodoList {
  constructor() {
    this.tasks = this.loadTasks();
    this.currentFilter = 'all';
    this.editingTaskId = null;

    this.initElements();
    this.attachEventListeners();
    this.syncThemeWithParent();
    this.render();
  }

  initElements() {
    this.taskListEl = document.getElementById('taskList');
    this.addTaskForm = document.getElementById('addTaskForm');
    this.newTaskInput = document.getElementById('newTaskInput');
    this.taskCounter = document.getElementById('taskCounter');
    this.clearCompletedBtn = document.getElementById('clearCompletedBtn');
    this.filterBtns = document.querySelectorAll('.filter-btn');
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

  attachEventListeners() {
    this.addTaskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.addTask();
    });

    this.clearCompletedBtn.addEventListener('click', () => {
      this.clearCompleted();
    });

    this.filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });
  }

  loadTasks() {
    const saved = localStorage.getItem('todoList');
    return saved ? JSON.parse(saved) : [];
  }

  saveTasks() {
    localStorage.setItem('todoList', JSON.stringify(this.tasks));
  }

  addTask() {
    const text = this.newTaskInput.value.trim();
    if (!text) return;

    const newTask = {
      id: this.generateId(),
      text: text,
      completed: false,
      createdAt: Date.now()
    };

    this.tasks.push(newTask);
    this.newTaskInput.value = '';
    this.saveTasks();
    this.render();
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter(task => task.id !== id);
    this.saveTasks();
    this.render();
  }

  toggleTask(id) {
    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.saveTasks();
      this.render();
    }
  }

  startEdit(id) {
    this.editingTaskId = id;
    this.render();
  }

  saveEdit(id, newText) {
    const text = newText.trim();
    if (!text) {
      this.deleteTask(id);
      return;
    }

    const task = this.tasks.find(t => t.id === id);
    if (task) {
      task.text = text;
      this.editingTaskId = null;
      this.saveTasks();
      this.render();
    }
  }

  cancelEdit() {
    this.editingTaskId = null;
    this.render();
  }

  clearCompleted() {
    const hasCompleted = this.tasks.some(t => t.completed);
    if (!hasCompleted) return;

    if (confirm('Are you sure you want to clear all completed tasks?')) {
      this.tasks = this.tasks.filter(task => !task.completed);
      this.saveTasks();
      this.render();
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;
    this.filterBtns.forEach(btn => {
      if (btn.dataset.filter === filter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.render();
  }

  getFilteredTasks() {
    switch (this.currentFilter) {
      case 'active':
        return this.tasks.filter(t => !t.completed);
      case 'completed':
        return this.tasks.filter(t => t.completed);
      default:
        return this.tasks;
    }
  }

  render() {
    const filteredTasks = this.getFilteredTasks();

    if (filteredTasks.length === 0) {
      this.renderEmptyState();
    } else {
      this.taskListEl.innerHTML = '';
      filteredTasks.forEach(task => {
        const taskEl = this.createTaskElement(task);
        this.taskListEl.appendChild(taskEl);
      });
    }

    this.updateCounter();
    this.updateClearButton();
  }

  createTaskElement(task) {
    const taskEl = document.createElement('div');
    taskEl.className = `task-item ${task.completed ? 'completed' : ''}`;

    if (this.editingTaskId === task.id) {
      taskEl.innerHTML = `
        <input
          type="text"
          class="task-edit-input"
          value="${this.escapeHtml(task.text)}"
          data-task-id="${task.id}"
        >
      `;

      const input = taskEl.querySelector('.task-edit-input');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);

      input.addEventListener('blur', () => {
        this.saveEdit(task.id, input.value);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.saveEdit(task.id, input.value);
        } else if (e.key === 'Escape') {
          this.cancelEdit();
        }
      });
    } else {
      taskEl.innerHTML = `
        <input
          type="checkbox"
          class="task-checkbox"
          ${task.completed ? 'checked' : ''}
          data-task-id="${task.id}"
        >
        <span class="task-text">${this.escapeHtml(task.text)}</span>
        <div class="task-actions">
          <button class="task-action-btn edit" data-task-id="${task.id}" title="Edit">
            ✎
          </button>
          <button class="task-action-btn delete" data-task-id="${task.id}" title="Delete">
            ×
          </button>
        </div>
      `;

      const checkbox = taskEl.querySelector('.task-checkbox');
      checkbox.addEventListener('change', () => {
        this.toggleTask(task.id);
      });

      const editBtn = taskEl.querySelector('.edit');
      editBtn.addEventListener('click', () => {
        this.startEdit(task.id);
      });

      const deleteBtn = taskEl.querySelector('.delete');
      deleteBtn.addEventListener('click', () => {
        this.deleteTask(task.id);
      });

      // Double-click to edit
      const taskText = taskEl.querySelector('.task-text');
      taskText.addEventListener('dblclick', () => {
        this.startEdit(task.id);
      });
    }

    return taskEl;
  }

  renderEmptyState() {
    const emptyMessages = {
      all: 'No tasks yet. Add one above!',
      active: 'No active tasks. Great job!',
      completed: 'No completed tasks yet.'
    };

    this.taskListEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">${emptyMessages[this.currentFilter]}</div>
      </div>
    `;
  }

  updateCounter() {
    const activeCount = this.tasks.filter(t => !t.completed).length;
    const taskWord = activeCount === 1 ? 'task' : 'tasks';
    this.taskCounter.textContent = `${activeCount} ${taskWord} remaining`;
  }

  updateClearButton() {
    const hasCompleted = this.tasks.some(t => t.completed);
    this.clearCompletedBtn.disabled = !hasCompleted;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  new TodoList();
});
