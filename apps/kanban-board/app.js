// Kanban Board App with drag-and-drop and localStorage persistence

class KanbanBoard {
  constructor() {
    this.migrateStorage();
    this.board = this.loadBoard();
    this.currentColumnId = null;
    this.editingTaskId = null;
    this.selectedColor = null;
    this.hasUnsavedChanges = false;
    this.deletedTaskState = null;
    this.undoTimeoutId = null;

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

    // Drag animation state
    this.dragAnimState = {
      rafId: null,
      pendingX: 0,
      pendingY: 0,
      columnCache: null
    };

    this.justDragged = false;

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
    this.colorSelector = document.getElementById('colorSelector');
    this.colorSwatches = document.querySelectorAll('.color-swatch');
    this.deleteTaskBtn = document.getElementById('deleteTaskBtn');
    this.undoToast = document.getElementById('undoToast');
    this.toastMessage = document.getElementById('toastMessage');
    this.toastUndo = document.getElementById('toastUndo');
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
        { id: 'todo', name: 'To Do', tasks: [], collapsed: false },
        { id: 'inprogress', name: 'In Progress', tasks: [], collapsed: false },
        { id: 'done', name: 'Done', tasks: [], collapsed: false }
      ],
      settings: {
        activeColorFilter: null
      }
    };

    const saved = localStorage.getItem('marlapps-kanban-board');
    if (!saved) return defaultBoard;

    try {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.columns)) {
        return defaultBoard;
      }

      const validColors = ['red', 'blue', 'green', 'yellow', 'purple'];
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
                  description: typeof task.description === 'string' ? task.description : '',
                  color: typeof task.color === 'string' && validColors.includes(task.color)
                    ? task.color
                    : null,
                  createdAt: Number.isFinite(task.createdAt) ? task.createdAt : Date.now()
                };
              })
              .filter(Boolean)
            : [];

          const collapsed = typeof column.collapsed === 'boolean' ? column.collapsed : false;
          const colorFilter = typeof column.colorFilter === 'string' && validColors.includes(column.colorFilter)
            ? column.colorFilter
            : null;

          return { id, name, tasks, collapsed, colorFilter };
        })
        .filter(Boolean);

      return {
        columns: columns.length > 0 ? columns : defaultBoard.columns,
        settings: {}
      };
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

    // Color selector
    this.colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectColor(swatch.dataset.color, true);
      });
    });

    // Delete button in modal
    this.deleteTaskBtn.addEventListener('click', () => {
      if (this.editingTaskId) {
        this.deleteTask(this.editingTaskId);
        this.closeModal();
      }
    });

    // Track unsaved changes
    this.taskTitleInput.addEventListener('input', () => {
      this.hasUnsavedChanges = true;
    });
    this.taskDescriptionInput.addEventListener('input', () => {
      this.hasUnsavedChanges = true;
    });

    // Close filter dropdowns when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.column-filter-dropdown.open').forEach(d => {
        d.classList.remove('open');
      });
    });

    // Undo button
    this.toastUndo.addEventListener('click', () => {
      this.undoDelete();
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
    columnEl.className = `column ${column.collapsed ? 'collapsed' : ''}`;
    columnEl.dataset.columnId = column.id;

    // Filter tasks based on this column's color filter
    const columnFilter = column.colorFilter || null;
    const visibleTasks = column.tasks.filter(task => this.shouldShowTask(task, columnFilter));
    const totalTasks = column.tasks.length;

    // Show "X of Y" if filtered
    const countText = columnFilter
      ? `${visibleTasks.length} of ${totalTasks}`
      : totalTasks.toString();

    const filterIcon = `<svg class="filter-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`;

    columnEl.innerHTML = `
      <div class="column-header">
        <div class="column-title-row">
          <h2 class="column-title">${this.escapeHtml(column.name)}</h2>
          <div class="column-controls">
            <span class="task-count">${countText}</span>
            <div class="column-filter-wrapper">
              <button class="column-filter-btn ${columnFilter ? 'active' : ''}" aria-label="Filter by color">
                ${filterIcon}
              </button>
              <div class="column-filter-dropdown">
                <button class="filter-option ${!columnFilter ? 'active' : ''}" data-color="all">All</button>
                <button class="filter-option ${columnFilter === 'red' ? 'active' : ''}" data-color="red">
                  <span class="filter-color-dot" style="background: #E74C3C;"></span> Red
                </button>
                <button class="filter-option ${columnFilter === 'blue' ? 'active' : ''}" data-color="blue">
                  <span class="filter-color-dot" style="background: #3498db;"></span> Blue
                </button>
                <button class="filter-option ${columnFilter === 'green' ? 'active' : ''}" data-color="green">
                  <span class="filter-color-dot" style="background: #2ECC71;"></span> Green
                </button>
                <button class="filter-option ${columnFilter === 'yellow' ? 'active' : ''}" data-color="yellow">
                  <span class="filter-color-dot" style="background: #F39C12;"></span> Yellow
                </button>
                <button class="filter-option ${columnFilter === 'purple' ? 'active' : ''}" data-color="purple">
                  <span class="filter-color-dot" style="background: #9B59B6;"></span> Purple
                </button>
              </div>
            </div>
            <button class="column-collapse-btn" data-column-id="${column.id}" aria-label="Toggle collapse">
              <span class="collapse-icon">${column.collapsed ? '▶' : '▼'}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="column-body ${column.collapsed ? 'collapsed' : ''}">
        <div class="tasks scrollable" data-column-id="${column.id}"></div>
        <button class="add-task-btn" data-column-id="${column.id}">+ Add Task</button>
      </div>
    `;

    const tasksContainer = columnEl.querySelector('.tasks');

    // Render only visible tasks
    visibleTasks.forEach(task => {
      const taskEl = this.createTaskElement(task, column.id);
      tasksContainer.appendChild(taskEl);
    });

    // Show empty state if no tasks at all
    if (totalTasks === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'column-empty';
      emptyState.innerHTML = `
        <div class="column-empty-icon">📝</div>
        <div class="column-empty-text">No tasks yet</div>
        <button class="column-empty-btn" data-column-id="${column.id}">Add First Task</button>
      `;
      tasksContainer.appendChild(emptyState);

      // Event listener for empty state button
      const emptyBtn = emptyState.querySelector('.column-empty-btn');
      emptyBtn.addEventListener('click', () => {
        this.openModal(column.id);
      });
    }
    // Show filtered empty state if filtered and no visible tasks
    else if (visibleTasks.length === 0 && totalTasks > 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'column-empty-filtered';
      emptyState.textContent = 'No tasks with this color';
      tasksContainer.appendChild(emptyState);
    }

    // Collapse button event
    const collapseBtn = columnEl.querySelector('.column-collapse-btn');
    collapseBtn.addEventListener('click', () => {
      this.toggleColumnCollapse(column.id);
    });

    // Filter dropdown toggle
    const filterBtn = columnEl.querySelector('.column-filter-btn');
    const filterDropdown = columnEl.querySelector('.column-filter-dropdown');
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any other open dropdowns
      document.querySelectorAll('.column-filter-dropdown.open').forEach(d => {
        if (d !== filterDropdown) d.classList.remove('open');
      });
      filterDropdown.classList.toggle('open');
    });

    // Filter option clicks
    filterDropdown.querySelectorAll('.filter-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setColorFilter(column.id, option.dataset.color);
        filterDropdown.classList.remove('open');
      });
    });

    // Add task button event
    const addTaskBtn = columnEl.querySelector('.add-task-btn');
    addTaskBtn.addEventListener('click', () => {
      this.openModal(column.id);
    });

    // Drag and drop events (entire column is droppable, including collapsed/empty states)
    this.bindDropTarget(columnEl, column.id);

    return columnEl;
  }

  bindDropTarget(dropTargetEl, columnId) {
    dropTargetEl.dataset.dragDepth = '0';
    dropTargetEl.addEventListener('dragover', (e) => this.handleDragOver(e));
    dropTargetEl.addEventListener('drop', (e) => this.handleDrop(e, columnId));
    dropTargetEl.addEventListener('dragenter', (e) => this.handleDragEnter(e));
    dropTargetEl.addEventListener('dragleave', (e) => this.handleDragLeave(e));
  }

  createTaskElement(task, columnId) {
    const taskEl = document.createElement('div');
    taskEl.className = 'task';
    taskEl.draggable = true;
    taskEl.tabIndex = 0;
    taskEl.dataset.taskId = task.id;
    if (task.color) {
      taskEl.dataset.color = task.color;
    }

    taskEl.innerHTML = `
      <div class="task-content">
        <div class="task-title">${this.escapeHtml(task.title)}</div>
      </div>
      <button class="task-delete" data-task-id="${task.id}" aria-label="Delete task">×</button>
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
      if (this.justDragged) return;
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
    }, 400);
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

    // Cache column rects for hit-testing during drag
    this.cacheColumnRects();

    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  }

  cacheColumnRects() {
    const columns = document.querySelectorAll('.column');
    this.dragAnimState.columnCache = Array.from(columns).map(col => ({
      el: col,
      columnId: col.dataset.columnId,
      rect: col.getBoundingClientRect()
    }));
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

    // Store pending position and schedule rAF update
    this.dragAnimState.pendingX = touch.clientX;
    this.dragAnimState.pendingY = touch.clientY;

    if (!this.dragAnimState.rafId) {
      this.dragAnimState.rafId = requestAnimationFrame(() => this.updateDragFrame());
    }
  }

  updateDragFrame() {
    this.dragAnimState.rafId = null;

    const { pendingX, pendingY } = this.dragAnimState;

    // Move clone
    if (this.touchDragState.clone) {
      this.touchDragState.clone.style.left = (pendingX - this.touchDragState.offsetX) + 'px';
      this.touchDragState.clone.style.top = (pendingY - this.touchDragState.offsetY) + 'px';
    }

    // Highlight target column (using cached rects)
    this.highlightDropTarget(pendingX, pendingY);

    // Auto-scroll when near edges
    this.autoScrollDuringDrag(pendingY);
  }

  autoScrollDuringDrag(touchY) {
    const edgeZone = 60;
    const maxSpeed = 12;
    const scrollContainer = document.querySelector('.kanban-main');
    if (!scrollContainer) return;

    let scrollDelta = 0;

    if (touchY < edgeZone) {
      // Near top — scroll up
      scrollDelta = -maxSpeed * ((edgeZone - touchY) / edgeZone);
    } else if (touchY > window.innerHeight - edgeZone) {
      // Near bottom — scroll down
      scrollDelta = maxSpeed * ((touchY - (window.innerHeight - edgeZone)) / edgeZone);
    }

    if (scrollDelta !== 0) {
      scrollContainer.scrollTop += scrollDelta;
      // Invalidate cached rects since scroll changed positions
      this.dragAnimState.columnCache = null;

      // Keep scrolling while touch stays in edge zone
      if (this.touchDragState.isDragging) {
        this.dragAnimState.rafId = requestAnimationFrame(() => this.updateDragFrame());
      }
    }
  }

  handleTouchEnd(e) {
    clearTimeout(this.touchDragState.longPressTimer);

    // Cancel any pending animation frame
    if (this.dragAnimState.rafId) {
      cancelAnimationFrame(this.dragAnimState.rafId);
      this.dragAnimState.rafId = null;
    }

    if (this.touchDragState.isDragging) {
      // Find drop target
      const touch = e.changedTouches[0];
      const targetColumn = this.findColumnAtPoint(touch.clientX, touch.clientY);

      if (targetColumn && this.touchDragState.taskId) {
        this.moveTask(this.touchDragState.taskId, targetColumn);
      }

      // Clean up
      this.clearDropHighlights();

      // Prevent click-after-drag from opening the edit modal
      this.justDragged = true;
      setTimeout(() => { this.justDragged = false; }, 0);
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
    this.dragAnimState.columnCache = null;
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

    const cached = this.dragAnimState.columnCache;
    if (cached) {
      for (const { el, rect } of cached) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          el.classList.add('drag-over');
        }
      }
    } else {
      // Fallback: query DOM directly
      const columns = document.querySelectorAll('.column');
      columns.forEach(col => {
        const rect = col.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          col.classList.add('drag-over');
        }
      });
    }
  }

  clearDropHighlights() {
    document.querySelectorAll('.column.drag-over, .tasks.drag-over').forEach(el => {
      el.classList.remove('drag-over');
      if (el.classList.contains('column')) {
        el.dataset.dragDepth = '0';
      }
    });
  }

  findColumnAtPoint(x, y) {
    const cached = this.dragAnimState.columnCache;
    if (cached) {
      // Refresh rects for final drop accuracy
      for (const entry of cached) {
        entry.rect = entry.el.getBoundingClientRect();
      }
      for (const { columnId, rect } of cached) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return columnId;
        }
      }
    } else {
      const columns = document.querySelectorAll('.column');
      for (const col of columns) {
        const rect = col.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return col.dataset.columnId;
        }
      }
    }
    return null;
  }

  handleDragStart(e) {
    const taskEl = e.currentTarget;
    taskEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', taskEl.innerHTML);
    e.dataTransfer.setData('taskId', taskEl.dataset.taskId);
  }

  handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    this.clearDropHighlights();
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  handleDragEnter(e) {
    e.preventDefault();
    const dropTarget = e.currentTarget;
    const depth = Number.parseInt(dropTarget.dataset.dragDepth || '0', 10) + 1;
    dropTarget.dataset.dragDepth = depth.toString();
    dropTarget.classList.add('drag-over');
  }

  handleDragLeave(e) {
    const dropTarget = e.currentTarget;
    const depth = Math.max(0, Number.parseInt(dropTarget.dataset.dragDepth || '0', 10) - 1);
    dropTarget.dataset.dragDepth = depth.toString();

    if (depth === 0) {
      dropTarget.classList.remove('drag-over');
    }
  }

  handleDrop(e, targetColumnId) {
    e.preventDefault();
    e.stopPropagation();

    const dropTarget = e.currentTarget;
    dropTarget.classList.remove('drag-over');
    dropTarget.dataset.dragDepth = '0';

    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    // Find and move the task
    this.moveTask(taskId, targetColumnId);
  }

  moveTask(taskId, targetColumnId) {
    // Find the source column and task
    let sourceColumn = null;
    let taskIndex = -1;

    for (const column of this.board.columns) {
      const idx = column.tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        sourceColumn = column;
        taskIndex = idx;
        break;
      }
    }

    if (!sourceColumn || taskIndex === -1) return;

    // Skip if dropped on the same column
    if (sourceColumn.id === targetColumnId) return;

    const targetColumn = this.board.columns.find(c => c.id === targetColumnId);
    if (!targetColumn) return;

    const task = sourceColumn.tasks.splice(taskIndex, 1)[0];
    targetColumn.tasks.push(task);

    this.saveBoard();
    this.renderBoard();
  }

  openModal(columnId, taskId = null) {
    this.currentColumnId = columnId;
    this.editingTaskId = taskId;
    this.hasUnsavedChanges = false;

    if (taskId) {
      // Editing existing task
      const task = this.findTask(taskId);
      if (task) {
        this.modalTitle.textContent = 'Edit Task';
        this.taskTitleInput.value = task.title;
        this.taskDescriptionInput.value = task.description || '';

        // Set color
        this.selectColor(task.color || 'none');

        // Show delete button
        this.deleteTaskBtn.style.display = 'inline-flex';
      }
    } else {
      // Adding new task
      this.modalTitle.textContent = 'Add Task';
      this.taskTitleInput.value = '';
      this.taskDescriptionInput.value = '';
      this.selectColor('none');

      // Hide delete
      this.deleteTaskBtn.style.display = 'none';
    }

    this.taskModal.classList.add('active');
    this.taskTitleInput.focus();
  }

  closeModal() {
    if (!this.checkUnsavedChanges()) return;

    this.taskModal.classList.remove('active');
    this.currentColumnId = null;
    this.editingTaskId = null;
    this.selectedColor = null;
    this.hasUnsavedChanges = false;
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
        task.color = this.selectedColor;
      }
    } else {
      // Create new task
      const newTask = {
        id: this.generateId(),
        title: title,
        description: description,
        color: this.selectedColor,
        createdAt: Date.now()
      };

      const column = this.board.columns.find(c => c.id === this.currentColumnId);
      if (column) {
        column.tasks.push(newTask);
      }
    }

    this.hasUnsavedChanges = false;
    this.saveBoard();
    this.renderBoard();
    this.closeModal();
  }

  deleteTask(taskId) {
    const task = this.findTask(taskId);
    if (!task) return;

    const taskTitle = task.title;

    // Confirmation dialog
    if (!confirm(`Delete task "${taskTitle}"?`)) return;

    // Find column and task index
    let deletedFromColumn = null;
    let deletedTaskIndex = -1;

    for (const column of this.board.columns) {
      const taskIndex = column.tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        deletedFromColumn = column.id;
        deletedTaskIndex = taskIndex;

        // Store for undo (deep copy)
        this.deletedTaskState = {
          task: { ...column.tasks[taskIndex] },
          columnId: column.id,
          index: taskIndex
        };

        // Remove task
        column.tasks.splice(taskIndex, 1);
        break;
      }
    }

    if (!deletedFromColumn) return;

    this.saveBoard();
    this.renderBoard();

    // Show undo toast
    this.showUndoToast(taskTitle);
  }

  findTask(taskId) {
    for (const column of this.board.columns) {
      const task = column.tasks.find(t => t.id === taskId);
      if (task) return task;
    }
    return null;
  }

  findTaskColumn(taskId) {
    for (const column of this.board.columns) {
      if (column.tasks.find(t => t.id === taskId)) {
        return column.id;
      }
    }
    return null;
  }

  selectColor(color, fromUserAction = false) {
    this.selectedColor = color === 'none' ? null : color;
    if (fromUserAction) {
      this.hasUnsavedChanges = true;
    }

    this.colorSwatches.forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.color === color);
    });
  }

  checkUnsavedChanges() {
    if (!this.hasUnsavedChanges) return true;
    return confirm('You have unsaved changes. Are you sure you want to close?');
  }

  setColorFilter(columnId, color) {
    const column = this.board.columns.find(c => c.id === columnId);
    if (!column) return;

    column.colorFilter = color === 'all' ? null : color;
    this.saveBoard();
    this.renderBoard();
  }

  shouldShowTask(task, columnFilter) {
    if (!columnFilter) return true;
    return task.color === columnFilter;
  }

  toggleColumnCollapse(columnId) {
    const column = this.board.columns.find(c => c.id === columnId);
    if (!column) return;

    column.collapsed = !column.collapsed;

    this.saveBoard();
    this.renderBoard();
  }

  showUndoToast(taskTitle) {
    // Clear previous timeout
    if (this.undoTimeoutId) {
      clearTimeout(this.undoTimeoutId);
    }

    // Set message
    this.toastMessage.textContent = `Deleted "${taskTitle}"`;

    // Show toast
    this.undoToast.classList.add('show');

    // Auto-hide after 8 seconds
    this.undoTimeoutId = setTimeout(() => {
      this.hideUndoToast();
      this.deletedTaskState = null;
    }, 8000);
  }

  hideUndoToast() {
    this.undoToast.classList.remove('show');

    if (this.undoTimeoutId) {
      clearTimeout(this.undoTimeoutId);
      this.undoTimeoutId = null;
    }
  }

  undoDelete() {
    if (!this.deletedTaskState) return;

    const { task, columnId, index } = this.deletedTaskState;

    // Find target column
    const column = this.board.columns.find(c => c.id === columnId);
    if (!column) {
      console.error('Column not found for undo');
      this.hideUndoToast();
      return;
    }

    // Restore task at original position
    column.tasks.splice(index, 0, task);

    this.saveBoard();
    this.renderBoard();

    // Hide toast
    this.hideUndoToast();
    this.deletedTaskState = null;
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
