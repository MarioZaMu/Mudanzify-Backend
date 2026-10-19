import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel, IpcEvent } from '../../shared/contract';
import { assertTrustedSender } from '../security';
import {
  confirmReception,
  openFolder,
  openReceipt,
  openReception,
  openReport,
  reopenReception,
  reviewBox,
  verifyReception,
} from './service';
import { assertReceptionId, deleteReception, listReceptions, loadReception } from './store';

function withReception<Args extends unknown[], Result>(
  handler: (event: IpcMainInvokeEvent, id: string, ...args: Args) => Promise<Result>,
) {
  return (event: IpcMainInvokeEvent, id: unknown, ...args: Args) => {
    assertTrustedSender(event);
    assertReceptionId(id);
    return handler(event, id, ...args);
  };
}

export function registerReceptionHandlers(): void {
  ipcMain.handle(IpcChannel.ReceptionsList, (event) => {
    assertTrustedSender(event);
    return listReceptions();
  });
  ipcMain.handle(IpcChannel.ReceptionsOpen, (event) => {
    assertTrustedSender(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) throw new Error('No window for IPC sender');
    return openReception(window);
  });
  ipcMain.handle(IpcChannel.ReceptionsGet, withReception((_event, id) => loadReception(id)));
  ipcMain.handle(IpcChannel.ReceptionsRemove, withReception((_event, id) => deleteReception(id)));
  ipcMain.handle(
    IpcChannel.ReceptionsVerify,
    withReception((event, id) =>
      verifyReception(id, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcEvent.VerifyProgress, { receptionId: id, ...progress });
      }),
    ),
  );
  ipcMain.handle(
    IpcChannel.ReceptionsReviewBox,
    withReception((_event, id, category: unknown, review: unknown) => reviewBox(id, category, review)),
  );
  ipcMain.handle(IpcChannel.ReceptionsConfirm, withReception((_event, id) => confirmReception(id)));
  ipcMain.handle(IpcChannel.ReceptionsReopen, withReception((_event, id) => reopenReception(id)));
  ipcMain.handle(IpcChannel.ReceptionsOpenFolder, withReception((_event, id) => openFolder(id)));
  ipcMain.handle(IpcChannel.ReceptionsOpenReport, withReception((_event, id) => openReport(id)));
  ipcMain.handle(IpcChannel.ReceptionsOpenReceipt, withReception((_event, id) => openReceipt(id)));
}
