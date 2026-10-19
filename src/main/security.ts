import type { IpcMainInvokeEvent } from 'electron';
import { frontendDevUrl, isDev } from './env';

/** Rejects IPC calls that do not come from our own frontend. */
export function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  const trusted = url.startsWith('file://') || (isDev && url.startsWith(frontendDevUrl));
  if (!trusted) throw new Error(`Untrusted IPC sender: ${url}`);
}
