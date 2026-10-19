import { stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MANIFEST_FILE_NAME,
  type TransferDraft,
  type TransferExecution,
  type TransferManifest,
} from '../../shared/contract';
import { resolveTarget } from './copy';

/**
 * Machine-readable twin of the report. The receiver's app reads it to check
 * every file; like the report, it never contains cell values.
 */
export async function writeManifest(draft: TransferDraft, execution: TransferExecution): Promise<string> {
  const files = new Map(draft.inventory?.files.map((file) => [file.id, file]) ?? []);
  const items = new Map(execution.plan.items.map((item) => [item.fileId, item]));
  const written = execution.results.filter((r) => (r.status === 'copied' || r.status === 'transformed') && r.target);
  const writtenIds = new Set(written.map((r) => r.fileId));

  const manifest: TransferManifest = {
    format: 'mudanzify-manifest',
    version: 1,
    transferName: draft.name,
    sentAt: execution.finishedAt ?? execution.startedAt,
    status: execution.status,
    order: execution.plan.order,
    files: await Promise.all(
      written.map(async (result) => {
        const item = items.get(result.fileId)!;
        // A changed table no longer has the original size: record what was actually written.
        const size =
          result.status === 'transformed' ? (await stat(resolveTarget(execution.outputPath, result.target!))).size : item.size;
        return { path: result.target!, category: item.category, size, sha256: result.sha256, changes: item.changes };
      }),
    ),
    skipped: execution.plan.items
      .filter((item) => item.action === 'skip' && item.reason)
      .map((item) => ({
        path: files.get(item.fileId)?.relativePath ?? item.fileId,
        category: item.category,
        reason: item.reason!,
      })),
    criteria: (draft.interview?.suggestions ?? [])
      .filter((s) => s.status === 'accepted' || s.status === 'edited')
      .map(({ title, detail }) => ({ title, detail })),
    notes: (draft.analysis?.findings ?? []).flatMap((finding) =>
      finding.kind === 'empty-cells' && finding.choice === 'flag' && writtenIds.has(finding.table.fileId)
        ? [{ path: items.get(finding.table.fileId)?.target ?? '', column: finding.column, empty: finding.empty, total: finding.total }]
        : [],
    ),
  };

  const manifestPath = path.join(execution.outputPath, MANIFEST_FILE_NAME);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}
