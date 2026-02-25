// Notes App - Rich text note-taking with IndexedDB storage

import { openDB, getAllNotes, saveNote, deleteNote } from './db.js';
import { initEditor, execToolbarCommand, getContentHtml, getContentPlainText, setContent, focus } from './editor.js';
import { createAutosaver } from './autosave.js';
import { searchNotes } from './search.js';
import { downloadMarkdown } from './export-markdown.js';

class NotesApp {
  constructor() {
    this.notes = [];
    this.currentNoteId = null;
    this.searchTimeout = null;
    this.autosaver = null;

    this.initElements();
    this.initEventListeners();
    this.syncThemeWithParent();
  }

  async init() {
    await openDB();
    this.notes = await getAllNotes();

    this.autosaver = createAutosaver(
      () => this.saveCurrentNote(),
      (status) => this.updateSaveStatus(status)
    );

    initEditor(this.editorContent, {
      onInput: () => this.autosaver.scheduleSave()
    });

    this.renderNotesList(this.notes);
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
        const filtered = searchNotes(this.notes, e.target.value);
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
        execToolbarCommand(btn.dataset.cmd);
      }
    });

    // Toolbar select (heading)
    this.editorToolbar.addEventListener('change', (e) => {
      if (e.target.dataset.cmd === 'formatBlock') {
        execToolbarCommand('formatBlock', e.target.value);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        this.createNewNote();
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
  }

  async createNewNote() {
    // Flush current note before creating new
    if (this.autosaver) await this.autosaver.flushSave();

    const now = Date.now();
    const note = {
      id: crypto.randomUUID(),
      title: 'Untitled Note',
      contentHtml: '<p><br></p>',
      contentPlainText: '',
      createdAt: now,
      updatedAt: now,
      version: 1
    };

    await saveNote(note);
    this.notes = await getAllNotes();
    this.renderNotesList(this.notes);
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
    this.renderNotesList(this.notes);

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
    this.renderNotesList(this.notes);
  }

  exportCurrentNote() {
    if (!this.currentNoteId) return;
    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) return;
    downloadMarkdown(note.title, note.contentHtml);
  }

  renderNotesList(notes) {
    if (!notes || notes.length === 0) {
      this.notesList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--app-text-tertiary);">No notes yet</div>';
      return;
    }

    this.notesList.innerHTML = notes.map(note => {
      const preview = (note.contentPlainText || '').substring(0, 60) || 'No content';
      const date = this.formatDate(note.updatedAt);

      return `
        <div class="note-item${note.id === this.currentNoteId ? ' active' : ''}" data-note-id="${note.id}">
          <div class="note-item-title">${this.escapeHtml(note.title)}</div>
          <div class="note-item-preview">${this.escapeHtml(preview)}</div>
          <div class="note-item-date">${date}</div>
        </div>
      `;
    }).join('');

    this.notesList.querySelectorAll('.note-item').forEach(item => {
      item.addEventListener('click', () => {
        this.openNote(item.dataset.noteId);
      });
    });
  }

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
