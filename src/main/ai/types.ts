import { INTERVIEW_LIMITS, type CriterionTopic, type InterviewQuestion, type InterviewTurn } from '../../shared/contract';
import type { InventoryContext } from './context';

export const MIN_QUESTIONS = INTERVIEW_LIMITS.minQuestions;
export const MAX_QUESTIONS = INTERVIEW_LIMITS.maxQuestions;

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
