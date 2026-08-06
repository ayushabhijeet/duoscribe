const { contextBridge, ipcRenderer, webUtils } = require('electron');
const MarkdownIt = require('markdown-it');
const hljs = require('highlight.js');
const taskLists = require('markdown-it-task-lists');

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight: (str, lang) => {
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${escapeHtml(str)}</pre>`;
    }
    const language = lang && hljs.getLanguage(lang) ? lang : null;
    try {
      const value = language
        ? hljs.highlight(str, { language, ignoreIllegals: true }).value
        : hljs.highlightAuto(str).value;
      return `<pre class="hljs-pre"><code class="hljs${language ? ' language-' + language : ''}">${value}</code></pre>`;
    } catch (e) {
      return `<pre class="hljs-pre"><code class="hljs">${escapeHtml(str)}</code></pre>`;
    }
  },
});
md.use(taskLists, { enabled: true, label: true });

contextBridge.exposeInMainWorld('mdViewer', {
  renderMarkdown: (text) => md.render(text),
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (event, data) => callback(data));
  },
  onRequestSave: (callback) => {
    ipcRenderer.on('request-save', () => callback());
  },
  onRequestNew: (callback) => {
    ipcRenderer.on('request-new', () => callback());
  },
  onFileChangedExternally: (callback) => {
    ipcRenderer.on('file-changed-externally', (event, data) => callback(data));
  },
  onFolderOpened: (callback) => {
    ipcRenderer.on('folder-opened', (event, data) => callback(data));
  },
  getInitialSpellcheck: () => ipcRenderer.invoke('get-spellcheck'),
  onSpellcheckChanged: (callback) => {
    ipcRenderer.on('spellcheck-changed', (event, value) => callback(value));
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  openFilePath: (filePath) => ipcRenderer.invoke('open-file-path', filePath),
  watchFiles: (filePaths) => ipcRenderer.send('watch-files', filePaths),
  savePastedImage: (imageData, mimeType, filePath) => ipcRenderer.invoke('save-pasted-image', { imageData, mimeType, filePath }),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  exportHtml: () => ipcRenderer.invoke('export-html'),
  exportPdf: () => ipcRenderer.invoke('export-pdf'),
});
