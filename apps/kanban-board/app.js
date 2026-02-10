// Kanban Board App with drag-and-drop and localStorage persistence

class KanbanBoard {
  constructor() {
    this.migrateStorage();
    this.board = this.loadBoard();
    this.currentColumnId = null;
    this.editingTaskId = null;

    // Touch drag state
    this.touchDragState = {
      isDragging: false,
      taskId: null,
      taskEl: null,
      clone: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      longPressTimer: null
    };

    this.initElements();
    this.renderBoard();
    this.attachEventListeners();
    this.syncThemeWithParent();
  }

  initElements() {
    this.boardEl = document.getElementById('board');
    this.taskModal = document.getElementById('taskModal');
    this.taskForm = document.getElementById('taskForm');
    this.taskTitleInput = document.getElementById('taskTitle');
    this.taskDescriptionInput = document.getElementById('taskDescription');
    this.cancelBtn = document.getElementById('cancelBtn');
    this.modalTitle = document.getElementById('modalTitle');
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

  migrateStorage() {
    const old = localStorage.getItem('kanbanBoard');
    if (old) {
      localStorage.setItem('marlapps-kanban-board', old);
      localStorage.removeItem('kanbanBoard');
    }
  }

  loadBoard() {
    const defaultBoard = {
      columns: [
        { id: 'todo', name: 'To Do', tasks: [] },
        { id: 'inprogress', name: 'In Progress', tasks: [] },
        { id: 'done', name: 'Done', tasks: [] }
      ]
    };

    const saved = localStorage.getItem('marlapps-kanban-board');
    if (!saved) return defaultBoard;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.columns)) {
        return defaultBoard;
      }

      const columns = parsed.columns
        .map((column, columnIndex) => {
          if (!column || typeof column !== 'object') return null;

          const fallback = defaultBoard.columns[columnIndex];
          const id = typeof column.id === 'string'
            ? column.id
            : (fallback ? fallback.id : `column-${columnIndex}`);
          const name = typeof column.name === 'string' && column.name.trim()
            ? column.name
            : (fallback ? fallback.name : `Column ${columnIndex + 1}`);

          const tasks = Array.isArray(column.tasks)
            ? column.tasks
              .map((task, taskIndex) => {
                if (!task || typeof task !== 'object') return null;
                if (typeof task.title !== 'string' || !task.title.trim()) return null;

                return {
                  id: typeof task.id === 'string'
                    ? task.id
                    : `${id}-task-${taskIndex}`,
                  title: task.title,
                  description: typeof task.description === 'string' ? task.description : ''
                };
              })
              .filter(Boolean)
            : [];

          return { id, name, tasks };
        })
        .filter(Boolean);

