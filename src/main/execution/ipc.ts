import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel, IpcEvent } from '../../shared/contract';
import { assertTrustedSender } from '../security';
import { assertTransferId } from '../transfers/store';
import { cancelExecution, openOutput, openReport, previewPlan, resetExecution, startExecution } from './service';

function withTransfer<Result>(handler: (event: IpcMainInvokeEvent, id: string) => Promise<Result>) {
  return (event: IpcMainInvokeEvent, id: unknown) => {
    assertTrustedSender(event);
    assertTransferId(id);
    return handler(event, id);
  };
}

export function registerExecutionHandlers(): void {
  ipcMain.handle(IpcChannel.ExecutionPreview, withTransfer((_event, id) => previewPlan(id)));
  ipcMain.handle(
    IpcChannel.ExecutionStart,
    withTransfer((event, id) =>
      startExecution(id, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcEvent.ExecutionProgress, { transferId: id, ...progress });
      }),
    ),
  );
  ipcMain.handle(IpcChannel.ExecutionCancel, withTransfer((_event, id) => cancelExecution(id)));
  ipcMain.handle(IpcChannel.ExecutionOpenOutput, withTransfer((_event, id) => openOutput(id)));
  ipcMain.handle(IpcChannel.ExecutionOpenReport, withTransfer((_event, id) => openReport(id)));
  ipcMain.handle(IpcChannel.ExecutionReset, withTransfer((_event, id) => resetExecution(id)));
}
