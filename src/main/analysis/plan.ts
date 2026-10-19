import {
  FILE_CATEGORIES,
  type ColumnSource,
  type FileCategory,
  type Finding,
  type Inventory,
  type SensitiveType,
  type TableRef,
  type TransferInterview,
} from '../../shared/contract';
import { cleanText } from '../ai/sanitize';
import type { TableResult } from './findings';

const MAX_COLUMNS = 40;
const MAX_MAPPINGS = 12;

/**
 * What the planner (AI or demo) may know. Tables are referred to by short ids
 * ("T1"), never by file name or path, and columns carry no values.
 */
export interface PlanContext {
  boxes: Array<{ category: FileCategory; files: number; bytes: number; flagged: number }>;
  tables: Array<{
    id: string;
    columns: Array<{ name: string; emptyPercent: number; sensitive: SensitiveType | null }>;
  }>;
  findings: {
    duplicateFiles: number;
    tablesWithDuplicateRows: number;
    columnsWithGaps: number;
    sensitiveColumns: number;
    junkFiles: number;
  };
  /** Criteria the sender kept in the interview. */
  criteria: Array<{ topic: string; title: string; detail: string }>;
}

/** Context plus the private lookup from table ids back to real tables. */
export interface PlanInput {
  context: PlanContext;
  tableRefs: Map<string, TableRef>;
}

export interface PlanDraft {
  summary: string;
  mappings: Array<{ standardName: string; sources: ColumnSource[]; reason: string }>;
  priority: { order: FileCategory[]; reasons: Partial<Record<FileCategory, string>> };
}

export interface Planner {
  propose(input: PlanInput): Promise<PlanDraft>;
}

export function buildPlanInput(
  inventory: Inventory,
  interview: TransferInterview | null,
  tables: TableResult[],
  findings: Finding[],
): PlanInput {
  const tableRefs = new Map<string, TableRef>();
  const count = (kind: Finding['kind']) => findings.filter((finding) => finding.kind === kind).length;

  const context: PlanContext = {
    boxes: inventory.boxes.map((box) => ({
      category: box.id,
      files: box.fileCount,
      bytes: box.bytes,
      flagged: box.flaggedCount,
    })),
    tables: tables.map(({ table, check }, index) => {
      const id = `T${index + 1}`;
      tableRefs.set(id, table);
      return {
        id,
        columns: check.columns.slice(0, MAX_COLUMNS).map((column) => ({
          name: column.column,
          emptyPercent: check.totalRows === 0 ? 0 : Math.round((column.empty / check.totalRows) * 100),
          sensitive: column.sensitive?.type ?? null,
        })),
      };
    }),
    findings: {
      duplicateFiles: findings
        .filter((finding) => finding.kind === 'duplicate-files')
        .reduce((sum, finding) => sum + (finding.kind === 'duplicate-files' ? finding.fileIds.length - 1 : 0), 0),
      tablesWithDuplicateRows: count('duplicate-rows'),
      columnsWithGaps: count('empty-cells'),
      sensitiveColumns: count('sensitive-column'),
      junkFiles: findings.reduce((sum, finding) => sum + (finding.kind === 'junk-files' ? finding.fileIds.length : 0), 0),
    },
    criteria: (interview?.suggestions ?? [])
      .filter((s) => s.status === 'accepted' || s.status === 'edited')
      .map(({ topic, title, detail }) => ({ topic, title, detail })),
  };
  return { context, tableRefs };
}

const isCategory = (value: unknown): value is FileCategory =>
  typeof value === 'string' && (FILE_CATEGORIES as readonly string[]).includes(value);

/**
 * Planner output is untrusted (columns are checked with resolveColumn first):
 * each column is mapped once,
 * a mapping must join at least two differently named columns, and the priority
 * covers exactly the boxes in the inventory.
 */
export function sanitizePlan(raw: PlanDraft, input: PlanInput): PlanDraft {
  const { context } = input;
  const used = new Set<string>();
  const mappings: PlanDraft['mappings'] = [];

  for (const mapping of raw.mappings) {
    const standardName = cleanText(mapping.standardName, 60);
    if (!standardName) continue;
    const sources = mapping.sources.filter((source) => {
      const key = `${source.fileId}\u0001${source.sheet}\u0001${source.column}`;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    });
    if (sources.length < 2 || new Set(sources.map((source) => source.column)).size < 2) continue;
    mappings.push({ standardName, sources, reason: cleanText(mapping.reason, 300) });
    if (mappings.length >= MAX_MAPPINGS) break;
  }

  const present = context.boxes.map((box) => box.category);
  const order = [...new Set(raw.priority.order.filter((category) => isCategory(category) && present.includes(category)))];
  for (const category of FILE_CATEGORIES) {
    if (present.includes(category) && !order.includes(category)) order.push(category);
  }
  const reasons: PlanDraft['priority']['reasons'] = {};
  for (const category of order) {
    const reason = cleanText(raw.priority.reasons[category], 200);
    if (reason) reasons[category] = reason;
  }

  return { summary: cleanText(raw.summary, 700), mappings, priority: { order, reasons } };
}

/** Resolves "T1" + column name into a real column, or null if it does not exist. */
export function resolveColumn(input: PlanInput, tableId: unknown, column: unknown): ColumnSource | null {
  if (typeof tableId !== 'string' || typeof column !== 'string') return null;
  const ref = input.tableRefs.get(tableId);
  const table = input.context.tables.find((t) => t.id === tableId);
  if (!ref || !table?.columns.some((c) => c.name === column)) return null;
  return { ...ref, column };
}
