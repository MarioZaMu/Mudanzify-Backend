import type { CriterionTopic, InterviewAnswer, InterviewTurn } from '../../shared/contract';
import type { InventoryContext } from './context';
import type { Interviewer, InterviewStep, SuggestionDraft } from './types';

/**
 * Scripted interviewer used when there is no API key. It adapts the questions
 * to the inventory like the real AI would, so the flow can be shown offline.
 * Its texts imitate model output, which is why they live in the backend.
 */
interface ScriptedQuestion {
  topic: CriterionTopic;
  applies: (context: InventoryContext) => boolean;
  text: (context: InventoryContext) => string;
  why: (context: InventoryContext) => string;
  options: string[];
  multiple?: boolean;
  suggest: (answer: InterviewAnswer) => SuggestionDraft | null;
}

const CATEGORY_NAMES: Record<string, string> = {
  documents: 'Documentos',
  spreadsheets: 'Hojas de cálculo',
  images: 'Imágenes',
  media: 'Audio y video',
  archives: 'Comprimidos',
  code: 'Código y datos',
  other: 'Otros archivos',
};

const SENSITIVE_COLUMN = /c[ée]dula|dni|documento|identific|tel[ée]fono|celular|correo|e-?mail|direcci[oó]n|nacimiento|cuenta/i;

const answerText = (answer: InterviewAnswer) => [...answer.choices, answer.text].filter(Boolean).join(', ');
const picked = (answer: InterviewAnswer, option: string) => answer.choices.includes(option);

const sensitiveColumns = (context: InventoryContext) =>
  [...new Set(context.tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns.map((c) => c.name))))]
    .filter((name) => SENSITIVE_COLUMN.test(name));

const columnsWithGaps = (context: InventoryContext) =>
  context.tables.flatMap((table) => table.sheets.flatMap((sheet) => sheet.columns)).filter((c) => c.emptyPercent > 0);

