const { app, BrowserWindow, Menu, dialog, ipcMain, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let pendingFilePath = null;

const RECENT_FILES_PATH = path.join(app.getPath('userData'), 'recent-files.json');
const MAX_RECENT_FILES = 10;
let recentFiles = [];

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
let settings = { spellcheck: false };

const watchers = new Map();

function loadRecentFiles() {
  try {
    if (fs.existsSync(RECENT_FILES_PATH)) {
      const data = fs.readFileSync(RECENT_FILES_PATH, 'utf-8');
      recentFiles = JSON.parse(data) || [];
    }
  } catch (err) {
    recentFiles = [];
  }
}

function saveRecentFiles() {
  fs.writeFileSync(RECENT_FILES_PATH, JSON.stringify(recentFiles, null, 2), 'utf-8');
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      const parsed = JSON.parse(data) || {};
      settings = { spellcheck: false, ...parsed };
    }
  } catch (err) {
    settings = { spellcheck: false };
  }
}

function saveSettings() {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

function toggleSpellcheck() {
  settings.spellcheck = !settings.spellcheck;
  saveSettings();
  rebuildMenu();
  if (mainWindow) {
    mainWindow.webContents.send('spellcheck-changed', settings.spellcheck);
  }
}

function addRecentFile(filePath) {
  const normalized = path.normalize(filePath);
  const index = recentFiles.findIndex(f => path.normalize(f) === normalized);
  if (index > -1) {
    recentFiles.splice(index, 1);
  }
  recentFiles.unshift(normalized);
  if (recentFiles.length > MAX_RECENT_FILES) {
    recentFiles = recentFiles.slice(0, MAX_RECENT_FILES);
  }
  saveRecentFiles();
  rebuildMenu();
}

function removeRecentFile(filePath) {
  const normalized = path.normalize(filePath);
  recentFiles = recentFiles.filter(f => path.normalize(f) !== normalized);
  saveRecentFiles();
  rebuildMenu();
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function buildStandaloneHtml(title, content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif; line-height: 1.6; color: #333; background: #fff; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { padding: 40px 24px; max-width: 900px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 700; margin: 32px 0 16px 0; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0; letter-spacing: -0.01em; }
    h1:first-child { margin-top: 0; }
    h2 { font-size: 22px; font-weight: 700; margin: 28px 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0; letter-spacing: -0.005em; }
    h3 { font-size: 18px; font-weight: 600; margin: 24px 0 10px 0; }
    h4 { font-size: 16px; font-weight: 600; margin: 20px 0 8px 0; }
    h5 { font-size: 15px; font-weight: 600; margin: 16px 0 6px 0; }
    h6 { font-size: 14px; font-weight: 600; margin: 16px 0 6px 0; color: #666; }
    p { margin: 12px 0; line-height: 1.7; }
    a { color: #d4382e; text-decoration: none; border-bottom: 1px solid rgba(212, 56, 46, 0.3); }
    a:hover { border-bottom-color: #d4382e; }
    ul, ol { margin: 12px 0; padding-left: 24px; line-height: 1.7; }
    li { margin: 6px 0; }
    ul ul, ul ol, ol ul, ol ol { margin: 6px 0; }
    code { background: #f5f5f5; color: #333; padding: 3px 6px; border-radius: 4px; font-family: "SF Mono", Menlo, Consolas, "Courier New", monospace; font-size: 13px; border: 1px solid #e0e0e0; }
    pre { background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; overflow-x: auto; margin: 16px 0; }
    pre code { background: transparent; border: none; padding: 0; font-size: 13px; line-height: 1.5; display: block; }
    blockquote { border-left: 3px solid #d4382e; padding-left: 16px; margin: 16px 0; color: #666; font-style: italic; line-height: 1.7; }
    blockquote p { margin: 8px 0; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 24px 0; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
    thead { background: #f5f5f5; border-bottom: 1px solid #e0e0e0; }
    th { border: 1px solid #e0e0e0; padding: 12px 16px; text-align: left; font-weight: 600; }
    td { border: 1px solid #e0e0e0; padding: 10px 16px; }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody tr:hover { background: #f0f0f0; }
    img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e0e0e0; margin: 12px 0; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
}

function clearRecentFiles() {
  recentFiles = [];
  saveRecentFiles();
  rebuildMenu();
}

function isMarkdownArg(arg) {
  return typeof arg === 'string' && /\.(md|markdown)$/i.test(arg);
}

// On Windows/Linux, the file path to open arrives as a CLI arg.
function getFileArgFromArgv(argv) {
  const args = app.isPackaged ? argv.slice(1) : argv.slice(2);
  return args.find(isMarkdownArg) || null;
}

function openFileInWindow(filePath) {
  if (!filePath) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  addRecentFile(filePath);
  if (mainWindow) {
    mainWindow.webContents.send('file-opened', { filePath, content });
  } else {
    pendingFilePath = filePath;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('[renderer]', message);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const argFile = getFileArgFromArgv(process.argv);
    const fileToOpen = pendingFilePath || argFile;
    if (fileToOpen) {
      openFileInWindow(fileToOpen);
      pendingFilePath = null;
    }
  });

  let allowClose = false;
  mainWindow.on('close', async (e) => {
    if (allowClose) return;
    e.preventDefault();
    const hasDirty = await mainWindow.webContents.executeJavaScript(
      'docs.some((d) => d.content !== d.savedContent)'
    );
    if (hasDirty) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Cancel', 'Close Without Saving'],
        defaultId: 0,
        cancelId: 0,
        message: 'You have unsaved changes in one or more tabs.',
        detail: 'Closing now will discard them.',
      });
      if (response !== 1) return;
    }
    allowClose = true;
    mainWindow.close();
  });

  mainWindow.on('closed', () => {
    watchers.forEach((watcher) => watcher.close());
    watchers.clear();
    mainWindow = null;
  });
}

async function exportAsHtml() {
  const data = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const doc = docs.find(d => d.id === activeId);
      if (!doc) return null;
      return { filePath: doc.filePath, html: document.getElementById('preview').innerHTML };
    })()
  `);

  if (!data) return;

  const basePath = path.basename(data.filePath, path.extname(data.filePath));
  const dir = path.dirname(data.filePath);
  const defaultPath = path.join(dir, basePath + '.html');
  const title = basePath;
  const html = buildStandaloneHtml(title, data.html);

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'HTML', extensions: ['html'] }],
    defaultPath,
  });

  if (!canceled && filePath) {
    fs.writeFileSync(filePath, html, 'utf-8');
  }
}

async function exportAsPdf() {
  const data = await mainWindow.webContents.executeJavaScript(`
    (function() {
      const doc = docs.find(d => d.id === activeId);
      if (!doc) return null;
      return { filePath: doc.filePath, html: document.getElementById('preview').innerHTML };
    })()
  `);

  if (!data) return;

  const basePath = path.basename(data.filePath, path.extname(data.filePath));
  const title = basePath;
  const html = buildStandaloneHtml(title, data.html);

  const hiddenWindow = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false },
  });

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await hiddenWindow.loadURL(dataUrl);

  const pdfBuffer = await hiddenWindow.webContents.printToPDF({});

  const dir = path.dirname(data.filePath);
  const defaultPath = path.join(dir, basePath + '.pdf');
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath,
  });

  if (!canceled && filePath) {
    fs.writeFileSync(filePath, pdfBuffer);
  }

  hiddenWindow.destroy();
}

function scanFolderForMarkdown(folderPath, maxDepth = 10, currentDepth = 0) {
  if (currentDepth >= maxDepth) return [];

  const noiseDir = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', '__pycache__']);
  const items = [];

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && noiseDir.has(entry.name)) continue;

      const fullPath = path.join(folderPath, entry.name);
      if (entry.isDirectory()) {
        const children = scanFolderForMarkdown(fullPath, maxDepth, currentDepth + 1);
        if (children.length > 0) {
          items.push({ name: entry.name, path: fullPath, type: 'folder', children });
        }
      } else if (/\.(md|markdown)$/i.test(entry.name)) {
        items.push({ name: entry.name, path: fullPath, type: 'file' });
      }
    }
  } catch (err) {
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function openFileDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  });
  if (!canceled && filePaths[0]) {
    openFileInWindow(filePaths[0]);
  }
}

async function openFolderDialog() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (!canceled && filePaths[0]) {
    const rootPath = filePaths[0];
    const tree = scanFolderForMarkdown(rootPath);
    mainWindow.webContents.send('folder-opened', { rootPath, tree });
  }
}

function buildMenu() {
  const fileSubmenu = [
    {
      label: 'Open...',
      accelerator: 'CmdOrCtrl+O',
      click: () => openFileDialog(),
    },
    {
      label: 'Open Folder...',
      // NOTE: was 'CmdOrCtrl+K CmdOrCtrl+O' -- changed because CmdOrCtrl+K is now the
      // Command Palette shortcut (renderer.js) and a chord accelerator starting with
      // the same key would shadow it.
      // NOTE: further changed from 'CmdOrCtrl+Shift+O' -- that combo is now the
      // Outline panel toggle (renderer.js global keydown listener), and a menu
      // accelerator would swallow the keypress before it ever reached the renderer.
      accelerator: 'CmdOrCtrl+Alt+O',
      click: () => openFolderDialog(),
    },
    {
      label: 'Save',
      accelerator: 'CmdOrCtrl+S',
      click: () => mainWindow.webContents.send('request-save'),
    },
    {
      label: 'Export as HTML...',
      click: () => exportAsHtml(),
    },
    {
      label: 'Export as PDF...',
      click: () => exportAsPdf(),
    },
    { type: 'separator' },
  ];

  if (recentFiles.length > 0) {
    const basenames = {};
    recentFiles.forEach(f => {
      const bn = path.basename(f);
      basenames[bn] = (basenames[bn] || 0) + 1;
    });

    const recentSubmenu = recentFiles.map((filePath) => {
      const bn = path.basename(filePath);
      const label = basenames[bn] > 1
        ? path.join(path.basename(path.dirname(filePath)), bn)
        : bn;
      return {
        label,
        click: () => {
          if (fs.existsSync(filePath)) {
            openFileInWindow(filePath);
          } else {
            removeRecentFile(filePath);
          }
        },
      };
    });

    recentSubmenu.push({ type: 'separator' });
    recentSubmenu.push({
      label: 'Clear Recent Files',
      click: () => clearRecentFiles(),
    });

    fileSubmenu.push({
      label: 'Open Recent',
      submenu: recentSubmenu,
    });
    fileSubmenu.push({ type: 'separator' });
  }

  fileSubmenu.push({ role: 'quit' });

  const isMac = process.platform === 'darwin';
  const editSubmenu = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
  ];
  if (isMac) {
    editSubmenu.push({ role: 'pasteAndMatchStyle' });
  }
  editSubmenu.push({ role: 'delete' });
  editSubmenu.push({ type: 'separator' });
  editSubmenu.push({ role: 'selectAll' });
  if (isMac) {
    editSubmenu.push({ type: 'separator' });
    editSubmenu.push({
      label: 'Speech',
      submenu: [
        { role: 'startSpeaking' },
        { role: 'stopSpeaking' },
      ],
    });
  }
  editSubmenu.push({ type: 'separator' });
  editSubmenu.push({
    label: 'Spellcheck',
    type: 'checkbox',
    checked: settings.spellcheck,
    click: () => toggleSpellcheck(),
  });

  const template = [
    {
      label: 'File',
      submenu: fileSubmenu,
    },
    {
      label: 'Edit',
      submenu: editSubmenu,
    },
    { role: 'viewMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => checkForUpdates(true),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function rebuildMenu() {
  if (mainWindow) {
    buildMenu();
  }
}

const UPDATE_CHECK_URL = 'https://api.github.com/repos/ayushabhijeet/duoscribe/releases/latest';

function parseVersion(v) {
  return v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
}

function isNewerVersion(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url: UPDATE_CHECK_URL });
    request.setHeader('User-Agent', 'Duoscribe');
    request.setHeader('Accept', 'application/vnd.github+json');
    let body = '';
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`GitHub API returned ${response.statusCode}`));
        return;
      }
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function checkForUpdates(interactive) {
  try {
    const release = await fetchLatestRelease();
    const currentVersion = app.getVersion();
    const latestVersion = release.tag_name || '';

    if (isNewerVersion(latestVersion, currentVersion)) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update available',
        message: `Duoscribe ${latestVersion} is available`,
        detail: `You're on ${currentVersion}. Download the new version from the Releases page?`,
        buttons: ['View Release', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) {
        shell.openExternal(release.html_url);
      }
    } else if (interactive) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'No updates available',
        message: `You're up to date`,
        detail: `Duoscribe ${currentVersion} is the latest version.`,
      });
    }
  } catch (err) {
    if (interactive) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Couldn\'t check for updates',
        message: 'Couldn\'t reach GitHub to check for updates.',
        detail: err.message || String(err),
      });
    }
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const filePath = getFileArgFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (filePath) openFileInWindow(filePath);
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    openFileInWindow(filePath);
  });

  app.whenReady().then(() => {
    loadRecentFiles();
    loadSettings();
    buildMenu();
    createWindow();
    setTimeout(() => checkForUpdates(false), 3000);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

ipcMain.handle('save-file', async (event, { filePath, content }) => {
  if (!filePath) {
    const { canceled, filePath: chosenPath } = await dialog.showSaveDialog(mainWindow, {
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (canceled || !chosenPath) return { saved: false };
    filePath = chosenPath;
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  addRecentFile(filePath);
  return { saved: true, filePath };
});

ipcMain.handle('get-spellcheck', () => settings.spellcheck);

ipcMain.handle('open-file-path', async (event, filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});

ipcMain.handle('open-file-dialog', () => openFileDialog());

ipcMain.handle('open-folder-dialog', () => openFolderDialog());

ipcMain.handle('export-html', () => exportAsHtml());

ipcMain.handle('export-pdf', () => exportAsPdf());

ipcMain.handle('save-pasted-image', async (event, { imageData, mimeType, filePath }) => {
  const dir = path.dirname(filePath);
  const assetsDir = path.join(dir, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const extMap = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
  const ext = extMap[mimeType] || (mimeType && mimeType.split('/')[1]) || 'png';

  let fileName = `pasted-image-${Date.now()}.${ext}`;
  let destPath = path.join(assetsDir, fileName);
  let counter = 1;
  while (fs.existsSync(destPath)) {
    fileName = `pasted-image-${Date.now()}-${counter}.${ext}`;
    destPath = path.join(assetsDir, fileName);
    counter++;
  }

  const buffer = Buffer.from(imageData, 'base64');
  fs.writeFileSync(destPath, buffer);

  return { relativePath: `assets/${fileName}` };
});

ipcMain.on('watch-files', (event, filePaths) => {
  const normalized = new Set(filePaths.map(p => path.normalize(p)));
  const currentPaths = new Set(watchers.keys());

  currentPaths.forEach((filePath) => {
    if (!normalized.has(filePath)) {
      const watcher = watchers.get(filePath);
      if (watcher) watcher.close();
      watchers.delete(filePath);
    }
  });

  normalized.forEach((filePath) => {
    if (!watchers.has(filePath) && fs.existsSync(filePath)) {
      let debounceTimer = null;
      const watcher = fs.watch(filePath, () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (mainWindow) {
              mainWindow.webContents.send('file-changed-externally', { filePath, content });
            }
          } catch (err) {
          }
        }, 300);
      });
      watchers.set(filePath, watcher);
    }
  });
});
