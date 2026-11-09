import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RECEIPT_FILE_NAME, type Reception } from '../../shared/contract';
import { bytes, date, escape } from '../execution/report';
import { texts } from '../i18n';

/** Like the sender's report, a document for people (texts in `../i18n`) with no cell values. */
function buildHtml(reception: Reception): string {
  const { locale, category, decision, check, receipt: t } = texts();
  const problems = reception.files.filter((file) => file.check === 'missing' || file.check === 'changed');
  const allGood = reception.boxes.every((box) => box.decision === 'accepted') && problems.length === 0;

  const boxes = reception.boxes
    .map(
      (box) => `<tr class="${box.decision}">
        <td>${category[box.category]}</td>
        <td>${box.files}</td>
        <td>${bytes(box.bytes)}</td>
        <td>${box.issues}</td>
        <td><b>${decision[box.decision]}</b>${box.comment ? `<br>${escape(box.comment)}` : ''}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.document} · ${escape(reception.transferName)}</title>
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
  <p class="muted">${t.document} · Mudanzify</p>
  <h1>${escape(reception.transferName)}</h1>
  <p class="muted">${t.sent}: ${date(reception.sentAt)} · ${t.verified}: ${date(reception.verifiedAt)} · ${t.confirmed}: ${date(reception.confirmedAt)}</p>
  <p class="verdict ${allGood ? 'good' : 'bad'}">${
    allGood ? t.allGood : t.withIssues
  }</p>

  <h2>${t.boxes}</h2>
  <table>
    <thead><tr><th>${t.columns.box}</th><th>${t.columns.files}</th><th>${t.columns.size}</th><th>${t.columns.problems}</th><th>${t.columns.decision}</th></tr></thead>
    <tbody>${boxes}</tbody>
  </table>

  ${
    problems.length === 0
      ? `<h2>${t.verification}</h2><p>${t.allMatch}</p>`
      : `<h2>${t.problemFiles}</h2><ul>${problems
          .map((file) => `<li>${escape(file.path)} — ${check[file.check!]}</li>`)
          .join('')}</ul>`
  }
  ${
    reception.extras.length === 0
      ? ''
      : `<h2>${t.extras}</h2><ul>${reception.extras.map((extra) => `<li>${escape(extra)}</li>`).join('')}</ul>`
  }
  <p class="muted">${t.footer(date(new Date().toISOString()))}</p>
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