const SCRIPT: ScriptedQuestion[] = [
  {
    topic: 'scope',
    applies: () => true,
    text: () => '¿Para qué es este traspaso?',
    why: (context) =>
      `Encontré ${context.totals.files} archivos en ${context.boxes.length} cajas; saber el propósito me ayuda a proponer reglas.`,
    options: ['Respaldo de seguridad', 'Cambio de equipo', 'Entregar a otra persona', 'Ordenar mis archivos'],
    suggest: (answer) =>
      picked(answer, 'Entregar a otra persona')
        ? {
            topic: 'scope',
            title: 'Incluir un informe para quien recibe',
            detail: 'Como los datos van a otra persona, conviene que reciba un resumen de qué se envió y qué quedó fuera.',
          }
        : null,
  },
  {
    topic: 'priority',
    applies: (context) => context.boxes.length > 1,
    text: () => '¿Qué es lo más importante que llegue completo?',
    why: (context) => `Tus datos se agrupan en ${context.boxes.length} cajas distintas.`,
    options: [],
    multiple: true,
    suggest: (answer) =>
      answer.skipped || answerText(answer) === ''
        ? null
        : {
            topic: 'priority',
            title: `Empacar primero: ${answerText(answer)}`,
            detail: 'Estas cajas se revisarán y traspasarán antes que el resto, para asegurar lo más importante.',
          },
  },
  {
    topic: 'scope',
    applies: (context) => context.flags.temporary + context.flags.hidden + context.flags.empty > 0,
    text: (context) =>
      `Hay ${context.flags.temporary + context.flags.hidden + context.flags.empty} archivos temporales, ocultos o vacíos. ¿Qué hacemos con ellos?`,
    why: () => 'Suelen ser restos del sistema o de programas y no aportan información.',
    options: ['Dejarlos fuera', 'Incluirlos igual', 'Decidir uno por uno'],
    suggest: (answer) => {
      if (picked(answer, 'Dejarlos fuera')) {
        return {
          topic: 'scope',
          title: 'Excluir archivos temporales, ocultos y vacíos',
          detail: 'No se traspasan; aparecerán en el informe como descartados para que nada se pierda sin aviso.',
        };
      }
      if (picked(answer, 'Decidir uno por uno')) {
        return {
          topic: 'scope',
          title: 'Revisar uno por uno los archivos temporales',
          detail: 'Se marcarán para que decidas cada caso antes de traspasar.',
        };
      }
      return null;
    },
  },
  {
    topic: 'gaps',
    applies: (context) => columnsWithGaps(context).length > 0,
    text: (context) => {
      const names = [...new Set(columnsWithGaps(context).map((c) => c.name))].slice(0, 3).join(', ');
      return `Algunas columnas tienen celdas vacías (${names}). ¿Cómo prefieres tratarlas?`;
    },
    why: () => 'Las celdas vacías pueden ser datos que faltan o que se perdieron en una copia anterior.',
    options: ['Marcarlas para revisar', 'Dejarlas tal cual', 'Completarlas después'],
    suggest: (answer) =>
      picked(answer, 'Dejarlas tal cual') || answer.skipped
        ? null
        : {
            topic: 'gaps',
            title: 'Marcar filas con datos faltantes',
            detail: 'Las filas con celdas vacías se señalan en el informe para revisarlas o completarlas.',
          },
  },
  {
    topic: 'sensitive',
    applies: (context) => sensitiveColumns(context).length > 0,
    text: (context) =>
      `Veo columnas como ${sensitiveColumns(context).slice(0, 3).join(', ')}. ¿Contienen datos personales que deban protegerse?`,
    why: () => 'Los nombres de esas columnas suelen guardar datos personales.',
    options: ['Sí, son datos personales', 'No', 'No estoy seguro'],
    suggest: (answer) =>
      picked(answer, 'No')
        ? null
        : {
            topic: 'sensitive',
            title: 'Revisar los datos personales antes de entregar',
            detail: 'Las columnas sensibles se marcarán en rojo y pedirán una confirmación aparte antes de traspasarse.',
          },
  },
  {
    topic: 'duplicates',
    applies: () => true,
    text: () => 'Si encontramos archivos o filas duplicadas, ¿qué prefieres?',
    why: () => 'En el siguiente paso buscaré duplicados y necesito saber tu preferencia.',
    options: ['Conservar el más reciente', 'Conservar ambos y marcarlos', 'Preguntarme cada vez'],
    suggest: (answer) => {
      if (answer.skipped) return null;
      const choice = answerText(answer) || 'Preguntarme cada vez';
      return {
        topic: 'duplicates',
        title: `Duplicados: ${choice.toLowerCase()}`,
        detail: 'Ningún duplicado se descarta sin que lo veas: siempre podrás cambiar la decisión antes de ejecutar.',
      };
    },
  },
];

export function createDemoInterviewer(): Interviewer {
  return {
    async nextStep(context, turns: InterviewTurn[]): Promise<InterviewStep> {
      // A short pause so the "thinking" state is visible, like with the real AI.
      await new Promise((resolve) => setTimeout(resolve, 700));
      const script = SCRIPT.filter((item) => item.applies(context));
      const answered = turns.filter((turn) => turn.answer !== null);

      if (answered.length < script.length) {
        const next = script[answered.length];
        const options =
          next.topic === 'priority'
            ? context.boxes.map((box) => CATEGORY_NAMES[box.category] ?? box.category).slice(0, 4)
            : next.options;
        return {
          kind: 'question',
          question: { text: next.text(context), why: next.why(context), options, multiple: next.multiple ?? false },
        };
      }

      const suggestions = script
        .map((item, index) => {
          const answer = answered[index]?.answer;
          return answer && !answer.skipped ? item.suggest(answer) : null;
        })
        .filter((item): item is SuggestionDraft => item !== null);
      const purpose = answered[0]?.answer;
      const purposeText = purpose && !purpose.skipped ? answerText(purpose).toLowerCase() : 'un traspaso general';

      return {
        kind: 'summary',
        summary: `Quieres hacer este traspaso para ${purposeText}. Revisé ${context.totals.files} archivos y propongo ${suggestions.length} criterios según tus respuestas. Tú decides cuáles aplicar.`,
        suggestions,
      };
    },
  };
}
