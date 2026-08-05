const sourceEl = document.getElementById('source');
const previewEl = document.getElementById('preview');
const tabbarEl = document.getElementById('tabbar');
const dropHintEl = document.getElementById('drop-hint');
const statusbarEl = document.getElementById('statusbar');
const findbarEl = document.getElementById('findbar');
const findInputEl = document.getElementById('find-input');
const replaceInputEl = document.getElementById('replace-input');
const findCounterEl = document.getElementById('find-counter');
const findPrevBtnEl = document.getElementById('find-prev-btn');
const findNextBtnEl = document.getElementById('find-next-btn');
const replaceBtnEl = document.getElementById('replace-btn');
const replaceAllBtnEl = document.getElementById('replace-all-btn');
const findbarCloseBtnEl = document.getElementById('findbar-close-btn');
const sidebarEl = document.getElementById('sidebar');

// Each doc: { id, filePath, content, savedContent }
let docs = [];
let activeId = null;
let idCounter = 0;
let debounceTimer = null;
let syncingScroll = false;
let findMatches = [];
let currentMatchIndex = -1;
let folderTree = null;
let folderRootPath = null;
let collapsedFolders = new Set();

function activeDoc() {
  return docs.find((d) => d.id === activeId) || null;
}

function renderSidebarNode(node, depth = 0) {
  const container = document.createElement('div');
  const btn = document.createElement('button');
  btn.className = `tree-node ${node.type}`;
  if (node.type === 'file' && activeDoc()?.filePath === node.path) {
    btn.classList.add('active');
  }

  const inner = document.createElement('div');
  inner.className = 'tree-node-inner';
  inner.style.paddingLeft = node.type === 'folder' ? `${12 + depth * 20}px` : `${12 + depth * 20}px`;

  const isCollapsed = node.type === 'folder' && collapsedFolders.has(node.path);
  let toggleEl = null;

  if (node.type === 'folder') {
    toggleEl = document.createElement('span');
    toggleEl.className = 'tree-toggle';
    if (isCollapsed) toggleEl.classList.add('collapsed');
    toggleEl.textContent = '▼';
    inner.appendChild(toggleEl);
  }

  const label = document.createElement('span');
  label.textContent = node.name;
  label.style.flex = '1';
  label.style.minWidth = '0';
  label.style.overflow = 'hidden';
  label.style.textOverflow = 'ellipsis';
  inner.appendChild(label);

  btn.appendChild(inner);

  if (node.type === 'folder') {
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'tree-children';
    if (isCollapsed) childrenDiv.classList.add('hidden');
    node.children?.forEach(child => {
      childrenDiv.appendChild(renderSidebarNode(child, depth + 1));
    });
    container.appendChild(btn);
    container.appendChild(childrenDiv);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (collapsedFolders.has(node.path)) {
        collapsedFolders.delete(node.path);
      } else {
        collapsedFolders.add(node.path);
      }
      childrenDiv.classList.toggle('hidden');
      toggleEl.classList.toggle('collapsed');
    });
  } else if (node.type === 'file') {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await window.mdViewer.openFilePath(node.path);
      addDoc(result.filePath, result.content);
      renderSidebar();
    });
    container.appendChild(btn);
  }

  return container;
}

function renderSidebar() {
  sidebarEl.innerHTML = '';
  if (!folderTree || !folderRootPath) {
    sidebarEl.classList.remove('open');
    return;
  }

  sidebarEl.classList.add('open');

  const header = document.createElement('div');
  header.className = 'sidebar-header';
  header.textContent = folderRootPath.split(/[\\/]/).pop() || 'Folder';
  sidebarEl.appendChild(header);

  const tree = document.createElement('div');
  tree.className = 'sidebar-tree';
  folderTree.forEach(node => {
    tree.appendChild(renderSidebarNode(node));
  });
  sidebarEl.appendChild(tree);
}

function updateStatusBar() {
  const doc = activeDoc();
  if (!doc) {
    statusbarEl.innerHTML = '';
    return;
  }

  const text = sourceEl.value;
  const cursorPos = sourceEl.selectionStart;

  const textBeforeCursor = text.substring(0, cursorPos);
  const lines = textBeforeCursor.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const chars = text.length;

  statusbarEl.innerHTML = `<span>Ln ${line}, Col ${col}</span><span>${words} words, ${chars} chars</span>`;
}

function isDirty(doc) {
  return doc.content !== doc.savedContent;
}

function baseName(filePath) {
  return filePath.split(/[\\/]/).pop();
}

