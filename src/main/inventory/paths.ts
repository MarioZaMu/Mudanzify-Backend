import path from 'node:path';
import type { InventoryFile, TransferSource } from '../../shared/contract';

/** Absolute path of an inventory file, rebuilt from its source and relative path. */
export function absolutePathOf(sources: TransferSource[], file: InventoryFile): string | null {
  const source = sources.find((candidate) => candidate.id === file.sourceId);
  if (!source) return null;
  return source.kind === 'file' ? source.path : path.join(source.path, ...file.relativePath.split('/'));
}
