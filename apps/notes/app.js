// Notes App - Simple note-taking application

class NotesApp {
  constructor() {
    this.notes = this.loadNotes();
    this.currentNoteId = null;
    this.autoSaveTimeout = null;
    this.searchTimeout = null;

    this.initElements();
    this.initEventListeners();
    this.syncThemeWithParent();
    this.renderNotesList();
  }

  initElements() {
    this.newNoteBtn = document.getElementById('newNoteBtn');
    this.notesList = document.getElementById('notesList');
    this.emptyState = document.getElementById('emptyState');
    this.noteEditor = document.getElementById('noteEditor');
    this.noteTitleInput = document.getElementById('noteTitleInput');
    this.noteContentInput = document.getElementById('noteContentInput');
    this.noteDate = document.getElementById('noteDate');
    this.deleteNoteBtn = document.getElementById('deleteNoteBtn');
    this.searchInput = document.getElementById('searchInput');
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
    this.newNoteBtn.addEventListener('click', () => this.createNewNote());
    this.deleteNoteBtn.addEventListener('click', () => this.deleteCurrentNote());

    // Debounced search for better performance
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.searchNotes(e.target.value);
      }, 150);
    });

    // Auto-save on title/content change
    this.noteTitleInput.addEventListener('input', () => this.scheduleAutoSave());
    this.noteContentInput.addEventListener('input', () => this.scheduleAutoSave());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        this.createNewNote();
      }
    });
  }

  loadNotes() {
    const saved = localStorage.getItem('marlapps-notes');
    return saved ? JSON.parse(saved) : [];
  }

  saveNotes() {
    localStorage.setItem('marlapps-notes', JSON.stringify(this.notes));
  }

  createNewNote() {
    const note = {
      id: Date.now().toString(),
      title: 'Untitled Note',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.notes.unshift(note);
    this.saveNotes();
    this.renderNotesList();
    this.openNote(note.id);
  }

  openNote(noteId) {
    this.currentNoteId = noteId;
    const note = this.notes.find(n => n.id === noteId);

    if (!note) return;

    this.emptyState.style.display = 'none';
    this.noteEditor.style.display = 'flex';

    this.noteTitleInput.value = note.title;
    this.noteContentInput.value = note.content;
    this.updateNoteDate(note.updatedAt);

    // Update active state in list
    document.querySelectorAll('.note-item').forEach(item => {
      item.classList.toggle('active', item.dataset.noteId === noteId);
    });

    // Focus on content
    this.noteContentInput.focus();
  }

  scheduleAutoSave() {
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => {
      this.saveCurrentNote();
    }, 500);
  }

  saveCurrentNote() {
    if (!this.currentNoteId) return;

    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) return;

    note.title = this.noteTitleInput.value.trim() || 'Untitled Note';
    note.content = this.noteContentInput.value;
    note.updatedAt = new Date().toISOString();

    this.saveNotes();
    this.updateNoteDate(note.updatedAt);
    this.renderNotesList();

    // Restore active state after re-render
    const activeItem = document.querySelector(`[data-note-id="${this.currentNoteId}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }
  }

  deleteCurrentNote() {
    if (!this.currentNoteId) return;

    if (!confirm('Are you sure you want to delete this note?')) return;

    this.notes = this.notes.filter(n => n.id !== this.currentNoteId);
    this.saveNotes();
    this.currentNoteId = null;

    this.noteEditor.style.display = 'none';
    this.emptyState.style.display = 'flex';
    this.renderNotesList();
  }

  searchNotes(query) {
    const searchTerm = query.toLowerCase().trim();
    const items = document.querySelectorAll('.note-item');

    items.forEach(item => {
      const title = item.querySelector('.note-item-title').textContent.toLowerCase();
      const preview = item.querySelector('.note-item-preview').textContent.toLowerCase();
      const matches = title.includes(searchTerm) || preview.includes(searchTerm);
      item.style.display = matches ? 'block' : 'none';
    });
  }

  renderNotesList() {
    if (this.notes.length === 0) {
      this.notesList.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--notes-text-tertiary);">No notes yet</div>';
      return;
    }

    this.notesList.innerHTML = this.notes.map(note => {
      const preview = note.content.substring(0, 60) || 'No content';
      const date = this.formatDate(note.updatedAt);

      return `
        <div class="note-item" data-note-id="${note.id}">
          <div class="note-item-title">${this.escapeHtml(note.title)}</div>
          <div class="note-item-preview">${this.escapeHtml(preview)}</div>
          <div class="note-item-date">${date}</div>
        </div>
      `;
    }).join('');

    // Add click listeners
    document.querySelectorAll('.note-item').forEach(item => {
      item.addEventListener('click', () => {
        this.openNote(item.dataset.noteId);
      });
    });
  }

  updateNoteDate(dateString) {
    this.noteDate.textContent = `Last edited: ${this.formatDate(dateString)}`;
  }

  formatDate(dateString) {
    const date = new Date(dateString);
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

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  new NotesApp();
});
