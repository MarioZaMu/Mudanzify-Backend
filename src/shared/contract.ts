/**
 * IPC contract shared between the backend (main + preload) and the frontend.
 *
 * This file is the single source of truth. The frontend keeps a synced copy
 * (see `npm run sync:contract` in mudanzify-frontend), so it must stay
 * dependency-free: only types and constants, no Node or Electron imports.
 */

export const CONTRACT_VERSION = 8;

/** Name of the object the preload script exposes on `window`. */
export const BRIDGE_KEY = 'mudanzify';

/** Every IPC channel the renderer is allowed to invoke. */
export const IpcChannel = {
  AppGetInfo: 'app:get-info',
  ThemeGet: 'theme:get',
  ThemeSet: 'theme:set',
  OnboardingGet: 'onboarding:get',
  OnboardingComplete: 'onboarding:complete',
  OnboardingReset: 'onboarding:reset',
  TransfersList: 'transfers:list',
  TransfersCreate: 'transfers:create',
  TransfersGet: 'transfers:get',
  TransfersRename: 'transfers:rename',
  TransfersRemove: 'transfers:remove',
  TransfersAddSources: 'transfers:add-sources',
  TransfersRemoveSource: 'transfers:remove-source',
  TransfersPickDestination: 'transfers:pick-destination',
  TransfersScan: 'transfers:scan',
  AiGetStatus: 'ai:get-status',
  InterviewStart: 'interview:start',
  InterviewAnswer: 'interview:answer',
  InterviewReview: 'interview:review',
  InterviewFinish: 'interview:finish',
  InterviewReset: 'interview:reset',
  AnalysisRun: 'analysis:run',
  AnalysisDecideFinding: 'analysis:decide-finding',
  AnalysisReviewMapping: 'analysis:review-mapping',
  AnalysisSetPriority: 'analysis:set-priority',
  AnalysisConfirm: 'analysis:confirm',
  AnalysisReset: 'analysis:reset',
  ExecutionPreview: 'execution:preview',
  ExecutionStart: 'execution:start',
  ExecutionCancel: 'execution:cancel',
  ExecutionOpenOutput: 'execution:open-output',
  ExecutionOpenReport: 'execution:open-report',
  ExecutionReset: 'execution:reset',
  ReceptionsList: 'receptions:list',
  ReceptionsOpen: 'receptions:open',
  ReceptionsGet: 'receptions:get',
  ReceptionsRemove: 'receptions:remove',
  ReceptionsVerify: 'receptions:verify',
  ReceptionsReviewBox: 'receptions:review-box',
  ReceptionsConfirm: 'receptions:confirm',
  ReceptionsReopen: 'receptions:reopen',
  ReceptionsOpenFolder: 'receptions:open-folder',
  ReceptionsOpenReport: 'receptions:open-report',
  ReceptionsOpenReceipt: 'receptions:open-receipt',
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];

/** Channels the backend uses to push events to the renderer. */
export const IpcEvent = {
  ThemeChanged: 'theme:changed',
  ScanProgress: 'transfers:scan-progress',
  AnalysisProgress: 'analysis:progress',
  ExecutionProgress: 'execution:progress',
  VerifyProgress: 'receptions:verify-progress',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  versions: {
    electron: string;
    chrome: string;
    node: string;
  };
  contractVersion: number;
}

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface ThemeState {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is actually shown after resolving "system". */
  resolved: 'light' | 'dark';
}

