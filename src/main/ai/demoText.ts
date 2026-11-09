import type { Language } from '../../shared/contract';
import { getLanguage } from '../language';

/**
 * Texts of the offline (demo) interviewer and planner. They imitate model
 * output, so they live in the backend, one set per interface language.
 * Option labels double as keys: the script checks which ones were picked.
 */
export interface DemoText {
  purpose: {
    text: string;
    why: (files: number, boxes: number) => string;
    options: { backup: string; newComputer: string; hand: string; tidy: string };
    handTitle: string;
    handDetail: string;
  };
  priority: {
    text: string;
    why: (boxes: number) => string;
    title: (picked: string) => string;
    detail: string;
  };
  junk: {
    text: (count: number) => string;
    why: string;
    options: { leave: string; include: string; oneByOne: string };
    excludeTitle: string;
    excludeDetail: string;
    reviewTitle: string;
    reviewDetail: string;
  };
  gaps: {
    text: (columns: string) => string;
    why: string;
    options: { mark: string; leave: string; later: string };
    title: string;
    detail: string;
  };
  sensitive: {
    text: (columns: string) => string;
    why: string;
    options: { yes: string; no: string; unsure: string };
    title: string;
    detail: string;
  };
  duplicates: {
    text: string;
    why: string;
    options: { newest: string; both: string; ask: string };
    title: (choice: string) => string;
    detail: string;
  };
  summary: {
    general: string;
    text: (purpose: string, files: number, criteria: number) => string;
  };
  /** Names used to unify columns that hold the same data. */
  standardNames: {
    phone: string;
    email: string;
    name: string;
    id: string;
    address: string;
    city: string;
    signupDate: string;
  };
  planner: {
    mappingReason: (names: string) => string;
    namedPriority: string;
    tablesFirst: string;
    flagged: string;
    fine: string;
    noProblems: string;
    found: (list: string) => string;
    closing: string;
    and: string;
    duplicateFiles: (count: number) => string;
    duplicateRows: (count: number) => string;
    gaps: (count: number) => string;
    sensitive: (count: number) => string;
    junk: (count: number) => string;
  };
}

