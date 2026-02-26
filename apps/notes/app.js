// Notes App - Rich text note-taking with IndexedDB storage

import { openDB, getAllNotes, saveNote, deleteNote, getAllNotebooks, saveNotebook, deleteNotebook as dbDeleteNotebook } from './db.js';
import { initEditor, execToolbarCommand, getContentHtml, getContentPlainText, setContent, focus } from './editor.js';
import { createAutosaver } from './autosave.js';
import { searchNotes } from './search.js';
import { downloadMarkdown } from './export-markdown.js';

const NOTEBOOK_COLORS = [
  { name: 'Default', value: null },
  { name: 'Red', value: '#e74c3c' },
  { name: 'Orange', value: '#f39c12' },
  { name: 'Yellow', value: '#f1c40f' },
  { name: 'Green', value: '#27ae60' },
  { name: 'Blue', value: '#3498db' },
  { name: 'Purple', value: '#9b59b6' },
  { name: 'Pink', value: '#e91e63' },
  { name: 'Teal', value: '#00bcd4' },
];

class NotesApp {
  constructor() {
    this.notes = [];
    this.notebooks = [];
    this.currentNoteId = null;
    this.currentNotebookId = null; // null = "All Notes"
    this.notebooksCollapsed = false;
    this.searchTimeout = null;
    this.autosaver = null;

    // Drag state
    this.dragNoteId = null;

    // Long-press state for mobile
    this.longPressTimer = null;
    this.longPressNoteId = null;

    this.initElements();
    this.initEventListeners();
    this.syncThemeWithParent();
  }

  async init() {
    try {
      await openDB();
      this.notes = await getAllNotes();
      this.notebooks = await getAllNotebooks();
    } catch (err) {
      console.error('Notes DB init failed:', err);
      this.notes = [];
      this.notebooks = [];
    }

    this.autosaver = createAutosaver(
      () => this.saveCurrentNote(),
      (status) => this.updateSaveStatus(status)
    );

    initEditor(this.editorContent, {
      onInput: () => this.autosaver.scheduleSave()
    });

    this.renderNotebooks();
    this.renderNotesList(this.getFilteredNotes());
  }

