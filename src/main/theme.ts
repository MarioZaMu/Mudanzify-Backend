import { BrowserWindow, nativeTheme } from 'electron';
import { IpcEvent, type ThemePreference, type ThemeState } from '../shared/contract';
import { readSettings, writeSettings } from './settings';

const WINDOW_BACKGROUND = { light: '#FAF7F2', dark: '#1C1917' } as const;

export function getThemeState(): ThemeState {
  return {
    preference: nativeTheme.themeSource,
    resolved: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
  };
}

export function getWindowBackground(): string {
  return WINDOW_BACKGROUND[getThemeState().resolved];
}

/** Applies the stored preference before any window is created. */
export function initTheme(): void {
  nativeTheme.themeSource = readSettings().theme;

  // Fires when the preference changes or when the OS switches light/dark.
  nativeTheme.on('updated', () => {
    const state = getThemeState();
    for (const window of BrowserWindow.getAllWindows()) {
      window.setBackgroundColor(WINDOW_BACKGROUND[state.resolved]);
      window.webContents.send(IpcEvent.ThemeChanged, state);
    }
  });
}

export function setThemePreference(preference: ThemePreference): ThemeState {
  writeSettings({ theme: preference });
  nativeTheme.themeSource = preference;
  return getThemeState();
}