function renderTabs() {
  tabbarEl.innerHTML = '';
  docs.forEach((doc) => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (doc.id === activeId ? ' active' : '');
    tab.dataset.id = doc.id;

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = baseName(doc.filePath);
    tab.appendChild(label);

    if (isDirty(doc)) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      dot.textContent = '●';
      tab.appendChild(dot);
    }

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(doc.id);
    });
    tab.appendChild(close);

    tab.addEventListener('click', () => switchToTab(doc.id));
    tabbarEl.appendChild(tab);
  });
  renderSidebar();
}

function renderPreview() {
  const doc = activeDoc();
  previewEl.innerHTML = doc ? window.mdViewer.renderMarkdown(doc.content) : '';
  renderMermaidBlocks();
}

function isDarkTheme() {
  const override = document.documentElement.dataset.theme;
  if (override === 'dark') return true;
  if (override === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function renderMermaidBlocks() {
  if (!window.mermaid) return;
  const nodes = previewEl.querySelectorAll('pre.mermaid');
  if (nodes.length === 0) return;
  try {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: isDarkTheme() ? 'dark' : 'default',
    });
    window.mermaid.run({ nodes });
  } catch (err) {
    console.error('Mermaid render failed', err);
  }
}

// GFM task list checkboxes: clicking one flips the raw `[ ]`/`[x]` in the source.
previewEl.addEventListener('click', (e) => {
  if (!e.target.classList?.contains('task-list-item-checkbox')) return;
  const doc = activeDoc();
  if (!doc) return;

  const allBoxes = Array.from(previewEl.querySelectorAll('.task-list-item-checkbox'));
  const targetIndex = allBoxes.indexOf(e.target);
  if (targetIndex === -1) return;

  const taskLineRegex = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](\s+.*)?$/;
  const lines = sourceEl.value.split('\n');
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(taskLineRegex);
    if (!match) continue;
    if (count === targetIndex) {
      lines[i] = match[1] + '[' + (e.target.checked ? 'x' : ' ') + ']' + (match[3] || '');
      break;
    }
    count++;
  }

  const newValue = lines.join('\n');
  sourceEl.value = newValue;
  doc.content = newValue;
  renderTabs();
  updateStatusBar();
  renderPreview();
});

function loadActiveIntoEditor() {
  const doc = activeDoc();
  const hasDoc = !!doc;
  sourceEl.classList.toggle('hidden', !hasDoc);
  previewEl.classList.toggle('hidden', !hasDoc);
  dropHintEl.classList.toggle('hidden', hasDoc);
  statusbarEl.classList.toggle('hidden', !hasDoc);
  document.getElementById('split-handle').classList.toggle('hidden', !hasDoc);
  if (hasDoc) {
    sourceEl.value = doc.content;
    renderPreview();
    updateStatusBar();
  }
}

function switchToTab(id) {
  activeId = id;
  loadActiveIntoEditor();
  renderTabs();
}

function closeTab(id) {
  const doc = docs.find((d) => d.id === id);
  if (doc && isDirty(doc)) {
    const ok = confirm(`"${baseName(doc.filePath)}" has unsaved changes. Close anyway?`);
    if (!ok) return;
  }
  const index = docs.findIndex((d) => d.id === id);
  docs.splice(index, 1);
  if (activeId === id) {
    const next = docs[index] || docs[index - 1] || null;
    activeId = next ? next.id : null;
  }
  loadActiveIntoEditor();
  renderTabs();
  window.mdViewer.watchFiles(docs.map(d => d.filePath));
}

function addDoc(filePath, content) {
  const existing = docs.find((d) => d.filePath === filePath);
  if (existing) {
    existing.content = content;
    existing.savedContent = content;
    switchToTab(existing.id);
    return;
  }
  const doc = { id: ++idCounter, filePath, content, savedContent: content };
  docs.push(doc);
  activeId = doc.id;
  loadActiveIntoEditor();
  renderTabs();
  window.mdViewer.watchFiles(docs.map(d => d.filePath));
}

async function saveActiveDoc() {
  const doc = activeDoc();
  if (!doc) return;
  const result = await window.mdViewer.saveFile(doc.filePath, sourceEl.value);
  if (result.saved) {
    doc.filePath = result.filePath;
    doc.savedContent = sourceEl.value;
    doc.content = sourceEl.value;
    renderTabs();
  }
}

sourceEl.addEventListener('input', () => {
  const doc = activeDoc();
  if (!doc) return;
  doc.content = sourceEl.value;
  renderTabs();
  updateStatusBar();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderPreview, 150);
});

