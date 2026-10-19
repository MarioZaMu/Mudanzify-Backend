import { shell } from 'electron';
import { stat } from 'node:fs/promises';
import type {
  ExecutionPlan,
  ExecutionProgress,
  ItemResult,
  TransferDraft,
  TransferExecution,
} from '../../shared/contract';
import { absolutePathOf } from '../inventory/paths';
import { inspectDestination } from '../transfers/destination';
import { activeExecutions, loadTransfer, saveTransfer } from '../transfers/store';
import { copyVerified, createUniqueFolder, ensureParent, MAX_VERIFY_BYTES, resolveTarget, sha256 } from './copy';
import { writeManifest } from './manifest';
import { buildPlan } from './plan';
import { writeReport } from './report';
import { writeTransformedTable } from './tables';

type ProgressListener = (progress: Omit<ExecutionProgress, 'transferId'>) => void;

/** Error codes the renderer can show with a clear message. */
export const EXECUTION_ERROR = {
  notReady: 'EXECUTION_NOT_READY',
  destination: 'DESTINATION_UNAVAILABLE',
} as const;

/** Saved every few files so a crash loses little of the record. */
const SAVE_EVERY = 25;

const cancelRequests = new Set<string>();

function requireReady(draft: TransferDraft) {
  if (!draft.inventory || !draft.analysis?.confirmed || !draft.destination) throw new Error(EXECUTION_ERROR.notReady);
}

export async function previewPlan(id: string): Promise<ExecutionPlan> {
  const draft = await loadTransfer(id);
  requireReady(draft);
  return buildPlan(draft);
}

function totalsOf(results: ItemResult[], plan: ExecutionPlan): TransferExecution['totals'] {
  const count = (status: ItemResult['status']) => results.filter((result) => result.status === status).length;
  const bytes = results
    .filter((result) => result.status === 'copied' || result.status === 'transformed')
    .reduce((sum, result) => sum + (plan.items.find((item) => item.fileId === result.fileId)?.size ?? 0), 0);
  return { copied: count('copied'), transformed: count('transformed'), skipped: count('skipped'), failed: count('failed'), bytes };
}

/** Copies one plan item; the origin is only ever read. */
async function processItem(draft: TransferDraft, outputPath: string, item: ExecutionPlan['items'][number]): Promise<ItemResult> {
  const base = { fileId: item.fileId, target: item.target };
  if (item.action === 'skip' || !item.target) return { ...base, status: 'skipped', verified: false, sha256: null, error: null };

  const file = draft.inventory!.files.find((candidate) => candidate.id === item.fileId);
  const source = file ? absolutePathOf(draft.sources, file) : null;
  try {
    if (!file || !source) throw new Error('El archivo ya no está en el origen');
    const target = resolveTarget(outputPath, item.target);

    if (item.action === 'transform') {
      const table = draft.inventory!.tables.find((candidate) => candidate.fileId === item.fileId);
      if (!table) throw new Error('No se encontró la tabla');
      await ensureParent(target);
      await writeTransformedTable(source, target, table.format, table.fileName, item.changes);
      const { size } = await stat(target);
      const hash = size > MAX_VERIFY_BYTES ? null : await sha256(target);
      return { ...base, status: 'transformed', verified: true, sha256: hash, error: null };
    }

    const hash = await copyVerified(source, target);
    return { ...base, status: 'copied', verified: hash !== null, sha256: hash, error: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message =
      code === 'ENOENT'
        ? 'El archivo ya no está en el origen'
        : code === 'EACCES' || code === 'EPERM'
          ? 'Sin permiso para leer o escribir'
          : code === 'ENOSPC'
            ? 'No queda espacio en el destino'
            : error instanceof Error
              ? error.message
              : 'Error desconocido';
    return { ...base, status: 'failed', verified: false, sha256: null, error: message };
  }
}

export async function startExecution(id: string, onProgress: ProgressListener): Promise<TransferDraft> {
  if (activeExecutions.has(id)) throw new Error('The transfer is already running');
  activeExecutions.add(id);
  cancelRequests.delete(id);

  try {
    let draft = await loadTransfer(id);
    requireReady(draft);
    const plan = buildPlan(draft);

    // The destination may have changed since it was chosen: check it again right before writing.
    const destination = await inspectDestination(draft.destination!.path, draft.sources, plan.totals.bytes);
    if (destination.conflicts.length > 0) {
      await saveTransfer({ ...draft, destination });
      throw new Error(EXECUTION_ERROR.destination);
    }

    const outputPath = await createUniqueFolder(destination.path, plan.outputName);
    const results: ItemResult[] = plan.items.map((item) => ({
      fileId: item.fileId,
      target: item.target,
      status: 'pending',
      verified: false,
      sha256: null,
      error: null,
    }));
    let execution: TransferExecution = {
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      outputPath,
      reportPath: null,
      plan,
      results,
      totals: totalsOf([], plan),
    };
    draft = await saveTransfer({ ...draft, destination, execution });

    const bytesTotal = plan.totals.bytes;
    let bytesDone = 0;
    let cancelled = false;
    for (const [index, item] of plan.items.entries()) {
      if (cancelRequests.has(id)) {
        cancelled = true;
        break;
      }
      onProgress({ done: index, total: plan.items.length, bytesDone, bytesTotal, current: item.target });
      results[index] = await processItem(draft, outputPath, item);
      if (item.action !== 'skip') bytesDone += item.size;
      if ((index + 1) % SAVE_EVERY === 0) {
        execution = { ...execution, results: [...results], totals: totalsOf(results, plan) };
        draft = await saveTransfer({ ...draft, execution });
      }
    }
    onProgress({ done: plan.items.length, total: plan.items.length, bytesDone, bytesTotal, current: null });

    const totals = totalsOf(results, plan);
    execution = {
      ...execution,
      status: cancelled ? 'cancelled' : totals.failed > 0 ? 'failed' : 'done',
      finishedAt: new Date().toISOString(),
      results: [...results],
      totals,
    };
    try {
      execution = { ...execution, reportPath: await writeReport(draft, execution) };
    } catch {
      // The copy itself is done; the app still shows the report.
    }
    try {
      await writeManifest(draft, execution);
    } catch {
      // Without a manifest the receiver can still open the files, just not verify them.
    }
    return await saveTransfer({ ...draft, execution });
  } finally {
    activeExecutions.delete(id);
    cancelRequests.delete(id);
  }
}

export async function cancelExecution(id: string): Promise<void> {
  if (activeExecutions.has(id)) cancelRequests.add(id);
}

/** Opens a path Mudanzify itself created; the renderer never sends paths. */
async function openSaved(id: string, pick: (execution: TransferExecution) => string | null): Promise<void> {
  const draft = await loadTransfer(id);
  const target = draft.execution ? pick(draft.execution) : null;
  if (!target) throw new Error('Nothing to open');
  await stat(target);
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
}

export const openOutput = (id: string) => openSaved(id, (execution) => execution.outputPath);
export const openReport = (id: string) => openSaved(id, (execution) => execution.reportPath);

export async function resetExecution(id: string): Promise<TransferDraft> {
  if (activeExecutions.has(id)) throw new Error('The transfer is running');
  const draft = await loadTransfer(id);
  return saveTransfer({ ...draft, execution: null });
}
