import type { CriterionTopic, InterviewQuestion, InterviewTurn } from '../../shared/contract';
import type { InventoryContext } from './context';

export const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 6;

export interface SuggestionDraft {
  topic: CriterionTopic;
  title: string;
  detail: string;
}

/** What the interviewer (real AI or demo script) decides to do next. */
export type InterviewStep =
  | { kind: 'question'; question: Omit<InterviewQuestion, 'id'> }
  | { kind: 'summary'; summary: string; suggestions: SuggestionDraft[] };

export interface Interviewer {
  nextStep(context: InventoryContext, turns: InterviewTurn[]): Promise<InterviewStep>;
}
