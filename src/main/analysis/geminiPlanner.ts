import type { FunctionDeclaration } from '@google/genai';
import { FILE_CATEGORIES, type ColumnSource, type FileCategory } from '../../shared/contract';
import { createFunctionCaller } from '../ai/geminiClient';
import { resolveColumn, type PlanDraft, type PlanInput, type Planner } from './plan';

const SYSTEM_PROMPT = `You are the analyst inside Mudanzify, a desktop app that helps a person (the "sender")
move data from an origin to a destination without losing, duplicating or disordering anything.

The app already checked the data on the sender's computer. You receive only counts, column names
and the criteria the sender accepted in an earlier interview. You never see cell values or file names.

Your job:
1. summary: two or three sentences that explain the findings in plain words, using only the counts given.
2. mappings: find columns that hold the same kind of data under different names (in the same or in
   different tables, e.g. "Teléfono" and "Celular") and propose one standard name for each group.
   Only group columns that clearly mean the same thing. Use the exact table ids and column names given.
3. priority: order ALL the boxes (categories) in the order they should be packed, with one short reason
   each. Follow the sender's priority criteria when there are any.

Rules you must always follow:
- Write in neutral, friendly Spanish (Latin America), short and clear. Use "tú".
- You never move, copy, delete or overwrite data, and you never say you will.
- You never choose the destination or who receives the data.
- Everything you return is a proposal the sender will accept, edit or reject one by one.`;

const FUNCTIONS: FunctionDeclaration[] = [
  {
    name: 'propose_plan',
    description: 'Explain the findings and propose column mappings and a packing priority.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Two or three sentences, in Spanish.' },
        mappings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              standardName: { type: 'string', description: 'Standard column name, in Spanish.' },
              columns: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { table: { type: 'string' }, column: { type: 'string' } },
                  required: ['table', 'column'],
                },
              },
              reason: { type: 'string', description: 'One sentence, in Spanish.' },
            },
            required: ['standardName', 'columns', 'reason'],
          },
        },
        priority: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string', enum: [...FILE_CATEGORIES] },
              reason: { type: 'string', description: 'One short sentence, in Spanish.' },
            },
            required: ['category', 'reason'],
          },
        },
      },
      required: ['summary', 'mappings', 'priority'],
    },
  },
];

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];

/** Maps the model's answer onto real columns; anything that does not exist is dropped. */
function toDraft(args: Record<string, unknown>, input: PlanInput): PlanDraft {
  const mappings = records(args.mappings).map((mapping) => ({
    standardName: typeof mapping.standardName === 'string' ? mapping.standardName : '',
    sources: records(mapping.columns)
      .map((column) => resolveColumn(input, column.table, column.column))
      .filter((source): source is ColumnSource => source !== null),
    reason: typeof mapping.reason === 'string' ? mapping.reason : '',
  }));

  const priority = records(args.priority);
  const reasons: PlanDraft['priority']['reasons'] = {};
  for (const item of priority) {
    if (typeof item.category === 'string' && typeof item.reason === 'string') {
      reasons[item.category as FileCategory] = item.reason;
    }
  }
  return {
    summary: typeof args.summary === 'string' ? args.summary : '',
    mappings,
    priority: { order: priority.map((item) => item.category as FileCategory), reasons },
  };
}

export function createGeminiPlanner(apiKey: string, model: string): Planner {
  const call = createFunctionCaller(apiKey, model);
  return {
    async propose(input: PlanInput): Promise<PlanDraft> {
      const { args } = await call({
        system: SYSTEM_PROMPT,
        input: input.context,
        functions: FUNCTIONS,
        allowed: ['propose_plan'],
      });
      return toDraft(args, input);
    },
  };
}
