import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RECEIPT_FILE_NAME, type BoxDecision, type FileCheck, type Reception } from '../../shared/contract';
import { bytes, CATEGORY, date, escape } from '../execution/report';

/** Like the sender's report, a document for people: Spanish texts, no cell values. */
const DECISION: Record<BoxDecision, string> = {
  pending: 'Sin revisar',
  accepted: 'Recibida conforme',
  reported: 'Con problema',
};

const CHECK: Record<FileCheck, string> = {
  ok: 'Idéntico',
  unverified: 'Mismo tamaño (sin huella)',
  missing: 'Falta',
  changed: 'Distinto al enviado',
};

function buildHtml(reception: Reception): string {
  const problems = reception.files.filter((file) => file.check === 'missing' || file.check === 'changed');
  const allGood = reception.boxes.every((box) => box.decision === 'accepted') && problems.length === 0;

  const boxes = reception.boxes
    .map(
      (box) => `<tr class="${box.decision}">
        <td>${CATEGORY[box.category]}</td>
        <td>${box.files}</td>
        <td>${bytes(box.bytes)}</td>
        <td>${box.issues}</td>
        <td><b>${DECISION[box.decision]}</b>${box.comment ? `<br>${escape(box.comment)}` : ''}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acuse de recibo · ${escape(reception.transferName)}</title>
<style>
  :root { --ink:#1f1b16; --muted:#6b6258; --line:#e7dfd3; --paper:#fbf8f3; --ok:#15803d; --bad:#b91c1c; }
  body { margin: 0; font: 15px/1.55 system-ui, "Segoe UI", sans-serif; color: var(--ink); background: var(--paper); }
  main { max-width: 900px; margin: 0 auto; padding: 40px 24px 64px; }
  h1 { margin: 0 0 4px; font-size: 28px; }
  h2 { margin: 32px 0 12px; font-size: 18px; }
  .muted { color: var(--muted); }
  .verdict { margin-top: 20px; padding: 16px; border-radius: 16px; font-weight: 600; }
  .good { background: #dcfce7; color: var(--ok); }
  .bad { background: #fee2e2; color: var(--bad); }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 14px; }
  th { background: #f4eee5; }
  .reported b { color: var(--bad); }
  .accepted b { color: var(--ok); }
</style>
</head>
<body>
<main>
  <p class="muted">Acuse de recibo · Mudanzify</p>
  <h1>${escape(reception.transferName)}</h1>
  <p class="muted">Enviado: ${date(reception.sentAt)} · Verificado: ${date(reception.verifiedAt)} · Confirmado: ${date(reception.confirmedAt)}</p>
  <p class="verdict ${allGood ? 'good' : 'bad'}">${
    allGood ? 'Todo llegó completo y sin cambios. Recepción conforme.' : 'La recepción tiene observaciones: revisa las cajas marcadas con problema.'
  }</p>

  <h2>Cajas</h2>
  <table>
    <thead><tr><th>Caja</th><th>Archivos</th><th>Tamaño</th><th>Problemas</th><th>Decisión</th></tr></thead>
    <tbody>${boxes}</tbody>
  </table>

  ${
    problems.length === 0
      ? '<h2>Verificación</h2><p>Todos los archivos coinciden con lo que se envió.</p>'
      : `<h2>Archivos con problemas</h2><ul>${problems
          .map((file) => `<li>${escape(file.path)} — ${CHECK[file.check!]}</li>`)
          .join('')}</ul>`
  }
  ${
    reception.extras.length === 0
      ? ''
      : `<h2>Archivos que no estaban en el envío</h2><ul>${reception.extras.map((extra) => `<li>${escape(extra)}</li>`).join('')}</ul>`
  }
  <p class="muted">Generado por Mudanzify el ${date(new Date().toISOString())}.</p>
</main>
</body>
</html>`;
}

/** Writes the receipt into the received folder so the sender can read it. */
export async function writeReceipt(reception: Reception): Promise<string> {
  const receiptPath = path.join(reception.folderPath, RECEIPT_FILE_NAME);
  await writeFile(receiptPath, buildHtml(reception), 'utf8');
  return receiptPath;
}
