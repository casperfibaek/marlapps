// editor.js - contenteditable rich text editor surface + toolbar
// Uses Range/Selection APIs instead of deprecated document.execCommand

let editorEl = null;
let onInputCallback = null;

const SEPARATOR_PATTERNS = /^(-{4,}|\*{4,}|={4,})$/;

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'DIV', 'SPAN'
]);

const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'LI', 'UL', 'OL', 'HR', 'BLOCKQUOTE'
]);

const INLINE_FORMAT_TAGS = {
  bold: 'STRONG',
  italic: 'EM',
  underline: 'U',
};

// ── Undo/Redo stack ──

const undoStack = [];
const redoStack = [];
let lastSnapshotTime = 0;
const SNAPSHOT_INTERVAL = 500;

function pushUndoSnapshot() {
  const now = Date.now();
  if (now - lastSnapshotTime < SNAPSHOT_INTERVAL) return;
  lastSnapshotTime = now;

  const html = editorEl.innerHTML;
  if (undoStack.length > 0 && undoStack[undoStack.length - 1] === html) return;

  undoStack.push(html);
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(editorEl.innerHTML);
  editorEl.innerHTML = undoStack.pop();
  if (onInputCallback) onInputCallback();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(editorEl.innerHTML);
  editorEl.innerHTML = redoStack.pop();
  if (onInputCallback) onInputCallback();
}

// ── Helper utilities ──

function getCurrentBlock() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  let node = sel.anchorNode;
  if (!node) return null;

  // If text node, start from parent
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

  // Walk up to find the nearest block-level element within the editor
  while (node && node !== editorEl) {
    if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName)) {
      return node;
    }
    node = node.parentNode;
  }

  return null;
}

function insertNodeAtCursor(node) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);

  // Move cursor after the inserted node
  const newRange = document.createRange();
  newRange.setStartAfter(node);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

function setBlockType(tagName) {
  const block = getCurrentBlock();
  if (!block) return;

  const upper = tagName.toUpperCase();

  // If already this type, do nothing
  if (block.tagName === upper) return;

  const newBlock = document.createElement(tagName);
  // Move all children
  while (block.firstChild) {
    newBlock.appendChild(block.firstChild);
  }

  block.replaceWith(newBlock);

  // Restore cursor inside the new block
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(newBlock);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function isWrappedIn(tagName) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;

  let node = sel.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

  while (node && node !== editorEl) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === tagName) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

function findWrappingElement(tagName) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  let node = sel.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;

  while (node && node !== editorEl) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === tagName) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function wrapSelection(tagName) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);

  // If already wrapped, unwrap
  if (isWrappedIn(tagName)) {
    const wrapper = findWrappingElement(tagName);
    if (wrapper) {
      const parent = wrapper.parentNode;
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      parent.removeChild(wrapper);
    }
    return;
  }

  // If selection is collapsed, nothing to wrap
  if (range.collapsed) return;

  // Wrap the selection
  const wrapper = document.createElement(tagName);
  try {
    range.surroundContents(wrapper);
  } catch {
    // surroundContents fails if selection crosses element boundaries
    // Fall back: extract, wrap, and reinsert
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
  }

  // Re-select the wrapped content
  const newRange = document.createRange();
  newRange.selectNodeContents(wrapper);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

// ── List handling ──

