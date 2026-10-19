import type { TableData } from '../inventory/tables';
import { classifyColumn, type SensitiveMatch } from './sensitive';

export interface ColumnCheck {
  column: string;
  empty: number;
  sensitive: SensitiveMatch | null;
}

export interface TableCheck {
  sheet: string;
  totalRows: number;
  duplicateRows: number;
  columns: ColumnCheck[];
}

/** Same row ignoring case, repeated spaces and surrounding blanks. */
const rowKey = (row: string[]) => row.map((cell) => cell.trim().replace(/\s+/g, ' ').toLowerCase()).join('\u0001');

/** Duplicate rows, empty cells and sensitive columns of one sheet. Values stay in memory only. */
export function checkTable(table: TableData): TableCheck {
  const width = Math.max(table.header.length, ...table.rows.map((row) => row.length), 0);
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of table.rows) {
    const key = rowKey(Array.from({ length: width }, (_, index) => row[index] ?? ''));
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const columns: ColumnCheck[] = Array.from({ length: width }, (_, index) => {
    const name = table.header[index]?.trim() || `Columna ${index + 1}`;
    const values = table.rows.map((row) => row[index] ?? '');
    return {
      column: name,
      empty: values.filter((value) => value.trim() === '').length,
      sensitive: classifyColumn(name, values),
    };
  });

  return { sheet: table.sheet, totalRows: table.rows.length, duplicateRows, columns };
}
