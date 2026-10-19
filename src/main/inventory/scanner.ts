import { opendir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  FILE_CATEGORIES,
  type FileCategory,
  type Inventory,
  type InventoryBox,
  type InventoryFile,
  type InventoryIssue,
  type ScanProgress,
  type TableProfile,
  type TransferSource,
} from '../../shared/contract';
import { categorize, detectFlags, TABLE_EXTENSIONS } from './categories';
import { profileCsv, profileXlsx, XLSX_MAX_BYTES } from './tables';

/** Hard limits keep the scan responsive on huge folders. */
const MAX_FILES = 20_000;
const MAX_TABLES = 30;
const PROGRESS_INTERVAL_MS = 100;

type ProgressListener = (progress: Omit<ScanProgress, 'transferId'>) => void;

interface ScanState {
  files: InventoryFile[];
  folders: number;
  bytes: number;
  issues: InventoryIssue[];
  truncated: boolean;
  lastEmit: number;
}

const extensionOf = (name: string) => path.extname(name).slice(1).toLowerCase();
const toPosix = (value: string) => value.split(path.sep).join('/');

/**
 * Reads the sources and builds the inventory. Strictly read-only:
 * it never creates, moves, modifies or deletes anything.
 */
export async function scanSources(sources: TransferSource[], onProgress: ProgressListener): Promise<Inventory> {
  const state: ScanState = { files: [], folders: 0, bytes: 0, issues: [], truncated: false, lastEmit: 0 };

  const emit = (phase: ScanProgress['phase'], currentPath: string, force = false) => {
    const now = Date.now();
    if (!force && now - state.lastEmit < PROGRESS_INTERVAL_MS) return;
    state.lastEmit = now;
    onProgress({ phase, filesSeen: state.files.length, bytesSeen: state.bytes, currentPath });
  };

  const addFile = async (source: TransferSource, absolutePath: string, relativePath: string) => {
    if (state.files.length >= MAX_FILES) {
      state.truncated = true;
      return;
    }
    try {
      const info = await stat(absolutePath);
      const name = path.basename(absolutePath);
      const extension = extensionOf(name);
      state.files.push({
        id: `f${state.files.length + 1}`,
        sourceId: source.id,
        relativePath: toPosix(relativePath),
        name,
        extension,
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        category: categorize(extension),
        flags: detectFlags(name, extension, info.size),
      });
      state.bytes += info.size;
      emit('walking', absolutePath);
    } catch {
      state.issues.push({ kind: 'unreadable', path: absolutePath });
    }
  };

  const walk = async (source: TransferSource, directory: string): Promise<void> => {
    let dir;
    try {
      dir = await opendir(directory);
    } catch {
      state.issues.push({ kind: 'unreadable', path: directory });
      return;
    }
    for await (const entry of dir) {
      if (state.truncated) break;
      const absolutePath = path.join(directory, entry.name);
      // Symlinks are skipped to avoid loops and reading outside the chosen folder.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        state.folders++;
        await walk(source, absolutePath);
      } else if (entry.isFile()) {
        await addFile(source, absolutePath, path.relative(source.path, absolutePath));
      }
    }
  };

  for (const source of sources) {
    if (source.kind === 'folder') await walk(source, source.path);
    else await addFile(source, source.path, path.basename(source.path));
  }
  if (state.truncated) state.issues.push({ kind: 'limit-reached', path: '' });

  const tables = await profileTables(state, sources, emit);
  emit('done', '', true);

  return {
    scannedAt: new Date().toISOString(),
    totals: { files: state.files.length, folders: state.folders, bytes: state.bytes, tables: tables.length },
    boxes: buildBoxes(state.files, tables),
    files: state.files,
    tables,
    issues: state.issues,
    truncated: state.truncated,
  };
}

async function profileTables(
  state: ScanState,
  sources: TransferSource[],
  emit: (phase: ScanProgress['phase'], currentPath: string, force?: boolean) => void,
): Promise<TableProfile[]> {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const candidates = state.files.filter((file) => TABLE_EXTENSIONS.has(file.extension) && file.size > 0);
  const tables: TableProfile[] = [];

  for (const file of candidates.slice(0, MAX_TABLES)) {
    const source = sourceById.get(file.sourceId);
    if (!source) continue;
    const absolutePath = source.kind === 'file' ? source.path : path.join(source.path, ...file.relativePath.split('/'));
    emit('tables', absolutePath, true);

    const isExcel = file.extension === 'xlsx' || file.extension === 'xlsm';
    if (isExcel && file.size > XLSX_MAX_BYTES) {
      state.issues.push({ kind: 'table-too-large', path: absolutePath });
      continue;
    }
    try {
      const sheets = isExcel ? await profileXlsx(absolutePath) : await profileCsv(absolutePath, file.name);
      tables.push({ fileId: file.id, fileName: file.name, format: isExcel ? 'xlsx' : 'csv', sheets });
    } catch {
      state.issues.push({ kind: 'table-unreadable', path: absolutePath });
    }
  }
  return tables;
}

/** Groups files by category into "boxes" with a first, simple risk signal. */
function buildBoxes(files: InventoryFile[], tables: TableProfile[]): InventoryBox[] {
  const tablesHaveGaps = tables.some((table) =>
    table.sheets.some((sheet) => sheet.columns.some((column) => column.empty > 0)),
  );

  return FILE_CATEGORIES.map((category: FileCategory) => {
    const inBox = files.filter((file) => file.category === category);
    const flaggedCount = inBox.filter((file) => file.flags.length > 0).length;
    const needsReview = flaggedCount > 0 || (category === 'spreadsheets' && tablesHaveGaps);
    return {
      id: category,
      fileCount: inBox.length,
      bytes: inBox.reduce((total, file) => total + file.size, 0),
      flaggedCount,
      risk: needsReview ? 'warn' : 'safe',
    } satisfies InventoryBox;
  }).filter((box) => box.fileCount > 0);
}