function toggleList(listTag) {
  const block = getCurrentBlock();
  if (!block) return;

  const upper = listTag.toUpperCase();

  // If inside a list of the same type, unwrap
  if (block.tagName === 'LI' && block.parentNode && block.parentNode.tagName === upper) {
    const list = block.parentNode;
    const parent = list.parentNode;

    // Convert each LI back to a P
    const items = Array.from(list.children);
    for (const li of items) {
      const p = document.createElement('p');
      while (li.firstChild) {
        p.appendChild(li.firstChild);
      }
      parent.insertBefore(p, list);
    }
    parent.removeChild(list);

    // Place cursor in last converted paragraph
    const sel = window.getSelection();
    const range = document.createRange();
    const lastP = parent.querySelector('p');
    if (lastP) {
      range.selectNodeContents(lastP);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  // If inside a list of a different type, switch the list type
  if (block.tagName === 'LI' && block.parentNode) {
    const oldList = block.parentNode;
    const newList = document.createElement(listTag);
    while (oldList.firstChild) {
      newList.appendChild(oldList.firstChild);
    }
    oldList.replaceWith(newList);
    return;
  }

  // Not in a list — wrap the current block in a list
  const li = document.createElement('li');
  while (block.firstChild) {
    li.appendChild(block.firstChild);
  }
  const list = document.createElement(listTag);
  list.appendChild(li);
  block.replaceWith(list);

  // Place cursor inside the LI
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(li);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ── Event handlers ──

export function initEditor(containerEl, options = {}) {
  editorEl = containerEl;
  onInputCallback = options.onInput || null;

  editorEl.setAttribute('contenteditable', 'true');
  editorEl.setAttribute('role', 'textbox');
  editorEl.setAttribute('aria-multiline', 'true');

  editorEl.addEventListener('input', handleInput);
  editorEl.addEventListener('keydown', handleKeydown);
  editorEl.addEventListener('paste', handlePaste);
  editorEl.addEventListener('beforeinput', handleBeforeInput);

  // Take initial snapshot for undo
  setTimeout(() => pushUndoSnapshot(), 0);
}

function handleBeforeInput(e) {
  switch (e.inputType) {
    case 'formatBold':
      e.preventDefault();
      pushUndoSnapshot();
      wrapSelection(INLINE_FORMAT_TAGS.bold);
      if (onInputCallback) onInputCallback();
      break;
    case 'formatItalic':
      e.preventDefault();
      pushUndoSnapshot();
      wrapSelection(INLINE_FORMAT_TAGS.italic);
      if (onInputCallback) onInputCallback();
      break;
    case 'formatUnderline':
      e.preventDefault();
      pushUndoSnapshot();
      wrapSelection(INLINE_FORMAT_TAGS.underline);
      if (onInputCallback) onInputCallback();
      break;
    case 'historyUndo':
      e.preventDefault();
      undo();
      break;
    case 'historyRedo':
      e.preventDefault();
      redo();
      break;
  }
}

function handleInput() {
  pushUndoSnapshot();
  if (onInputCallback) onInputCallback();
}

function handleKeydown(e) {
  // Insert tab character
  if (e.key === 'Tab') {
    e.preventDefault();
    pushUndoSnapshot();
    const tabNode = document.createTextNode('\t');
    insertNodeAtCursor(tabNode);
    if (onInputCallback) onInputCallback();
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    let block = range.startContainer;

    // Walk up to find the block-level element
    while (block && block !== editorEl && block.parentNode !== editorEl) {
      block = block.parentNode;
    }

    if (block && block !== editorEl) {
      const text = block.textContent;
      if (SEPARATOR_PATTERNS.test(text.trim())) {
        e.preventDefault();
        pushUndoSnapshot();
        const hr = document.createElement('hr');
        const newP = document.createElement('p');
        newP.innerHTML = '<br>';
        block.replaceWith(hr);
        hr.after(newP);

        // Place cursor in new paragraph
        const newRange = document.createRange();
        newRange.setStart(newP, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);

        if (onInputCallback) onInputCallback();
      }
    }
  }
}

function handlePaste(e) {
  e.preventDefault();
  pushUndoSnapshot();

  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();

  if (html) {
    // Sanitize pasted HTML - keep only safe formatting tags
    const temp = document.createElement('div');
    temp.innerHTML = html;
    sanitizeNode(temp);

    const fragment = document.createDocumentFragment();
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }
    range.insertNode(fragment);

    // Move cursor to end of inserted content
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (text) {
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor after text
    const newRange = document.createRange();
    newRange.setStartAfter(textNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  if (onInputCallback) onInputCallback();
}

function sanitizeNode(node) {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.COMMENT_NODE) {
      node.removeChild(child);
      continue;
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      // Remove dangerous elements entirely (including children)
      const tag = child.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' ||
          tag === 'OBJECT' || tag === 'EMBED' || tag === 'LINK' ||
          tag === 'META' || tag === 'FORM' || tag === 'INPUT' ||
          tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') {
        node.removeChild(child);
        continue;
      }

      // Remove all attributes (strips event handlers, src, href, etc.)
      const attrs = Array.from(child.attributes);
      for (const attr of attrs) {
        child.removeAttribute(attr.name);
      }

      if (!ALLOWED_TAGS.has(tag)) {
        // Replace with its children (inline the content)
        sanitizeNode(child);
        while (child.firstChild) {
          node.insertBefore(child.firstChild, child);
        }
        node.removeChild(child);
      } else {
        sanitizeNode(child);
      }
    }
  }
}

// ── Toolbar command dispatcher ──

export function execToolbarCommand(cmd, value) {
  editorEl.focus();
  pushUndoSnapshot();

  switch (cmd) {
    case 'bold':
      wrapSelection(INLINE_FORMAT_TAGS.bold);
      break;
    case 'italic':
      wrapSelection(INLINE_FORMAT_TAGS.italic);
      break;
    case 'underline':
      wrapSelection(INLINE_FORMAT_TAGS.underline);
      break;
    case 'insertUnorderedList':
      toggleList('ul');
      break;
    case 'insertOrderedList':
      toggleList('ol');
      break;
    case 'formatBlock':
      setBlockType(value);
      break;
    case 'insertHorizontalRule': {
      const hr = document.createElement('hr');
      const newP = document.createElement('p');
      newP.innerHTML = '<br>';
      insertNodeAtCursor(hr);
      hr.after(newP);
      // Place cursor in new paragraph
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(newP, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      break;
    }
  }

  if (onInputCallback) onInputCallback();
}

// ── Public API ──

export function getContentHtml() {
  if (!editorEl) return '';
  return editorEl.innerHTML;
}

export function getContentPlainText() {
  if (!editorEl) return '';
  return editorEl.innerText || editorEl.textContent || '';
}

export function setContent(html) {
  if (!editorEl) return;
  editorEl.innerHTML = html || '<p><br></p>';
  undoStack.length = 0;
  redoStack.length = 0;
  pushUndoSnapshot();
}

export function focus() {
  if (!editorEl) return;
  editorEl.focus();
  // Place cursor at end
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editorEl);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
