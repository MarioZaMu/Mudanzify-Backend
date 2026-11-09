import type { CriterionTopic, InterviewAnswer, InterviewTurn } from '../../shared/contract';
import { texts } from '../i18n';
import type { InventoryContext } from './context';
import { demoText, everyDemoText, type DemoText } from './demoText';
import type { Interviewer, InterviewStep, SuggestionDraft } from './types';

/**
 * Scripted interviewer used when there is no API key. It adapts the questions
 * to the inventory like the real AI would, so the flow can be shown offline.
 * Its texts imitate model output (see `demoText.ts`), one set per language.
 */
interface ScriptedQuestion {
  topic: CriterionTopic;
  applies: (context: InventoryContext) => boolean;
  text: (context: InventoryContext, t: DemoText) => string;
  why: (context: InventoryContext, t: DemoText) => string;
  options: (t: DemoText) => string[];
  multiple?: boolean;
  suggest: (answer: InterviewAnswer, t: DemoText) => SuggestionDraft | null;
}

const SENSITIVE_COLUMN =
  /c[ée]dula|dni|documento|identific|tel[ée]fono|celular|correo|e-?mail|direcci[oó]n|nacimiento|cuenta|phone|mobile|address|birth|passport|ssn|account|national.?id/i;

const answerText = (answer: InterviewAnswer) => [...answer.choices, answer.text].filter(Boolean).join(', ');

/** True if the answer picked this option in any language (the user may switch language mid-interview). */
const picked = (answer: InterviewAnswer, option: (t: DemoText) => string) =>
  everyDemoText().some((t) => answer.choices.includes(option(t)));

const sensitiveColumns = (context: InventoryContext) =>
  [...new Set(context.tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((c) => c.name))))]
    .filter((name) => SENSITIVE_COLUMN.test(name));

const columnsWithGaps = (context: InventoryContext) =>
  context.tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns)).filter((c) => c.emptyPercent > 0);

const SCRIPT: ScriptedQuestion[] = [
  {
    topic: 'scope',
    applies: () => true,
    text: (_context, t) => t.purpose.text,
    why: (context, t) => t.purpose.why(context.totals.files, context.boxes.length),
    options: (t) => Object.values(t.purpose.options),
    suggest: (answer, t) =>
      picked(answer, (x) => x.purpose.options.hand)
        ? { topic: 'scope', title: t.purpose.handTitle, detail: t.purpose.handDetail }
        : null,
  },
  {
    topic: 'priority',
    applies: (context) => context.boxes.length > 1,
    text: (_context, t) => t.priority.text,
    why: (context, t) => t.priority.why(context.boxes.length),
    options: () => [],
    multiple: true,
    suggest: (answer, t) =>
      answer.skipped || answerText(answer) === ''
        ? null
        : { topic: 'priority', title: t.priority.title(answerText(answer)), detail: t.priority.detail },
  },
  {
    topic: 'scope',
    applies: (context) => context.flags.temporary + context.flags.hidden + context.flags.empty > 0,
    text: (context, t) => t.junk.text(context.flags.temporary + context.flags.hidden + context.flags.empty),
    why: (_context, t) => t.junk.why,
    options: (t) => Object.values(t.junk.options),
    suggest: (answer, t) => {
      if (picked(answer, (x) => x.junk.options.leave)) {
        return { topic: 'scope', title: t.junk.excludeTitle, detail: t.junk.excludeDetail };
      }
      if (picked(answer, (x) => x.junk.options.oneByOne)) {
        return { topic: 'scope', title: t.junk.reviewTitle, detail: t.junk.reviewDetail };
      }
      return null;
    },
  },
  {
    topic: 'gaps',
    applies: (context) => columnsWithGaps(context).length > 0,
    text: (context, t) => t.gaps.text([...new Set(columnsWithGaps(context).map((c) => c.name))].slice(0, 3).join(', ')),
    why: (_context, t) => t.gaps.why,
    options: (t) => Object.values(t.gaps.options),
    suggest: (answer, t) =>
      picked(answer, (x) => x.gaps.options.leave) || answer.skipped
        ? null
        : { topic: 'gaps', title: t.gaps.title, detail: t.gaps.detail },
  },
  {
    topic: 'sensitive',
    applies: (context) => sensitiveColumns(context).length > 0,
    text: (context, t) => t.sensitive.text(sensitiveColumns(context).slice(0, 3).join(', ')),
    why: (_context, t) => t.sensitive.why,
    options: (t) => Object.values(t.sensitive.options),
    suggest: (answer, t) =>
      picked(answer, (x) => x.sensitive.options.no)
        ? null
        : { topic: 'sensitive', title: t.sensitive.title, detail: t.sensitive.detail },
  },
  {
    topic: 'duplicates',
    applies: () => true,
    text: (_context, t) => t.duplicates.text,
    why: (_context, t) => t.duplicates.why,
    options: (t) => Object.values(t.duplicates.options),
    suggest: (answer, t) => {
      if (answer.skipped) return null;
      const choice = answerText(answer) || t.duplicates.options.ask;
      return { topic: 'duplicates', title: t.duplicates.title(choice.toLowerCase()), detail: t.duplicates.detail };
    },
  },
];

export function createDemoInterviewer(): Interviewer {
  return {
    async nextStep(context, turns: InterviewTurn[]): Promise<InterviewStep> {
      // A short pause so the "thinking" state is visible, like with the real AI.
      await new Promise((resolve) => setTimeout(resolve, 700));
      const t = demoText();
      const names: Record<string, string> = texts().category;
      const script = SCRIPT.filter((item) => item.applies(context));
      const answered = turns.filter((turn) => turn.answer !== null);

      if (answered.length < script.length) {
        const next = script[answered.length];
        const options =
          next.topic === 'priority'
            ? context.boxes.map((box) => names[box.category] ?? box.category).slice(0, 4)
            : next.options(t);
        return {
          kind: 'question',
          question: { text: next.text(context, t), why: next.why(context, t), options, multiple: next.multiple ?? false },
        };
      }

      const suggestions = script
        .map((item, index) => {
          const answer = answered[index]?.answer;
          return answer && !answer.skipped ? item.suggest(answer, t) : null;
        })
        .filter((item): item is SuggestionDraft => item !== null);
      const purpose = answered[0]?.answer;
      const purposeText = purpose && !purpose.skipped ? answerText(purpose).toLowerCase() : t.summary.general;

      return {
        kind: 'summary',
        summary: t.summary.text(purposeText, context.totals.files, suggestions.length),
        suggestions,
      };
    },
  };
}
