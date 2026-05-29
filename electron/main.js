import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { LiveF1Bridge } from './live-bridge.js';
import { LocalF1Bridge } from './localf1-bridge.js';
import { sendF1Data, sendSourceStatus } from './f1-events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix GPU Cache on Windows
app.commandLine.appendSwitch('disk-cache-dir', path.join(app.getPath('temp'), 'v-max-cache'));

let currentBridge = null;
let mainWindowInstance = null;
let currentReplaySession = 9158;

const VALID_MODES = new Set(['live', 'archive']);

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readLocalSession(libPath, folderName) {
  const sessionKey = Number(folderName);
  if (!Number.isFinite(sessionKey)) return null;

  const sessionDir = path.join(libPath, folderName);
  const session = readJsonIfExists(path.join(sessionDir, 'session.json'));
  const manifest = readJsonIfExists(path.join(sessionDir, 'manifest.json'));

  return {
    session_key: sessionKey,
    session_name: session?.session_name ?? manifest?.session_name ?? `Local Replay (ID: ${folderName})`,
    year: session?.year ?? manifest?.year ?? 2023,
    country_name: session?.country_name ?? manifest?.country_name,
    date_start: session?.date_start,
    circuit_key: session?.circuit_key ?? manifest?.circuit_key,
    circuit_short_name: session?.circuit_short_name,
    driver_count: manifest?.drivers?.length ?? session?.driver_count,
    telemetry_records: manifest?.telemetry_records,
    location_records: manifest?.location_records,
    position_records: manifest?.position_records,
    interval_records: manifest?.interval_records,
    lap_records: manifest?.lap_records,
    stint_records: manifest?.stint_records,
    race_control_records: manifest?.race_control_records
  };
}

function readLocalSessions() {
  const libPath = path.join(process.cwd(), 'library');
  if (!fs.existsSync(libPath)) return [];

  const folders = fs.readdirSync(libPath, { withFileTypes: true }).filter(entry => entry.isDirectory());
  return folders
    .map(f => readLocalSession(libPath, f.name))
    .filter(Boolean)
    .sort((a, b) => {
      const dateA = a.date_start ? new Date(a.date_start).getTime() : 0;
      const dateB = b.date_start ? new Date(b.date_start).getTime() : 0;
      return dateB - dateA || b.session_key - a.session_key;
    });
}

function resolveDefaultReplaySession() {
  return readLocalSessions()[0]?.session_key ?? currentReplaySession;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#747d8c',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  mainWindowInstance = mainWindow;

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  
  // Start Archive Mode by default
  startMode('archive');

  // Handle manual track flag changes from dev panel
  ipcMain.on('set-track-flag', (event, flag) => {
    sendF1Data(mainWindow, { type: 'track-status', flag });
  });
  
  ipcMain.on('set-mode', (event, mode) => {
    if (!VALID_MODES.has(mode)) return;
    startMode(mode);
  });

  ipcMain.handle('get-sessions', async () => {
    try {
      return readLocalSessions();
    } catch (err) {
      console.error('Failed to read local sessions:', err);
      return [];
    }
  });

  ipcMain.on('set-replay-session', (event, sessionKey) => {
    const parsedSessionKey = Number(sessionKey);
    if (!Number.isFinite(parsedSessionKey)) return;

    if (currentReplaySession === parsedSessionKey && currentBridge && currentBridge.constructor.name === 'LocalF1Bridge') {
      return; // Prevent full reload on HMR if session hasn't changed
    }

    currentReplaySession = parsedSessionKey;
    // Restart archive mode with new session
    if (currentBridge && currentBridge.constructor.name === 'LocalF1Bridge') {
      startMode('archive');
    }
  });

  ipcMain.on('replay-control', (event, command) => {
    if (!command || currentBridge?.constructor.name !== 'LocalF1Bridge') return;
    currentBridge.handleControl(command);
  });

  ipcMain.on('set-focused-driver', (event, driverNumber) => {
    if (!currentBridge || typeof currentBridge.setFocusedDriver !== 'function') return;
    currentBridge.setFocusedDriver(driverNumber);
  });
}

function startMode(mode) {
  if (currentBridge) {
    currentBridge.stop();
    currentBridge = null;
  }
  
  if (!mainWindowInstance) return;

  if (mode === 'live') {
    sendSourceStatus(mainWindowInstance, 'live', 'connecting', 'Connecting to live timing');
    currentBridge = new LiveF1Bridge(mainWindowInstance);
    currentBridge.start().catch(err => {
      console.warn('[V-Max] Live mode failed:', err.message);
      sendSourceStatus(mainWindowInstance, 'live', 'error', err.message);
    });
  } else if (mode === 'archive') {
    sendSourceStatus(mainWindowInstance, 'archive', 'connecting', `Loading local replay ${currentReplaySession}`);
    currentBridge = new LocalF1Bridge(mainWindowInstance, currentReplaySession);
    currentBridge.initialize().then(() => {
      currentBridge.start();
    }).catch(err => {
      console.warn('[V-Max] Local replay failed:', err.message);
      sendSourceStatus(mainWindowInstance, 'archive', 'error', err.message);
    });
  }
}


app.whenReady().then(() => {
  currentReplaySession = resolveDefaultReplaySession();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
