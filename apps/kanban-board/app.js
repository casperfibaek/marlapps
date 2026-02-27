// Kanban Board App with drag-and-drop and localStorage persistence

class KanbanBoard {
  // Constants
  static LONG_PRESS_MS = 400;
  static TOUCH_MOVE_THRESHOLD_PX = 10;
  static AUTO_SCROLL_EDGE_PX = 60;
  static AUTO_SCROLL_MAX_SPEED = 12;
  static UNDO_TIMEOUT_MS = 8000;

  constructor() {
    this.migrateStorage();
    this.board = this.loadBoard();
    this.currentColumnId = null;
    this.editingTaskId = null;
    this.selectedColor = null;
    this.hasUnsavedChanges = false;
    this.deletedTaskState = null;
    this.undoTimeoutId = null;
    this._pendingConfirm = null;

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
      columnCache: null
    };

    this.justDragged = false;

    this.initElements();
    this.attachEventListeners();
    this.renderBoard();
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

    // Confirm dialog elements
    this.confirmModal = document.getElementById('confirmModal');
    this.confirmTitle = document.getElementById('confirmTitle');
    this.confirmMessage = document.getElementById('confirmMessage');
    this.confirmOkBtn = document.getElementById('confirmOk');
    this.confirmCancelBtn = document.getElementById('confirmCancel');

    // Prompt dialog elements
    this.promptModal = document.getElementById('promptModal');
    this.promptForm = document.getElementById('promptForm');
    this.promptInput = document.getElementById('promptInput');
    this.promptCancelBtn = document.getElementById('promptCancel');
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
      settings: {}
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
    try {
      localStorage.setItem('marlapps-kanban-board', JSON.stringify(this.board));
    } catch (e) {
      console.error('Failed to save board:', e);
    }
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