const es: DemoText = {
  purpose: {
    text: '¿Para qué es este traspaso?',
    why: (files, boxes) =>
      `Encontré ${files} archivos en ${boxes} cajas; saber el propósito me ayuda a proponer reglas.`,
    options: {
      backup: 'Respaldo de seguridad',
      newComputer: 'Cambio de equipo',
      hand: 'Entregar a otra persona',
      tidy: 'Ordenar mis archivos',
    },
    handTitle: 'Incluir un informe para quien recibe',
    handDetail: 'Como los datos van a otra persona, conviene que reciba un resumen de qué se envió y qué quedó fuera.',
  },
  priority: {
    text: '¿Qué es lo más importante que llegue completo?',
    why: (boxes) => `Tus datos se agrupan en ${boxes} cajas distintas.`,
    title: (picked) => `Empacar primero: ${picked}`,
    detail: 'Estas cajas se revisarán y traspasarán antes que el resto, para asegurar lo más importante.',
  },
  junk: {
    text: (count) => `Hay ${count} archivos temporales, ocultos o vacíos. ¿Qué hacemos con ellos?`,
    why: 'Suelen ser restos del sistema o de programas y no aportan información.',
    options: { leave: 'Dejarlos fuera', include: 'Incluirlos igual', oneByOne: 'Decidir uno por uno' },
    excludeTitle: 'Excluir archivos temporales, ocultos y vacíos',
    excludeDetail: 'No se traspasan; aparecerán en el informe como descartados para que nada se pierda sin aviso.',
    reviewTitle: 'Revisar uno por uno los archivos temporales',
    reviewDetail: 'Se marcarán para que decidas cada caso antes de traspasar.',
  },
  gaps: {
    text: (columns) => `Algunas columnas tienen celdas vacías (${columns}). ¿Cómo prefieres tratarlas?`,
    why: 'Las celdas vacías pueden ser datos que faltan o que se perdieron en una copia anterior.',
    options: { mark: 'Marcarlas para revisar', leave: 'Dejarlas tal cual', later: 'Completarlas después' },
    title: 'Marcar filas con datos faltantes',
    detail: 'Las filas con celdas vacías se señalan en el informe para revisarlas o completarlas.',
  },
  sensitive: {
    text: (columns) => `Veo columnas como ${columns}. ¿Contienen datos personales que deban protegerse?`,
    why: 'Los nombres de esas columnas suelen guardar datos personales.',
    options: { yes: 'Sí, son datos personales', no: 'No', unsure: 'No estoy seguro' },
    title: 'Revisar los datos personales antes de entregar',
    detail: 'Las columnas sensibles se marcarán en rojo y pedirán una confirmación aparte antes de traspasarse.',
  },
  duplicates: {
    text: 'Si encontramos archivos o filas duplicadas, ¿qué prefieres?',
    why: 'En el siguiente paso buscaré duplicados y necesito saber tu preferencia.',
    options: { newest: 'Conservar el más reciente', both: 'Conservar ambos y marcarlos', ask: 'Preguntarme cada vez' },
    title: (choice) => `Duplicados: ${choice}`,
    detail: 'Ningún duplicado se descarta sin que lo veas: siempre podrás cambiar la decisión antes de ejecutar.',
  },
  summary: {
    general: 'un traspaso general',
    text: (purpose, files, criteria) =>
      `Quieres hacer este traspaso para ${purpose}. Revisé ${files} archivos y propongo ${criteria} criterios según tus respuestas. Tú decides cuáles aplicar.`,
  },
  standardNames: {
    phone: 'Teléfono',
    email: 'Correo',
    name: 'Nombre',
    id: 'Cédula',
    address: 'Dirección',
    city: 'Ciudad',
    signupDate: 'Fecha de alta',
  },
  planner: {
    mappingReason: (names) =>
      `${names} parecen guardar el mismo dato. Con un solo nombre, el destino queda ordenado y sin columnas repetidas.`,
    namedPriority: 'Lo marcaste como lo más importante en la entrevista.',
    tablesFirst: 'Las tablas tienen datos que conviene verificar primero.',
    flagged: 'Tiene archivos para revisar; mejor resolverlos pronto.',
    fine: 'Sin problemas detectados; puede ir después.',
    noProblems: 'No encontré problemas en tus datos.',
    found: (list) => `Encontré ${list}.`,
    closing: 'Todo se revisó en tu equipo y nada se ha movido: cada sugerencia espera tu decisión.',
    and: 'y',
    duplicateFiles: (n) => `${n} archivo${n === 1 ? '' : 's'} duplicado${n === 1 ? '' : 's'}`,
    duplicateRows: (n) => `filas repetidas en ${n} tabla${n === 1 ? '' : 's'}`,
    gaps: (n) => `${n} columna${n === 1 ? '' : 's'} con celdas vacías`,
    sensitive: (n) => `${n} columna${n === 1 ? '' : 's'} con datos personales`,
    junk: (n) =>
      `${n} archivo${n === 1 ? '' : 's'} temporal${n === 1 ? '' : 'es'}, oculto${n === 1 ? '' : 's'} o vacío${n === 1 ? '' : 's'}`,
  },
};

