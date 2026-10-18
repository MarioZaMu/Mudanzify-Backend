import { app, BrowserWindow } from 'electron';
import './env';
import { registerIpcHandlers } from './ipc';
import { initTheme } from './theme';
import { createMainWindow } from './window';

// One Mudanzify window at a time: a second launch focuses the existing one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.mariozamu.mudanzify');
    initTheme();
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
