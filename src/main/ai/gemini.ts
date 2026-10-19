import type { FunctionDeclaration } from '@google/genai';
import { CRITERION_TOPICS, type InterviewTurn } from '../../shared/contract';
import type { InventoryContext } from './context';
import { createFunctionCaller } from './geminiClient';
import { sanitizeQuestion, sanitizeSummary } from './sanitize';
import { MAX_QUESTIONS, MIN_QUESTIONS, type Interviewer, type InterviewStep } from './types';

const SYSTEM_PROMPT = `You are the interviewer inside Mudanzify, a desktop app that helps a person (the "sender")
move data from an origin to a destination without losing, duplicating or disordering anything.

Your job in this step is ONLY to understand the sender's intent through a short interview, then propose
transfer criteria that the sender will review one by one.

Rules you must always follow:
- Write everything in neutral, friendly Spanish (Latin America), short and clear. Use "tú".
- Ask ONE question at a time. Ask between ${MIN_QUESTIONS} and ${MAX_QUESTIONS} questions in total.
- Base your questions on the inventory summary: purpose of the transfer, what matters most, how to treat
  temporary/hidden/empty files, empty cells in tables, possible duplicates, and personal or sensitive data
  (for example, columns that look like IDs, phone numbers or emails).
- Give 2 to 4 short quick-answer options per question. Set "multiple" only when several answers make sense.
- Explain in "why" (one sentence) what in the inventory made you ask.
- You never move, copy, delete or overwrite data, and you never say you will.
- You never choose the destination or who receives the data: the sender already decides that.
- Your criteria are proposals. Phrase them as suggestions the sender can accept, edit or reject.
- You only receive a summary (counts, file types, column names). Never ask for file contents.

When you have enough information, call finish_interview with a two or three sentence summary of the
sender's intent and up to 6 concrete criteria. Use the topics: ${CRITERION_TOPICS.join(', ')}.`;

const FUNCTIONS: FunctionDeclaration[] = [
  {
    name: 'ask_question',
    description: 'Ask the sender the next interview question.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The question, in Spanish.' },
        why: { type: 'string', description: 'One sentence: what in the inventory motivates it.' },
        options: { type: 'array', items: { type: 'string' }, description: '2 to 4 short quick answers.' },
        multiple: { type: 'boolean', description: 'True if several options can be chosen together.' },
      },
      required: ['text', 'why', 'options', 'multiple'],
    },
  },
  {
    name: 'finish_interview',
    description: 'End the interview with a summary and proposed transfer criteria.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: "Two or three sentences about the sender's intent, in Spanish." },
        suggestions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic: { type: 'string', enum: [...CRITERION_TOPICS] },
              title: { type: 'string', description: 'Short criterion, in Spanish.' },
              detail: { type: 'string', description: 'One or two sentences explaining it, in Spanish.' },
            },
            required: ['topic', 'title', 'detail'],
          },
        },
      },
      required: ['summary', 'suggestions'],
    },
  },
];

/** Turns the interview so far into plain data for the model. */
function transcript(turns: InterviewTurn[]) {
  return turns
    .filter((turn) => turn.answer !== null)
    .map((turn) => ({
      question: turn.question.text,
      answer: turn.answer?.skipped
        ? '(the sender skipped this question)'
        : [...(turn.answer?.choices ?? []), turn.answer?.text ?? ''].filter(Boolean).join(' | '),
    }));
}

export function createGeminiInterviewer(apiKey: string, model: string): Interviewer {
  const call = createFunctionCaller(apiKey, model);

  return {
    async nextStep(context: InventoryContext, turns: InterviewTurn[]): Promise<InterviewStep> {
      const answered = turns.filter((turn) => turn.answer !== null).length;
      // The bounds are enforced here, not left to the model.
      const allowed =
        answered >= MAX_QUESTIONS
          ? ['finish_interview']
          : answered < MIN_QUESTIONS
            ? ['ask_question']
            : ['ask_question', 'finish_interview'];

      const { name, args } = await call({
        system: SYSTEM_PROMPT,
        input: { inventorySummary: context, questionsAnswered: answered, conversation: transcript(turns) },
        functions: FUNCTIONS,
        allowed,
      });
      return name === 'finish_interview' ? sanitizeSummary(args) : sanitizeQuestion(args);
    },
  };
}
