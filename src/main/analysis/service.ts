import {
  FINDING_CHOICES,
  type AnalysisProgress,
  type ColumnMapping,
  type FileCategory,
  type Finding,
  type FindingChoice,
  type FindingDecision,
  type MappingDecision,
  type PriorityDecision,
  type PriorityPlan,
  type TransferAnalysis,
  type TransferDraft,
} from '../../shared/contract';
import { getAiStatus, getApiKey, getModel } from '../ai/config';
import { cleanText } from '../ai/sanitize';
import { absolutePathOf } from '../inventory/paths';
import { readTable } from '../inventory/tables';
import { loadTransfer, newId, saveTransfer } from '../transfers/store';
import { createDemoPlanner } from './demoPlanner';
import { findDuplicateFiles } from './duplicates';
import { buildFindings, type TableResult } from './findings';
import { createGeminiPlanner } from './geminiPlanner';
import { buildPlanInput, sanitizePlan, type Planner } from './plan';
import { checkTable } from './tableChecks';

type ProgressListener = (progress: Omit<AnalysisProgress, 'transferId'>) => void;

function plannerFor(mode: TransferAnalysis['mode']): Planner {
  const apiKey = getApiKey();
  return mode === 'ai' && apiKey ? createGeminiPlanner(apiKey, getModel()) : createDemoPlanner();
}

/** One analysis at a time per transfer, so double clicks never run it twice. */
const running = new Map<string, Promise<TransferDraft>>();

function exclusive(id: string, job: () => Promise<TransferDraft>): Promise<TransferDraft> {
  const current = running.get(id);
  if (current) return current;
  const next = job().finally(() => running.delete(id));
  running.set(id, next);
  return next;
}

/** Reads every table of the inventory (read-only) and checks it in memory. */
async function checkTables(draft: TransferDraft, onProgress: ProgressListener) {
  const inventory = draft.inventory!;
  const results: TableResult[] = [];
  const skipped: string[] = [];

  for (const [index, table] of inventory.tables.entries()) {
    onProgress({ phase: 'tables', done: index, total: inventory.tables.length });
    const file = inventory.files.find((candidate) => candidate.id === table.fileId);
    const filePath = file ? absolutePathOf(draft.sources, file) : null;
    try {
      if (!filePath) throw new Error('Missing file');
      for (const data of await readTable(filePath, table.format, table.fileName)) {
        if (data.truncated) skipped.push(table.fileName);
        results.push({ table: { fileId: table.fileId, sheet: data.sheet }, check: checkTable(data) });
      }
    } catch {
      // Too large, damaged or moved: report it instead of guessing.
      skipped.push(table.fileName);
    }
  }
  onProgress({ phase: 'tables', done: inventory.tables.length, total: inventory.tables.length });
  return { results, skipped: [...new Set(skipped)] };
}

export function runAnalysis(id: string, onProgress: ProgressListener): Promise<TransferDraft> {
  return exclusive(id, async () => {
    const draft = await loadTransfer(id);
    if (!draft.inventory) throw new Error('The analysis needs an inventory');
    if (draft.interview?.status !== 'done') throw new Error('The analysis needs a finished interview');

    const duplicates = await findDuplicateFiles(draft.inventory.files, draft.sources, (done, total) =>
      onProgress({ phase: 'hashing', done, total }),
    );
    const { results, skipped } = await checkTables(draft, onProgress);
    const findings = buildFindings(draft.inventory, draft.interview, duplicates, results);

    onProgress({ phase: 'ai', done: 0, total: 1 });
    const { mode } = getAiStatus();
    const input = buildPlanInput(draft.inventory, draft.interview, results, findings);
    const plan = sanitizePlan(await plannerFor(mode).propose(input), input);
    onProgress({ phase: 'ai', done: 1, total: 1 });

    const analysis: TransferAnalysis = {
      analyzedAt: new Date().toISOString(),
      mode,
      summary: plan.summary,
      findings,
      mappings: plan.mappings.map((mapping) => ({ id: newId(), ...mapping, status: 'pending', original: null })),
      priority: { order: plan.priority.order, suggested: plan.priority.order, reasons: plan.priority.reasons, status: 'pending' },
      skippedTables: skipped,
      confirmed: false,
    };
    return saveTransfer({ ...draft, analysis });
  });
}

function requireAnalysis(draft: TransferDraft): TransferAnalysis {
  if (!draft.analysis) throw new Error('The analysis has not run');
  return draft.analysis;
}

const isDecision = (value: unknown): value is { action: string } =>
  typeof value === 'object' && value !== null && typeof (value as { action?: unknown }).action === 'string';

