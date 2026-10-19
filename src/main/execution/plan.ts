import {
  FILE_CATEGORIES,
  MANIFEST_FILE_NAME,
  RECEIPT_FILE_NAME,
  REPORT_FILE_NAME,
  type ExecutionPlan,
  type PlanItem,
  type SkipReason,
  type TableChange,
  type TransferAnalysis,
  type TransferDraft,
} from '../../shared/contract';
import { FULL_CSV_MAX_BYTES, XLSX_MAX_BYTES } from '../inventory/tables';

/** Characters Windows does not allow in file or folder names. */
const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

export function safeName(name: string): string {
  const cleaned = name.replace(INVALID_NAME, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return cleaned || 'Traspaso';
}

/** "Fotos", "Fotos (2)", "Fotos (3)"… keeping the extension of files. */
export function numbered(name: string, index: number): string {
  if (index < 2) return name;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${index})${name.slice(dot)}` : `${name} (${index})`;
}

export const outputNameFor = (draft: TransferDraft) => `Mudanzify - ${safeName(draft.name)}`;

/** Each source becomes one entry of the output folder; repeated names get a number. */
function rootNames(draft: TransferDraft): Map<string, string> {
  // The report, manifest and receipt are written next to the sources, so their names are taken.
  const used = new Set([REPORT_FILE_NAME, MANIFEST_FILE_NAME, RECEIPT_FILE_NAME].map((name) => name.toLowerCase()));
  const roots = new Map<string, string>();
  for (const source of draft.sources) {
    const base = safeName(source.name);
    let index = 1;
    while (used.has(numbered(base, index).toLowerCase())) index++;
    const name = numbered(base, index);
    used.add(name.toLowerCase());
    roots.set(source.id, name);
  }
  return roots;
}

/** Files the sender chose to leave out (duplicates and junk), with the reason. */
function skippedFiles(analysis: TransferAnalysis): Map<string, SkipReason> {
  const skipped = new Map<string, SkipReason>();
  for (const finding of analysis.findings) {
    if (finding.kind === 'duplicate-files' && finding.choice === 'keep-one') {
      for (const fileId of finding.fileIds) if (fileId !== finding.keepFileId) skipped.set(fileId, 'duplicate');
    }
    if (finding.kind === 'junk-files' && finding.choice === 'exclude') {
      for (const fileId of finding.fileIds) if (!skipped.has(fileId)) skipped.set(fileId, 'junk');
    }
  }
  return skipped;
}

/** Changes to write into the copy of each table, from the findings and the accepted column mappings. */
function tableChanges(analysis: TransferAnalysis): Map<string, TableChange[]> {
  const changes = new Map<string, TableChange[]>();
  const add = (fileId: string, change: TableChange) => changes.set(fileId, [...(changes.get(fileId) ?? []), change]);

  for (const finding of analysis.findings) {
    if (finding.kind === 'sensitive-column') {
      const { fileId, sheet } = finding.table;
      if (finding.choice === 'mask') add(fileId, { kind: 'mask', sheet, column: finding.column, type: finding.sensitiveType });
      if (finding.choice === 'exclude') add(fileId, { kind: 'drop-column', sheet, column: finding.column });
    }
    if (finding.kind === 'duplicate-rows' && finding.choice === 'remove-duplicates') {
      add(finding.table.fileId, { kind: 'remove-duplicates', sheet: finding.table.sheet, rows: finding.duplicateRows });
    }
  }
  for (const mapping of analysis.mappings) {
    if (mapping.status !== 'accepted' && mapping.status !== 'edited') continue;
    for (const source of mapping.sources) {
      if (source.column !== mapping.standardName) {
        add(source.fileId, { kind: 'rename', sheet: source.sheet, column: source.column, to: mapping.standardName });
      }
    }
  }
  return changes;
}

/**
 * Turns the confirmed review into one action per file. It only reads the saved
 * draft: nothing is written until the sender starts the transfer.
 */
export function buildPlan(draft: TransferDraft): ExecutionPlan {
  const { inventory, analysis } = draft;
  if (!inventory || !analysis) throw new Error('The plan needs an inventory and an analysis');

  const roots = rootNames(draft);
  const skipped = skippedFiles(analysis);
  const changes = tableChanges(analysis);
  const order = [...analysis.priority.order, ...FILE_CATEGORIES.filter((c) => !analysis.priority.order.includes(c))];

  const items: PlanItem[] = inventory.files.map((file) => {
    const source = draft.sources.find((candidate) => candidate.id === file.sourceId);
    const root = roots.get(file.sourceId) ?? safeName(file.sourceId);
    const target = source?.kind === 'file' ? root : `${root}/${file.relativePath}`;
    const fileChanges = changes.get(file.id) ?? [];
    const table = inventory.tables.find((candidate) => candidate.fileId === file.id);

    let reason = skipped.get(file.id) ?? null;
    // A table that needs changes but is too large to rewrite is left out, never copied unprotected.
    if (!reason && fileChanges.length > 0 && table) {
      const limit = table.format === 'csv' ? FULL_CSV_MAX_BYTES : XLSX_MAX_BYTES;
      if (file.size > limit) reason = 'too-large';
    }

    return {
      fileId: file.id,
      target: reason ? null : target,
      category: file.category,
      size: file.size,
      action: reason ? 'skip' : fileChanges.length > 0 && table ? 'transform' : 'copy',
      reason,
      changes: reason ? [] : fileChanges,
    };
  });

  items.sort(
    (a, b) =>
      order.indexOf(a.category) - order.indexOf(b.category) || (a.target ?? '~').localeCompare(b.target ?? '~', 'es'),
  );

  const count = (action: PlanItem['action']) => items.filter((item) => item.action === action).length;
  return {
    outputName: outputNameFor(draft),
    order: order.filter((category) => items.some((item) => item.category === category)),
    items,
    totals: {
      copy: count('copy'),
      transform: count('transform'),
      skip: count('skip'),
      bytes: items.filter((item) => item.action !== 'skip').reduce((sum, item) => sum + item.size, 0),
    },
  };
}