    // Keyboard support (skip if a confirm/prompt dialog is open — they handle their own Escape)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.confirmModal.classList.contains('active')) return;
      if (this.promptModal.classList.contains('active')) return;
      if (this.taskModal.classList.contains('active')) {
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
    this.deleteTaskBtn.addEventListener('click', async () => {
      if (this.editingTaskId) {
        const taskId = this.editingTaskId;
        this.hasUnsavedChanges = false;
        await this.closeModal();
        await this.deleteTask(taskId);
      }
    });

    // Track unsaved changes
    this.taskTitleInput.addEventListener('input', () => {
      this.hasUnsavedChanges = true;
    });
    this.taskDescriptionInput.addEventListener('input', () => {
      this.hasUnsavedChanges = true;
    });

    // Close filter and edit dropdowns when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.column-filter-dropdown.open, .column-edit-dropdown.open').forEach(d => {
        d.classList.remove('open');
      });
    });

    // Undo button
    this.toastUndo.addEventListener('click', () => {
      this.undoDelete();
    });

    // Board-level drag handlers for column reordering (attached once, not per-render)
    this.boardEl.addEventListener('dragover', (e) => {
      if (!this.currentDragColumnId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this.showColumnDropIndicator(e.clientX);
    });
    this.boardEl.addEventListener('drop', (e) => {
      if (!this.currentDragColumnId) return;
      e.preventDefault();
      const targetIndex = this.getColumnDropIndex(e.clientX, this.currentDragColumnId);
      this.moveColumn(this.currentDragColumnId, targetIndex);
      this.currentDragColumnId = null;
      this.removeColumnDropIndicator();
    });

    // Persist data when app is closed / hidden
    const flush = () => this.saveBoard();
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveBoard();
    });
  }

  renderBoard() {
    // Preserve scroll position across re-renders
    const main = document.querySelector('.kanban-main');
    const scrollLeft = main ? main.scrollLeft : 0;
    const scrollTop = main ? main.scrollTop : 0;

    this.boardEl.innerHTML = '';

    this.board.columns.forEach(column => {
      const columnEl = this.createColumnElement(column);
      this.boardEl.appendChild(columnEl);
    });

    // Add "Add Column" button at the end
    const addColumnBtn = document.createElement('button');
    addColumnBtn.className = 'add-column-btn';
    addColumnBtn.textContent = '+ Add Column';
    addColumnBtn.addEventListener('click', async () => {
      const name = await this.showPrompt('Add Column', 'Column name:', 'Enter column name');
      if (name) {
        this.addColumn(name);
      }
    });
    this.boardEl.appendChild(addColumnBtn);

    if (main) {
      main.scrollLeft = scrollLeft;
      main.scrollTop = scrollTop;
    }
  }

  createColumnElement(column) {
    const columnEl = document.createElement('div');
    columnEl.className = `column ${column.collapsed ? 'collapsed' : ''}`;
    columnEl.dataset.columnId = column.id;
    columnEl.setAttribute('role', 'listitem');
    columnEl.setAttribute('aria-label', column.name);

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
              <button class="column-filter-btn ${columnFilter ? 'active' : ''}" aria-label="Filter by color" aria-expanded="false" aria-haspopup="true">
                ${filterIcon}
              </button>
              <div class="column-filter-dropdown" role="menu">
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
            <div class="column-edit-wrapper">
              <button class="column-edit-btn" aria-label="Edit column" aria-expanded="false" aria-haspopup="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
              </button>
              <div class="column-edit-dropdown" role="menu">
                <button class="edit-option" data-action="rename">Rename column</button>
                <div class="edit-separator"></div>
                <button class="edit-option danger" data-action="clear-tasks">Delete all tasks</button>
                <button class="edit-option danger" data-action="delete-column">Delete column</button>
              </div>
            </div>
            <button class="column-collapse-btn" data-column-id="${column.id}" aria-label="Toggle collapse">
              <span class="collapse-icon">${column.collapsed ? '▶' : '▼'}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="column-body ${column.collapsed ? 'collapsed' : ''}">
        <div class="tasks scrollable" data-column-id="${column.id}" role="list" aria-label="${this.escapeHtml(column.name)} tasks"></div>
        <button class="add-task-btn" data-column-id="${column.id}">+ Add Task</button>
      </div>
    `;

    const tasksContainer = columnEl.querySelector('.tasks');

    // Render only visible tasks
    visibleTasks.forEach(task => {
      const taskEl = this.createTaskElement(task, column.id);
      tasksContainer.appendChild(taskEl);
    });

    // Show filtered empty state if filtered and no visible tasks
    if (visibleTasks.length === 0 && totalTasks > 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'column-empty-filtered';
      emptyState.textContent = 'No tasks with this color';
      tasksContainer.appendChild(emptyState);
    }

    // Column header drag for reordering
    const columnHeader = columnEl.querySelector('.column-header');
    columnHeader.draggable = true;
    columnHeader.addEventListener('dragstart', (e) => {
      // Don't start column drag from interactive elements
      if (e.target.closest('.column-filter-btn, .column-filter-dropdown, .column-edit-wrapper, .column-collapse-btn, .column-rename-input')) {
        e.preventDefault();
        return;
      }
      this.currentDragColumnId = column.id;
      columnEl.classList.add('column-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('columnId', column.id);
      // Needed so task drop handlers can distinguish column vs task drags
      e.stopPropagation();
    });
    columnHeader.addEventListener('dragend', () => {
      columnEl.classList.remove('column-dragging');
      this.currentDragColumnId = null;
      this.removeColumnDropIndicator();
    });

    // Collapse button event
    const collapseBtn = columnEl.querySelector('.column-collapse-btn');
    collapseBtn.addEventListener('click', () => {
      this.toggleColumnCollapse(column.id);
    });

    // Clicking column header expands a collapsed column
    columnHeader.addEventListener('click', (e) => {
      if (!column.collapsed) return;
      if (e.target.closest('.column-collapse-btn') || e.target.closest('.column-filter-btn') || e.target.closest('.column-filter-dropdown') || e.target.closest('.column-edit-wrapper')) return;
      this.toggleColumnCollapse(column.id);
    });

    // Filter dropdown toggle
    const filterBtn = columnEl.querySelector('.column-filter-btn');
    const filterDropdown = columnEl.querySelector('.column-filter-dropdown');
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close any other open dropdowns
      document.querySelectorAll('.column-filter-dropdown.open').forEach(d => {
        if (d !== filterDropdown) {
          d.classList.remove('open');
          d.previousElementSibling?.setAttribute('aria-expanded', 'false');
        }
      });
      const isOpen = filterDropdown.classList.toggle('open');
      filterBtn.setAttribute('aria-expanded', isOpen.toString());
    });

    // Filter option clicks
    filterDropdown.querySelectorAll('.filter-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setColorFilter(column.id, option.dataset.color);
        filterDropdown.classList.remove('open');
      });
    });

    // Edit dropdown toggle
    const editBtn = columnEl.querySelector('.column-edit-btn');
    const editDropdown = columnEl.querySelector('.column-edit-dropdown');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.column-edit-dropdown.open, .column-filter-dropdown.open').forEach(d => {
        if (d !== editDropdown) d.classList.remove('open');
      });
      const isOpen = editDropdown.classList.toggle('open');
      editBtn.setAttribute('aria-expanded', isOpen.toString());
    });

    // Edit dropdown actions
    editDropdown.querySelectorAll('.edit-option').forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = option.dataset.action;
        editDropdown.classList.remove('open');

        if (action === 'rename') {
          this.startColumnRename(columnEl, column.id);
        } else if (action === 'clear-tasks') {
          this.clearColumnTasks(column.id);
        } else if (action === 'delete-column') {
          this.deleteColumn(column.id);
        }
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
    taskEl.setAttribute('role', 'listitem');
    taskEl.setAttribute('aria-label', task.title);
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
    }, KanbanBoard.LONG_PRESS_MS);
  }

  startTouchDrag(taskEl, touch) {
    this.touchDragState.isDragging = true;

    // Create clone for visual feedback
    const rect = taskEl.getBoundingClientRect();
    const clone = taskEl.cloneNode(true);
    clone.classList.add('touch-dragging');
    clone.style.width = rect.width + 'px';
    clone.style.left = '0px';
    clone.style.top = '0px';
    const x = touch.clientX - this.touchDragState.offsetX;
    const y = touch.clientY - this.touchDragState.offsetY;
    clone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(3deg) scale(1.02)`;
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
    if (!this.touchDragState.isDragging && (deltaX > KanbanBoard.TOUCH_MOVE_THRESHOLD_PX || deltaY > KanbanBoard.TOUCH_MOVE_THRESHOLD_PX)) {
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

    // Move clone via transform (GPU-accelerated)
    if (this.touchDragState.clone) {
      const x = pendingX - this.touchDragState.offsetX;
      const y = pendingY - this.touchDragState.offsetY;
      this.touchDragState.clone.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(3deg) scale(1.02)`;
    }

    // Highlight target column and show drop indicator (using cached rects)
    this.highlightDropTarget(pendingX, pendingY);

    // Show drop indicator for touch drag
    const targetCol = this.findColumnAtPoint(pendingX, pendingY);
    if (targetCol) {
      this.showDropIndicator(targetCol, pendingY, this.touchDragState.taskId);
    } else {
      this.removeDropIndicator();
    }

    // Auto-scroll when near edges
    this.autoScrollDuringDrag(pendingY);
  }

  autoScrollDuringDrag(touchY) {
    const edgeZone = KanbanBoard.AUTO_SCROLL_EDGE_PX;
    const maxSpeed = KanbanBoard.AUTO_SCROLL_MAX_SPEED;
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
      // Refresh rects for accurate final drop position
      this.cacheColumnRects();
      const touch = e.changedTouches[0];
      const targetColumn = this.findColumnAtPoint(touch.clientX, touch.clientY);

      if (targetColumn && this.touchDragState.taskId) {
        const targetIndex = this.getDropIndex(targetColumn, touch.clientY, this.touchDragState.taskId);
        this.moveTask(this.touchDragState.taskId, targetColumn, targetIndex);
      }

      // Clean up
      this.clearDropHighlights();
      this.removeDropIndicator();

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
    let cached = this.dragAnimState.columnCache;
    if (!cached) {
      this.cacheColumnRects();
      cached = this.dragAnimState.columnCache;
    }
    if (cached) {
      for (const { columnId, rect } of cached) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return columnId;
        }
      }
    }
    return null;
  }

  getDropIndex(targetColumnId, clientY, draggedTaskId = null) {
    const targetColumn = this.board.columns.find(c => c.id === targetColumnId);
    if (!targetColumn) return null;

    const targetColumnEl = document.querySelector(`.column[data-column-id="${targetColumnId}"]`);
    if (!targetColumnEl) return targetColumn.tasks.length;

    // Use only visible DOM task elements (respects color filter)
    const visibleTaskEls = Array.from(targetColumnEl.querySelectorAll('.task[data-task-id]'))
      .filter(taskEl => taskEl.dataset.taskId !== draggedTaskId);

    if (visibleTaskEls.length === 0) {
      // If filtered and empty, insert at end; if unfiltered and empty, also end
      return targetColumn.tasks.length;
    }

    // Find which visible task the cursor is above
    for (const taskEl of visibleTaskEls) {
      const rect = taskEl.getBoundingClientRect();
      const midpoint = rect.top + (rect.height / 2);
      if (clientY < midpoint) {
        // Map this visible task back to its actual index in the full array
        const beforeTaskIndex = targetColumn.tasks.findIndex(t => t.id === taskEl.dataset.taskId);
        if (beforeTaskIndex !== -1) {
          return beforeTaskIndex;
        }
      }
    }

    // Cursor is below all visible tasks — insert after the last visible task's real position
    const lastVisibleId = visibleTaskEls[visibleTaskEls.length - 1].dataset.taskId;
    const lastVisibleIndex = targetColumn.tasks.findIndex(t => t.id === lastVisibleId);
    return lastVisibleIndex !== -1 ? lastVisibleIndex + 1 : targetColumn.tasks.length;
  }

  handleDragStart(e) {
    const taskEl = e.currentTarget;
    taskEl.classList.add('dragging');
    this.currentDragTaskId = taskEl.dataset.taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', taskEl.innerHTML);
    e.dataTransfer.setData('taskId', taskEl.dataset.taskId);
  }

  handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    this.currentDragTaskId = null;
    this.clearDropHighlights();
    this.removeDropIndicator();
  }

  handleDragOver(e) {
    if (this.currentDragColumnId) return; // Column drag handled at board level
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Show drop indicator
    const column = e.currentTarget;
    const columnId = column.dataset.columnId;
    const draggedTaskId = this.currentDragTaskId;
    this.showDropIndicator(columnId, e.clientY, draggedTaskId);
  }

  handleDragEnter(e) {
    if (this.currentDragColumnId) return;
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
    if (this.currentDragColumnId) return; // Column drag handled at board level
    e.preventDefault();
    e.stopPropagation();

    const dropTarget = e.currentTarget;
    dropTarget.classList.remove('drag-over');
    dropTarget.dataset.dragDepth = '0';
    this.removeDropIndicator();

    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;

    const targetIndex = this.getDropIndex(targetColumnId, e.clientY, taskId);
    this.moveTask(taskId, targetColumnId, targetIndex);
  }

  moveTask(taskId, targetColumnId, targetIndex = null) {
    // Find the source column and task
    let sourceColumn = null;
    let sourceTaskIndex = -1;

    for (const column of this.board.columns) {
      const idx = column.tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        sourceColumn = column;
        sourceTaskIndex = idx;
        break;
      }
    }

    if (!sourceColumn || sourceTaskIndex === -1) return;

    const targetColumn = this.board.columns.find(c => c.id === targetColumnId);
    if (!targetColumn) return;

    // Default behavior remains append when no target index is available.
    const maxTargetIndex = targetColumn.tasks.length;
    let insertionIndex = Number.isInteger(targetIndex) ? targetIndex : maxTargetIndex;
    insertionIndex = Math.max(0, Math.min(insertionIndex, maxTargetIndex));

    if (sourceColumn.id === targetColumnId && sourceTaskIndex < insertionIndex) {
      insertionIndex -= 1;
    }

    // No-op: dropped back to original position
    if (sourceColumn.id === targetColumnId && insertionIndex === sourceTaskIndex) {
      return;
    }

    const task = sourceColumn.tasks.splice(sourceTaskIndex, 1)[0];
    targetColumn.tasks.splice(insertionIndex, 0, task);

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

  async closeModal() {
    if (!await this.checkUnsavedChanges()) return;

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

  async deleteTask(taskId) {
    const task = this.findTask(taskId);
    if (!task) return;

    const taskTitle = task.title;

    if (!await this.showConfirm('Delete Task', `Delete task "${taskTitle}"?`)) return;

    // Find column and task index
    let found = false;

    for (const column of this.board.columns) {
      const taskIndex = column.tasks.findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        // Store for undo (deep copy)
        this.deletedTaskState = {
          task: { ...column.tasks[taskIndex] },
          columnId: column.id,
          index: taskIndex
        };

        // Remove task
        column.tasks.splice(taskIndex, 1);
        found = true;
        break;
      }
    }

    if (!found) return;

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

  selectColor(color, fromUserAction = false) {
    this.selectedColor = color === 'none' ? null : color;
    if (fromUserAction) {
      this.hasUnsavedChanges = true;
    }

    this.colorSwatches.forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.color === color);
    });
  }

  async checkUnsavedChanges() {
    if (!this.hasUnsavedChanges) return true;
    return this.showConfirm('Unsaved Changes', 'You have unsaved changes. Are you sure you want to close?', 'Discard');
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

  startColumnRename(columnEl, columnId) {
    const titleEl = columnEl.querySelector('.column-title');
    const currentName = titleEl.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'column-rename-input';
    input.value = currentName;

    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        this.renameColumn(columnId, newName);
      } else {
        this.renderBoard();
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        this.renderBoard();
      }
    });

    input.addEventListener('blur', commit);
  }

  renameColumn(columnId, newName) {
    const column = this.board.columns.find(c => c.id === columnId);
    if (!column) return;

    column.name = newName;
    this.saveBoard();
    this.renderBoard();
  }

  async clearColumnTasks(columnId) {
    const column = this.board.columns.find(c => c.id === columnId);
    if (!column) return;
    if (column.tasks.length === 0) return;

    if (!await this.showConfirm('Clear Tasks', `Delete all ${column.tasks.length} tasks in "${column.name}"?`)) return;

    column.tasks = [];
    this.saveBoard();
    this.renderBoard();
  }

  async deleteColumn(columnId) {
    const column = this.board.columns.find(c => c.id === columnId);
    if (!column) return;

    const taskCount = column.tasks.length;
    const msg = taskCount > 0
      ? `Delete column "${column.name}" and its ${taskCount} task${taskCount > 1 ? 's' : ''}?`
      : `Delete column "${column.name}"?`;

    if (!await this.showConfirm('Delete Column', msg)) return;

    this.board.columns = this.board.columns.filter(c => c.id !== columnId);
    this.saveBoard();
    this.renderBoard();
  }

  addColumn(name) {
    const id = 'col-' + this.generateId();
    this.board.columns.push({
      id,
      name,
      tasks: [],
      collapsed: false,
      colorFilter: null
    });
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

    this.undoTimeoutId = setTimeout(() => {
      this.hideUndoToast();
      this.deletedTaskState = null;
    }, KanbanBoard.UNDO_TIMEOUT_MS);
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

  showDropIndicator(columnId, clientY, draggedTaskId = null) {
    const columnEl = document.querySelector(`.column[data-column-id="${columnId}"]`);
    if (!columnEl) return;

    const tasksContainer = columnEl.querySelector('.tasks');
    if (!tasksContainer) return;

    const taskEls = Array.from(tasksContainer.querySelectorAll('.task[data-task-id]'))
      .filter(el => el.dataset.taskId !== draggedTaskId);

    // Reuse existing indicator or create one
    let indicator = this._dropIndicator;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'drop-indicator';
      this._dropIndicator = indicator;
    }

    // Determine target position
    let targetRef = null; // insert before this element, or null = prepend/append
    if (taskEls.length === 0) {
      targetRef = tasksContainer.firstChild;
    } else {
      for (const taskEl of taskEls) {
        const rect = taskEl.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (clientY < midpoint) {
          targetRef = taskEl;
          break;
        }
      }
    }

    // Only move if position actually changed
    if (targetRef) {
      if (indicator.nextSibling !== targetRef || indicator.parentNode !== tasksContainer) {
        tasksContainer.insertBefore(indicator, targetRef);
      }
    } else {
      if (indicator.parentNode !== tasksContainer || indicator.nextSibling !== null) {
        tasksContainer.appendChild(indicator);
      }
    }
  }

  removeDropIndicator() {
    if (this._dropIndicator && this._dropIndicator.parentNode) {
      this._dropIndicator.remove();
    }
    this._dropIndicator = null;
  }

  // Column reorder helpers
  showColumnDropIndicator(clientX) {
    let indicator = this._columnDropIndicator;
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'column-drop-indicator';
      this._columnDropIndicator = indicator;
    }

    const columnEls = Array.from(this.boardEl.querySelectorAll('.column'))
      .filter(el => el.dataset.columnId !== this.currentDragColumnId);

    if (columnEls.length === 0) {
      this.boardEl.insertBefore(indicator, this.boardEl.firstChild);
      return;
    }

    // Find insert position based on horizontal midpoints
    let targetRef = null;
    for (const colEl of columnEls) {
      const rect = colEl.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      if (clientX < midpoint) {
        targetRef = colEl;
        break;
      }
    }

    if (targetRef) {
      if (indicator.nextElementSibling !== targetRef || indicator.parentNode !== this.boardEl) {
        this.boardEl.insertBefore(indicator, targetRef);
      }
    } else {
      // After all columns, but before the add-column button
      const addBtn = this.boardEl.querySelector('.add-column-btn');
      if (addBtn && (indicator.nextElementSibling !== addBtn || indicator.parentNode !== this.boardEl)) {
        this.boardEl.insertBefore(indicator, addBtn);
      }
    }
  }

  removeColumnDropIndicator() {
    if (this._columnDropIndicator && this._columnDropIndicator.parentNode) {
      this._columnDropIndicator.remove();
    }
    this._columnDropIndicator = null;
  }

  getColumnDropIndex(clientX, draggedColumnId) {
    const columnEls = Array.from(this.boardEl.querySelectorAll('.column'))
      .filter(el => el.dataset.columnId !== draggedColumnId);

    for (let i = 0; i < columnEls.length; i++) {
      const rect = columnEls[i].getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      if (clientX < midpoint) {
        // Find the actual index in board.columns for this column
        const targetColId = columnEls[i].dataset.columnId;
        const targetIdx = this.board.columns.findIndex(c => c.id === targetColId);
        return targetIdx;
      }
    }

    return this.board.columns.length;
  }

  moveColumn(columnId, targetIndex) {
    const sourceIndex = this.board.columns.findIndex(c => c.id === columnId);
    if (sourceIndex === -1) return;

    // Adjust target if source is before target
    let insertIndex = targetIndex;
    if (sourceIndex < insertIndex) {
      insertIndex -= 1;
    }

    if (sourceIndex === insertIndex) return;

    const column = this.board.columns.splice(sourceIndex, 1)[0];
    this.board.columns.splice(insertIndex, 0, column);

    this.saveBoard();
    this.renderBoard();
  }

  showConfirm(title, message, okLabel = 'Delete') {
    return new Promise((resolve) => {
      this.confirmTitle.textContent = title;
      this.confirmMessage.textContent = message;
      this.confirmOkBtn.textContent = okLabel;
      this.confirmModal.classList.add('active');
      this.confirmOkBtn.focus();

      const cleanup = () => {
        this.confirmModal.classList.remove('active');
        this.confirmOkBtn.removeEventListener('click', onOk);
        this.confirmCancelBtn.removeEventListener('click', onCancel);
        this.confirmModal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
      };
      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      const onBackdrop = (e) => { if (e.target === this.confirmModal) onCancel(); };
      const onKey = (e) => { if (e.key === 'Escape') onCancel(); };

      this.confirmOkBtn.addEventListener('click', onOk);
      this.confirmCancelBtn.addEventListener('click', onCancel);
      this.confirmModal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }

  showPrompt(title, label, placeholder = '') {
    return new Promise((resolve) => {
      document.getElementById('promptTitle').textContent = title;
      this.promptInput.value = '';
      this.promptInput.placeholder = placeholder;
      this.promptInput.previousElementSibling.textContent = label;
      this.promptModal.classList.add('active');
      this.promptInput.focus();

      const cleanup = () => {
        this.promptModal.classList.remove('active');
        this.promptForm.removeEventListener('submit', onSubmit);
        this.promptCancelBtn.removeEventListener('click', onCancel);
        this.promptModal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
      };
      const onSubmit = (e) => {
        e.preventDefault();
        const val = this.promptInput.value.trim();
        cleanup();
        resolve(val || null);
      };
      const onCancel = () => { cleanup(); resolve(null); };
      const onBackdrop = (e) => { if (e.target === this.promptModal) onCancel(); };
      const onKey = (e) => { if (e.key === 'Escape') onCancel(); };

      this.promptForm.addEventListener('submit', onSubmit);
      this.promptCancelBtn.addEventListener('click', onCancel);
      this.promptModal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }

  generateId() {
    return crypto.randomUUID();
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
