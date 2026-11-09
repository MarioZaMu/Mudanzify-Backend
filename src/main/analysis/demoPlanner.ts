import { FILE_CATEGORIES, type ColumnSource, type FileCategory } from '../../shared/contract';
import { demoText, type DemoText } from '../ai/demoText';
import { categoryNamesInAnyLanguage } from '../i18n';
import type { PlanContext, PlanDraft, PlanInput, Planner } from './plan';

/**
 * Scripted planner used without an API key. Like the demo interviewer, its
 * texts imitate model output (see `ai/demoText.ts`) so the flow can be shown offline.
 * Patterns accept column names in both languages.
 */
const SYNONYMS: Array<{ standardName: keyof DemoText['standardNames']; pattern: RegExp }> = [
  { standardName: 'phone', pattern: /^(tel[eé]fono|tel\.?|celular|cel\.?|m[oó]vil|phone|mobile|whatsapp)$/i },
  { standardName: 'email', pattern: /^(correo( electr[oó]nico)?|e-?mail|mail)$/i },
  { standardName: 'name', pattern: /^(nombre( completo)?|cliente|(full |first )?name|customer)$/i },
  { standardName: 'id', pattern: /^(c[eé]dula|dni|documento|identificaci[oó]n|n[uú]mero de documento|id( number)?|national id)$/i },
  { standardName: 'address', pattern: /^(direcci[oó]n|domicilio|address)$/i },
  { standardName: 'city', pattern: /^(ciudad|municipio|localidad|city|town)$/i },
  { standardName: 'signupDate', pattern: /^(fecha( de)? (alta|registro|ingreso)|alta|registro|sign-?up( date)?|registration( date)?)$/i },
];

function proposeMappings(input: PlanInput): PlanDraft['mappings'] {
  const t = demoText();
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
      standardName: t.standardNames[standardName],
      sources,
      reason: t.planner.mappingReason(names.map((name) => `"${name}"`).join(` ${t.planner.and} `)),
    });
  }
  return mappings;
}

/** Boxes named in the interview's priority criterion go first, then the riskiest ones. */
function proposePriority(context: PlanContext): PlanDraft['priority'] {
  const t = demoText().planner;
  const criteria = context.criteria.filter((c) => c.topic === 'priority').map((c) => `${c.title} ${c.detail}`).join(' ');
  const present = context.boxes.map((box) => box.category);
  const named = present.filter((category) => categoryNamesInAnyLanguage(category).some((name) => criteria.includes(name)) || criteria.includes(category));
  const flagged = (category: FileCategory) => context.boxes.find((box) => box.category === category)?.flagged ?? 0;
  const rest = FILE_CATEGORIES.filter((category) => present.includes(category) && !named.includes(category)).sort(
    (a, b) => Number(b === 'spreadsheets') - Number(a === 'spreadsheets') || flagged(b) - flagged(a),
  );

  const reasons: PlanDraft['priority']['reasons'] = {};
  for (const category of named) reasons[category] = t.namedPriority;
  for (const category of rest) {
    reasons[category] =
      category === 'spreadsheets'
        ? t.tablesFirst
        : flagged(category) > 0
          ? t.flagged
          : t.fine;
  }
  return { order: [...named, ...rest], reasons };
}

function summarize(context: PlanContext): string {
  const { findings } = context;
  const t = demoText().planner;
  const parts = [
    findings.duplicateFiles > 0 && t.duplicateFiles(findings.duplicateFiles),
    findings.tablesWithDuplicateRows > 0 && t.duplicateRows(findings.tablesWithDuplicateRows),
    findings.columnsWithGaps > 0 && t.gaps(findings.columnsWithGaps),
    findings.sensitiveColumns > 0 && t.sensitive(findings.sensitiveColumns),
    findings.junkFiles > 0 && t.junk(findings.junkFiles),
  ].filter((part): part is string => typeof part === 'string');

  const found =
    parts.length === 0
      ? t.noProblems
      : t.found(parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} ${t.and} ${parts.at(-1)}`);
  return `${found} ${t.closing}`;
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
