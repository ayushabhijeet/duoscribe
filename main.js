const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let pendingFilePath = null;

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
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
            });
            if (!canceled && filePaths[0]) {
              openFileInWindow(filePaths[0]);
            }
          },
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('request-save'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
    buildMenu();
    createWindow();

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
  return { saved: true, filePath };
});

ipcMain.handle('open-file-path', async (event, filePath) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});