  initElements() {
    this.newNoteBtn = document.getElementById('newNoteBtn');
    this.notesList = document.getElementById('notesList');
    this.emptyState = document.getElementById('emptyState');
    this.noteEditor = document.getElementById('noteEditor');
    this.noteTitleInput = document.getElementById('noteTitleInput');
    this.editorContent = document.getElementById('editorContent');
    this.noteDate = document.getElementById('noteDate');
    this.saveStatus = document.getElementById('saveStatus');
    this.deleteNoteBtn = document.getElementById('deleteNoteBtn');
    this.exportMdBtn = document.getElementById('exportMdBtn');
    this.searchInput = document.getElementById('searchInput');
    this.notesLayout = document.querySelector('.notes-layout');
    this.mobileBackBtn = document.getElementById('mobileBackBtn');
    this.editorToolbar = document.getElementById('editorToolbar');

    // Notebook elements
    this.notebooksSection = document.getElementById('notebooksSection');
    this.notebooksToggle = document.getElementById('notebooksToggle');
    this.notebooksList = document.getElementById('notebooksList');

    // Move-to modal
    this.moveToModal = document.getElementById('moveToNotebookModal');
    this.moveToList = document.getElementById('moveToNotebookList');
    this.moveToCancel = document.getElementById('moveToNotebookCancel');
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
    this.newNoteBtn.addEventListener('click', () => this.createNewNote());
    this.deleteNoteBtn.addEventListener('click', () => this.deleteCurrentNote());
    this.exportMdBtn.addEventListener('click', () => this.exportCurrentNote());

    if (this.mobileBackBtn) {
      this.mobileBackBtn.addEventListener('click', () => this.closeMobileEditor());
    }

    // Debounced search
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        const notes = this.getFilteredNotes();
        const filtered = searchNotes(notes, e.target.value);
        this.renderNotesList(filtered);
      }, 150);
    });

    // Auto-save on title change
    this.noteTitleInput.addEventListener('input', () => {
      if (this.autosaver) this.autosaver.scheduleSave();
    });

    // Toolbar buttons
    this.editorToolbar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cmd]');
      if (btn) {
        execToolbarCommand(btn.dataset.cmd, btn.dataset.value);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        if (e.shiftKey) {
          this.promptCreateNotebook();
        } else {
          this.createNewNote();
        }
      }
    });

    // Flush saves on visibility/unload
    const flushAndSave = () => {
      if (this.autosaver) this.autosaver.flushSave();
    };

    window.addEventListener('beforeunload', flushAndSave);
    window.addEventListener('pagehide', flushAndSave);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) flushAndSave();
    });

    // Flush on editor blur
    this.editorContent.addEventListener('blur', () => {
      if (this.autosaver) this.autosaver.flushSave();
    });

    // Notebooks toggle
    this.notebooksToggle.addEventListener('click', () => {
      this.notebooksCollapsed = !this.notebooksCollapsed;
      this.notebooksSection.classList.toggle('collapsed', this.notebooksCollapsed);
    });

    // Move-to modal cancel
    if (this.moveToCancel) {
      this.moveToCancel.addEventListener('click', () => this.closeMoveToModal());
    }
    if (this.moveToModal) {
      this.moveToModal.addEventListener('click', (e) => {
        if (e.target === this.moveToModal) this.closeMoveToModal();
      });
    }

    // Close any open popover when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.notebook-settings-popover') && !e.target.closest('.notebook-settings-btn')) {
        this.closeSettingsPopover();
      }
    });
  }

  // ── Notebook filtering ──

  getFilteredNotes() {
    if (this.currentNotebookId === null) {
      return this.notes;
    }
    if (this.currentNotebookId === '__uncategorized__') {
      return this.notes.filter(n => !n.notebookId);
    }
    return this.notes.filter(n => n.notebookId === this.currentNotebookId);
  }

  selectNotebook(notebookId) {
    this.currentNotebookId = notebookId;
    this.searchInput.value = '';
    this.renderNotebooks();
    this.renderNotesList(this.getFilteredNotes());
  }

  // ── Notebook rendering ──

  renderNotebooks() {
    const allCount = this.notes.length;
    const uncategorizedCount = this.notes.filter(n => !n.notebookId).length;

    let html = '';

    // "All Notes" entry
    html += `<div class="notebook-item${this.currentNotebookId === null ? ' active' : ''}" data-notebook-id="__all__">
      <span class="notebook-icon">&#128209;</span>
      <span class="notebook-name">All Notes</span>
      <span class="notebook-count">${allCount}</span>
    </div>`;

    // "Uncategorized" entry (only show if there are notebooks)
    if (this.notebooks.length > 0) {
      html += `<div class="notebook-item${this.currentNotebookId === '__uncategorized__' ? ' active' : ''}" data-notebook-id="__uncategorized__">
        <span class="notebook-icon">&#128196;</span>
        <span class="notebook-name">Uncategorized</span>
        <span class="notebook-count">${uncategorizedCount}</span>
      </div>`;
    }

    // User notebooks
    for (const nb of this.notebooks) {
      const count = this.notes.filter(n => n.notebookId === nb.id).length;
      const colorStyle = nb.color ? ` style="color: ${nb.color}"` : '';
      html += `<div class="notebook-item${this.currentNotebookId === nb.id ? ' active' : ''}" data-notebook-id="${nb.id}">
        <span class="notebook-icon"${colorStyle}>&#128213;</span>
        <span class="notebook-name">${this.escapeHtml(nb.name)}</span>
        <button class="notebook-settings-btn" data-notebook-id="${nb.id}" title="Notebook settings">&#9881;</button>
        <span class="notebook-count">${count}</span>
      </div>`;
    }

    // "+ New Notebook" button (same row structure as notebook-item for alignment)
    html += `<div class="notebook-item notebook-create" id="notebookCreateBtn">
      <span class="notebook-icon notebook-create-icon">+</span>
      <span class="notebook-name">New Notebook</span>
    </div>`;

    this.notebooksList.innerHTML = html;

    // Bind click events on notebook items
    this.notebooksList.querySelectorAll('.notebook-item:not(.notebook-create)').forEach(item => {
      const nbId = item.dataset.notebookId;

      item.addEventListener('click', (e) => {
        // Don't select notebook when clicking settings button
        if (e.target.closest('.notebook-settings-btn')) return;
        if (nbId === '__all__') {
          this.selectNotebook(null);
        } else {
          this.selectNotebook(nbId);
        }
      });

      // Drop target for drag-and-drop
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        item.classList.add('notebook-drop-target');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('notebook-drop-target');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('notebook-drop-target');
        const noteId = e.dataTransfer.getData('text/plain');
        if (!noteId) return;

        let targetNotebookId = null;
        if (nbId === '__all__') return;
        if (nbId === '__uncategorized__') {
          targetNotebookId = null;
        } else {
          targetNotebookId = nbId;
        }

        this.moveNoteToNotebook(noteId, targetNotebookId);
      });
    });

    // Bind settings gear buttons
    this.notebooksList.querySelectorAll('.notebook-settings-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleSettingsPopover(btn.dataset.notebookId, btn);
      });
    });

    // Bind create notebook button
    const createBtn = document.getElementById('notebookCreateBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.promptCreateNotebook());
    }
  }

  // ── Notebook settings popover ──

  toggleSettingsPopover(notebookId, anchorBtn) {
    // If already open for this notebook, close it
    const existing = document.querySelector(`.notebook-settings-popover[data-for="${notebookId}"]`);
    if (existing) {
      existing.remove();
      return;
    }

    this.closeSettingsPopover();

    const nb = this.notebooks.find(n => n.id === notebookId);
    if (!nb) return;

    const popover = document.createElement('div');
    popover.className = 'notebook-settings-popover';
    popover.dataset.for = notebookId;

    // Color picker
    const colorGrid = NOTEBOOK_COLORS.map(c => {
      const isActive = (nb.color || null) === c.value;
      const swatch = c.value
        ? `<span class="color-swatch${isActive ? ' active' : ''}" data-color="${c.value}" style="background: ${c.value}" title="${c.name}"></span>`
        : `<span class="color-swatch color-swatch--default${isActive ? ' active' : ''}" data-color="" title="Default"></span>`;
      return swatch;
    }).join('');

    popover.innerHTML = `
      <div class="popover-section">
        <div class="popover-label">Color</div>
        <div class="color-picker-grid">${colorGrid}</div>
      </div>
      <div class="popover-divider"></div>
      <div class="popover-action" data-action="rename">Rename</div>
      <div class="popover-action popover-action--danger" data-action="delete">Delete</div>
    `;

    // Position below the gear button
    const rect = anchorBtn.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;
    popover.style.top = `${rect.bottom + 4}px`;

    document.body.appendChild(popover);

    // Color swatch clicks
    popover.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', async (e) => {
        e.stopPropagation();
        const color = swatch.dataset.color || null;
        nb.color = color;
        nb.updatedAt = Date.now();
        await saveNotebook(nb);
        this.notebooks = await getAllNotebooks();
        this.closeSettingsPopover();
        this.renderNotebooks();
      });
    });

    // Action clicks
    popover.querySelectorAll('.popover-action').forEach(action => {
      action.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = action.dataset.action;
        this.closeSettingsPopover();
        if (act === 'rename') this.renameNotebook(notebookId);
        if (act === 'delete') this.deleteNotebookById(notebookId);
      });
    });
  }

  closeSettingsPopover() {
    document.querySelectorAll('.notebook-settings-popover').forEach(p => p.remove());
  }

  // ── Notebook CRUD ──

  promptCreateNotebook() {
    const createBtn = document.getElementById('notebookCreateBtn');
    if (!createBtn) return;

    // Replace the create button with an input inside the same row structure
    const wrapper = document.createElement('div');
    wrapper.className = 'notebook-item notebook-create-row';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'notebook-icon notebook-create-icon';
    iconSpan.textContent = '+';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'notebook-inline-input';
    input.placeholder = 'Notebook name...';
    input.maxLength = 50;

    wrapper.appendChild(iconSpan);
    wrapper.appendChild(input);
    createBtn.replaceWith(wrapper);
    input.focus();

    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      const name = input.value.trim();
      if (name) {
        const error = this.validateNotebookName(name);
        if (error) {
          alert(error);
          finished = false;
          input.focus();
          return;
        }
        await this.createNotebook(name);
      }
      this.renderNotebooks();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
      }
      if (e.key === 'Escape') {
        finished = true;
        this.renderNotebooks();
      }
    });

    input.addEventListener('blur', finish);
  }

  validateNotebookName(name, excludeId = null) {
    const normalized = name.toLowerCase().trim();
    const duplicate = this.notebooks.find(
      nb => nb.name.toLowerCase().trim() === normalized && nb.id !== excludeId
    );
    if (duplicate) {
      return `A notebook named "${duplicate.name}" already exists.`;
    }
    return null;
  }

  async createNotebook(name) {
    const now = Date.now();
    const maxOrder = this.notebooks.reduce((max, nb) => Math.max(max, nb.order), 0);
    const notebook = {
      id: crypto.randomUUID(),
      name,
      color: null,
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now
    };

    await saveNotebook(notebook);
    this.notebooks = await getAllNotebooks();
    this.renderNotebooks();
  }

  async renameNotebook(notebookId) {
    const nb = this.notebooks.find(n => n.id === notebookId);
    if (!nb) return;

    const item = this.notebooksList.querySelector(`[data-notebook-id="${notebookId}"]`);
    if (!item) return;

    const nameSpan = item.querySelector('.notebook-name');
    const originalName = nb.name;

    // Replace name span with inline input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'notebook-inline-input';
    input.value = nb.name;
    input.maxLength = 50;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    // Hide the settings button while renaming
    const settingsBtn = item.querySelector('.notebook-settings-btn');
    if (settingsBtn) settingsBtn.style.display = 'none';

    let finished = false;
    const finish = async () => {
      if (finished) return;
      finished = true;
      const newName = input.value.trim();
      if (newName && newName !== originalName) {
        const error = this.validateNotebookName(newName, notebookId);
        if (error) {
          alert(error);
          finished = false;
          input.focus();
          return;
        }
        nb.name = newName;
        nb.updatedAt = Date.now();
        await saveNotebook(nb);
        this.notebooks = await getAllNotebooks();
      }
      this.renderNotebooks();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish();
      }
      if (e.key === 'Escape') {
        finished = true;
        this.renderNotebooks();
      }
    });

    input.addEventListener('blur', finish);
  }

  async deleteNotebookById(notebookId) {
    const nb = this.notebooks.find(n => n.id === notebookId);
    if (!nb) return;

    const count = this.notes.filter(n => n.notebookId === notebookId).length;
    const msg = count > 0
      ? `Delete "${nb.name}"? Its ${count} note${count > 1 ? 's' : ''} will be moved to Uncategorized.`
      : `Delete "${nb.name}"?`;

    if (!confirm(msg)) return;

    await dbDeleteNotebook(notebookId);

    // Update local state
    this.notes.forEach(n => {
      if (n.notebookId === notebookId) n.notebookId = null;
    });
    this.notebooks = await getAllNotebooks();

    if (this.currentNotebookId === notebookId) {
      this.currentNotebookId = null;
    }

    this.renderNotebooks();
    this.renderNotesList(this.getFilteredNotes());
  }

  // ── Move note to notebook ──

  async moveNoteToNotebook(noteId, notebookId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;
    if (note.notebookId === notebookId) return;

    note.notebookId = notebookId;
    note.updatedAt = Date.now();
    await saveNote(note);

    this.renderNotebooks();
    this.renderNotesList(this.getFilteredNotes());
  }

  // ── Move-to modal (mobile) ──

  showMoveToModal(noteId) {
    if (!this.moveToModal) return;

    let html = `<div class="modal-option" data-notebook-id="__uncategorized__">Uncategorized</div>`;
    for (const nb of this.notebooks) {
      const colorDot = nb.color ? `<span class="color-dot" style="background: ${nb.color}"></span>` : '';
      html += `<div class="modal-option" data-notebook-id="${nb.id}">${colorDot}${this.escapeHtml(nb.name)}</div>`;
    }

    this.moveToList.innerHTML = html;
    this.moveToModal.style.display = 'flex';

    this.moveToList.querySelectorAll('.modal-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const nbId = opt.dataset.notebookId;
        const targetId = nbId === '__uncategorized__' ? null : nbId;
        this.moveNoteToNotebook(noteId, targetId);
        this.closeMoveToModal();
      });
    });
  }

  closeMoveToModal() {
    if (this.moveToModal) {
      this.moveToModal.style.display = 'none';
    }
  }

  // ── Notes CRUD ──

  async createNewNote() {
    if (this.autosaver) await this.autosaver.flushSave();

    const now = Date.now();
    let notebookId = null;
    if (this.currentNotebookId && this.currentNotebookId !== '__uncategorized__') {
      notebookId = this.currentNotebookId;
    }

    const note = {
      id: crypto.randomUUID(),
      title: 'Untitled Note',
      contentHtml: '<p><br></p>',
      contentPlainText: '',
      createdAt: now,
      updatedAt: now,
      version: 1,
      notebookId
    };

    await saveNote(note);
    this.notes = await getAllNotes();
    this.renderNotebooks();
    this.renderNotesList(this.getFilteredNotes());
    await this.openNote(note.id);

    // Select the title so user can immediately type a name
    this.noteTitleInput.focus();
    this.noteTitleInput.select();
  }

  isMobile() {
    return window.innerWidth <= 768;
  }

  async openNote(noteId) {
    if (this.autosaver) {
      await this.autosaver.flushSave();
      this.autosaver.reset();
    }

    this.currentNoteId = noteId;
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    this.emptyState.style.display = 'none';
    this.noteEditor.style.display = 'flex';

    this.noteTitleInput.value = note.title;
    setContent(note.contentHtml);
    this.updateNoteDate(note.updatedAt);
    this.updateSaveStatus('saved');

    document.querySelectorAll('.note-item').forEach(item => {
      item.classList.toggle('active', item.dataset.noteId === noteId);
    });

    if (this.isMobile() && this.notesLayout) {
      this.notesLayout.classList.add('mobile-editing');
    }

    focus();
  }

  async closeMobileEditor() {
    if (this.autosaver) await this.autosaver.flushSave();
    if (this.notesLayout) {
      this.notesLayout.classList.remove('mobile-editing');
    }
  }

  async saveCurrentNote() {
    if (!this.currentNoteId) return;

    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) return;

    note.title = this.noteTitleInput.value.trim() || 'Untitled Note';
    note.contentHtml = getContentHtml();
    note.contentPlainText = getContentPlainText();
    note.updatedAt = Date.now();
    note.version = (note.version || 0) + 1;

    await saveNote(note);
    this.updateNoteDate(note.updatedAt);

    this.notes.sort((a, b) => b.updatedAt - a.updatedAt);
    this.renderNotesList(this.getFilteredNotes());
    this.renderNotebooks();

    const activeItem = document.querySelector(`[data-note-id="${this.currentNoteId}"]`);
    if (activeItem) activeItem.classList.add('active');
  }

  async deleteCurrentNote() {
    if (!this.currentNoteId) return;
    if (!confirm('Are you sure you want to delete this note?')) return;

    if (this.autosaver) this.autosaver.reset();

    await deleteNote(this.currentNoteId);
    this.notes = this.notes.filter(n => n.id !== this.currentNoteId);
    this.currentNoteId = null;

    this.noteEditor.style.display = 'none';
    this.emptyState.style.display = 'flex';
    if (this.notesLayout) {
      this.notesLayout.classList.remove('mobile-editing');
    }
    this.renderNotebooks();
    this.renderNotesList(this.getFilteredNotes());
  }

  exportCurrentNote() {
    if (!this.currentNoteId) return;
    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) return;
    downloadMarkdown(note.title, note.contentHtml);
  }

  // ── Render notes list ──

  renderNotesList(notes) {
    if (!notes || notes.length === 0) {
      this.notesList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--app-text-tertiary);">No notes yet</div>';
      return;
    }

    this.notesList.innerHTML = notes.map(note => {
      const preview = (note.contentPlainText || '').substring(0, 60) || 'No content';
      const date = this.formatDate(note.updatedAt);

      let notebookBadge = '';
      if (this.currentNotebookId === null && note.notebookId) {
        const nb = this.notebooks.find(n => n.id === note.notebookId);
        if (nb) {
          const badgeStyle = nb.color ? ` style="color: ${nb.color}; background: ${nb.color}22"` : '';
          notebookBadge = `<span class="note-item-notebook"${badgeStyle}>${this.escapeHtml(nb.name)}</span>`;
        }
      }

      return `
        <div class="note-item${note.id === this.currentNoteId ? ' active' : ''}" data-note-id="${note.id}" draggable="true">
          <div class="note-item-header">
            <div class="note-item-title">${this.escapeHtml(note.title)}</div>
            ${notebookBadge}
          </div>
          <div class="note-item-preview">${this.escapeHtml(preview)}</div>
          <div class="note-item-date">${date}</div>
        </div>
      `;
    }).join('');

    this.notesList.querySelectorAll('.note-item').forEach(item => {
      const noteId = item.dataset.noteId;

      item.addEventListener('click', () => {
        this.openNote(noteId);
      });

      item.addEventListener('dragstart', (e) => {
        this.dragNoteId = noteId;
        e.dataTransfer.setData('text/plain', noteId);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this.dragNoteId = null;
        document.querySelectorAll('.notebook-drop-target').forEach(el => el.classList.remove('notebook-drop-target'));
      });

      // Long-press for mobile "Move to"
      item.addEventListener('touchstart', () => {
        this.longPressTimer = setTimeout(() => {
          if (this.notebooks.length > 0) {
            this.showMoveToModal(noteId);
          }
        }, 600);
      }, { passive: true });

      item.addEventListener('touchend', () => {
        clearTimeout(this.longPressTimer);
      });

      item.addEventListener('touchmove', () => {
        clearTimeout(this.longPressTimer);
      });
    });
  }

  // ── Helpers ──

  updateSaveStatus(status) {
    if (!this.saveStatus) return;
    const labels = {
      saved: 'Saved',
      unsaved: 'Unsaved changes',
      saving: 'Saving…',
      failed: 'Save failed'
    };
    this.saveStatus.textContent = labels[status] || '';
    this.saveStatus.className = `save-status save-status--${status}`;
  }

  updateNoteDate(timestamp) {
    this.noteDate.textContent = this.formatDate(timestamp);
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new NotesApp();
  app.init();
});