/** Sender prepares and hands over data; receiver reviews and confirms it. */
export const USER_ROLES = ['sender', 'receiver'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface OnboardingState {
  completed: boolean;
  role: UserRole | null;
}

/* ------------------------------------------------------------------ */
/* Transfers: origin, inventory and destination (phase 4)              */
/* ------------------------------------------------------------------ */

/**
 * Paths never travel from the renderer to the backend: they only come from
 * native dialogs opened by the main process. The renderer works with ids.
 */
export type SourceKind = 'folder' | 'file';

export interface TransferSource {
  id: string;
  kind: SourceKind;
  path: string;
  name: string;
}

export const FILE_CATEGORIES = [
  'documents',
  'spreadsheets',
  'images',
  'media',
  'archives',
  'code',
  'other',
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number];

/** Signals found while scanning; the AI analysis (phase 6) goes much deeper. */
export type FileFlag = 'hidden' | 'temporary' | 'empty';

export type RiskLevel = 'safe' | 'warn' | 'danger';

export interface InventoryFile {
  id: string;
  sourceId: string;
  /** Path relative to its source, using "/" separators. */
  relativePath: string;
  name: string;
  extension: string;
  size: number;
  /** ISO date. */
  modifiedAt: string;
  category: FileCategory;
  flags: FileFlag[];
}

export interface ColumnProfile {
  name: string;
  filled: number;
  empty: number;
}

export interface SheetProfile {
  name: string;
  rowCount: number;
  /** Rows actually inspected to compute filled/empty counts. */
  sampledRows: number;
  columns: ColumnProfile[];
  sampleRows: string[][];
}

export interface TableProfile {
  fileId: string;
  fileName: string;
  format: 'csv' | 'xlsx';
  sheets: SheetProfile[];
}

/** A group of files of the same category: one "box" in the moving metaphor. */
export interface InventoryBox {
  id: FileCategory;
  fileCount: number;
  bytes: number;
  flaggedCount: number;
  risk: RiskLevel;
}

export type InventoryIssueKind = 'unreadable' | 'table-too-large' | 'table-unreadable' | 'limit-reached';

export interface InventoryIssue {
  kind: InventoryIssueKind;
  path: string;
}

export interface Inventory {
  scannedAt: string;
  totals: { files: number; folders: number; bytes: number; tables: number };
  boxes: InventoryBox[];
  files: InventoryFile[];
  tables: TableProfile[];
  issues: InventoryIssue[];
  /** True when the file limit was reached and not everything was listed. */
  truncated: boolean;
}

export type DestinationConflict = 'inside-source' | 'not-writable' | 'not-enough-space';

export interface TransferDestination {
  path: string;
  name: string;
  writable: boolean;
  freeBytes: number | null;
  conflicts: DestinationConflict[];
}

export interface TransferDraft {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sources: TransferSource[];
  inventory: Inventory | null;
  destination: TransferDestination | null;
  /** AI guided interview (phase 5); null until it starts. */
  interview: TransferInterview | null;
  /** Detection, column mapping and priority (phase 6); null until it runs. */
  analysis: TransferAnalysis | null;
  /** Last run of the copy (phase 7); null until it starts. */
  execution: TransferExecution | null;
}

export interface TransferSummary {
  id: string;
  name: string;
  updatedAt: string;
  sourceCount: number;
  fileCount: number | null;
  totalBytes: number | null;
  hasDestination: boolean;
}

export interface ScanProgress {
  transferId: string;
  phase: 'walking' | 'tables' | 'done';
  filesSeen: number;
  bytesSeen: number;
  currentPath: string;
}

/* ------------------------------------------------------------------ */
/* AI guided interview (phase 5)                                       */
/* ------------------------------------------------------------------ */

/**
 * `ai` uses the real model (API key in .env); `demo` uses scripted questions
 * so the app can be tried without a key. The UI always says which one is on.
 */
export type AiMode = 'ai' | 'demo';

export interface AiStatus {
  mode: AiMode;
  /** Model id when mode is `ai`. */
  model: string | null;
}

/** How many questions the interviewer may ask. */
export const INTERVIEW_LIMITS = { minQuestions: 3, maxQuestions: 6 } as const;

export interface InterviewQuestion {
  id: string;
  text: string;
  /** Why the AI asks this, shown to the user for transparency. */
  why: string;
  /** Quick answers; the user can also write their own. */
  options: string[];
  multiple: boolean;
}

export interface InterviewAnswer {
  choices: string[];
  text: string;
  skipped: boolean;
}

export interface InterviewTurn {
  question: InterviewQuestion;
  /** Null while the question is waiting for an answer. */
  answer: InterviewAnswer | null;
}

export const CRITERION_TOPICS = ['scope', 'priority', 'duplicates', 'gaps', 'sensitive', 'other'] as const;
export type CriterionTopic = (typeof CRITERION_TOPICS)[number];

export type SuggestionStatus = 'pending' | 'accepted' | 'edited' | 'rejected';

/** A transfer rule proposed by the AI. Only the sender can accept it. */
export interface CriterionSuggestion {
  id: string;
  topic: CriterionTopic;
  title: string;
  detail: string;
  status: SuggestionStatus;
  /** The AI's original wording, kept when the sender edits it. */
  original: { title: string; detail: string } | null;
}

/** asking → reviewing (summary + suggestions) → done (criteria confirmed). */
export type InterviewStatus = 'asking' | 'reviewing' | 'done';

export interface TransferInterview {
  mode: AiMode;
  status: InterviewStatus;
  turns: InterviewTurn[];
  summary: string | null;
  suggestions: CriterionSuggestion[];
}

/** Answer sent by the renderer; null skips the question. */
export interface InterviewAnswerInput {
  choices: string[];
  text: string;
}

export type ReviewDecision =
  | { action: 'accept' }
  | { action: 'reject' }
  | { action: 'undo' }
  | { action: 'edit'; title: string; detail: string };

/* ------------------------------------------------------------------ */
/* Detection, column mapping and priority (phase 6)                    */
/* ------------------------------------------------------------------ */

/**
 * Detection runs locally: values never leave the computer. The AI only sees
 * counts and column names to explain, map columns and propose a priority.
 */
export type FindingKind = 'duplicate-files' | 'duplicate-rows' | 'empty-cells' | 'sensitive-column' | 'junk-files';

export type FindingChoice =
  | 'keep-one'
  | 'keep-all'
  | 'remove-duplicates'
  | 'flag'
  | 'ignore'
  | 'mask'
  | 'exclude'
  | 'include';

/** Options the sender can pick for each kind; the last one always leaves the data as it is. */
export const FINDING_CHOICES: Record<FindingKind, readonly FindingChoice[]> = {
  'duplicate-files': ['keep-one', 'keep-all'],
  'duplicate-rows': ['remove-duplicates', 'keep-all'],
  'empty-cells': ['flag', 'ignore'],
  'sensitive-column': ['mask', 'exclude', 'include'],
  'junk-files': ['exclude', 'include'],
};

/** accepted = took the suggestion, changed = picked another option, dismissed = left the data as is. */
export type FindingStatus = 'pending' | 'accepted' | 'changed' | 'dismissed';

export type SensitiveType = 'email' | 'phone' | 'national-id' | 'card';

export interface TableRef {
  fileId: string;
  sheet: string;
}

interface FindingBase {
  id: string;
  risk: RiskLevel;
  suggested: FindingChoice;
  choice: FindingChoice | null;
  status: FindingStatus;
}

export type Finding = FindingBase &
  (
    | { kind: 'duplicate-files'; fileIds: string[]; keepFileId: string; bytes: number }
    | { kind: 'duplicate-rows'; table: TableRef; duplicateRows: number; totalRows: number }
    | { kind: 'empty-cells'; table: TableRef; column: string; empty: number; total: number }
    | {
        kind: 'sensitive-column';
        table: TableRef;
        column: string;
        sensitiveType: SensitiveType;
        matches: number;
        total: number;
        /** A masked example such as "a***@correo.com"; it stays on this computer. */
        example: string;
      }
    | { kind: 'junk-files'; flag: FileFlag; fileIds: string[] }
  );

export type FindingDecision =
  | { action: 'accept' }
  | { action: 'change'; choice: FindingChoice }
  | { action: 'dismiss' }
  | { action: 'undo' };

export interface ColumnSource extends TableRef {
  column: string;
}

/** Columns that hold the same data under different names, unified under one name. */
export interface ColumnMapping {
  id: string;
  standardName: string;
  sources: ColumnSource[];
  reason: string;
  status: SuggestionStatus;
  /** The AI's original name, kept when the sender edits it. */
  original: string | null;
}

export type MappingDecision =
  | { action: 'accept' }
  | { action: 'reject' }
  | { action: 'undo' }
  | { action: 'edit'; standardName: string };

export interface PriorityPlan {
  /** Boxes in the order they will be packed. */
  order: FileCategory[];
  /** The AI's proposal, to compare with or go back to. */
  suggested: FileCategory[];
  reasons: Partial<Record<FileCategory, string>>;
  status: SuggestionStatus;
}

export type PriorityDecision = { action: 'accept' } | { action: 'reorder'; order: FileCategory[] } | { action: 'reset' };

export interface TransferAnalysis {
  analyzedAt: string;
  mode: AiMode;
  /** Short explanation of the findings, written by the AI (or the demo script). */
  summary: string;
  findings: Finding[];
  mappings: ColumnMapping[];
  priority: PriorityPlan;
  /** Tables that could not be read completely (too large or damaged). */
  skippedTables: string[];
  confirmed: boolean;
}

export interface AnalysisProgress {
  transferId: string;
  phase: 'hashing' | 'tables' | 'ai';
  done: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/* Plan, execution and report (phase 7)                                */
/* ------------------------------------------------------------------ */

/**
 * The transfer only copies: the origin is never moved, changed or deleted.
 * Everything goes into a new folder inside the destination, so nothing that
 * already exists there is overwritten.
 */
export type PlanAction = 'copy' | 'transform' | 'skip';

/** Why a file is not copied. */
export type SkipReason = 'duplicate' | 'junk' | 'too-large';

/** Changes written into the copy of a table; the original stays as it is. */
export type TableChange =
  | { kind: 'mask'; sheet: string; column: string; type: SensitiveType }
  | { kind: 'drop-column'; sheet: string; column: string }
  | { kind: 'remove-duplicates'; sheet: string; rows: number }
  | { kind: 'rename'; sheet: string; column: string; to: string };

export interface PlanItem {
  fileId: string;
  /** Path inside the output folder, using "/" separators. */
  target: string | null;
  category: FileCategory;
  size: number;
  action: PlanAction;
  reason: SkipReason | null;
  changes: TableChange[];
}

export interface ExecutionPlan {
  /** Name of the new folder created inside the destination. */
  outputName: string;
  /** Boxes in the order they will be packed. */
  order: FileCategory[];
  items: PlanItem[];
  totals: { copy: number; transform: number; skip: number; bytes: number };
}

export type ItemStatus = 'pending' | 'copied' | 'transformed' | 'skipped' | 'failed';

export interface ItemResult {
  fileId: string;
  target: string | null;
  status: ItemStatus;
  /** Copies are checked against the original (size and SHA-256). */
  verified: boolean;
  /** Fingerprint of the written file, saved in the manifest for the receiver. */
  sha256: string | null;
  error: string | null;
}

export type ExecutionStatus = 'running' | 'done' | 'cancelled' | 'failed';

export interface TransferExecution {
  status: ExecutionStatus;
  startedAt: string;
  finishedAt: string | null;
  /** Absolute path of the folder created in the destination. */
  outputPath: string;
  /** HTML report written in the output folder; null if it could not be written. */
  reportPath: string | null;
  plan: ExecutionPlan;
  results: ItemResult[];
  totals: { copied: number; transformed: number; skipped: number; failed: number; bytes: number };
}

export interface ExecutionProgress {
  transferId: string;
  done: number;
  total: number;
  bytesDone: number;
  bytesTotal: number;
  /** The file being written, relative to the output folder. */
  current: string | null;
}

/* ------------------------------------------------------------------ */
/* Receiver: manifest, verification and receipt (phase 8)              */
/* ------------------------------------------------------------------ */

/** Written by the sender next to the report; it lets the receiver check every file. */
export const MANIFEST_FILE_NAME = 'mudanzify.json';
export const REPORT_FILE_NAME = 'Informe de Mudanzify.html';
export const RECEIPT_FILE_NAME = 'Acuse de recibo.html';

export interface ManifestFile {
  /** Path inside the received folder, using "/" separators. */
  path: string;
  category: FileCategory;
  size: number;
  /** null when the file was too large to fingerprint; then only the size is checked. */
  sha256: string | null;
  changes: TableChange[];
}

export interface TransferManifest {
  format: 'mudanzify-manifest';
  version: 1;
  transferName: string;
  sentAt: string;
  status: ExecutionStatus;
  order: FileCategory[];
  files: ManifestFile[];
  /** Files the sender left out on purpose, so the receiver knows they are not missing. */
  skipped: Array<{ path: string; category: FileCategory; reason: SkipReason }>;
  criteria: Array<{ title: string; detail: string }>;
  /** Empty cells the sender flagged to review. */
  notes: Array<{ path: string; column: string; empty: number; total: number }>;
}

/** ok = identical; changed = different size or content; unverified = size matches, no fingerprint. */
export type FileCheck = 'ok' | 'missing' | 'changed' | 'unverified';

export interface ReceivedFile extends ManifestFile {
  check: FileCheck | null;
}

export type BoxDecision = 'pending' | 'accepted' | 'reported';

export interface ReceptionBox {
  category: FileCategory;
  files: number;
  bytes: number;
  /** Missing or changed files after the verification. */
  issues: number;
  decision: BoxDecision;
  /** What the receiver wrote when reporting a problem. */
  comment: string;
}

export type BoxReview = { action: 'accept' } | { action: 'report'; comment: string } | { action: 'undo' };

export interface Reception {
  id: string;
  openedAt: string;
  /** Absolute path of the received folder, chosen in a native dialog. */
  folderPath: string;
  folderName: string;
  transferName: string;
  sentAt: string;
  sendStatus: ExecutionStatus;
  criteria: TransferManifest['criteria'];
  notes: TransferManifest['notes'];
  skipped: TransferManifest['skipped'];
  files: ReceivedFile[];
  /** Files in the folder that the manifest does not list. */
  extras: string[];
  hasReport: boolean;
  verifiedAt: string | null;
  boxes: ReceptionBox[];
  confirmedAt: string | null;
  /** Receipt written in the folder for the sender; null if it could not be written. */
  receiptPath: string | null;
}

export interface ReceptionSummary {
  id: string;
  transferName: string;
  folderName: string;
  openedAt: string;
  verifiedAt: string | null;
  confirmedAt: string | null;
  files: number;
  issues: number;
}

export interface VerifyProgress {
  receptionId: string;
  done: number;
  total: number;
  current: string | null;
}

/** API available to the renderer as `window.mudanzify`. */
export interface MudanzifyBridge {
  app: {
    getInfo(): Promise<AppInfo>;
  };
  theme: {
    get(): Promise<ThemeState>;
    set(preference: ThemePreference): Promise<ThemeState>;
    /** Subscribes to theme changes; returns an unsubscribe function. */
    onChange(listener: (state: ThemeState) => void): () => void;
  };
  onboarding: {
    get(): Promise<OnboardingState>;
    /** Marks the presentation as seen and stores the chosen role. */
    complete(role: UserRole): Promise<OnboardingState>;
    /** Shows the presentation again on next load (keeps nothing else). */
    reset(): Promise<OnboardingState>;
  };
  transfers: {
    list(): Promise<TransferSummary[]>;
    create(): Promise<TransferDraft>;
    get(id: string): Promise<TransferDraft>;
    rename(id: string, name: string): Promise<TransferDraft>;
    /** Deletes only Mudanzify's record of the transfer, never the user's files. */
    remove(id: string): Promise<void>;
    /** Opens a native dialog; resolves with the draft unchanged if cancelled. */
    addSources(id: string, kind: SourceKind): Promise<TransferDraft>;
    removeSource(id: string, sourceId: string): Promise<TransferDraft>;
    /** Opens a native folder dialog for the destination. */
    pickDestination(id: string): Promise<TransferDraft>;
    /** Reads the sources (read-only) and builds the inventory. */
    scan(id: string): Promise<TransferDraft>;
    onScanProgress(listener: (progress: ScanProgress) => void): () => void;
  };
  ai: {
    getStatus(): Promise<AiStatus>;
  };
  interview: {
    /** Starts (or restarts) the interview and asks the first question. */
    start(id: string): Promise<TransferDraft>;
    /** Answers the open question (null skips it) and gets the next step. */
    answer(id: string, answer: InterviewAnswerInput | null): Promise<TransferDraft>;
    /** Accept, edit, reject or undo one suggestion. */
    review(id: string, suggestionId: string, decision: ReviewDecision): Promise<TransferDraft>;
    /** Confirms the reviewed criteria; requires every suggestion decided. */
    finish(id: string): Promise<TransferDraft>;
    reset(id: string): Promise<TransferDraft>;
  };
  analysis: {
    /** Reads the inventory (read-only), detects issues and asks the AI for mapping and priority. */
    run(id: string): Promise<TransferDraft>;
    decideFinding(id: string, findingId: string, decision: FindingDecision): Promise<TransferDraft>;
    reviewMapping(id: string, mappingId: string, decision: MappingDecision): Promise<TransferDraft>;
    setPriority(id: string, decision: PriorityDecision): Promise<TransferDraft>;
    /** Saves the reviewed plan; requires every finding and mapping decided. */
    confirm(id: string): Promise<TransferDraft>;
    reset(id: string): Promise<TransferDraft>;
    onProgress(listener: (progress: AnalysisProgress) => void): () => void;
  };
  execution: {
    /** What will be copied, transformed or skipped; computed from the confirmed plan, writes nothing. */
    preview(id: string): Promise<ExecutionPlan>;
    /** Copies into a new folder of the destination; resolves when it ends (done, cancelled or failed). */
    start(id: string): Promise<TransferDraft>;
    /** Stops after the file being copied; what was copied stays. */
    cancel(id: string): Promise<void>;
    openOutput(id: string): Promise<void>;
    openReport(id: string): Promise<void>;
    /** Forgets the last run (the copied files stay in the destination). */
    reset(id: string): Promise<TransferDraft>;
    onProgress(listener: (progress: ExecutionProgress) => void): () => void;
  };
  receptions: {
    list(): Promise<ReceptionSummary[]>;
    /** Opens a native folder dialog; resolves with null if cancelled. Throws RECEPTION_NO_MANIFEST if it is not a Mudanzify folder. */
    open(): Promise<Reception | null>;
    get(id: string): Promise<Reception>;
    /** Forgets the reception in this app; the received files stay where they are. */
    remove(id: string): Promise<void>;
    /** Recomputes every file's fingerprint (read-only) and compares it with the manifest. */
    verify(id: string): Promise<Reception>;
    reviewBox(id: string, category: FileCategory, review: BoxReview): Promise<Reception>;
    /** Requires every box decided; writes the receipt into the folder. */
    confirm(id: string): Promise<Reception>;
    /** Undoes the confirmation to change decisions (the old receipt is replaced on the next confirm). */
    reopen(id: string): Promise<Reception>;
    openFolder(id: string): Promise<void>;
    openReport(id: string): Promise<void>;
    openReceipt(id: string): Promise<void>;
    onVerifyProgress(listener: (progress: VerifyProgress) => void): () => void;
  };
}
