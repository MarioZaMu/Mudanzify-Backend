import { readFile, writeFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { SensitiveType, TableChange } from '../../shared/contract';
import { mask } from '../analysis/sensitive';
import { cellToString, decode, detectDelimiter, parseCsv, rowValues } from '../inventory/tables';

/** Same name the analysis gave each column (see analysis/tableChecks.ts). */
const columnName = (header: string[], index: number) => header[index]?.trim() || `Columna ${index + 1}`;

const rowKey = (row: string[]) => row.map((cell) => cell.trim().replace(/\s+/g, ' ').toLowerCase()).join('\u0001');

/** Masks a cell; values that do not look like the detected type are hidden completely. */
function maskValue(type: SensitiveType, value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return value;
  if (type === 'email' && !trimmed.includes('@')) return '•••';
  if (type !== 'email' && trimmed.replace(/\D/g, '').length < 3) return '•••';
  return mask(type, trimmed);
}

function columnIndexes(header: string[], width: number, column: string): number[] {
  return Array.from({ length: width }, (_, index) => index).filter((index) => columnName(header, index) === column);
}

/** Applies the changes to one sheet held in memory as plain rows. */
function transformRows(header: string[], rows: string[][], changes: TableChange[]) {
  const width = Math.max(header.length, ...rows.map((row) => row.length), 0);
  const padded = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
  let data = padded;

  if (changes.some((change) => change.kind === 'remove-duplicates')) {
    const seen = new Set<string>();
    data = padded.filter((row) => {
      const key = rowKey(row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const newHeader = Array.from({ length: width }, (_, index) => header[index] ?? '');
  const dropped = new Set<number>();
  for (const change of changes) {
    if (change.kind === 'remove-duplicates') continue;
    for (const index of columnIndexes(header, width, change.column)) {
      if (change.kind === 'mask') data = data.map((row) => row.map((cell, i) => (i === index ? maskValue(change.type, cell) : cell)));
      if (change.kind === 'rename') newHeader[index] = change.to;
      if (change.kind === 'drop-column') dropped.add(index);
    }
  }
  const keep = (_: string, index: number) => !dropped.has(index);
  return { header: newHeader.filter(keep), rows: data.map((row) => row.filter(keep)) };
}

const csvField = (value: string, delimiter: string) =>
  /["\r\n]/.test(value) || value.includes(delimiter) ? `"${value.replace(/"/g, '""')}"` : value;

async function writeCsv(source: string, target: string, name: string, changes: TableChange[]) {
  const text = decode(await readFile(source));
  const delimiter = name.toLowerCase().endsWith('.tsv') ? '\t' : detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '');
  const [header = [], ...rows] = parseCsv(text, delimiter, Number.POSITIVE_INFINITY);
  const result = transformRows(header, rows, changes);
  const lines = [result.header, ...result.rows].map((row) => row.map((cell) => csvField(cell, delimiter)).join(delimiter));
  // BOM so Excel opens accents correctly; "wx" never overwrites an existing file.
  await writeFile(target, `﻿${lines.join('\r\n')}\r\n`, { encoding: 'utf8', flag: 'wx' });
}

/** Edits the workbook in place so formats, widths and other sheets are kept. */
async function writeXlsx(source: string, target: string, changes: TableChange[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(source);

  for (const sheet of workbook.worksheets) {
    const sheetChanges = changes.filter((change) => change.sheet === sheet.name);
    if (sheetChanges.length === 0) continue;

    const width = sheet.actualColumnCount;
    const rowNumbers: number[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => rowNumbers.push(row.number));
    const [headerRow, ...dataRows] = rowNumbers;
    if (headerRow === undefined) continue;
    const header = rowValues(sheet.getRow(headerRow), width);

    if (sheetChanges.some((change) => change.kind === 'remove-duplicates')) {
      const seen = new Set<string>();
      const duplicates = dataRows.filter((number) => {
        const key = rowKey(rowValues(sheet.getRow(number), width));
        if (seen.has(key)) return true;
        seen.add(key);
        return false;
      });
      // From the bottom up, so the row numbers still to remove do not shift.
      for (const number of duplicates.reverse()) sheet.spliceRows(number, 1);
    }

    const dropped = new Set<number>();
    for (const change of sheetChanges) {
      if (change.kind === 'remove-duplicates') continue;
      for (const index of columnIndexes(header, width, change.column)) {
        if (change.kind === 'rename') sheet.getRow(headerRow).getCell(index + 1).value = change.to;
        if (change.kind === 'drop-column') dropped.add(index);
        if (change.kind === 'mask') {
          sheet.eachRow({ includeEmpty: false }, (row) => {
            if (row.number === headerRow) return;
            const cell = row.getCell(index + 1);
            const value = cellToString(cell.value);
            if (value.trim() !== '') cell.value = maskValue(change.type, value);
          });
        }
      }
    }
    for (const index of [...dropped].sort((a, b) => b - a)) sheet.spliceColumns(index + 1, 1);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  await writeFile(target, Buffer.from(buffer as ArrayBuffer), { flag: 'wx' });
}

/** Writes a changed copy of a table; the original file is only read. */
export async function writeTransformedTable(
  source: string,
  target: string,
  format: 'csv' | 'xlsx',
  name: string,
  changes: TableChange[],
): Promise<void> {
  if (format === 'csv') await writeCsv(source, target, name, changes);
  else await writeXlsx(source, target, changes);
}