const en: DemoText = {
  purpose: {
    text: 'What is this transfer for?',
    why: (files, boxes) =>
      `I found ${files} files in ${boxes} boxes; knowing the purpose helps me suggest rules.`,
    options: {
      backup: 'Safety backup',
      newComputer: 'Switching computers',
      hand: 'Handing over to someone else',
      tidy: 'Tidying my files',
    },
    handTitle: 'Include a report for the receiver',
    handDetail: 'Since the data goes to someone else, they should get a summary of what was sent and what was left out.',
  },
  priority: {
    text: 'What is the most important thing to arrive complete?',
    why: (boxes) => `Your data is grouped into ${boxes} different boxes.`,
    title: (picked) => `Pack first: ${picked}`,
    detail: 'These boxes will be reviewed and transferred before the rest, to secure what matters most.',
  },
  junk: {
    text: (count) => `There are ${count} temporary, hidden or empty files. What should we do with them?`,
    why: 'They are usually leftovers from the system or from programs and add no information.',
    options: { leave: 'Leave them out', include: 'Include them anyway', oneByOne: 'Decide one by one' },
    excludeTitle: 'Exclude temporary, hidden and empty files',
    excludeDetail: 'They are not transferred; they will appear in the report as dropped so nothing is lost without notice.',
    reviewTitle: 'Review temporary files one by one',
    reviewDetail: 'They will be flagged so you decide each case before transferring.',
  },
  gaps: {
    text: (columns) => `Some columns have empty cells (${columns}). How do you prefer to handle them?`,
    why: 'Empty cells can be missing data or data lost in an earlier copy.',
    options: { mark: 'Flag them for review', leave: 'Leave them as they are', later: 'Fill them in later' },
    title: 'Flag rows with missing data',
    detail: 'Rows with empty cells are pointed out in the report so you can review or complete them.',
  },
  sensitive: {
    text: (columns) => `I see columns like ${columns}. Do they contain personal data that should be protected?`,
    why: 'The names of those columns usually hold personal data.',
    options: { yes: 'Yes, it is personal data', no: 'No', unsure: 'I am not sure' },
    title: 'Review personal data before delivering',
    detail: 'Sensitive columns will be marked in red and ask for a separate confirmation before being transferred.',
  },
  duplicates: {
    text: 'If we find duplicate files or rows, what do you prefer?',
    why: 'In the next step I will look for duplicates and I need to know your preference.',
    options: { newest: 'Keep the most recent', both: 'Keep both and flag them', ask: 'Ask me every time' },
    title: (choice) => `Duplicates: ${choice}`,
    detail: 'No duplicate is dropped without you seeing it: you can always change the decision before running.',
  },
  summary: {
    general: 'a general transfer',
    text: (purpose, files, criteria) =>
      `You want to do this transfer for ${purpose}. I reviewed ${files} files and suggest ${criteria} criteria based on your answers. You decide which ones to apply.`,
  },
  standardNames: {
    phone: 'Phone',
    email: 'Email',
    name: 'Name',
    id: 'ID number',
    address: 'Address',
    city: 'City',
    signupDate: 'Signup date',
  },
  planner: {
    mappingReason: (names) =>
      `${names} seem to hold the same data. With a single name, the destination stays tidy and free of repeated columns.`,
    namedPriority: 'You marked it as the most important thing in the interview.',
    tablesFirst: 'The tables hold data that is worth verifying first.',
    flagged: 'It has files to review; better to sort them out soon.',
    fine: 'No problems detected; it can go later.',
    noProblems: 'I found no problems in your data.',
    found: (list) => `I found ${list}.`,
    closing: 'Everything was checked on your computer and nothing has been moved: each suggestion waits for your decision.',
    and: 'and',
    duplicateFiles: (n) => `${n} duplicate file${n === 1 ? '' : 's'}`,
    duplicateRows: (n) => `repeated rows in ${n} table${n === 1 ? '' : 's'}`,
    gaps: (n) => `${n} column${n === 1 ? '' : 's'} with empty cells`,
    sensitive: (n) => `${n} column${n === 1 ? '' : 's'} with personal data`,
    junk: (n) => `${n} temporary, hidden or empty file${n === 1 ? '' : 's'}`,
  },
};

const DEMO: Record<Language, DemoText> = { es, en };

export const demoText = (): DemoText => DEMO[getLanguage()];

/** Every spelling of a value in all languages, so decisions made before a language switch still match. */
export const everyDemoText = (): DemoText[] => Object.values(DEMO);
