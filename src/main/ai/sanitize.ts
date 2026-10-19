import { CRITERION_TOPICS, type CriterionTopic } from '../../shared/contract';
import type { InterviewStep, SuggestionDraft } from './types';

const MAX_OPTIONS = 5;
const MAX_SUGGESTIONS = 6;

/** Trims a value that should be text and caps its length; anything else becomes ''. */
export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

const isTopic = (value: unknown): value is CriterionTopic =>
  typeof value === 'string' && (CRITERION_TOPICS as readonly string[]).includes(value);

/** Model output is untrusted input: keep only well-formed, bounded fields. */
export function sanitizeQuestion(raw: Record<string, unknown>): InterviewStep {
  const text = cleanText(raw.text, 240);
  if (!text) throw new Error('The AI returned an empty question');
  const options = Array.isArray(raw.options)
    ? [...new Set(raw.options.map((option) => cleanText(option, 80)).filter(Boolean))].slice(0, MAX_OPTIONS)
    : [];
  return {
    kind: 'question',
    question: { text, why: cleanText(raw.why, 240), options, multiple: raw.multiple === true },
  };
}

export function sanitizeSummary(raw: Record<string, unknown>): InterviewStep {
  const suggestions: SuggestionDraft[] = Array.isArray(raw.suggestions)
    ? raw.suggestions
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => ({
          topic: isTopic(item.topic) ? item.topic : 'other',
          title: cleanText(item.title, 120),
          detail: cleanText(item.detail, 400),
        }))
        .filter((item) => item.title !== '')
        .slice(0, MAX_SUGGESTIONS)
    : [];
  return { kind: 'summary', summary: cleanText(raw.summary, 600), suggestions };
}