      return { columns: columns.length > 0 ? columns : defaultBoard.columns };
    } catch {
      return defaultBoard;
    }
  }

  saveBoard() {
    localStorage.setItem('marlapps-kanban-board', JSON.stringify(this.board));
  }

  attachEventListeners() {
    this.taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveTask();
    });

    this.cancelBtn.addEventListener('click', () => {
      this.closeModal();
    });

    this.taskModal.addEventListener('click', (e) => {
      if (e.target === this.taskModal) {
        this.closeModal();
      }
    });

    // Keyboard support
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.taskModal.classList.contains('active')) {
        this.closeModal();
      }
    });
  }

  renderBoard() {
    this.boardEl.innerHTML = '';

    this.board.columns.forEach(column => {
      const columnEl = this.createColumnElement(column);
      this.boardEl.appendChild(columnEl);
    });
  }

  createColumnElement(column) {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.columnId = column.id;

    columnEl.innerHTML = `
      <div class="column-header">
        <h2 class="column-title">${column.name}</h2>
        <span class="task-count">${column.tasks.length}</span>
      </div>
      <div class="tasks" data-column-id="${column.id}"></div>
      <button class="add-task-btn" data-column-id="${column.id}">+ Add Task</button>
    `;

    const tasksContainer = columnEl.querySelector('.tasks');
    column.tasks.forEach(task => {
      const taskEl = this.createTaskElement(task, column.id);
      tasksContainer.appendChild(taskEl);
    });

    // Add task button event
    const addTaskBtn = columnEl.querySelector('.add-task-btn');
    addTaskBtn.addEventListener('click', () => {
      this.openModal(column.id);
    });

    // Drag and drop events
    tasksContainer.addEventListener('dragover', (e) => this.handleDragOver(e));
    tasksContainer.addEventListener('drop', (e) => this.handleDrop(e, column.id));
    tasksContainer.addEventListener('dragenter', (e) => this.handleDragEnter(e));
    tasksContainer.addEventListener('dragleave', (e) => this.handleDragLeave(e));

    return columnEl;
  }

  createTaskElement(task, columnId) {
    const taskEl = document.createElement('div');
    taskEl.className = 'task';
    taskEl.draggable = true;
    taskEl.tabIndex = 0;
    taskEl.dataset.taskId = task.id;

    taskEl.innerHTML = `
      <div class="task-header">
        <div class="task-title">${this.escapeHtml(task.title)}</div>
        <button class="task-delete" data-task-id="${task.id}">×</button>
      </div>
      ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
    `;

    // Delete button event
    const deleteBtn = taskEl.querySelector('.task-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteTask(task.id);
    });

    // Drag events (desktop)
    taskEl.addEventListener('dragstart', (e) => this.handleDragStart(e));
    taskEl.addEventListener('dragend', (e) => this.handleDragEnd(e));

    // Touch events (mobile)
    taskEl.addEventListener('touchstart', (e) => this.handleTouchStart(e, taskEl, task.id), { passive: false });
    taskEl.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    taskEl.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    taskEl.addEventListener('touchcancel', (e) => this.handleTouchEnd(e));

    // Click/keyboard opens edit modal for existing tasks.
    taskEl.addEventListener('click', (e) => {
      if (e.target.closest('.task-delete')) return;
      this.openModal(columnId, task.id);
    });
    taskEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      this.openModal(columnId, task.id);
    });

    return taskEl;
  }

  // Touch drag handlers
  handleTouchStart(e, taskEl, taskId) {
    // Don't interfere with delete button
    if (e.target.classList.contains('task-delete')) return;

    const touch = e.touches[0];
    const rect = taskEl.getBoundingClientRect();

    this.touchDragState.startX = touch.clientX;
    this.touchDragState.startY = touch.clientY;
    this.touchDragState.offsetX = touch.clientX - rect.left;
    this.touchDragState.offsetY = touch.clientY - rect.top;
    this.touchDragState.taskEl = taskEl;
    this.touchDragState.taskId = taskId;

    // Long press to start dragging
    this.touchDragState.longPressTimer = setTimeout(() => {
      this.startTouchDrag(taskEl, touch);
    }, 200);
  }

  startTouchDrag(taskEl, touch) {
    this.touchDragState.isDragging = true;

    // Create clone for visual feedback
    const rect = taskEl.getBoundingClientRect();
    const clone = taskEl.cloneNode(true);
    clone.classList.add('touch-dragging');
    clone.style.width = rect.width + 'px';
    clone.style.left = (touch.clientX - this.touchDragState.offsetX) + 'px';
    clone.style.top = (touch.clientY - this.touchDragState.offsetY) + 'px';
    document.body.appendChild(clone);
    this.touchDragState.clone = clone;

    // Mark original as placeholder
    taskEl.classList.add('touch-placeholder');

    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  handleTouchMove(e) {
    if (!this.touchDragState.taskEl) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - this.touchDragState.startX);
    const deltaY = Math.abs(touch.clientY - this.touchDragState.startY);

    // Cancel long press if moved too much before drag started
    if (!this.touchDragState.isDragging && (deltaX > 10 || deltaY > 10)) {
      clearTimeout(this.touchDragState.longPressTimer);
      this.resetTouchDragState();
      return;
    }

    if (!this.touchDragState.isDragging) return;

    e.preventDefault();

    // Move clone
    if (this.touchDragState.clone) {
      this.touchDragState.clone.style.left = (touch.clientX - this.touchDragState.offsetX) + 'px';
      this.touchDragState.clone.style.top = (touch.clientY - this.touchDragState.offsetY) + 'px';
    }

    // Highlight target column
    this.highlightDropTarget(touch.clientX, touch.clientY);
  }

  handleTouchEnd(e) {
    clearTimeout(this.touchDragState.longPressTimer);

    if (this.touchDragState.isDragging) {
      // Find drop target
      const touch = e.changedTouches[0];
      const targetColumn = this.findColumnAtPoint(touch.clientX, touch.clientY);

      if (targetColumn && this.touchDragState.taskId) {
        this.moveTask(this.touchDragState.taskId, targetColumn);
      }

      // Clean up
      this.clearDropHighlights();
    }

    // Remove clone
    if (this.touchDragState.clone) {
      this.touchDragState.clone.remove();
    }

    // Remove placeholder class
    if (this.touchDragState.taskEl) {
      this.touchDragState.taskEl.classList.remove('touch-placeholder');
    }

    this.resetTouchDragState();
  }

  resetTouchDragState() {
    this.touchDragState = {
      isDragging: false,
      taskId: null,
      taskEl: null,
      clone: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      longPressTimer: null
    };
  }

  highlightDropTarget(x, y) {
    this.clearDropHighlights();

    const columns = document.querySelectorAll('.tasks');
    columns.forEach(col => {
      const rect = col.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        col.classList.add('drag-over');
      }
    });
  }

  clearDropHighlights() {
    document.querySelectorAll('.tasks.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  }

  findColumnAtPoint(x, y) {
    const columns = document.querySelectorAll('.tasks');
    for (const col of columns) {
      const rect = col.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return col.dataset.columnId;
      }
    }
    return null;
  }

  handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
    e.dataTransfer.setData('taskId', e.target.dataset.taskId);
  }

  handleDragEnd(e) {
    e.target.classList.remove('dragging');
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  handleDragEnter(e) {
    if (e.target.classList.contains('tasks')) {
      e.target.classList.add('drag-over');
    }
  }

  handleDragLeave(e) {
    if (e.target.classList.contains('tasks')) {
      e.target.classList.remove('drag-over');
    }
  }

  handleDrop(e, targetColumnId) {
    e.preventDefault();
    e.stopPropagation();

    const tasksContainer = e.currentTarget;
    tasksContainer.classList.remove('drag-over');

    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    // Find and move the task
    this.moveTask(taskId, targetColumnId);
  }

  moveTask(taskId, targetColumnId) {
    let task = null;

    // Find the task and remove from source column
    for (const column of this.board.columns) {
      const taskIndex = column.tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        task = column.tasks[taskIndex];
        column.tasks.splice(taskIndex, 1);
        break;
      }
    }

    if (!task) return;

    // Add to target column
    const targetColumn = this.board.columns.find(c => c.id === targetColumnId);
    if (targetColumn) {
      targetColumn.tasks.push(task);
    }

    this.saveBoard();
    this.renderBoard();
  }

  openModal(columnId, taskId = null) {
    this.currentColumnId = columnId;
    this.editingTaskId = taskId;

    if (taskId) {
      // Editing existing task
      const task = this.findTask(taskId);
      if (task) {
        this.modalTitle.textContent = 'Edit Task';
        this.taskTitleInput.value = task.title;
        this.taskDescriptionInput.value = task.description || '';
      }
    } else {
      // Adding new task
      this.modalTitle.textContent = 'Add Task';
      this.taskTitleInput.value = '';
      this.taskDescriptionInput.value = '';
    }

    this.taskModal.classList.add('active');
    this.taskTitleInput.focus();
  }

  closeModal() {
    this.taskModal.classList.remove('active');
    this.currentColumnId = null;
    this.editingTaskId = null;
    this.taskForm.reset();
  }

  saveTask() {
    const title = this.taskTitleInput.value.trim();
    const description = this.taskDescriptionInput.value.trim();

    if (!title) return;

    if (this.editingTaskId) {
      // Update existing task
      const task = this.findTask(this.editingTaskId);
      if (task) {
        task.title = title;
        task.description = description;
      }
    } else {
      // Create new task
      const newTask = {
        id: this.generateId(),
        title: title,
        description: description
      };

      const column = this.board.columns.find(c => c.id === this.currentColumnId);
      if (column) {
        column.tasks.push(newTask);
      }
    }

    this.saveBoard();
    this.renderBoard();
    this.closeModal();
  }

  deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    for (const column of this.board.columns) {
      const taskIndex = column.tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        column.tasks.splice(taskIndex, 1);
        break;
      }
    }

    this.saveBoard();
    this.renderBoard();
  }

  findTask(taskId) {
    for (const column of this.board.columns) {
      const task = column.tasks.find(t => t.id === taskId);
      if (task) return task;
    }
    return null;
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
  new KanbanBoard();
});
