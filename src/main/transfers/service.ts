import path from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import type { ScanProgress, SourceKind, TransferDraft, TransferSource } from '../../shared/contract';
import { scanSources } from '../inventory/scanner';
import { inspectDestination } from './destination';
import { deleteTransfer, loadTransfer, newId, saveTransfer } from './store';

const MAX_NAME_LENGTH = 80;

function defaultName(): string {
  const date = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date());
  return `Traspaso del ${date}`;
}

export async function createTransfer(): Promise<TransferDraft> {
  const now = new Date().toISOString();
  return saveTransfer({
    id: newId(),
    name: defaultName(),
    createdAt: now,
    updatedAt: now,
    sources: [],
    inventory: null,
    destination: null,
    interview: null,
    analysis: null,
  });
}

export async function renameTransfer(id: string, name: unknown): Promise<TransferDraft> {
  if (typeof name !== 'string' || name.trim() === '') throw new Error('Invalid transfer name');
  const draft = await loadTransfer(id);
  return saveTransfer({ ...draft, name: name.trim().slice(0, MAX_NAME_LENGTH) });
}

export { deleteTransfer as removeTransfer };

/** Any change to the sources makes the previous inventory (and the interview and analysis based on it) stale. */
async function withSources(draft: TransferDraft, sources: TransferSource[]): Promise<TransferDraft> {
  const destination = draft.destination
    ? await inspectDestination(draft.destination.path, sources, null)
    : null;
  return saveTransfer({ ...draft, sources, inventory: null, destination, interview: null, analysis: null });
}

export async function addSources(window: BrowserWindow, id: string, kind: SourceKind): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  const result = await dialog.showOpenDialog(window, {
    title: kind === 'folder' ? 'Elige las carpetas de origen' : 'Elige los archivos de origen',
    buttonLabel: 'Agregar',
    properties: kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
    filters:
      kind === 'file'
        ? [
            { name: 'Hojas de cálculo', extensions: ['xlsx', 'xlsm', 'csv', 'tsv'] },
            { name: 'Todos los archivos', extensions: ['*'] },
          ]
        : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) return draft;

  const known = new Set(draft.sources.map((source) => source.path.toLowerCase()));
  const added: TransferSource[] = result.filePaths
    .filter((filePath) => !known.has(filePath.toLowerCase()))
    .map((filePath) => ({ id: newId(), kind, path: filePath, name: path.basename(filePath) || filePath }));

  return added.length > 0 ? withSources(draft, [...draft.sources, ...added]) : draft;
}

export async function removeSource(id: string, sourceId: unknown): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  return withSources(
    draft,
    draft.sources.filter((source) => source.id !== sourceId),
  );
}

export async function pickDestination(window: BrowserWindow, id: string): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  const result = await dialog.showOpenDialog(window, {
    title: 'Elige la carpeta de destino',
    buttonLabel: 'Usar esta carpeta',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return draft;

  const destination = await inspectDestination(
    result.filePaths[0],
    draft.sources,
    draft.inventory?.totals.bytes ?? null,
  );
  return saveTransfer({ ...draft, destination });
}

/** One scan at a time per transfer, so double clicks do not start parallel scans. */
const runningScans = new Map<string, Promise<TransferDraft>>();

export function scanTransfer(id: string, onProgress: (progress: ScanProgress) => void): Promise<TransferDraft> {
  const running = runningScans.get(id);
  if (running) return running;

  const job = (async () => {
    const draft = await loadTransfer(id);
    if (draft.sources.length === 0) throw new Error('No sources to scan');
    const inventory = await scanSources(draft.sources, (progress) => onProgress({ transferId: id, ...progress }));
    const destination = draft.destination
      ? await inspectDestination(draft.destination.path, draft.sources, inventory.totals.bytes)
      : null;
    // A new inventory means the interview and analysis describe old data.
    return saveTransfer({ ...draft, inventory, destination, interview: null, analysis: null });
  })().finally(() => runningScans.delete(id));

  runningScans.set(id, job);
  return job;
}
