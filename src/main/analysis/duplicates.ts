import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { InventoryFile, TransferSource } from '../../shared/contract';
import { absolutePathOf } from '../inventory/paths';

/** Files above this size are not hashed (it would take too long); they are never reported as duplicates. */
const MAX_HASH_BYTES = 1024 * 1024 * 1024;

export interface DuplicateGroup {
  fileIds: string[];
  /** Suggested copy to keep: the most recently modified one. */
  keepFileId: string;
  bytes: number;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath) as AsyncIterable<Buffer>) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Exact duplicates by content. Only files that share a size are hashed, and
 * files are only read, never opened for writing.
 */
export async function findDuplicateFiles(
  files: InventoryFile[],
  sources: TransferSource[],
  onProgress: (done: number, total: number) => void,
): Promise<DuplicateGroup[]> {
  const bySize = new Map<number, InventoryFile[]>();
  for (const file of files) {
    if (file.size === 0 || file.size > MAX_HASH_BYTES) continue;
    bySize.set(file.size, [...(bySize.get(file.size) ?? []), file]);
  }
  const candidates = [...bySize.values()].filter((group) => group.length > 1).flat();

  const byHash = new Map<string, InventoryFile[]>();
  let done = 0;
  for (const file of candidates) {
    const filePath = absolutePathOf(sources, file);
    if (filePath) {
      try {
        const key = `${file.size}:${await hashFile(filePath)}`;
        byHash.set(key, [...(byHash.get(key) ?? []), file]);
      } catch {
        // Unreadable now (moved, locked): skip it rather than guess.
      }
    }
    onProgress(++done, candidates.length);
  }

  return [...byHash.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const newest = group.reduce((a, b) => (b.modifiedAt > a.modifiedAt ? b : a));
      return { fileIds: group.map((file) => file.id), keepFileId: newest.id, bytes: group[0].size };
    });
}
