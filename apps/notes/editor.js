// editor.js - contenteditable rich text editor surface + toolbar
// Uses Range/Selection APIs instead of deprecated document.execCommand

let editorEl = null;
let onInputCallback = null;
let lastFormatCommand = null;

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

function getSelectedBlocks() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return [];

  const range = sel.getRangeAt(0);

  // Find the block containing the start of the selection
  let startNode = range.startContainer;
  if (startNode.nodeType === Node.TEXT_NODE) startNode = startNode.parentNode;
  while (startNode && startNode !== editorEl && startNode.parentNode !== editorEl) {
    startNode = startNode.parentNode;
  }

  // Find the block containing the end of the selection
  let endNode = range.endContainer;
  if (endNode.nodeType === Node.TEXT_NODE) endNode = endNode.parentNode;
  while (endNode && endNode !== editorEl && endNode.parentNode !== editorEl) {
    endNode = endNode.parentNode;
  }

  if (!startNode || startNode === editorEl) return [];
  if (!endNode || endNode === editorEl) endNode = startNode;

  // Collect all direct children of the editor between start and end (inclusive)
  const blocks = [];
  let current = startNode;
  while (current) {
    blocks.push(current);
    if (current === endNode) break;
    current = current.nextElementSibling || current.nextSibling;
    // Skip non-element nodes
    while (current && current.nodeType !== Node.ELEMENT_NODE) {
      current = current.nextSibling;
    }
  }

  return blocks;
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
  const blocks = getSelectedBlocks();
  if (blocks.length === 0) {
    // Fallback to single block
    const block = getCurrentBlock();
    if (!block) return;
    blocks.push(block);
  }

  const upper = tagName.toUpperCase();
  let firstNew = null;
  let lastNew = null;

  for (const block of blocks) {
    // Skip if already this type
    if (block.tagName === upper) {
      if (!firstNew) firstNew = block;
      lastNew = block;
      continue;
    }

    // Skip non-convertible elements like HR
    if (block.tagName === 'HR') continue;

    // If block is a list (UL/OL), convert each LI to the target type
    if (block.tagName === 'UL' || block.tagName === 'OL') {
      const items = Array.from(block.children);
      const parent = block.parentNode;
      for (const li of items) {
        const newBlock = document.createElement(tagName);
        while (li.firstChild) newBlock.appendChild(li.firstChild);
        parent.insertBefore(newBlock, block);
        if (!firstNew) firstNew = newBlock;
        lastNew = newBlock;
      }
      parent.removeChild(block);
      continue;
    }

    const newBlock = document.createElement(tagName);
    while (block.firstChild) {
      newBlock.appendChild(block.firstChild);
    }
    block.replaceWith(newBlock);
    if (!firstNew) firstNew = newBlock;
    lastNew = newBlock;
  }

  // Restore selection spanning first to last converted block
  if (firstNew) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(firstNew, 0);
    range.setEndAfter(lastNew.lastChild || lastNew);
    sel.removeAllRanges();
    sel.addRange(range);
  }
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

  // If already wrapped, unwrap all matching elements within the selection
  if (isWrappedIn(tagName)) {
    // Unwrap the ancestor wrapper around the anchor
    const wrapper = findWrappingElement(tagName);
    if (wrapper) {
      const parent = wrapper.parentNode;
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      parent.removeChild(wrapper);
    }

    // Also unwrap any matching elements within the selection range
    if (!range.collapsed) {
      const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentNode;
      const matches = container.querySelectorAll(tagName);
      for (const el of matches) {
        // Only unwrap if it intersects the selection
        if (range.intersectsNode(el)) {
          const parent = el.parentNode;
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
      }
    }
    return;
  }

  // If selection is collapsed, nothing to wrap
  if (range.collapsed) return;

  // Wrap the selection, avoiding double-wrapping
  const fragment = range.extractContents();

  // Remove any existing instances of this tag within the fragment to prevent double-wrap
  const existing = fragment.querySelectorAll(tagName);
  for (const el of existing) {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  const wrapper = document.createElement(tagName);
  wrapper.appendChild(fragment);
  range.insertNode(wrapper);

  // Re-select the wrapped content
  const newRange = document.createRange();
  newRange.selectNodeContents(wrapper);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

// ── List handling ──

function toggleList(listTag) {
  let blocks = getSelectedBlocks();
  if (blocks.length === 0) {
    const block = getCurrentBlock();
    if (!block) return;
    blocks = [block];
  }

  const upper = listTag.toUpperCase();

  // Determine if ALL selected blocks are LIs inside a list of the same type
  const allSameList = blocks.every(b => {
    if (b.tagName === 'LI' && b.parentNode && b.parentNode.tagName === upper) return true;
    // A selected block might be the list itself (UL/OL)
    if (b.tagName === upper) return true;
    return false;
  });

  if (allSameList) {
    // Unwrap: convert each LI back to P
    const listsToRemove = new Set();
    let firstP = null;
    let lastP = null;

    for (const block of blocks) {
      const list = block.tagName === 'LI' ? block.parentNode : block;
      if (listsToRemove.has(list)) continue;
      listsToRemove.add(list);

      const parent = list.parentNode;
      const items = Array.from(list.children);
      for (const li of items) {
        const p = document.createElement('p');
        while (li.firstChild) p.appendChild(li.firstChild);
        parent.insertBefore(p, list);
        if (!firstP) firstP = p;
        lastP = p;
      }
      parent.removeChild(list);
    }

    if (firstP) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(firstP, 0);
      range.setEndAfter(lastP.lastChild || lastP);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return;
  }

  // Check if all selected blocks are LIs in a list of a different type → switch type
  const allInDifferentList = blocks.every(b =>
    (b.tagName === 'LI' && b.parentNode && (b.parentNode.tagName === 'UL' || b.parentNode.tagName === 'OL')) ||
    (b.tagName === 'UL' || b.tagName === 'OL')
  );

  if (allInDifferentList) {
    const listsToSwitch = new Set();
    for (const block of blocks) {
      const list = block.tagName === 'LI' ? block.parentNode : block;
      listsToSwitch.add(list);
    }
    for (const oldList of listsToSwitch) {
      const newList = document.createElement(listTag);
      while (oldList.firstChild) newList.appendChild(oldList.firstChild);
      oldList.replaceWith(newList);
    }
    return;
  }

  // Wrap case: create one list, convert each selected block to an LI
  const newList = document.createElement(listTag);
  let insertionPoint = blocks[0];

  for (const block of blocks) {
    // If block is already a list, merge its items
    if (block.tagName === 'UL' || block.tagName === 'OL') {
      while (block.firstChild) newList.appendChild(block.firstChild);
      block.remove();
      continue;
    }
    // If block is an LI (from a different list type), take it directly
    if (block.tagName === 'LI') {
      const oldList = block.parentNode;
      newList.appendChild(block);
      // If old list is now empty, remove it
      if (oldList && oldList.children.length === 0) oldList.remove();
      continue;
    }
    // Normal block → wrap in LI
    const li = document.createElement('li');
    while (block.firstChild) li.appendChild(block.firstChild);
    newList.appendChild(li);
    block.remove();
  }

  insertionPoint.parentNode
    ? insertionPoint.replaceWith(newList)
    : editorEl.appendChild(newList);

  // Place cursor inside the last LI
  const lastLi = newList.lastElementChild;
  if (lastLi) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(lastLi);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// ── Toolbar state reflection ──

function updateToolbarState() {
  if (!editorEl) return;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  // Only respond if selection is inside our editor
  let node = sel.anchorNode;
  if (!node) return;
  let insideEditor = false;
  let walk = node;
  while (walk) {
    if (walk === editorEl) { insideEditor = true; break; }
    walk = walk.parentNode;
  }
  if (!insideEditor) return;

  // Collect ancestor tag names from anchor to editor root
  const ancestors = new Set();
  let nearestBlock = null;
  let n = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (n && n !== editorEl) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      ancestors.add(n.tagName);
      if (!nearestBlock && BLOCK_TAGS.has(n.tagName)) nearestBlock = n.tagName;
    }
    n = n.parentNode;
  }

  // Toggle .active on toolbar buttons
  const toolbar = editorEl.parentElement?.querySelector('.editor-toolbar');
  if (!toolbar) return;

  const buttons = toolbar.querySelectorAll('button[data-cmd]');
  for (const btn of buttons) {
    const cmd = btn.dataset.cmd;
    const val = (btn.dataset.value || '').toUpperCase();
    let active = false;

    switch (cmd) {
      case 'bold':
        active = ancestors.has('STRONG') || ancestors.has('B');
        break;
      case 'italic':
        active = ancestors.has('EM') || ancestors.has('I');
        break;
      case 'underline':
        active = ancestors.has('U');
        break;
      case 'insertUnorderedList':
        active = ancestors.has('LI') && ancestors.has('UL');
        break;
      case 'insertOrderedList':
        active = ancestors.has('LI') && ancestors.has('OL');
        break;
      case 'formatBlock':
        active = nearestBlock === val;
        break;
    }

    btn.classList.toggle('active', active);
  }
}

// ── Markdown-style shortcuts ──

const MARKDOWN_SHORTCUTS = [
  { pattern: /^###\s?$/, transform: () => setBlockType('h3') },
  { pattern: /^##\s?$/, transform: () => setBlockType('h2') },
  { pattern: /^#\s?$/, transform: () => setBlockType('h1') },
  { pattern: /^[-*]\s?$/, transform: () => toggleList('ul') },
  { pattern: /^1\.\s?$/, transform: () => toggleList('ol') },
  { pattern: /^---$/, transform: 'hr' },
];

function handleMarkdownShortcut(e) {
  if (e.key !== ' ') return false;

  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;

  const block = getCurrentBlock();
  if (!block) return false;

  // Only trigger at the start of a plain paragraph
  if (block.tagName !== 'P' && block.tagName !== 'DIV') return false;

  const text = block.textContent;

  for (const shortcut of MARKDOWN_SHORTCUTS) {
    // Test against text (the space hasn't been inserted yet, so match prefix without trailing space too)
    if (!shortcut.pattern.test(text) && !shortcut.pattern.test(text + ' ')) continue;

    e.preventDefault();
    pushUndoSnapshot();

    if (shortcut.transform === 'hr') {
      // Replace block with HR + new P
      const hr = document.createElement('hr');
      const newP = document.createElement('p');
      newP.innerHTML = '<br>';
      block.replaceWith(hr);
      hr.after(newP);
      const range = document.createRange();
      range.setStart(newP, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // Clear the prefix text, then apply the block transform
      block.textContent = '';
      block.appendChild(document.createElement('br'));
      // Restore cursor inside block before transform
      const range = document.createRange();
      range.setStart(block, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      shortcut.transform();
    }

    if (onInputCallback) onInputCallback();
    updateToolbarState();
    return true;
  }

  return false;
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
  editorEl.addEventListener('focus', updateToolbarState);

  // Update toolbar state on selection changes within the editor
  document.addEventListener('selectionchange', updateToolbarState);

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
  // Ctrl+Y / Cmd+Y — reapply last formatting command
  if (e.key === 'y' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    if (lastFormatCommand) {
      e.preventDefault();
      execToolbarCommand(lastFormatCommand.cmd, lastFormatCommand.value);
      return;
    }
  }

  // Markdown-style shortcuts on Space
  if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (handleMarkdownShortcut(e)) return;
  }

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

  // Track last formatting command for Ctrl+Y reapply
  lastFormatCommand = { cmd, value };

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
  updateToolbarState();
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