// Synced scrolling: mirror scroll percentage between the two panes.
function syncScroll(from, to) {
  if (syncingScroll) return;
  syncingScroll = true;
  const max = from.scrollHeight - from.clientHeight;
  const ratio = max > 0 ? from.scrollTop / max : 0;
  const toMax = to.scrollHeight - to.clientHeight;
  to.scrollTop = ratio * toMax;
  requestAnimationFrame(() => { syncingScroll = false; });
}
sourceEl.addEventListener('scroll', () => syncScroll(sourceEl, previewEl));
previewEl.addEventListener('scroll', () => syncScroll(previewEl, sourceEl));

sourceEl.addEventListener('click', updateStatusBar);
sourceEl.addEventListener('keyup', updateStatusBar);
sourceEl.addEventListener('select', updateStatusBar);

// Resizable split between source and preview panes.
const sourceContainerEl = document.getElementById('source-container');
const splitHandleEl = document.getElementById('split-handle');
const panesEl = document.getElementById('panes');

function applySplit(percent) {
  sourceContainerEl.style.flex = `0 0 ${percent}%`;
}

const savedSplit = parseFloat(localStorage.getItem('splitPercent'));
applySplit(Number.isFinite(savedSplit) ? savedSplit : 50);

splitHandleEl.addEventListener('mousedown', (e) => {
  e.preventDefault();
  document.body.classList.add('resizing');
  splitHandleEl.classList.add('dragging');

  function onMouseMove(e) {
    const rect = panesEl.getBoundingClientRect();
    let percent = ((e.clientX - rect.left) / rect.width) * 100;
    percent = Math.min(85, Math.max(15, percent));
    applySplit(percent);
  }

  function onMouseUp() {
    document.body.classList.remove('resizing');
    splitHandleEl.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    const percent = parseFloat(sourceContainerEl.style.flexBasis);
    if (Number.isFinite(percent)) {
      localStorage.setItem('splitPercent', percent);
    }
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

splitHandleEl.addEventListener('dblclick', () => {
  applySplit(50);
  localStorage.setItem('splitPercent', 50);
});

document.addEventListener('keydown', (e) => {
  const cmdOrCtrl = e.metaKey || e.ctrlKey;
  if (cmdOrCtrl && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveActiveDoc();
  }
  if (cmdOrCtrl && e.key.toLowerCase() === 'w') {
    e.preventDefault();
    if (activeId !== null) closeTab(activeId);
  }
  if (cmdOrCtrl && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    openFindBar();
  }
  if (cmdOrCtrl && /^[1-9]$/.test(e.key)) {
    e.preventDefault();
    const index = Number(e.key) - 1;
    if (docs[index]) switchToTab(docs[index].id);
  }
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    cycleTab(e.shiftKey ? -1 : 1);
  }
  if (cmdOrCtrl && e.shiftKey && (e.key === ']' || e.key === '[')) {
    e.preventDefault();
    cycleTab(e.key === ']' ? 1 : -1);
  }
});

findInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      findPrev();
    } else {
      findNext();
    }
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeFindBar();
  }
});

replaceInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeFindBar();
  }
});

findInputEl.addEventListener('input', () => {
  findAllMatches(findInputEl.value);
  currentMatchIndex = -1;
  updateFindCounter();
});

findPrevBtnEl.addEventListener('click', findPrev);
findNextBtnEl.addEventListener('click', findNext);
replaceBtnEl.addEventListener('click', replaceOne);
replaceAllBtnEl.addEventListener('click', replaceAll);
findbarCloseBtnEl.addEventListener('click', closeFindBar);

function cycleTab(direction) {
  if (docs.length === 0) return;
  const currentIndex = docs.findIndex((d) => d.id === activeId);
  const nextIndex = (currentIndex + direction + docs.length) % docs.length;
  switchToTab(docs[nextIndex].id);
}

function findAllMatches(searchTerm) {
  findMatches = [];
  if (!searchTerm) return;
  const text = sourceEl.value;
  const lowerText = text.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();
  let index = 0;
  while ((index = lowerText.indexOf(lowerSearch, index)) !== -1) {
    findMatches.push({ start: index, end: index + searchTerm.length });
    index++;
  }
}

function scrollToMatch(match) {
  const textBefore = sourceEl.value.substring(0, match.start);
  const line = textBefore.split('\n').length - 1;
  const style = getComputedStyle(sourceEl);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;
  const target = line * lineHeight - sourceEl.clientHeight / 2 + lineHeight;
  sourceEl.scrollTop = Math.max(0, target);
}

function selectMatch(index) {
  if (findMatches.length === 0) return;
  currentMatchIndex = index % findMatches.length;
  if (currentMatchIndex < 0) currentMatchIndex += findMatches.length;
  const match = findMatches[currentMatchIndex];
  sourceEl.focus();
  sourceEl.setSelectionRange(match.start, match.end);
  scrollToMatch(match);
  updateFindCounter();
}

