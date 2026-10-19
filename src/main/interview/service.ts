import type {
  CriterionSuggestion,
  InterviewAnswer,
  ReviewDecision,
  TransferDraft,
  TransferInterview,
} from '../../shared/contract';
import { createClaudeInterviewer } from '../ai/claude';
import { getAiStatus, getApiKey, getModel } from '../ai/config';
import { buildInventoryContext } from '../ai/context';
import { createDemoInterviewer } from '../ai/demo';
import { cleanText } from '../ai/sanitize';
import type { Interviewer, InterviewStep } from '../ai/types';
import { loadTransfer, newId, saveTransfer } from '../transfers/store';

const MAX_CHOICES = 10;

function interviewerFor(mode: TransferInterview['mode']): Interviewer {
  const apiKey = getApiKey();
  return mode === 'ai' && apiKey ? createClaudeInterviewer(apiKey, getModel()) : createDemoInterviewer();
}

/** Applies what the interviewer decided: a new open question or the review stage. */
function applyStep(interview: TransferInterview, step: InterviewStep): TransferInterview {
  if (step.kind === 'question') {
    return { ...interview, status: 'asking', turns: [...interview.turns, { question: { id: newId(), ...step.question }, answer: null }] };
  }
  const suggestions: CriterionSuggestion[] = step.suggestions.map((suggestion) => ({
    id: newId(),
    ...suggestion,
    status: 'pending',
    original: null,
  }));
  return { ...interview, status: 'reviewing', summary: step.summary, suggestions };
}

function requireInterview(draft: TransferDraft): TransferInterview {
  if (!draft.interview) throw new Error('The interview has not started');
  return draft.interview;
}

/** One AI request at a time per transfer, so double clicks never fork the interview. */
const running = new Map<string, Promise<TransferDraft>>();

function exclusive(id: string, job: () => Promise<TransferDraft>): Promise<TransferDraft> {
  const current = running.get(id);
  if (current) return current;
  const next = job().finally(() => running.delete(id));
  running.set(id, next);
  return next;
}

export function startInterview(id: string): Promise<TransferDraft> {
  return exclusive(id, async () => {
    const draft = await loadTransfer(id);
    const context = buildInventoryContext(draft);
    const { mode } = getAiStatus();
    const empty: TransferInterview = { mode, status: 'asking', turns: [], summary: null, suggestions: [] };
    const step = await interviewerFor(mode).nextStep(context, []);
    return saveTransfer({ ...draft, interview: applyStep(empty, step) });
  });
}

function parseAnswer(input: unknown): InterviewAnswer {
  if (input === null) return { choices: [], text: '', skipped: true };
  if (typeof input !== 'object') throw new Error('Invalid answer');
  const raw = input as Record<string, unknown>;
  const choices = Array.isArray(raw.choices)
    ? raw.choices.map((choice) => cleanText(choice, 200)).filter(Boolean).slice(0, MAX_CHOICES)
    : [];
  const text = cleanText(raw.text, 500);
  if (choices.length === 0 && text === '') throw new Error('Empty answer');
  return { choices, text, skipped: false };
}

export function answerQuestion(id: string, input: unknown): Promise<TransferDraft> {
  return exclusive(id, async () => {
    const draft = await loadTransfer(id);
    const interview = requireInterview(draft);
    const last = interview.turns.at(-1);
    if (interview.status !== 'asking' || !last || last.answer !== null) throw new Error('No open question');

    const turns = [...interview.turns.slice(0, -1), { ...last, answer: parseAnswer(input) }];
    const answered: TransferInterview = { ...interview, turns };
    const step = await interviewerFor(interview.mode).nextStep(buildInventoryContext(draft), turns);
    return saveTransfer({ ...draft, interview: applyStep(answered, step) });
  });
}

function applyDecision(suggestion: CriterionSuggestion, decision: unknown): CriterionSuggestion {
  if (typeof decision !== 'object' || decision === null) throw new Error('Invalid decision');
  const action = (decision as ReviewDecision).action;

  switch (action) {
    case 'accept':
      return { ...suggestion, status: suggestion.original ? 'edited' : 'accepted' };
    case 'reject':
      return { ...suggestion, status: 'rejected' };
    case 'undo':
      // Undo restores the AI's original wording and asks again.
      return suggestion.original
        ? { ...suggestion, ...suggestion.original, status: 'pending', original: null }
        : { ...suggestion, status: 'pending' };
    case 'edit': {
      const raw = decision as Record<string, unknown>;
      const title = cleanText(raw.title, 120);
      if (!title) throw new Error('A criterion needs a title');
      return {
        ...suggestion,
        title,
        detail: cleanText(raw.detail, 400),
        status: 'edited',
        original: suggestion.original ?? { title: suggestion.title, detail: suggestion.detail },
      };
    }
    default:
      throw new Error('Invalid decision');
  }
}

export async function reviewSuggestion(id: string, suggestionId: unknown, decision: unknown): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  const interview = requireInterview(draft);
  if (interview.status !== 'reviewing') throw new Error('Nothing to review');
  if (!interview.suggestions.some((suggestion) => suggestion.id === suggestionId)) throw new Error('Unknown suggestion');

  const suggestions = interview.suggestions.map((suggestion) =>
    suggestion.id === suggestionId ? applyDecision(suggestion, decision) : suggestion,
  );
  return saveTransfer({ ...draft, interview: { ...interview, suggestions } });
}

export async function finishInterview(id: string): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  const interview = requireInterview(draft);
  if (interview.status !== 'reviewing') throw new Error('Nothing to confirm');
  if (interview.suggestions.some((suggestion) => suggestion.status === 'pending')) {
    throw new Error('Every suggestion must be accepted, edited or rejected first');
  }
  return saveTransfer({ ...draft, interview: { ...interview, status: 'done' } });
}

export async function resetInterview(id: string): Promise<TransferDraft> {
  const draft = await loadTransfer(id);
  return saveTransfer({ ...draft, interview: null });
}
