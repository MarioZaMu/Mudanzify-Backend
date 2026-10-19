import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { numbered } from './plan';

/** Above this size only the size is compared; hashing would take too long. */
export const MAX_VERIFY_BYTES = 1024 * 1024 * 1024;

export async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath) as AsyncIterable<Buffer>) hash.update(chunk);
  return hash.digest('hex');
}

/** Creates a new folder; if the name is taken it tries "name (2)", "name (3)"… Never reuses one. */
export async function createUniqueFolder(parent: string, name: string): Promise<string> {
  for (let index = 1; index < 1000; index++) {
    const candidate = path.join(parent, numbered(name, index));
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('No free folder name in the destination');
}

/** Absolute path for a plan target ("Fotos/2023/playa.png") inside the output folder. */
export function resolveTarget(outputPath: string, target: string): string {
  const resolved = path.resolve(outputPath, ...target.split('/'));
  // Targets come from our own plan, but never write outside the output folder.
  if (!resolved.startsWith(path.resolve(outputPath) + path.sep)) throw new Error('Target outside the output folder');
  return resolved;
}

export async function ensureParent(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

/**
 * Copies one file without ever overwriting (COPYFILE_EXCL) and checks the copy
 * against the original. Returns the copy's fingerprint, or null when it was too large to hash.
 */
export async function copyVerified(source: string, target: string): Promise<string | null> {
  await ensureParent(target);
  await copyFile(source, target, constants.COPYFILE_EXCL);

  const [original, copy] = await Promise.all([stat(source), stat(target)]);
  if (original.size !== copy.size) throw new Error('The copy has a different size');
  if (original.size > MAX_VERIFY_BYTES) return null;
  const [a, b] = await Promise.all([sha256(source), sha256(target)]);
  if (a !== b) throw new Error('The copy has different content');
  return b;
}
