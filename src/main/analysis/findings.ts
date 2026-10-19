import type {
  CriterionSuggestion,
  FileFlag,
  Finding,
  FindingChoice,
  Inventory,
  TableRef,
  TransferInterview,
} from '../../shared/contract';
import { newId } from '../transfers/store';
import type { DuplicateGroup } from './duplicates';
import type { TableCheck } from './tableChecks';

/** Avoids flooding the review with one card per column on very wide tables. */
const MAX_EMPTY_CELL_FINDINGS = 30;

/** Criteria the sender kept in the interview (accepted or edited). */
function keptCriteria(interview: TransferInterview | null): CriterionSuggestion[] {
  return (interview?.suggestions ?? []).filter((s) => s.status === 'accepted' || s.status === 'edited');
}

const mentions = (criteria: CriterionSuggestion[], pattern: RegExp) =>
  criteria.some((criterion) => pattern.test(`${criterion.title} ${criterion.detail}`));

/**
 * Suggested choices follow the interview: e.g. "conservar ambos" keeps every
 * duplicate. Without a criterion the suggestion is the careful default.
 */
function suggestions(interview: TransferInterview | null) {
  const criteria = keptCriteria(interview);
  const duplicates = criteria.filter((c) => c.topic === 'duplicates');
  const keepBoth = mentions(duplicates, /ambos|todos|marc/i);
  const scope = criteria.filter((c) => c.topic === 'scope');
  const includeJunk = mentions(scope, /incluir/i) && !mentions(scope, /excluir/i);

  return {
    duplicateFiles: (keepBoth ? 'keep-all' : 'keep-one') as FindingChoice,
    duplicateRows: (keepBoth ? 'keep-all' : 'remove-duplicates') as FindingChoice,
    emptyCells: 'flag' as FindingChoice,
    sensitive: 'mask' as FindingChoice,
    junk: (includeJunk ? 'include' : 'exclude') as FindingChoice,
  };
}

const base = (risk: Finding['risk'], suggested: FindingChoice) => ({
  id: newId(),
  risk,
  suggested,
  choice: null,
  status: 'pending' as const,
});

export interface TableResult {
  table: TableRef;
  check: TableCheck;
}

export function buildFindings(
  inventory: Inventory,
  interview: TransferInterview | null,
  duplicates: DuplicateGroup[],
  tables: TableResult[],
): Finding[] {
  const suggest = suggestions(interview);
  const findings: Finding[] = [];

  for (const group of duplicates) {
    findings.push({ ...base('warn', suggest.duplicateFiles), kind: 'duplicate-files', ...group });
  }

  // Sensitive data first among table findings: it is the highest risk.
  for (const { table, check } of tables) {
    for (const column of check.columns) {
      if (!column.sensitive) continue;
      findings.push({
        ...base('danger', suggest.sensitive),
        kind: 'sensitive-column',
        table,
        column: column.column,
        sensitiveType: column.sensitive.type,
        matches: column.sensitive.matches,
        total: check.totalRows,
        example: column.sensitive.example,
      });
    }
  }

  for (const { table, check } of tables) {
    if (check.duplicateRows > 0) {
      findings.push({
        ...base('warn', suggest.duplicateRows),
        kind: 'duplicate-rows',
        table,
        duplicateRows: check.duplicateRows,
        totalRows: check.totalRows,
      });
    }
  }

  let emptyCount = 0;
  for (const { table, check } of tables) {
    for (const column of check.columns) {
      if (column.empty === 0 || emptyCount >= MAX_EMPTY_CELL_FINDINGS) continue;
      emptyCount++;
      findings.push({
        ...base('warn', suggest.emptyCells),
        kind: 'empty-cells',
        table,
        column: column.column,
        empty: column.empty,
        total: check.totalRows,
      });
    }
  }

  const flags: FileFlag[] = ['temporary', 'hidden', 'empty'];
  for (const flag of flags) {
    const fileIds = inventory.files.filter((file) => file.flags.includes(flag)).map((file) => file.id);
    if (fileIds.length > 0) findings.push({ ...base('warn', suggest.junk), kind: 'junk-files', flag, fileIds });
  }

  return findings;
}
