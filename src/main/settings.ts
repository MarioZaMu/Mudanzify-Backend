import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { THEME_PREFERENCES, type ThemePreference } from '../shared/contract';

/** User preferences persisted as JSON in the OS user data folder. */
export interface Settings {
  theme: ThemePreference;
}

const DEFAULT_SETTINGS: Settings = { theme: 'system' };

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function readSettings(): Settings {
  try {
    const raw: unknown = JSON.parse(readFileSync(settingsPath(), 'utf8'));
    const theme = (raw as Partial<Settings> | null)?.theme;
    return { theme: isThemePreference(theme) ? theme : DEFAULT_SETTINGS.theme };
  } catch {
    // Missing or corrupt file: fall back to defaults instead of crashing.
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch };
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
