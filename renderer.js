const sourceEl = document.getElementById('source');
const previewEl = document.getElementById('preview');
const tabbarEl = document.getElementById('tabbar');
const dropHintEl = document.getElementById('drop-hint');

// Each doc: { id, filePath, content, savedContent }
let docs = [];
let activeId = null;
let idCounter = 0;
let debounceTimer = null;
let syncingScroll = false;

function activeDoc() {
  return docs.find((d) => d.id === activeId) || null;
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
}

function renderPreview() {
  const doc = activeDoc();
  previewEl.innerHTML = doc ? window.mdViewer.renderMarkdown(doc.content) : '';
}

function loadActiveIntoEditor() {
  const doc = activeDoc();
  const hasDoc = !!doc;
  sourceEl.classList.toggle('hidden', !hasDoc);
  previewEl.classList.toggle('hidden', !hasDoc);
  dropHintEl.classList.toggle('hidden', hasDoc);
  if (hasDoc) {
    sourceEl.value = doc.content;
    renderPreview();
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

function cycleTab(direction) {
  if (docs.length === 0) return;
  const currentIndex = docs.findIndex((d) => d.id === activeId);
  const nextIndex = (currentIndex + direction + docs.length) % docs.length;
  switchToTab(docs[nextIndex].id);
}

window.mdViewer.onRequestSave(() => saveActiveDoc());
window.mdViewer.onFileOpened(({ filePath, content }) => addDoc(filePath, content));

// Drag-and-drop support (multiple files at once)
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files).filter((f) => /\.(md|markdown)$/i.test(f.name));
  for (const file of files) {
    const result = await window.mdViewer.openFilePath(file.path);
    addDoc(result.filePath, result.content);
  }
});

loadActiveIntoEditor();
