import type { BoxDecision, FileCategory, FileCheck, ItemStatus, Language, SkipReason, TransferExecution } from '../../shared/contract';
import { getLanguage } from '../language';

/**
 * Texts the main process shows or writes: native dialogs, the default transfer
 * name and the HTML documents (report and receipt). The renderer has its own
 * dictionary; only these live here because they never pass through the UI.
 */
export interface Texts {
  /** BCP 47 tag for dates and numbers. */
  locale: string;
  dialogs: {
    receivedFolder: { title: string; button: string };
    sourceFolders: { title: string; button: string };
    sourceFiles: { title: string; button: string };
    spreadsheets: string;
    allFiles: string;
    destination: { title: string; button: string };
  };
  defaultName: (date: string) => string;
  /** How the AI model is told to write, so its answers match the interface language. */
  model: { language: string; style: string };
  category: Record<FileCategory, string>;
  decision: Record<BoxDecision, string>;
  check: Record<FileCheck, string>;
  report: {
    document: string;
    status: Record<ItemStatus, string>;
    reason: Record<SkipReason, string>;
    run: Record<TransferExecution['status'], string>;
    unknownError: string;
    verified: string;
    mask: (column: string, where: string) => string;
    dropColumn: (column: string, where: string) => string;
    removeDuplicates: (rows: number, where: string) => string;
    rename: (column: string, to: string, where: string) => string;
    state: string;
    start: string;
    end: string;
    cards: { copied: string; transformed: string; skipped: string; failed: string; written: string };
    originAndDestination: string;
    origin: string;
    destination: string;
    copyOnly: string;
    packingOrder: string;
    criteria: string;
    noCriteria: string;
    toReview: string;
    gaps: (column: string, empty: number, total: number, file: string) => string;
    files: string;
    columns: { origin: string; box: string; destination: string; result: string; detail: string };
    footer: (when: string) => string;
  };
  receipt: {
    document: string;
    sent: string;
    verified: string;
    confirmed: string;
    allGood: string;
    withIssues: string;
    boxes: string;
    columns: { box: string; files: string; size: string; problems: string; decision: string };
    verification: string;
    allMatch: string;
    problemFiles: string;
    extras: string;
    footer: (when: string) => string;
  };
}

const es: Texts = {
  locale: 'es',
  dialogs: {
    receivedFolder: { title: 'Elige la carpeta que recibiste', button: 'Abrir' },
    sourceFolders: { title: 'Elige las carpetas de origen', button: 'Agregar' },
    sourceFiles: { title: 'Elige los archivos de origen', button: 'Agregar' },
    spreadsheets: 'Hojas de cálculo',
    allFiles: 'Todos los archivos',
    destination: { title: 'Elige la carpeta de destino', button: 'Usar esta carpeta' },
  },
  defaultName: (date) => `Traspaso del ${date}`,
  model: { language: 'Spanish', style: 'neutral, friendly Spanish (Latin America), short and clear. Use "tú"' },
  category: {
    documents: 'Documentos',
    spreadsheets: 'Hojas de cálculo',
    images: 'Imágenes',
    media: 'Audio y video',
    archives: 'Comprimidos',
    code: 'Código y datos',
    other: 'Otros archivos',
  },
  decision: { pending: 'Sin revisar', accepted: 'Recibida conforme', reported: 'Con problema' },
  check: {
    ok: 'Idéntico',
    unverified: 'Mismo tamaño (sin huella)',
    missing: 'Falta',
    changed: 'Distinto al enviado',
  },
  report: {
    document: 'Informe de Mudanzify',
    status: {
      pending: 'Sin procesar',
      copied: 'Copiado',
      transformed: 'Copiado con cambios',
      skipped: 'Fuera del traspaso',
      failed: 'Error',
    },
    reason: {
      duplicate: 'Duplicado: se conservó otra copia idéntica',
      junk: 'Archivo temporal, oculto o vacío',
      'too-large': 'Tabla demasiado grande para aplicar los cambios con seguridad',
    },
    run: { running: 'En curso', done: 'Completado', cancelled: 'Cancelado', failed: 'Con errores' },
    unknownError: 'Error desconocido',
    verified: 'Verificado (contenido idéntico)',
    mask: (column, where) => `«${column}» enmascarada (${where})`,
    dropColumn: (column, where) => `«${column}» quitada (${where})`,
    removeDuplicates: (rows, where) =>
      `${rows} ${rows === 1 ? 'fila repetida quitada' : 'filas repetidas quitadas'} (${where})`,
    rename: (column, to, where) => `«${column}» → «${to}» (${where})`,
    state: 'Estado',
    start: 'Inicio',
    end: 'Fin',
    cards: {
      copied: 'copiados sin cambios',
      transformed: 'copiados con cambios',
      skipped: 'fuera del traspaso',
      failed: 'con error',
      written: 'escritos',
    },
    originAndDestination: 'Origen y destino',
    origin: 'Origen',
    destination: 'Destino',
    copyOnly: 'Mudanzify solo copió: los archivos de origen no se movieron, cambiaron ni borraron.',
    packingOrder: 'Orden de empaque',
    criteria: 'Criterios aplicados',
    noCriteria: 'Sin criterios: se siguieron las reglas por defecto.',
    toReview: 'Para revisar',
    gaps: (column, empty, total, file) => `«${column}»: ${empty} de ${total} filas sin dato (${file})`,
    files: 'Archivos',
    columns: { origin: 'Origen', box: 'Caja', destination: 'Destino', result: 'Resultado', detail: 'Detalle' },
    footer: (when) => `Generado por Mudanzify el ${when}. Este informe no incluye el contenido de las tablas.`,
  },
  receipt: {
    document: 'Acuse de recibo',
    sent: 'Enviado',
    verified: 'Verificado',
    confirmed: 'Confirmado',
    allGood: 'Todo llegó completo y sin cambios. Recepción conforme.',
    withIssues: 'La recepción tiene observaciones: revisa las cajas marcadas con problema.',
    boxes: 'Cajas',
    columns: { box: 'Caja', files: 'Archivos', size: 'Tamaño', problems: 'Problemas', decision: 'Decisión' },
    verification: 'Verificación',
    allMatch: 'Todos los archivos coinciden con lo que se envió.',
    problemFiles: 'Archivos con problemas',
    extras: 'Archivos que no estaban en el envío',
    footer: (when) => `Generado por Mudanzify el ${when}.`,
  },
};

