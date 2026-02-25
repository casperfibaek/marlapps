// editor.js - contenteditable rich text editor surface + toolbar

let editorEl = null;
let onInputCallback = null;

const SEPARATOR_PATTERNS = /^(-{4,}|\*{4,}|={4,})$/;

export function initEditor(containerEl, options = {}) {
  editorEl = containerEl;
  onInputCallback = options.onInput || null;

  editorEl.setAttribute('contenteditable', 'true');
  editorEl.setAttribute('role', 'textbox');
  editorEl.setAttribute('aria-multiline', 'true');

  editorEl.addEventListener('input', handleInput);
  editorEl.addEventListener('keydown', handleKeydown);
  editorEl.addEventListener('paste', handlePaste);
}

function handleInput() {
  if (onInputCallback) onInputCallback();
}

function handleKeydown(e) {
  // Insert tab character
  if (e.key === 'Tab') {
    e.preventDefault();
    document.execCommand('insertText', false, '\t');
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
  const html = e.clipboardData.getData('text/html');
  const text = e.clipboardData.getData('text/plain');

  if (html) {
    // Sanitize pasted HTML - keep only safe formatting tags
    const temp = document.createElement('div');
    temp.innerHTML = html;
    sanitizeNode(temp);
    document.execCommand('insertHTML', false, temp.innerHTML);
  } else if (text) {
    document.execCommand('insertText', false, text);
  }

  if (onInputCallback) onInputCallback();
}

function sanitizeNode(node) {
  const ALLOWED_TAGS = new Set([
    'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'DIV', 'SPAN'
  ]);

  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      // Remove all attributes except basic ones
      const attrs = Array.from(child.attributes);
      for (const attr of attrs) {
        child.removeAttribute(attr.name);
      }

      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Replace with its children
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

export function execToolbarCommand(cmd, value) {
  editorEl.focus();
  if (cmd === 'formatBlock') {
    document.execCommand('formatBlock', false, `<${value}>`);
  } else {
    document.execCommand(cmd, false, null);
  }
  if (onInputCallback) onInputCallback();
}

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
