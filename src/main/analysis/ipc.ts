import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel, IpcEvent } from '../../shared/contract';
import { assertTrustedSender } from '../security';
import { assertTransferId } from '../transfers/store';
import { confirmAnalysis, decideFinding, resetAnalysis, reviewMapping, runAnalysis, setPriority } from './service';

function withTransfer<Args extends unknown[], Result>(
  handler: (event: IpcMainInvokeEvent, id: string, ...args: Args) => Promise<Result>,
) {
  return (event: IpcMainInvokeEvent, id: unknown, ...args: Args) => {
    assertTrustedSender(event);
    assertTransferId(id);
    return handler(event, id, ...args);
  };
}

export function registerAnalysisHandlers(): void {
  ipcMain.handle(
    IpcChannel.AnalysisRun,
    withTransfer((event, id) =>
      runAnalysis(id, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IpcEvent.AnalysisProgress, { transferId: id, ...progress });
      }),
    ),
  );
  ipcMain.handle(
    IpcChannel.AnalysisDecideFinding,
    withTransfer((_event, id, findingId: unknown, decision: unknown) => decideFinding(id, findingId, decision)),
  );
  ipcMain.handle(
    IpcChannel.AnalysisReviewMapping,
    withTransfer((_event, id, mappingId: unknown, decision: unknown) => reviewMapping(id, mappingId, decision)),
  );
  ipcMain.handle(IpcChannel.AnalysisSetPriority, withTransfer((_event, id, decision: unknown) => setPriority(id, decision)));
  ipcMain.handle(IpcChannel.AnalysisConfirm, withTransfer((_event, id) => confirmAnalysis(id)));
  ipcMain.handle(IpcChannel.AnalysisReset, withTransfer((_event, id) => resetAnalysis(id)));
}
