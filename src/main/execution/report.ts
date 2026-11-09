import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPORT_FILE_NAME, type TableChange, type TransferDraft, type TransferExecution } from '../../shared/contract';
import { texts } from '../i18n';

export { REPORT_FILE_NAME };

/**
 * The report is a document for people, written in the language the sender uses
 * (texts in `../i18n`). It never includes cell values.
 */

export const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(texts().locale, { dateStyle: 'long', timeStyle: 'short' }) : '—';

export function bytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toLocaleString(texts().locale, { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

function change(item: TableChange): string {
  const t = texts().report;
  const where = escape(item.sheet);
  switch (item.kind) {
    case 'mask':
      return t.mask(escape(item.column), where);
    case 'drop-column':
      return t.dropColumn(escape(item.column), where);
    case 'remove-duplicates':
      return t.removeDuplicates(item.rows, where);
    case 'rename':
      return t.rename(escape(item.column), escape(item.to), where);
  }
}

function buildHtml(draft: TransferDraft, execution: TransferExecution): string {
  const { locale, category, report: t } = texts();
  const files = new Map(draft.inventory?.files.map((file) => [file.id, file]) ?? []);
  const criteria = (draft.interview?.suggestions ?? []).filter((s) => s.status === 'accepted' || s.status === 'edited');
  const { totals, plan } = execution;
  const written = new Set(
    execution.results.filter((r) => r.status === 'copied' || r.status === 'transformed').map((r) => r.fileId),
  );
  // Gaps to review, only in tables that actually reached the destination.
  const notes = (draft.analysis?.findings ?? []).filter(
    (f) => f.kind === 'empty-cells' && f.choice === 'flag' && written.has(f.table.fileId),
  );

  const rows = execution.results
    .map((result) => {
      const item = plan.items.find((candidate) => candidate.fileId === result.fileId);
      const file = files.get(result.fileId);
      const detail =
        result.status === 'failed'
          ? escape(result.error ?? t.unknownError)
          : item?.reason
            ? t.reason[item.reason]
            : item?.changes.length
              ? item.changes.map(change).join('<br>')
              : result.verified
                ? t.verified
                : '';
      return `<tr class="${result.status}">
        <td>${escape(file?.relativePath ?? result.fileId)}</td>
        <td>${item ? category[item.category] : ''}</td>
        <td>${escape(result.target ?? '—')}</td>
        <td><span class="pill">${t.status[result.status]}</span></td>
        <td>${detail}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.document} · ${escape(draft.name)}</title>
<style>
  :root { --ink:#1f1b16; --muted:#6b6258; --line:#e7dfd3; --paper:#fbf8f3; --primary:#4f46e5; --ok:#15803d; --warn:#b45309; --bad:#b91c1c; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.55 system-ui, "Segoe UI", sans-serif; color: var(--ink); background: var(--paper); }
  main { max-width: 1040px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  h2 { margin: 36px 0 12px; font-size: 18px; }
  .muted { color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 24px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 16px; }
  .card b { display: block; font-size: 24px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 13px; }
  th { background: #f4eee5; font-weight: 600; }
  .pill { white-space: nowrap; font-weight: 600; }
  .copied .pill, .transformed .pill { color: var(--ok); }
  .skipped .pill { color: var(--warn); }
  .failed .pill { color: var(--bad); }
  ul { padding-left: 20px; }
  footer { margin-top: 40px; font-size: 13px; }
  @media print { body { background: #fff; } main { padding: 0; } }
</style>
</head>
<body>
<main>
  <p class="muted">${t.document}</p>
  <h1>${escape(draft.name)}</h1>
  <p class="muted">${t.state}: <b>${t.run[execution.status]}</b> · ${t.start}: ${date(execution.startedAt)} · ${t.end}: ${date(execution.finishedAt)}</p>

  <div class="cards">
    <div class="card"><b>${totals.copied}</b>${t.cards.copied}</div>
    <div class="card"><b>${totals.transformed}</b>${t.cards.transformed}</div>
    <div class="card"><b>${totals.skipped}</b>${t.cards.skipped}</div>
    <div class="card"><b>${totals.failed}</b>${t.cards.failed}</div>
    <div class="card"><b>${bytes(totals.bytes)}</b>${t.cards.written}</div>
  </div>

  <h2>${t.originAndDestination}</h2>
  <ul>
    ${draft.sources.map((source) => `<li>${t.origin}: ${escape(source.path)}</li>`).join('')}
    <li>${t.destination}: ${escape(path.basename(execution.outputPath))}</li>
  </ul>
  <p class="muted">${t.copyOnly}</p>

  <h2>${t.packingOrder}</h2>
  <ol>${plan.order.map((name) => `<li>${category[name]}</li>`).join('')}</ol>

  <h2>${t.criteria}</h2>
  ${
    criteria.length === 0
      ? `<p class="muted">${t.noCriteria}</p>`
      : `<ul>${criteria.map((c) => `<li><b>${escape(c.title)}</b>${c.detail ? ` — ${escape(c.detail)}` : ''}</li>`).join('')}</ul>`
  }

  ${
    notes.length === 0
      ? ''
      : `<h2>${t.toReview}</h2><ul>${notes
          .map((f) => (f.kind === 'empty-cells' ? `<li>${t.gaps(escape(f.column), f.empty, f.total, escape(files.get(f.table.fileId)?.relativePath ?? ''))}</li>` : ''))
          .join('')}</ul>`
  }

  <h2>${t.files}</h2>
  <table>
    <thead><tr><th>${t.columns.origin}</th><th>${t.columns.box}</th><th>${t.columns.destination}</th><th>${t.columns.result}</th><th>${t.columns.detail}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <footer class="muted">${t.footer(date(new Date().toISOString()))}</footer>
</main>
</body>
</html>`;
}

/** Writes the report into the output folder and returns its path. */
export async function writeReport(draft: TransferDraft, execution: TransferExecution): Promise<string> {
  const reportPath = path.join(execution.outputPath, REPORT_FILE_NAME);
  await writeFile(reportPath, buildHtml(draft, execution), 'utf8');
  return reportPath;
}
