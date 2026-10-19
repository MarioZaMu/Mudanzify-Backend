import type { FileCategory, TransferDraft } from '../../shared/contract';

/**
 * What the AI is allowed to know about a transfer. It is a summary on purpose:
 * counts, file types and column names. It never includes file contents,
 * cell values, file names or paths.
 */
export interface InventoryContext {
  sources: { folders: number; files: number };
  totals: { files: number; folders: number; bytes: number; tables: number };
  boxes: Array<{ category: FileCategory; files: number; bytes: number; flagged: number }>;
  flags: { hidden: number; temporary: number; empty: number };
  topExtensions: Array<{ extension: string; files: number }>;
  tables: Array<{
    format: 'csv' | 'xlsx';
    sheets: Array<{ rows: number; columns: Array<{ name: string; emptyPercent: number }> }>;
  }>;
  destinationChosen: boolean;
}

const MAX_EXTENSIONS = 10;
const MAX_COLUMNS = 25;

export function buildInventoryContext(draft: TransferDraft): InventoryContext {
  const inventory = draft.inventory;
  if (!inventory) throw new Error('The interview needs an inventory');

  const flags = { hidden: 0, temporary: 0, empty: 0 };
  const extensions = new Map<string, number>();
  for (const file of inventory.files) {
    for (const flag of file.flags) flags[flag] += 1;
    const extension = file.extension || '(sin extensión)';
    extensions.set(extension, (extensions.get(extension) ?? 0) + 1);
  }

  return {
    sources: {
      folders: draft.sources.filter((source) => source.kind === 'folder').length,
      files: draft.sources.filter((source) => source.kind === 'file').length,
    },
    totals: inventory.totals,
    boxes: inventory.boxes.map((box) => ({
      category: box.id,
      files: box.fileCount,
      bytes: box.bytes,
      flagged: box.flaggedCount,
    })),
    flags,
    topExtensions: [...extensions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_EXTENSIONS)
      .map(([extension, files]) => ({ extension, files })),
    tables: inventory.tables.map((table) => ({
      format: table.format,
      sheets: table.sheets.map((sheet) => ({
        rows: sheet.rowCount,
        columns: sheet.columns.slice(0, MAX_COLUMNS).map((column) => {
          const total = column.filled + column.empty;
          return { name: column.name, emptyPercent: total === 0 ? 0 : Math.round((column.empty / total) * 100) };
        }),
      })),
    })),
    destinationChosen: draft.destination !== null,
  };
}
