import type { FileCategory, FileFlag } from '../../shared/contract';

const EXTENSIONS: Record<Exclude<FileCategory, 'other'>, string[]> = {
  documents: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'ppt', 'pptx', 'odp', 'pages', 'key'],
  spreadsheets: ['xlsx', 'xls', 'xlsm', 'csv', 'tsv', 'ods', 'numbers'],
  images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'tif', 'tiff', 'svg', 'raw', 'psd', 'ai'],
  media: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso'],
  code: ['js', 'ts', 'tsx', 'jsx', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sql', 'xml', 'yml', 'yaml'],
};

const CATEGORY_BY_EXTENSION = new Map<string, FileCategory>(
  Object.entries(EXTENSIONS).flatMap(([category, extensions]) =>
    extensions.map((extension) => [extension, category as FileCategory]),
  ),
);

export function categorize(extension: string): FileCategory {
  return CATEGORY_BY_EXTENSION.get(extension) ?? 'other';
}

/** System or editor leftovers that rarely belong in a transfer. */
const TEMPORARY_NAMES = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
const TEMPORARY_EXTENSIONS = new Set(['tmp', 'temp', 'bak', 'old', 'swp', 'crdownload', 'part']);

export function detectFlags(name: string, extension: string, size: number): FileFlag[] {
  const lower = name.toLowerCase();
  const flags: FileFlag[] = [];
  if (lower.startsWith('.')) flags.push('hidden');
  if (TEMPORARY_NAMES.has(lower) || TEMPORARY_EXTENSIONS.has(extension) || lower.startsWith('~$')) {
    flags.push('temporary');
  }
  if (size === 0) flags.push('empty');
  return flags;
}

export const TABLE_EXTENSIONS = new Set(['csv', 'tsv', 'xlsx', 'xlsm']);
