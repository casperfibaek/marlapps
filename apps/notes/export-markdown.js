// export-markdown.js - HTML to Markdown conversion + .md download

export function htmlToMarkdown(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return walkNode(container).trim();
}

function walkNode(node) {
  let result = '';

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent;
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName;

    switch (tag) {
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const level = parseInt(tag[1]);
        const prefix = '#'.repeat(level);
        result += `\n\n${prefix} ${walkNode(child).trim()}`;
        break;
      }
      case 'P':
        result += `\n\n${walkNode(child).trim()}`;
        break;
      case 'BR':
        result += '\n';
        break;
      case 'HR':
        result += '\n\n---';
        break;
      case 'STRONG':
      case 'B': {
        const inner = walkNode(child);
        result += `**${inner}**`;
        break;
      }
      case 'EM':
      case 'I': {
        const inner = walkNode(child);
        result += `*${inner}*`;
        break;
      }
      case 'U': {
        const inner = walkNode(child);
        result += `<u>${inner}</u>`;
        break;
      }
      case 'UL':
        result += '\n' + walkList(child, '-');
        break;
      case 'OL':
        result += '\n' + walkList(child, 'ordered');
        break;
      case 'DIV':
      case 'SPAN':
        result += walkNode(child);
        break;
      default:
        result += walkNode(child);
        break;
    }
  }

  return result;
}

function walkList(listNode, style, indent = 0) {
  let result = '';
  let index = 1;
  const prefix = '  '.repeat(indent);

  for (const child of listNode.childNodes) {
    if (child.nodeType !== Node.ELEMENT_NODE || child.tagName !== 'LI') continue;

    const bullet = style === 'ordered' ? `${index}.` : '-';
    let content = '';

    for (const liChild of child.childNodes) {
      if (liChild.nodeType === Node.ELEMENT_NODE && (liChild.tagName === 'UL' || liChild.tagName === 'OL')) {
        content += '\n' + walkList(liChild, liChild.tagName === 'OL' ? 'ordered' : '-', indent + 1);
      } else if (liChild.nodeType === Node.TEXT_NODE) {
        content += liChild.textContent;
      } else if (liChild.nodeType === Node.ELEMENT_NODE) {
        content += walkNode(liChild);
      }
    }

    result += `\n${prefix}${bullet} ${content.trim()}`;
    index++;
  }

  return result;
}

export function downloadMarkdown(title, html) {
  const md = `# ${title}\n\n${htmlToMarkdown(html)}`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(title)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\.$/, '_')    // trailing dot (reserved on Windows)
    .trim()
    .substring(0, 200)      // filesystem limit safety (leave room for extension)
    || 'note';
}
