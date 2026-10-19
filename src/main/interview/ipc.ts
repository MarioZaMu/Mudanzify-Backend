import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IpcChannel } from '../../shared/contract';
import { getAiStatus } from '../ai/config';
import { assertTrustedSender } from '../security';
import { assertTransferId } from '../transfers/store';
import { answerQuestion, finishInterview, resetInterview, reviewSuggestion, startInterview } from './service';

function withTransfer<Args extends unknown[], Result>(handler: (id: string, ...args: Args) => Promise<Result>) {
  return (event: IpcMainInvokeEvent, id: unknown, ...args: Args) => {
    assertTrustedSender(event);
    assertTransferId(id);
    return handler(id, ...args);
  };
}

export function registerInterviewHandlers(): void {
  ipcMain.handle(IpcChannel.AiGetStatus, (event) => {
    assertTrustedSender(event);
    return getAiStatus();
  });

  ipcMain.handle(IpcChannel.InterviewStart, withTransfer((id) => startInterview(id)));
  ipcMain.handle(IpcChannel.InterviewAnswer, withTransfer((id, answer: unknown) => answerQuestion(id, answer)));
  ipcMain.handle(
    IpcChannel.InterviewReview,
    withTransfer((id, suggestionId: unknown, decision: unknown) => reviewSuggestion(id, suggestionId, decision)),
  );
  ipcMain.handle(IpcChannel.InterviewFinish, withTransfer((id) => finishInterview(id)));
  ipcMain.handle(IpcChannel.InterviewReset, withTransfer((id) => resetInterview(id)));
}
