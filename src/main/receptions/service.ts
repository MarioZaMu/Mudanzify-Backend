import { dialog, shell, type BrowserWindow } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import {
  FILE_CATEGORIES,
  REPORT_FILE_NAME,
  type BoxReview,
  type FileCategory,
  type Reception,
  type ReceptionBox,
  type VerifyProgress,
} from '../../shared/contract';
import { cleanText } from '../ai/sanitize';
import { newId } from '../transfers/store';
import { readManifest } from './manifest';
import { writeReceipt } from './receipt';
import { loadReception, saveReception } from './store';
import { checkFile, findExtras } from './verify';

type ProgressListener = (progress: Omit<VerifyProgress, 'receptionId'>) => void;

/** One box per category in the sender's packing order; decisions start pending. */
function buildBoxes(reception: Pick<Reception, 'files'>, order: FileCategory[]): ReceptionBox[] {
  const categories = [...order, ...FILE_CATEGORIES.filter((c) => !order.includes(c))].filter((category) =>
    reception.files.some((file) => file.category === category),
  );
  return categories.map((category) => {
    const files = reception.files.filter((file) => file.category === category);
    return {
      category,
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
      issues: files.filter((file) => file.check === 'missing' || file.check === 'changed').length,
      decision: 'pending',
      comment: '',
    };
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/** The folder comes from a native dialog: the renderer never sends paths. */
export async function openReception(window: BrowserWindow): Promise<Reception | null> {
  const result = await dialog.showOpenDialog(window, {
    title: 'Elige la carpeta que recibiste',
    buttonLabel: 'Abrir',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const folderPath = result.filePaths[0];
  const manifest = await readManifest(folderPath);
  const files = manifest.files.map((file) => ({ ...file, check: null }));
  const reception: Reception = {
    id: newId(),
    openedAt: new Date().toISOString(),
    folderPath,
    folderName: path.basename(folderPath),
    transferName: manifest.transferName,
    sentAt: manifest.sentAt,
    sendStatus: manifest.status,
    criteria: manifest.criteria,
    notes: manifest.notes,
    skipped: manifest.skipped,
    files,
    extras: [],
    hasReport: await exists(path.join(folderPath, REPORT_FILE_NAME)),
    verifiedAt: null,
    boxes: buildBoxes({ files }, manifest.order),
    confirmedAt: null,
    receiptPath: null,
  };
  return saveReception(reception);
}

const verifying = new Set<string>();

/** Recomputes every fingerprint (read-only); box decisions start over with the new results. */
export async function verifyReception(id: string, onProgress: ProgressListener): Promise<Reception> {
  if (verifying.has(id)) throw new Error('Already verifying');
  verifying.add(id);
  try {
    const reception = await loadReception(id);
    const files = [...reception.files];
    for (const [index, file] of files.entries()) {
      onProgress({ done: index, total: files.length, current: file.path });
      files[index] = { ...file, check: await checkFile(reception.folderPath, file) };
    }
    onProgress({ done: files.length, total: files.length, current: null });

    const extras = await findExtras(reception.folderPath, new Set(files.map((file) => file.path.toLowerCase()))).catch(() => []);
    const order = reception.boxes.map((box) => box.category);
    return saveReception({
      ...reception,
      files,
      extras,
      verifiedAt: new Date().toISOString(),
      boxes: buildBoxes({ files }, order),
      confirmedAt: null,
    });
  } finally {
    verifying.delete(id);
  }
}

export async function reviewBox(id: string, category: unknown, review: unknown): Promise<Reception> {
  const reception = await loadReception(id);
  if (!reception.verifiedAt) throw new Error('Verify the reception first');
  if (reception.confirmedAt) throw new Error('The reception is confirmed');
  if (!reception.boxes.some((box) => box.category === category)) throw new Error('Unknown box');
  if (typeof review !== 'object' || review === null) throw new Error('Invalid review');

  const action = (review as BoxReview).action;
  const boxes = reception.boxes.map((box): ReceptionBox => {
    if (box.category !== category) return box;
    if (action === 'accept') return { ...box, decision: 'accepted', comment: '' };
    if (action === 'undo') return { ...box, decision: 'pending', comment: '' };
    if (action === 'report') {
      const comment = cleanText((review as { comment?: unknown }).comment, 500);
      if (!comment) throw new Error('A report needs a comment');
      return { ...box, decision: 'reported', comment };
    }
    throw new Error('Invalid review');
  });
  return saveReception({ ...reception, boxes });
}

export async function confirmReception(id: string): Promise<Reception> {
  const reception = await loadReception(id);
  if (!reception.verifiedAt) throw new Error('Verify the reception first');
  if (reception.boxes.some((box) => box.decision === 'pending')) throw new Error('Every box must be decided first');

  let confirmed: Reception = { ...reception, confirmedAt: new Date().toISOString(), receiptPath: null };
  try {
    confirmed = { ...confirmed, receiptPath: await writeReceipt(confirmed) };
  } catch {
    // A read-only folder (e.g. a shared drive): the confirmation still counts in this app.
  }
  return saveReception(confirmed);
}

export async function reopenReception(id: string): Promise<Reception> {
  const reception = await loadReception(id);
  return saveReception({ ...reception, confirmedAt: null });
}

/** Opens paths Mudanzify knows about; nothing comes from the renderer. */
async function openPath(target: string | null): Promise<void> {
  if (!target || !(await exists(target))) throw new Error('Nothing to open');
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
}

export const openFolder = async (id: string) => openPath((await loadReception(id)).folderPath);
export const openReport = async (id: string) => {
  const reception = await loadReception(id);
  return openPath(reception.hasReport ? path.join(reception.folderPath, REPORT_FILE_NAME) : null);
};
export const openReceipt = async (id: string) => openPath((await loadReception(id)).receiptPath);
