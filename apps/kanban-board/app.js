// Kanban Board App with drag-and-drop and localStorage persistence

class KanbanBoard {
  constructor() {
    this.board = this.loadBoard();
    this.currentColumnId = null;
    this.editingTaskId = null;

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

  loadBoard() {
    const defaultBoard = {
      columns: [
        { id: 'todo', name: 'To Do', tasks: [] },
        { id: 'inprogress', name: 'In Progress', tasks: [] },
        { id: 'done', name: 'Done', tasks: [] }
      ]
    };

    const saved = localStorage.getItem('kanbanBoard');
    return saved ? JSON.parse(saved) : defaultBoard;
  }

  saveBoard() {
    localStorage.setItem('kanbanBoard', JSON.stringify(this.board));
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
      const taskEl = this.createTaskElement(task);
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

  createTaskElement(task) {
    const taskEl = document.createElement('div');
    taskEl.className = 'task';
    taskEl.draggable = true;
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

    // Drag events
    taskEl.addEventListener('dragstart', (e) => this.handleDragStart(e));
    taskEl.addEventListener('dragend', (e) => this.handleDragEnd(e));

    return taskEl;
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