function applyFindingDecision(finding: Finding, decision: unknown): Finding {
  if (!isDecision(decision)) throw new Error('Invalid decision');
  const choices = FINDING_CHOICES[finding.kind];

  switch ((decision as FindingDecision).action) {
    case 'accept':
      return { ...finding, choice: finding.suggested, status: 'accepted' };
    case 'change': {
      const choice = (decision as { choice?: unknown }).choice as FindingChoice;
      if (!choices.includes(choice)) throw new Error('Invalid choice');
      return { ...finding, choice, status: choice === finding.suggested ? 'accepted' : 'changed' };
    }
    case 'dismiss':
      // The last option of every kind leaves the data exactly as it is.
      return { ...finding, choice: choices[choices.length - 1], status: 'dismissed' };
    case 'undo':
      return { ...finding, choice: null, status: 'pending' };
    default:
      throw new Error('Invalid decision');
  }
}

function applyMappingDecision(mapping: ColumnMapping, decision: unknown): ColumnMapping {
  if (!isDecision(decision)) throw new Error('Invalid decision');

  switch ((decision as MappingDecision).action) {
    case 'accept':
      return { ...mapping, status: mapping.original ? 'edited' : 'accepted' };
    case 'reject':
      return { ...mapping, status: 'rejected' };
    case 'undo':
      return mapping.original
        ? { ...mapping, standardName: mapping.original, status: 'pending', original: null }
        : { ...mapping, status: 'pending' };
    case 'edit': {
      const standardName = cleanText((decision as { standardName?: unknown }).standardName, 60);
      if (!standardName) throw new Error('A column needs a name');
      return { ...mapping, standardName, status: 'edited', original: mapping.original ?? mapping.standardName };
    }
    default:
      throw new Error('Invalid decision');
  }
}

const sameOrder = (a: FileCategory[], b: FileCategory[]) => a.length === b.length && a.every((item, i) => item === b[i]);

function applyPriorityDecision(priority: PriorityPlan, decision: unknown): PriorityPlan {
  if (!isDecision(decision)) throw new Error('Invalid decision');

  switch ((decision as PriorityDecision).action) {
    case 'accept':
      return { ...priority, status: sameOrder(priority.order, priority.suggested) ? 'accepted' : 'edited' };
    case 'reorder': {
      const order = (decision as { order?: unknown }).order;
      // Only a permutation of the same boxes is allowed.
      if (
        !Array.isArray(order) ||
        order.length !== priority.order.length ||
        new Set(order).size !== order.length ||
        !order.every((category) => priority.order.includes(category))
      ) {
        throw new Error('Invalid order');
      }
      return { ...priority, order: order as FileCategory[], status: 'edited' };
    }
    case 'reset':
      return { ...priority, order: priority.suggested, status: 'pending' };
    default:
      throw new Error('Invalid decision');
  }
}

/** Every change reopens the plan: a confirmed plan must match what the sender saw. */
async function update(id: string, change: (analysis: TransferAnalysis) => TransferAnalysis): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  const analysis = change(requireAnalysis(draft));
  return saveTransfer({ ...draft, analysis: { ...analysis, confirmed: false } });
}

export function decideFinding(id: string, findingId: unknown, decision: unknown): Promise<TransferDraft> {
  return update(id, (analysis) => {
    if (!analysis.findings.some((finding) => finding.id === findingId)) throw new Error('Unknown finding');
    const findings = analysis.findings.map((finding) =>
      finding.id === findingId ? applyFindingDecision(finding, decision) : finding,
    );
    return { ...analysis, findings };
  });
}

export function reviewMapping(id: string, mappingId: unknown, decision: unknown): Promise<TransferDraft> {
  return update(id, (analysis) => {
    if (!analysis.mappings.some((mapping) => mapping.id === mappingId)) throw new Error('Unknown mapping');
    const mappings = analysis.mappings.map((mapping) =>
      mapping.id === mappingId ? applyMappingDecision(mapping, decision) : mapping,
    );
    return { ...analysis, mappings };
  });
}

export function setPriority(id: string, decision: unknown): Promise<TransferDraft> {
  return update(id, (analysis) => ({ ...analysis, priority: applyPriorityDecision(analysis.priority, decision) }));
}

export async function confirmAnalysis(id: string): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  const analysis = requireAnalysis(draft);
  if (
    analysis.findings.some((finding) => finding.status === 'pending') ||
    analysis.mappings.some((mapping) => mapping.status === 'pending') ||
    analysis.priority.status === 'pending'
  ) {
    throw new Error('Every finding, mapping and the priority must be decided first');
  }
  return saveTransfer({ ...draft, analysis: { ...analysis, confirmed: true } });
}

export async function resetAnalysis(id: string): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  return saveTransfer({ ...draft, analysis: null });
}
