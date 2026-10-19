/**
 * IPC contract shared between the backend (main + preload) and the frontend.
 *
 * This file is the single source of truth. The frontend keeps a synced copy
 * (see `npm run sync:contract` in mudanzify-frontend), so it must stay
 * dependency-free: only types and constants, no Node or Electron imports.
 */

export const CONTRACT_VERSION = 3;

/** Name of the object the preload script exposes on `window`. */
export const BRIDGE_KEY = 'mudanzify';

/** Every IPC channel the renderer is allowed to invoke. */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  ThemeGet: 'theme:get',
  ThemeSet: 'theme:set',
  OnboardingGet: 'onboarding:get',
  OnboardingComplete: 'onboarding:complete',
  OnboardingReset: 'onboarding:reset',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

/** Channels the backend uses to push events to the renderer. */
export const IpcEvent = {
  ThemeChanged: 'theme:changed',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  contractVersion: number;
}

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface ThemeState {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is actually shown after resolving "system". */
  resolved: 'light' | 'dark';
}

/** Sender prepares and hands over data; receiver reviews and confirms it. */
export const USER_ROLES = ['sender', 'receiver'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface OnboardingState {
  completed: boolean;
  role: UserRole | null;
}

/** API available to the renderer as `window.mudanzify`. */
export interface MudanzifyBridge {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  theme: {
    get(): Promise<ThemeState>;
    set(preference: ThemePreference): Promise<ThemeState>;
    /** Subscribes to theme changes; returns an unsubscribe function. */
    onChange(listener: (state: ThemeState) => void): () => void;
  };
  onboarding: {
    get(): Promise<OnboardingState>;
    /** Marks the presentation as seen and stores the chosen role. */
    complete(role: UserRole): Promise<OnboardingState>;
    /** Shows the presentation again on next load (keeps nothing else). */
    reset(): Promise<OnboardingState>;
  };
}
