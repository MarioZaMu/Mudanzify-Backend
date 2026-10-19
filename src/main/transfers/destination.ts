import { constants } from 'node:fs';
import { access, statfs } from 'node:fs/promises';
import path from 'node:path';
import type { DestinationConflict, TransferDestination, TransferSource } from '../../shared/contract';

/** True when `child` is the same folder as `parent` or lives inside it. */
function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Checks a destination folder without writing anything to it:
 * write permission, free space and whether it would end up inside a source.
 */
export async function inspectDestination(
  folderPath: string,
  sources: TransferSource[],
  requiredBytes: number | null,
): Promise<TransferDestination> {
  const conflicts: DestinationConflict[] = [];

  let writable = true;
  try {
    await access(folderPath, constants.W_OK);
  } catch {
    writable = false;
    conflicts.push('not-writable');
  }

  let freeBytes: number | null = null;
  try {
    const info = await statfs(folderPath);
    freeBytes = info.bavail * info.bsize;
  } catch {
    freeBytes = null;
  }
  if (freeBytes !== null && requiredBytes !== null && requiredBytes > freeBytes) {
    conflicts.push('not-enough-space');
  }

  // Copying a folder into itself would never finish and duplicate everything.
  if (sources.some((source) => source.kind === 'folder' && isInside(source.path, folderPath))) {
    conflicts.push('inside-source');
  }

  return { path: folderPath, name: path.basename(folderPath) || folderPath, writable, freeBytes, conflicts };
}
