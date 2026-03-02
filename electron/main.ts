import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import * as path from 'path';
import { PythonBridge } from './python-bridge';
import { registerIpcHandlers } from './ipc-handlers';
import { DatabaseManager } from './database';

let mainWindow: BrowserWindow | null = null;
let popoutWindow: BrowserWindow | null = null;
let pythonBridge: PythonBridge | null = null;
let dbManager: DatabaseManager | null = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'FactorySim',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
    backgroundColor: '#f8fafc',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app
  if (isDev) {
    await mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function createPopoutWindow(): Promise<void> {
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    popoutWindow.focus();
    return;
  }

  popoutWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'FactorySim — Live Animation',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    backgroundColor: '#0f172a',
  });

  popoutWindow.on('closed', () => {
    popoutWindow = null;
  });

  if (isDev) {
    await popoutWindow.loadURL('http://localhost:3000?popout=animation');
  } else {
    await popoutWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      query: { popout: 'animation' },
    });
  }
}

async function initializeApp(): Promise<void> {
  // Initialize database
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'factorysim.db');
  dbManager = new DatabaseManager(dbPath);
  await dbManager.initialize();

  // Initialize Python bridge
  const pythonPath = isDev
    ? path.join(__dirname, '../../python')
    : path.join(process.resourcesPath, 'python');

  pythonBridge = new PythonBridge(pythonPath);

  // Register IPC handlers
  registerIpcHandlers(ipcMain, pythonBridge, dbManager, dialog, mainWindow, shell);

  // P9 — Pop-out window handler
  ipcMain.handle('window:create-popout', async () => {
    await createPopoutWindow();
  });
}

function buildAppMenu(): void {
  const userDataPath = app.getPath('userData');
  const runsPath = path.join(userDataPath, 'runs');

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Model',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-model'),
        },
        {
          label: 'Save Model',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('menu:save-model'),
        },
        { type: 'separator' },
        {
          label: 'Open Run Artifacts Folder',
          click: () => shell.openPath(runsPath),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About FactorySim',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About FactorySim',
              message: 'FactorySim v1.0.0',
              detail: [
                'Desktop digital twin platform for manufacturing simulation.',
                '',
                'Engine: SimPy 4.1 / Python 3.11+',
                'UI: Electron + React + TypeScript',
                `Build: 2026.02.13`,
                '',
                'Drag stations, buffers, sources, and sinks onto the canvas.',
                'Connect them to define material flow, then run simulations',
                'to analyze OEE, throughput, cycle time, and bottlenecks.',
              ].join('\n'),
              buttons: ['OK'],
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Getting Started',
          click: () => {
            const helpPath = isDev
              ? path.join(__dirname, '../../public/help.html')
              : path.join(__dirname, '../renderer/help.html');
            shell.openPath(helpPath);
          },
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'Keyboard Shortcuts',
              message: 'FactorySim Shortcuts',
              detail: [
                'Ctrl+N          New model',
                'Ctrl+S          Save model',
                'Ctrl+Z          Undo',
                'Ctrl+Shift+Z    Redo',
                'Delete           Remove selected node',
                'Ctrl++/−         Zoom in/out',
                'Ctrl+0           Reset zoom',
                'F11              Toggle fullscreen',
                'Ctrl+Shift+I     Developer tools',
              ].join('\n'),
              buttons: ['OK'],
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Open Run Artifacts Folder',
          click: () => shell.openPath(runsPath),
        },
        {
          label: 'SimPy Documentation',
          click: () => shell.openExternal('https://simpy.readthedocs.io/en/latest/'),
        },
        { type: 'separator' },
        {
          label: 'Report an Issue',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'Report an Issue',
              message: 'Found a bug or have feedback?',
              detail: [
                'To report issues, use the cowork analysis workflow:',
                '',
                '1. Run your simulation or scenario',
                '2. Artifacts are auto-saved to the runs/ folder',
                '3. Share the run folder for analysis',
                '',
                `Artifacts location:\n${runsPath}`,
              ].join('\n'),
              buttons: ['Open Artifacts Folder', 'OK'],
            }).then((result) => {
              if (result.response === 0) {
                shell.openPath(runsPath);
              }
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  await initializeApp();
  buildAppMenu();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  pythonBridge?.shutdown();
  dbManager?.close();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  pythonBridge?.shutdown();
  dbManager?.close();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Error', `An unexpected error occurred: ${error.message}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
