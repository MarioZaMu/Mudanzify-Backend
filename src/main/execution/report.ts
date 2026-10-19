import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  FileCategory,
  ItemStatus,
  SkipReason,
  TableChange,
  TransferDraft,
  TransferExecution,
} from '../../shared/contract';

/**
 * The report is a document for people, so its texts are Spanish and live here,
 * next to the data it describes. It never includes cell values.
 */
export const REPORT_FILE_NAME = 'Informe de Mudanzify.html';

const CATEGORY: Record<FileCategory, string> = {
  documents: 'Documentos',
  spreadsheets: 'Hojas de cálculo',
  images: 'Imágenes',
  media: 'Audio y video',
  archives: 'Comprimidos',
  code: 'Código y datos',
  other: 'Otros archivos',
};

const STATUS: Record<ItemStatus, string> = {
  pending: 'Sin procesar',
  copied: 'Copiado',
  transformed: 'Copiado con cambios',
  skipped: 'Fuera del traspaso',
  failed: 'Error',
};

const REASON: Record<SkipReason, string> = {
  duplicate: 'Duplicado: se conservó otra copia idéntica',
  junk: 'Archivo temporal, oculto o vacío',
  'too-large': 'Tabla demasiado grande para aplicar los cambios con seguridad',
};

const RUN_STATUS: Record<TransferExecution['status'], string> = {
  running: 'En curso',
  done: 'Completado',
  cancelled: 'Cancelado',
  failed: 'Con errores',
};

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' }) : '—';

function bytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toLocaleString('es', { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`;
}

function change(item: TableChange): string {
  const where = escape(item.sheet);
  switch (item.kind) {
    case 'mask':
      return `«${escape(item.column)}» enmascarada (${where})`;
    case 'drop-column':
      return `«${escape(item.column)}» quitada (${where})`;
    case 'remove-duplicates':
      return `${item.rows} ${item.rows === 1 ? 'fila repetida quitada' : 'filas repetidas quitadas'} (${where})`;
    case 'rename':
      return `«${escape(item.column)}» → «${escape(item.to)}» (${where})`;
  }
}

function buildHtml(draft: TransferDraft, execution: TransferExecution): string {
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
          ? escape(result.error ?? 'Error desconocido')
          : item?.reason
            ? REASON[item.reason]
            : item?.changes.length
              ? item.changes.map(change).join('<br>')
              : result.verified
                ? 'Verificado (contenido idéntico)'
                : '';
      return `<tr class="${result.status}">
        <td>${escape(file?.relativePath ?? result.fileId)}</td>
        <td>${item ? CATEGORY[item.category] : ''}</td>
        <td>${escape(result.target ?? '—')}</td>
        <td><span class="pill">${STATUS[result.status]}</span></td>
        <td>${detail}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Informe de Mudanzify · ${escape(draft.name)}</title>
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
  <p class="muted">Informe de Mudanzify</p>
  <h1>${escape(draft.name)}</h1>
  <p class="muted">Estado: <b>${RUN_STATUS[execution.status]}</b> · Inicio: ${date(execution.startedAt)} · Fin: ${date(execution.finishedAt)}</p>

  <div class="cards">
    <div class="card"><b>${totals.copied}</b>copiados sin cambios</div>
    <div class="card"><b>${totals.transformed}</b>copiados con cambios</div>
    <div class="card"><b>${totals.skipped}</b>fuera del traspaso</div>
    <div class="card"><b>${totals.failed}</b>con error</div>
    <div class="card"><b>${bytes(totals.bytes)}</b>escritos</div>
  </div>

  <h2>Origen y destino</h2>
  <ul>
    ${draft.sources.map((source) => `<li>Origen: ${escape(source.path)}</li>`).join('')}
    <li>Destino: ${escape(execution.outputPath)}</li>
  </ul>
  <p class="muted">Mudanzify solo copió: los archivos de origen no se movieron, cambiaron ni borraron.</p>

  <h2>Orden de empaque</h2>
  <ol>${plan.order.map((category) => `<li>${CATEGORY[category]}</li>`).join('')}</ol>

  <h2>Criterios aplicados</h2>
  ${
    criteria.length === 0
      ? '<p class="muted">Sin criterios: se siguieron las reglas por defecto.</p>'
      : `<ul>${criteria.map((c) => `<li><b>${escape(c.title)}</b>${c.detail ? ` — ${escape(c.detail)}` : ''}</li>`).join('')}</ul>`
  }

  ${
    notes.length === 0
      ? ''
      : `<h2>Para revisar</h2><ul>${notes
          .map((f) => (f.kind === 'empty-cells' ? `<li>«${escape(f.column)}»: ${f.empty} de ${f.total} filas sin dato (${escape(files.get(f.table.fileId)?.relativePath ?? '')})</li>` : ''))
          .join('')}</ul>`
  }

  <h2>Archivos</h2>
  <table>
    <thead><tr><th>Origen</th><th>Caja</th><th>Destino</th><th>Resultado</th><th>Detalle</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <footer class="muted">Generado por Mudanzify el ${date(new Date().toISOString())}. Este informe no incluye el contenido de las tablas.</footer>
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
