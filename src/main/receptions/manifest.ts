import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  FILE_CATEGORIES,
  MANIFEST_FILE_NAME,
  type FileCategory,
  type ManifestFile,
  type SensitiveType,
  type SkipReason,
  type TableChange,
  type TransferManifest,
} from '../../shared/contract';
import { cleanText } from '../ai/sanitize';

/** Code the renderer recognizes: the chosen folder is not a Mudanzify delivery. */
export const RECEPTION_ERROR = { noManifest: 'RECEPTION_NO_MANIFEST' } as const;

const MAX_MANIFEST_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 200_000;
const MAX_LIST = 10_000;
const SHA256 = /^[0-9a-f]{64}$/;
const STATUSES = ['running', 'done', 'cancelled', 'failed'] as const;
const REASONS: readonly SkipReason[] = ['duplicate', 'junk', 'too-large'];
const SENSITIVE: readonly SensitiveType[] = ['email', 'phone', 'national-id', 'card'];

type Raw = Record<string, unknown>;
const records = (value: unknown, max = MAX_LIST): Raw[] =>
  Array.isArray(value) ? value.slice(0, max).filter((item): item is Raw => typeof item === 'object' && item !== null) : [];
const isCategory = (value: unknown): value is FileCategory =>
  typeof value === 'string' && (FILE_CATEGORIES as readonly string[]).includes(value);
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);

/**
 * The manifest comes from outside (USB, cloud, another person), so it is
 * untrusted: paths must stay inside the folder and every field is checked.
 */
export function safeRelativePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1000) return null;
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..' || /[<>:"\\|?*\u0000-\u001f]/.test(part))) return null;
  return parts.join('/');
}

function parseChange(raw: Raw): TableChange | null {
  const sheet = cleanText(raw.sheet, 200);
  const column = cleanText(raw.column, 200);
  switch (raw.kind) {
    case 'mask':
      return SENSITIVE.includes(raw.type as SensitiveType) ? { kind: 'mask', sheet, column, type: raw.type as SensitiveType } : null;
    case 'drop-column':
      return { kind: 'drop-column', sheet, column };
    case 'remove-duplicates':
      return { kind: 'remove-duplicates', sheet, rows: count(raw.rows) };
    case 'rename':
      return { kind: 'rename', sheet, column, to: cleanText(raw.to, 200) };
    default:
      return null;
  }
}

function parseFile(raw: Raw): ManifestFile | null {
  const filePath = safeRelativePath(raw.path);
  if (!filePath || !isCategory(raw.category)) return null;
  return {
    path: filePath,
    category: raw.category,
    size: count(raw.size),
    sha256: typeof raw.sha256 === 'string' && SHA256.test(raw.sha256) ? raw.sha256 : null,
    changes: records(raw.changes, 100).map(parseChange).filter((change): change is TableChange => change !== null),
  };
}

export function parseManifest(raw: unknown): TransferManifest {
  if (typeof raw !== 'object' || raw === null) throw new Error(RECEPTION_ERROR.noManifest);
  const data = raw as Raw;
  if (data.format !== 'mudanzify-manifest' || data.version !== 1) throw new Error(RECEPTION_ERROR.noManifest);

  const seen = new Set<string>();
  const files = records(data.files, MAX_FILES)
    .map(parseFile)
    .filter((file): file is ManifestFile => {
      if (!file || seen.has(file.path.toLowerCase())) return false;
      seen.add(file.path.toLowerCase());
      return true;
    });

  return {
    format: 'mudanzify-manifest',
    version: 1,
    transferName: cleanText(data.transferName, 120) || 'Traspaso',
    sentAt: typeof data.sentAt === 'string' && !Number.isNaN(Date.parse(data.sentAt)) ? data.sentAt : new Date(0).toISOString(),
    status: STATUSES.includes(data.status as (typeof STATUSES)[number]) ? (data.status as TransferManifest['status']) : 'done',
    order: [...new Set(Array.isArray(data.order) ? data.order.filter(isCategory) : [])],
    files,
    skipped: records(data.skipped).flatMap((item) =>
      isCategory(item.category) && REASONS.includes(item.reason as SkipReason)
        ? [{ path: cleanText(item.path, 1000), category: item.category, reason: item.reason as SkipReason }]
        : [],
    ),
    criteria: records(data.criteria, 20).map((item) => ({ title: cleanText(item.title, 120), detail: cleanText(item.detail, 400) })),
    notes: records(data.notes, 200).map((item) => ({
      path: cleanText(item.path, 1000),
      column: cleanText(item.column, 200),
      empty: count(item.empty),
      total: count(item.total),
    })),
  };
}

export async function readManifest(folderPath: string): Promise<TransferManifest> {
  const manifestPath = path.join(folderPath, MANIFEST_FILE_NAME);
  let text: string;
  try {
    if ((await stat(manifestPath)).size > MAX_MANIFEST_BYTES) throw new Error('too large');
    text = await readFile(manifestPath, 'utf8');
  } catch {
    throw new Error(RECEPTION_ERROR.noManifest);
  }
  try {
    return parseManifest(JSON.parse(text));
  } catch {
    throw new Error(RECEPTION_ERROR.noManifest);
  }
}
