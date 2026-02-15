const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function getIconPath() {
    const ico = path.join(__dirname, 'assets', 'Weasco.ico');
    if (fs.existsSync(ico)) return ico;
    const png = path.join(__dirname, 'assets', 'weasco.png');
    if (fs.existsSync(png)) return png;
    return undefined;
}

function createWindow() {
    const iconPath = getIconPath();
    const opts = {
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Weasco 4.0',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        },
        backgroundColor: '#0A0A0C',
        autoHideMenuBar: true,
        show: false
    };
    if (iconPath) opts.icon = iconPath;

    mainWindow = new BrowserWindow(opts);

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// IPC handler for opening external URLs safely
ipcMain.on('open-external', (event, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
        shell.openExternal(url);
    }
});

app.disableHardwareAcceleration();

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});