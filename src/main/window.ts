import { BrowserWindow, shell } from 'electron';
import { appIconPath, frontendDevUrl, isDev, preloadPath, rendererIndexPath } from './env';
import { getWindowBackground } from './theme';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Mudanzify',
    icon: appIconPath,
    backgroundColor: getWindowBackground(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  // Avoid a white flash: only show once the first frame is painted.
  window.once('ready-to-show', () => window.show());

  hardenNavigation(window);

  if (isDev) {
    void window.loadURL(frontendDevUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(rendererIndexPath);
  }

  return window;
}

/** The renderer may never navigate away or open new Electron windows. */
function hardenNavigation(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev && url.startsWith(frontendDevUrl);
    if (!allowed) event.preventDefault();
  });
}
