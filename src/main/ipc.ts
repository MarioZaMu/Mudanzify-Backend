import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { CONTRACT_VERSION, IpcChannel, type AppInfo } from '../shared/contract';
import { frontendDevUrl, isDev } from './env';

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
}
