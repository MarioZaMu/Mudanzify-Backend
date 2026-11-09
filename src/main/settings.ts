import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { LANGUAGES, THEME_PREFERENCES, USER_ROLES, type Language, type ThemePreference, type UserRole } from '../shared/contract';

/** User preferences persisted as JSON in the OS user data folder. */
export interface Settings {
  theme: ThemePreference;
  language: Language;
  onboardingCompleted: boolean;
  role: UserRole | null;
}

/** First launch follows the OS language; anything but Spanish falls back to English. */
const systemLanguage = (): Language => (app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en');

const DEFAULT_SETTINGS: Omit<Settings, 'language'> = { theme: 'system', onboardingCompleted: false, role: null };

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function readSettings(): Settings {
  try {
    const raw = JSON.parse(readFileSync(settingsPath(), 'utf8')) as Partial<Settings> | null;
    // Validate field by field so a hand-edited or corrupt file never breaks the app.
    return {
      theme: isThemePreference(raw?.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
      language: isLanguage(raw?.language) ? raw.language : systemLanguage(),
      onboardingCompleted: raw?.onboardingCompleted === true,
      role: isUserRole(raw?.role) ? raw.role : null,
    };
  } catch {
    // Missing or corrupt file: fall back to defaults instead of crashing.
    return { ...DEFAULT_SETTINGS, language: systemLanguage() };
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch };
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
