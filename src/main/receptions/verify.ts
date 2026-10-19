import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  MANIFEST_FILE_NAME,
  RECEIPT_FILE_NAME,
  REPORT_FILE_NAME,
  type FileCheck,
  type ReceivedFile,
} from '../../shared/contract';
import { sha256 } from '../execution/copy';

const MAX_EXTRAS = 500;
const OWN_FILES = new Set([MANIFEST_FILE_NAME, REPORT_FILE_NAME, RECEIPT_FILE_NAME].map((name) => name.toLowerCase()));

/** Absolute path of a manifest entry; never outside the received folder. */
export function resolveInside(folderPath: string, relative: string): string {
  const resolved = path.resolve(folderPath, ...relative.split('/'));
  if (!resolved.startsWith(path.resolve(folderPath) + path.sep)) throw new Error('Path outside the folder');
  return resolved;
}

/** Compares one received file with its manifest entry. Read-only. */
export async function checkFile(folderPath: string, file: ReceivedFile): Promise<FileCheck> {
  let size: number;
  try {
    size = (await stat(resolveInside(folderPath, file.path))).size;
  } catch {
    return 'missing';
  }
  if (size !== file.size) return 'changed';
  if (!file.sha256) return 'unverified';
  return (await sha256(resolveInside(folderPath, file.path))) === file.sha256 ? 'ok' : 'changed';
}

/** Files in the folder that the manifest does not list (someone added them after sending). */
export async function findExtras(folderPath: string, listed: Set<string>): Promise<string[]> {
  const extras: string[] = [];
  const walk = async (relative: string) => {
    if (extras.length >= MAX_EXTRAS) return;
    const entries = await readdir(path.join(folderPath, ...relative.split('/').filter(Boolean)), { withFileTypes: true });
    for (const entry of entries) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) {
        const own = relative === '' && OWN_FILES.has(entry.name.toLowerCase());
        if (!own && !listed.has(child.toLowerCase())) extras.push(child);
      }
      if (extras.length >= MAX_EXTRAS) return;
    }
  };
  await walk('');
  return extras.sort((a, b) => a.localeCompare(b, 'es'));
}
