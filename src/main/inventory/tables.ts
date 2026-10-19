import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { ColumnProfile, SheetProfile } from '../../shared/contract';

/** Rows inspected per sheet to measure empty cells. */
const SAMPLE_ROW_LIMIT = 1000;
/** Rows kept as a preview for the UI. */
const PREVIEW_ROWS = 5;
const PREVIEW_CELL_LENGTH = 60;
/** Bytes read from a CSV to build its profile. */
const CSV_SAMPLE_BYTES = 2 * 1024 * 1024;
/** ExcelJS loads the whole workbook in memory, so very large files are skipped. */
export const XLSX_MAX_BYTES = 25 * 1024 * 1024;

const isBlank = (value: string) => value.trim() === '';
const clip = (value: string) =>
  value.length > PREVIEW_CELL_LENGTH ? `${value.slice(0, PREVIEW_CELL_LENGTH - 1)}…` : value;

/** Builds column stats from a header row and sampled data rows. */
function profileRows(header: string[], rows: string[][], totalRows: number, name: string): SheetProfile {
  const width = Math.max(header.length, ...rows.map((row) => row.length), 0);
  const columns: ColumnProfile[] = Array.from({ length: width }, (_, index) => {
    const filled = rows.filter((row) => !isBlank(row[index] ?? '')).length;
    const label = header[index]?.trim();
    return { name: label || `Columna ${index + 1}`, filled, empty: rows.length - filled };
  });

  return {
    name,
    rowCount: totalRows,
    sampledRows: rows.length,
    columns,
    sampleRows: rows.slice(0, PREVIEW_ROWS).map((row) => columns.map((_, index) => clip(row[index] ?? ''))),
  };
}

/* ------------------------------- CSV ------------------------------- */

function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  return candidates.reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );
}

/** Small RFC 4180 parser: quoted fields, escaped quotes and newlines inside quotes. */
export function parseCsv(text: string, delimiter: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if ((field !== '' || row.length > 0) && rows.length < maxRows) rows.push([...row, field]);
  return rows.filter((candidate) => candidate.some((cell) => !isBlank(cell)));
}

/** Spanish Excel exports CSV as Windows-1252: fall back to latin1 when UTF-8 is invalid. */
function decode(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  const text = utf8.includes('�') ? buffer.toString('latin1') : utf8;
  return text.replace(/^﻿/, '');
}

async function countLines(filePath: string): Promise<number> {
  let lines = 0;
  let lastByte = 10;
  for await (const chunk of createReadStream(filePath) as AsyncIterable<Buffer>) {
    for (const byte of chunk) if (byte === 10) lines++;
    lastByte = chunk[chunk.length - 1] ?? lastByte;
  }
  return lastByte === 10 ? lines : lines + 1;
}

export async function profileCsv(filePath: string, name: string): Promise<SheetProfile[]> {
  const { size } = await stat(filePath);
  const handle = await open(filePath, 'r');
  let text: string;
  try {
    const buffer = Buffer.alloc(Math.min(size, CSV_SAMPLE_BYTES));
    await handle.read(buffer, 0, buffer.length, 0);
    text = decode(buffer);
  } finally {
    await handle.close();
  }

  const delimiter = name.toLowerCase().endsWith('.tsv') ? '\t' : detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '');
  const [header = [], ...rows] = parseCsv(text, delimiter, SAMPLE_ROW_LIMIT + 1);
  // Exact count when the whole file was parsed; otherwise count lines (approximate if fields contain newlines).
  const totalRows = size <= CSV_SAMPLE_BYTES ? rows.length : Math.max(0, (await countLines(filePath)) - 1);
  return [profileRows(header, rows, totalRows, name)];
}

/* ------------------------------- XLSX ------------------------------ */

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return String(value.text);
    if ('result' in value) return cellToString(value.result as ExcelJS.CellValue);
    if ('error' in value) return String(value.error);
    return '';
  }
  return String(value);
}

function rowValues(row: ExcelJS.Row, width: number): string[] {
  return Array.from({ length: width }, (_, index) => cellToString(row.getCell(index + 1).value));
}

export async function profileXlsx(filePath: string): Promise<SheetProfile[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  return workbook.worksheets.map((sheet) => {
    const width = sheet.actualColumnCount;
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length <= SAMPLE_ROW_LIMIT) rows.push(rowValues(row, width));
    });
    const [header = [], ...data] = rows;
    return profileRows(header, data, Math.max(0, sheet.actualRowCount - 1), sheet.name);
  });
}
