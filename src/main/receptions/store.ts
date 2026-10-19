import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { Reception, ReceptionSummary } from '../../shared/contract';

/** Each reception is one JSON file in <userData>/receptions/<id>.json. */
const receptionsDir = () => path.join(app.getPath('userData'), 'receptions');

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertReceptionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new Error('Invalid reception id');
}

const fileFor = (id: string) => path.join(receptionsDir(), `${id}.json`);

export async function saveReception(reception: Reception): Promise<Reception> {
  await mkdir(receptionsDir(), { recursive: true });
  const target = fileFor(reception.id);
  // Temp file and rename, so a crash never leaves a half-written JSON.
  await writeFile(`${target}.tmp`, JSON.stringify(reception), 'utf8');
  await rename(`${target}.tmp`, target);
  return reception;
}

export async function loadReception(id: string): Promise<Reception> {
  assertReceptionId(id);
  return JSON.parse(await readFile(fileFor(id), 'utf8')) as Reception;
}

export async function deleteReception(id: string): Promise<void> {
  assertReceptionId(id);
  await rm(fileFor(id), { force: true });
}

export function toSummary(reception: Reception): ReceptionSummary {
  return {
    id: reception.id,
    transferName: reception.transferName,
    folderName: reception.folderName,
    openedAt: reception.openedAt,
    verifiedAt: reception.verifiedAt,
    confirmedAt: reception.confirmedAt,
    files: reception.files.length,
    issues: reception.boxes.reduce((sum, box) => sum + box.issues, 0),
  };
}

export async function listReceptions(): Promise<ReceptionSummary[]> {
  let names: string[];
  try {
    names = await readdir(receptionsDir());
  } catch {
    return [];
  }
  const receptions = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .map((name) => loadReception(name.slice(0, -5)).catch(() => null)),
  );
  return receptions
    .filter((reception): reception is Reception => reception !== null)
    .map(toSummary)
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}
