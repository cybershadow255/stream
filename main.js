const { app, BrowserWindow, ipcMain, desktopCapturer, session } = require('electron');
const path = require('path');

// Disable GPU Hardware Acceleration to prevent green screen video rendering artifacts
app.disableHardwareAcceleration();

let mainWindow;
let selectedSourceId = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1f22',
    title: 'StreamShare',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  // Allow Chromium displayMedia requests inside Electron window
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      let selected = sources.find(s => s.id === selectedSourceId) || sources[0];
      if (selected) {
        callback({ video: selected, audio: 'loopback' });
      } else {
        callback({});
      }
    }).catch((err) => {
      console.error(err);
      callback({});
    });
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Store selected source ID for displayMedia request
ipcMain.handle('set-selected-source', (event, sourceId) => {
  selectedSourceId = sourceId;
  return true;
});

// IPC Handler to get desktop screen capture sources
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 }
  });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});
