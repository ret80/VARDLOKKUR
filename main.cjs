const { app, BrowserWindow } = require('electron');
const path = require('path');

const PORT = 3000;

let mainWindow;

async function startVite() {
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const vite = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      env: { ...process.env, PORT: PORT.toString() }
    });

    vite.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      if (output.includes('Local:') || output.includes(`http://localhost:${PORT}`)) {
        resolve();
      }
    });

    vite.stderr.on('data', (data) => {
      console.error(data.toString());
    });

    setTimeout(() => resolve(), 30000);
  });
}

app.whenReady().then(async () => {
  await startVite();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}/VARDLOKKUR/`);
  mainWindow.webContents.openDevTools();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    app.whenReady().then(async () => {
      await startVite();

      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          devTools: true
        }
      });

      mainWindow.loadURL(`http://localhost:${PORT}/VARDLOKKUR/`);
      mainWindow.webContents.openDevTools();
    });
  }
});