function updateFindCounter() {
  if (findMatches.length === 0) {
    findCounterEl.textContent = '0/0';
  } else {
    findCounterEl.textContent = `${currentMatchIndex + 1}/${findMatches.length}`;
  }
}

function openFindBar() {
  if (!activeDoc()) return;
  findbarEl.classList.remove('hidden');
  findInputEl.focus();
  findInputEl.select();
}

function closeFindBar() {
  findbarEl.classList.add('hidden');
  sourceEl.focus();
  findMatches = [];
  currentMatchIndex = -1;
  updateFindCounter();
}

function findNext() {
  const searchTerm = findInputEl.value;
  if (!searchTerm) return;
  findAllMatches(searchTerm);
  if (findMatches.length === 0) return;
  if (currentMatchIndex === -1) {
    selectMatch(0);
  } else {
    selectMatch(currentMatchIndex + 1);
  }
}

function findPrev() {
  const searchTerm = findInputEl.value;
  if (!searchTerm) return;
  findAllMatches(searchTerm);
  if (findMatches.length === 0) return;
  if (currentMatchIndex === -1) {
    selectMatch(findMatches.length - 1);
  } else {
    selectMatch(currentMatchIndex - 1);
  }
}

function replaceOne() {
  if (findMatches.length === 0 || currentMatchIndex === -1) return;
  const doc = activeDoc();
  const match = findMatches[currentMatchIndex];
  const before = sourceEl.value.substring(0, match.start);
  const after = sourceEl.value.substring(match.end);
  doc.content = before + replaceInputEl.value + after;
  sourceEl.value = doc.content;
  findAllMatches(findInputEl.value);
  if (currentMatchIndex < findMatches.length) {
    selectMatch(currentMatchIndex);
  } else if (findMatches.length > 0) {
    selectMatch(0);
  } else {
    currentMatchIndex = -1;
    updateFindCounter();
  }
  renderTabs();
  updateStatusBar();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderPreview, 150);
}

function replaceAll() {
  const searchTerm = findInputEl.value;
  if (!searchTerm) return;
  const doc = activeDoc();
  const replaceWith = replaceInputEl.value;
  let newContent = sourceEl.value;
  const lowerContent = newContent.toLowerCase();
  const lowerSearch = searchTerm.toLowerCase();
  let result = '';
  let lastIndex = 0;
  let index = 0;
  while ((index = lowerContent.indexOf(lowerSearch, index)) !== -1) {
    result += newContent.substring(lastIndex, index) + replaceWith;
    index += searchTerm.length;
    lastIndex = index;
  }
  result += newContent.substring(lastIndex);
  doc.content = result;
  sourceEl.value = result;
  findAllMatches(searchTerm);
  currentMatchIndex = -1;
  updateFindCounter();
  renderTabs();
  updateStatusBar();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderPreview, 150);
}

window.mdViewer.onRequestSave(() => saveActiveDoc());
window.mdViewer.onFileOpened(({ filePath, content }) => addDoc(filePath, content));
window.mdViewer.onFileChangedExternally(({ filePath, content }) => {
  const doc = docs.find((d) => d.filePath === filePath);
  if (!doc) return;
  if (doc.content === doc.savedContent) {
    doc.content = content;
    doc.savedContent = content;
    if (doc.id === activeId) {
      sourceEl.value = content;
      renderPreview();
    }
  }
});
window.mdViewer.onFolderOpened(({ rootPath, tree }) => {
  folderRootPath = rootPath;
  folderTree = tree;
  renderSidebar();
});

// Drag-and-drop support (multiple files at once)
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter((f) => /\.(md|markdown)$/i.test(f.name));
  for (const file of files) {
    const filePath = window.mdViewer.getPathForFile(file);
    const result = await window.mdViewer.openFilePath(filePath);
    addDoc(result.filePath, result.content);
  }
});

// Manual theme toggle (system -> light -> dark -> system), overrides the OS-driven default.
const themeToggleEl = document.getElementById('theme-toggle');
const THEME_CYCLE = ['system', 'light', 'dark'];
const THEME_ICON = { system: '◐', light: '☀', dark: '☾' };

function applyTheme(theme) {
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  themeToggleEl.textContent = THEME_ICON[theme];
  themeToggleEl.title = `Toggle theme (currently: ${theme})`;
  localStorage.setItem('theme', theme);
  renderPreview();
}

applyTheme(localStorage.getItem('theme') || 'system');

themeToggleEl.addEventListener('click', () => {
  const current = localStorage.getItem('theme') || 'system';
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  applyTheme(next);
});

loadActiveIntoEditor();