const en: Texts = {
  locale: 'en',
  dialogs: {
    receivedFolder: { title: 'Choose the folder you received', button: 'Open' },
    sourceFolders: { title: 'Choose the source folders', button: 'Add' },
    sourceFiles: { title: 'Choose the source files', button: 'Add' },
    spreadsheets: 'Spreadsheets',
    allFiles: 'All files',
    destination: { title: 'Choose the destination folder', button: 'Use this folder' },
  },
  defaultName: (date) => `Transfer of ${date}`,
  model: { language: 'English', style: 'neutral, friendly English, short and clear' },
  category: {
    documents: 'Documents',
    spreadsheets: 'Spreadsheets',
    images: 'Images',
    media: 'Audio and video',
    archives: 'Compressed',
    code: 'Code and data',
    other: 'Other files',
  },
  decision: { pending: 'Not reviewed', accepted: 'Received in good order', reported: 'With a problem' },
  check: {
    ok: 'Identical',
    unverified: 'Same size (no fingerprint)',
    missing: 'Missing',
    changed: 'Different from what was sent',
  },
  report: {
    document: 'Mudanzify Report',
    status: {
      pending: 'Not processed',
      copied: 'Copied',
      transformed: 'Copied with changes',
      skipped: 'Left out of the transfer',
      failed: 'Error',
    },
    reason: {
      duplicate: 'Duplicate: another identical copy was kept',
      junk: 'Temporary, hidden or empty file',
      'too-large': 'Table too large to apply the changes safely',
    },
    run: { running: 'In progress', done: 'Completed', cancelled: 'Cancelled', failed: 'With errors' },
    unknownError: 'Unknown error',
    verified: 'Verified (identical content)',
    mask: (column, where) => `“${column}” masked (${where})`,
    dropColumn: (column, where) => `“${column}” removed (${where})`,
    removeDuplicates: (rows, where) =>
      `${rows} ${rows === 1 ? 'repeated row removed' : 'repeated rows removed'} (${where})`,
    rename: (column, to, where) => `“${column}” → “${to}” (${where})`,
    state: 'Status',
    start: 'Start',
    end: 'End',
    cards: {
      copied: 'copied unchanged',
      transformed: 'copied with changes',
      skipped: 'left out of the transfer',
      failed: 'with errors',
      written: 'written',
    },
    originAndDestination: 'Source and destination',
    origin: 'Source',
    destination: 'Destination',
    copyOnly: 'Mudanzify only copied: the source files were not moved, changed or deleted.',
    packingOrder: 'Packing order',
    criteria: 'Criteria applied',
    noCriteria: 'No criteria: the default rules were followed.',
    toReview: 'To review',
    gaps: (column, empty, total, file) => `“${column}”: ${empty} of ${total} rows without data (${file})`,
    files: 'Files',
    columns: { origin: 'Source', box: 'Box', destination: 'Destination', result: 'Result', detail: 'Detail' },
    footer: (when) => `Generated by Mudanzify on ${when}. This report does not include the content of the tables.`,
  },
  receipt: {
    document: 'Receipt',
    sent: 'Sent',
    verified: 'Verified',
    confirmed: 'Confirmed',
    allGood: 'Everything arrived complete and unchanged. Reception in good order.',
    withIssues: 'The reception has remarks: check the boxes marked with a problem.',
    boxes: 'Boxes',
    columns: { box: 'Box', files: 'Files', size: 'Size', problems: 'Problems', decision: 'Decision' },
    verification: 'Verification',
    allMatch: 'All files match what was sent.',
    problemFiles: 'Files with problems',
    extras: 'Files that were not in the delivery',
    footer: (when) => `Generated by Mudanzify on ${when}.`,
  },
};

const TEXTS: Record<Language, Texts> = { es, en };

/** Every name a category has across languages, to match text written before a language switch. */
export const categoryNamesInAnyLanguage = (category: FileCategory): string[] =>
  Object.values(TEXTS).map((entry) => entry.category[category]);

/** Texts in the language the user picked in the interface. */
export const texts = (): Texts => TEXTS[getLanguage()];
