import { FILE_CATEGORIES, type ColumnSource, type FileCategory } from '../../shared/contract';
import { CATEGORY_NAMES } from '../ai/demo';
import type { PlanContext, PlanDraft, PlanInput, Planner } from './plan';

/**
 * Scripted planner used without an API key. Like the demo interviewer, its
 * texts imitate model output so the flow can be shown offline.
 */
const SYNONYMS: Array<{ standardName: string; pattern: RegExp }> = [
  { standardName: 'Teléfono', pattern: /^(tel[eé]fono|tel\.?|celular|cel\.?|m[oó]vil|phone|whatsapp)$/i },
  { standardName: 'Correo', pattern: /^(correo( electr[oó]nico)?|e-?mail|mail)$/i },
  { standardName: 'Nombre', pattern: /^(nombre( completo)?|cliente|name)$/i },
  { standardName: 'Cédula', pattern: /^(c[eé]dula|dni|documento|identificaci[oó]n|n[uú]mero de documento)$/i },
  { standardName: 'Dirección', pattern: /^(direcci[oó]n|domicilio|address)$/i },
  { standardName: 'Ciudad', pattern: /^(ciudad|municipio|localidad|city)$/i },
  { standardName: 'Fecha de alta', pattern: /^(fecha( de)? (alta|registro|ingreso)|alta|registro)$/i },
];

function proposeMappings(input: PlanInput): PlanDraft['mappings'] {
  const mappings: PlanDraft['mappings'] = [];
  for (const { standardName, pattern } of SYNONYMS) {
    const sources: ColumnSource[] = [];
    for (const table of input.context.tables) {
      const ref = input.tableRefs.get(table.id);
      if (!ref) continue;
      for (const column of table.columns) {
        if (pattern.test(column.name.trim())) sources.push({ ...ref, column: column.name });
      }
    }
    const names = [...new Set(sources.map((source) => source.column))];
    if (names.length < 2) continue;
    mappings.push({
      standardName,
      sources,
      reason: `${names.map((name) => `"${name}"`).join(' y ')} parecen guardar el mismo dato. Con un solo nombre, el destino queda ordenado y sin columnas repetidas.`,
    });
  }
  return mappings;
}

/** Boxes named in the interview's priority criterion go first, then the riskiest ones. */
function proposePriority(context: PlanContext): PlanDraft['priority'] {
  const criteria = context.criteria.filter((c) => c.topic === 'priority').map((c) => `${c.title} ${c.detail}`).join(' ');
  const present = context.boxes.map((box) => box.category);
  const named = present.filter((category) => criteria.includes(CATEGORY_NAMES[category] ?? category));
  const flagged = (category: FileCategory) => context.boxes.find((box) => box.category === category)?.flagged ?? 0;
  const rest = FILE_CATEGORIES.filter((category) => present.includes(category) && !named.includes(category)).sort(
    (a, b) => Number(b === 'spreadsheets') - Number(a === 'spreadsheets') || flagged(b) - flagged(a),
  );

  const reasons: PlanDraft['priority']['reasons'] = {};
  for (const category of named) reasons[category] = 'Lo marcaste como lo más importante en la entrevista.';
  for (const category of rest) {
    reasons[category] =
      category === 'spreadsheets'
        ? 'Las tablas tienen datos que conviene verificar primero.'
        : flagged(category) > 0
          ? 'Tiene archivos para revisar; mejor resolverlos pronto.'
          : 'Sin problemas detectados; puede ir después.';
  }
  return { order: [...named, ...rest], reasons };
}

function summarize(context: PlanContext): string {
  const { findings } = context;
  const parts = [
    findings.duplicateFiles > 0 && `${findings.duplicateFiles} archivo${findings.duplicateFiles === 1 ? '' : 's'} duplicado${findings.duplicateFiles === 1 ? '' : 's'}`,
    findings.tablesWithDuplicateRows > 0 && `filas repetidas en ${findings.tablesWithDuplicateRows} tabla${findings.tablesWithDuplicateRows === 1 ? '' : 's'}`,
    findings.columnsWithGaps > 0 && `${findings.columnsWithGaps} columna${findings.columnsWithGaps === 1 ? '' : 's'} con celdas vacías`,
    findings.sensitiveColumns > 0 && `${findings.sensitiveColumns} columna${findings.sensitiveColumns === 1 ? '' : 's'} con datos personales`,
    findings.junkFiles > 0 && `${findings.junkFiles} archivo${findings.junkFiles === 1 ? '' : 's'} temporal${findings.junkFiles === 1 ? '' : 'es'}, oculto${findings.junkFiles === 1 ? '' : 's'} o vacío${findings.junkFiles === 1 ? '' : 's'}`,
  ].filter((part): part is string => typeof part === 'string');

  const found =
    parts.length === 0
      ? 'No encontré problemas en tus datos.'
      : `Encontré ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`}.`;
  return `${found} Todo se revisó en tu equipo y nada se ha movido: cada sugerencia espera tu decisión.`;
}

export function createDemoPlanner(): Planner {
  return {
    async propose(input: PlanInput): Promise<PlanDraft> {
      // A short pause so the "thinking" state is visible, like with the real AI.
      await new Promise((resolve) => setTimeout(resolve, 700));
      return {
        summary: summarize(input.context),
        mappings: proposeMappings(input),
        priority: proposePriority(input.context),
      };
    },
  };
}
