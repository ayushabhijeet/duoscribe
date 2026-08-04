const { contextBridge, ipcRenderer, webUtils } = require('electron');
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

contextBridge.exposeInMainWorld('mdViewer', {
  renderMarkdown: (text) => md.render(text),
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (event, data) => callback(data));
  },
  onRequestSave: (callback) => {
    ipcRenderer.on('request-save', () => callback());
  },
  onFileChangedExternally: (callback) => {
    ipcRenderer.on('file-changed-externally', (event, data) => callback(data));
  },
  onFolderOpened: (callback) => {
    ipcRenderer.on('folder-opened', (event, data) => callback(data));
  },
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  openFilePath: (filePath) => ipcRenderer.invoke('open-file-path', filePath),
  watchFiles: (filePaths) => ipcRenderer.send('watch-files', filePaths),
});
