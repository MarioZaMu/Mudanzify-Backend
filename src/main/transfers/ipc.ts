import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel, IpcEvent, type SourceKind } from '../../shared/contract';
import { assertTrustedSender } from '../security';
import {
  addSources,
  createTransfer,
  pickDestination,
  removeSource,
  removeTransfer,
  renameTransfer,
  scanTransfer,
} from './service';
import { assertTransferId, listTransfers, loadTransfer } from './store';

const isSourceKind = (value: unknown): value is SourceKind => value === 'folder' || value === 'file';

function windowFor(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('No window for IPC sender');
  return window;
}

/** Wraps a handler that receives a transfer id with sender and id validation. */
function withTransfer<Args extends unknown[], Result>(
  handler: (event: IpcMainInvokeEvent, id: string, ...args: Args) => Promise<Result>,
) {
  return (event: IpcMainInvokeEvent, id: unknown, ...args: Args) => {
    assertTrustedSender(event);
    assertTransferId(id);
    return handler(event, id, ...args);
  };
}

export function registerTransferHandlers(): void {
  ipcMain.handle(IpcChannel.TransfersList, (event) => {
    assertTrustedSender(event);
    return listTransfers();
  });

  ipcMain.handle(IpcChannel.TransfersCreate, (event) => {
    assertTrustedSender(event);
    return createTransfer();
  });

  ipcMain.handle(IpcChannel.TransfersGet, withTransfer((_event, id) => loadTransfer(id)));
  ipcMain.handle(IpcChannel.TransfersRename, withTransfer((_event, id, name: unknown) => renameTransfer(id, name)));
  ipcMain.handle(IpcChannel.TransfersRemove, withTransfer((_event, id) => removeTransfer(id)));

  ipcMain.handle(
    IpcChannel.TransfersAddSources,
    withTransfer((event, id, kind: unknown) => {
      if (!isSourceKind(kind)) throw new Error('Invalid source kind');
      return addSources(windowFor(event), id, kind);
    }),
  );

  ipcMain.handle(
    IpcChannel.TransfersRemoveSource,
    withTransfer((_event, id, sourceId: unknown) => removeSource(id, sourceId)),
  );

  ipcMain.handle(
    IpcChannel.TransfersPickDestination,
    withTransfer((event, id) => pickDestination(windowFor(event), id)),
  );

  ipcMain.handle(
    IpcChannel.TransfersScan,
    withTransfer((event, id) =>
      scanTransfer(id, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcEvent.ScanProgress, progress);
      }),
    ),
  );
}
