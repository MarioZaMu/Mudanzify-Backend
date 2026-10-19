import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { CONTRACT_VERSION, IpcChannel, type AppInfo } from '../shared/contract';
import { frontendDevUrl, isDev } from './env';
import { completeOnboarding, getOnboardingState, resetOnboarding } from './onboarding';
import { isThemePreference, isUserRole } from './settings';
import { getThemeState, setThemePreference } from './theme';

/** Rejects IPC calls that do not come from our own frontend. */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  const trusted = url.startsWith('file://') || (isDev && url.startsWith(frontendDevUrl));
  if (!trusted) throw new Error(`Untrusted IPC sender: ${url}`);
}

function getAppInfo(): AppInfo {
  return {
    name: 'Mudanzify',
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
    },
    contractVersion: CONTRACT_VERSION,
  };
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.AppGetInfo, (event) => {
    assertTrustedSender(event);
    return getAppInfo();
  });

  ipcMain.handle(IpcChannel.ThemeGet, (event) => {
    assertTrustedSender(event);
    return getThemeState();
  });

  ipcMain.handle(IpcChannel.ThemeSet, (event, preference: unknown) => {
    assertTrustedSender(event);
    // Never trust renderer input: validate before touching settings.
    if (!isThemePreference(preference)) throw new Error('Invalid theme preference');
    return setThemePreference(preference);
  });

  ipcMain.handle(IpcChannel.OnboardingGet, (event) => {
    assertTrustedSender(event);
    return getOnboardingState();
  });

  ipcMain.handle(IpcChannel.OnboardingComplete, (event, role: unknown) => {
    assertTrustedSender(event);
    if (!isUserRole(role)) throw new Error('Invalid user role');
    return completeOnboarding(role);
  });

  ipcMain.handle(IpcChannel.OnboardingReset, (event) => {
    assertTrustedSender(event);
    return resetOnboarding();
  });
}
