import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { TransferDraft, TransferSummary } from '../../shared/contract';

/** Each transfer is one JSON file in <userData>/transfers/<id>.json. */
const transfersDir = () => path.join(app.getPath('userData'), 'transfers');

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ids come from the renderer: validate them so they can never escape the folder. */
export function assertTransferId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('Invalid transfer id');
}

const fileFor = (id: string) => path.join(transfersDir(), `${id}.json`);

export function newId(): string {
  return randomUUID();
}

export async function saveTransfer(draft: TransferDraft): Promise<TransferDraft> {
  await mkdir(transfersDir(), { recursive: true });
  const next = { ...draft, updatedAt: new Date().toISOString() };
  // Write to a temp file first and rename, so a crash never leaves a half-written JSON.
  const target = fileFor(draft.id);
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(next), 'utf8');
  await rename(temp, target);
  return next;
}

/** Transfers whose copy is running in this process right now. */
export const activeExecutions = new Set<string>();

export async function loadTransfer(id: string): Promise<TransferDraft> {
  assertTransferId(id);
  const raw = await readFile(fileFor(id), 'utf8');
  const draft = JSON.parse(raw) as TransferDraft;
  // Drafts saved before phases 5 to 7 lack the newer fields.
  let execution = draft.execution ?? null;
  // A run saved as "running" that is not running now was cut short (the app closed).
  if (execution?.status === 'running' && !activeExecutions.has(id)) {
    execution = { ...execution, status: 'cancelled' };
  }
  return { ...draft, interview: draft.interview ?? null, analysis: draft.analysis ?? null, execution };
}

export async function deleteTransfer(id: string): Promise<void> {
  assertTransferId(id);
  await rm(fileFor(id), { force: true });
}

export function toSummary(draft: TransferDraft): TransferSummary {
  return {
    id: draft.id,
    name: draft.name,
    updatedAt: draft.updatedAt,
    sourceCount: draft.sources.length,
    fileCount: draft.inventory?.totals.files ?? null,
    totalBytes: draft.inventory?.totals.bytes ?? null,
    hasDestination: draft.destination !== null,
  };
}

export async function listTransfers(): Promise<TransferSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(transfersDir());
  } catch {
    return [];
  }

  const summaries: TransferSummary[] = [];
  for (const entry of entries) {
    const id = entry.replace(/\.json$/, '');
    if (!entry.endsWith('.json') || !ID_PATTERN.test(id)) continue;
    try {
      summaries.push(toSummary(await loadTransfer(id)));
    } catch {
      // Skip unreadable records instead of failing the whole list.
    }
  }
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
