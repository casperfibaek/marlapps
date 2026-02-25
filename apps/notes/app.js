// Notes App - Rich text note-taking with IndexedDB storage

import { openDB, getAllNotes, saveNote, deleteNote, getAllNotebooks, saveNotebook, deleteNotebook as dbDeleteNotebook } from './db.js';
import { initEditor, execToolbarCommand, getContentHtml, getContentPlainText, setContent, focus } from './editor.js';
import { createAutosaver } from './autosave.js';
import { searchNotes } from './search.js';
import { downloadMarkdown } from './export-markdown.js';

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
    await openDB();
    this.notes = await getAllNotes();
    this.notebooks = await getAllNotebooks();

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
  }

  // ── Notebook filtering ──

  getFilteredNotes() {
    if (this.currentNotebookId === null) {
      // "All Notes"
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
      html += `<div class="notebook-item${this.currentNotebookId === nb.id ? ' active' : ''}" data-notebook-id="${nb.id}">
        <span class="notebook-icon">&#128213;</span>
        <span class="notebook-name">${this.escapeHtml(nb.name)}</span>
        <span class="notebook-count">${count}</span>
      </div>`;
    }

    // "+ New Notebook" button
    html += `<div class="notebook-create" id="notebookCreateBtn">
      <span class="notebook-create-icon">+</span>
      <span>New Notebook</span>
    </div>`;

    this.notebooksList.innerHTML = html;

    // Bind click events on notebook items
    this.notebooksList.querySelectorAll('.notebook-item').forEach(item => {
      const nbId = item.dataset.notebookId;

      item.addEventListener('click', () => {
        if (nbId === '__all__') {
          this.selectNotebook(null);
        } else {
          this.selectNotebook(nbId);
        }
      });

      // Context menu for user notebooks (not All/Uncategorized)
      if (nbId !== '__all__' && nbId !== '__uncategorized__') {
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.showNotebookContextMenu(nbId, e);
        });
      }

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
        if (nbId === '__all__') return; // Can't drop on "All Notes"
        if (nbId === '__uncategorized__') {
          targetNotebookId = null;
        } else {
          targetNotebookId = nbId;
        }

        this.moveNoteToNotebook(noteId, targetNotebookId);
      });
    });

    // Bind create notebook button
    const createBtn = document.getElementById('notebookCreateBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.promptCreateNotebook());
    }
  }

  // ── Notebook CRUD ──

  promptCreateNotebook() {
    const createBtn = document.getElementById('notebookCreateBtn');
    if (!createBtn) return;

    // Replace button with inline input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'notebook-create-input';
    input.placeholder = 'Notebook name...';
    input.maxLength = 50;

    createBtn.replaceWith(input);
    input.focus();

    const finish = async () => {
      const name = input.value.trim();
      if (name) {
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
        this.renderNotebooks();
      }
    });

    input.addEventListener('blur', finish);
  }

  async createNotebook(name) {
    const now = Date.now();
    const maxOrder = this.notebooks.reduce((max, nb) => Math.max(max, nb.order), 0);
    const notebook = {
      id: crypto.randomUUID(),
      name,
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

    // Replace name span with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'notebook-rename-input';
    input.value = nb.name;
    input.maxLength = 50;
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const finish = async () => {
      const newName = input.value.trim();
      if (newName && newName !== originalName) {
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

    // If we were viewing this notebook, switch to All Notes
    if (this.currentNotebookId === notebookId) {
      this.currentNotebookId = null;
    }

    this.renderNotebooks();
    this.renderNotesList(this.getFilteredNotes());
  }

  showNotebookContextMenu(notebookId, event) {
    // Remove existing context menu
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
      <div class="context-menu-item" data-action="rename">Rename</div>
      <div class="context-menu-item context-menu-item--danger" data-action="delete">Delete</div>
    `;

    // Position near click
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    document.body.appendChild(menu);

    menu.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      this.closeContextMenu();
      if (action === 'rename') this.renameNotebook(notebookId);
      if (action === 'delete') this.deleteNotebookById(notebookId);
    });

    // Close on any outside click
    setTimeout(() => {
      const closer = (e) => {
        if (!menu.contains(e.target)) {
          this.closeContextMenu();
          document.removeEventListener('click', closer);
        }
      };
      document.addEventListener('click', closer);
    }, 0);
  }

  closeContextMenu() {
    document.querySelectorAll('.context-menu').forEach(m => m.remove());
  }

  // ── Move note to notebook ──

  async moveNoteToNotebook(noteId, notebookId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;
    if (note.notebookId === notebookId) return; // Already in this notebook

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
      html += `<div class="modal-option" data-notebook-id="${nb.id}">${this.escapeHtml(nb.name)}</div>`;
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
    // Flush current note before creating new
    if (this.autosaver) await this.autosaver.flushSave();

    const now = Date.now();
    // Assign to current notebook (unless viewing All Notes)
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
    this.openNote(note.id);
  }

  isMobile() {
    return window.innerWidth <= 768;
  }

  async openNote(noteId) {
    // Flush current note before switching
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

    // Update active state in list
    document.querySelectorAll('.note-item').forEach(item => {
      item.classList.toggle('active', item.dataset.noteId === noteId);
    });

    // On mobile, switch to editor view
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

    // Re-sort notes list
    this.notes.sort((a, b) => b.updatedAt - a.updatedAt);
    this.renderNotesList(this.getFilteredNotes());
    this.renderNotebooks();

    // Restore active state after re-render
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

      // Show notebook badge if viewing "All Notes"
      let notebookBadge = '';
      if (this.currentNotebookId === null && note.notebookId) {
        const nb = this.notebooks.find(n => n.id === note.notebookId);
        if (nb) {
          notebookBadge = `<span class="note-item-notebook">${this.escapeHtml(nb.name)}</span>`;
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

    // Bind click + drag events
    this.notesList.querySelectorAll('.note-item').forEach(item => {
      const noteId = item.dataset.noteId;

      item.addEventListener('click', () => {
        this.openNote(noteId);
      });

      // Drag start
      item.addEventListener('dragstart', (e) => {
        this.dragNoteId = noteId;
        e.dataTransfer.setData('text/plain', noteId);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this.dragNoteId = null;
        // Remove all drop target highlights
        document.querySelectorAll('.notebook-drop-target').forEach(el => el.classList.remove('notebook-drop-target'));
      });

      // Long-press for mobile "Move to"
      item.addEventListener('touchstart', (e) => {
        this.longPressTimer = setTimeout(() => {
          e.preventDefault();
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
