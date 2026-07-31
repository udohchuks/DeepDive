/**
 * What each phase asks for, as fields rather than as a JSON file to guess at.
 *
 * The old flow required knowing that a charter wants `scopeBounds` and not
 * `scope`, and punished a wrong guess with a rejected round. The shape of an
 * artifact is not the thing being assessed — the thinking inside it is — so
 * making the shape visible costs the student nothing and removes a whole class
 * of rejection that taught them nothing.
 *
 * These describe structure only. No field carries a suggested answer, and
 * nothing here is generated: the student still writes every word that gets
 * graded (P-2).
 */

export type FieldKind = 'text' | 'textarea' | 'select' | 'number' | 'list' | 'objectList';

export interface FormField {
  /** The JSON key. Findings name this, which is how a rejection finds its field. */
  name: string;
  label: string;
  kind: FieldKind;
  /** Shown under the field: what it is for, never an example answer. */
  help?: string;
  options?: string[];
  /** For objectList: the shape of one entry. */
  fields?: FormField[];
  optional?: boolean;
  /**
   * Rubric criteria that concern this field.
   *
   * A deterministic finding names its field in the message and can be placed
   * by reading it. A judged one cannot: the Grader writes prose, and the
   * finding carries a criterion id like `charter_goal_clarity` rather than a
   * JSON key. Without this map every judged rejection — which is most of them,
   * once the gate passes — would land in a banner instead of under the box
   * that caused it, and the panel would be least useful exactly when the
   * feedback is most worth reading.
   */
  criteria?: string[];
}

export interface FormSchema {
  rubric: string;
  phaseId: string;
  title: string;
  /** What this phase is for, in one line. */
  purpose: string;
  fileName: string;
  fields: FormField[];
}

const CITATION_FIELDS: FormField[] = [
  { name: 'filePath', label: 'File', kind: 'text' },
  { name: 'lineStart', label: 'From line', kind: 'number' },
  { name: 'lineEnd', label: 'To line', kind: 'number' },
];

export const FORM_SCHEMAS: FormSchema[] = [
  {
    rubric: 'charter',
    phaseId: 'A',
    title: 'Project charter',
    purpose: 'What you are building, and what you are deliberately not building.',
    fileName: 'charter.json',
    fields: [
      { name: 'title', label: 'Title', kind: 'text', criteria: ['charter_title_present'] },
      {
        name: 'goal',
        label: 'Goal',
        kind: 'textarea',
        criteria: ['charter_goal_clarity'],
        help: 'What a user will be able to do, and what you intend to learn by building it.',
      },
      {
        name: 'scopeBounds',
        label: 'Scope bounds',
        kind: 'list',
        criteria: ['charter_scope_bounded'],
        help: 'Things this project will not do. An unbounded project cannot be finished.',
      },
      {
        name: 'successCriteria',
        label: 'Success criteria',
        kind: 'list',
        optional: true,
        help: 'How you will know it works — each one something you could test.',
      },
    ],
  },
  {
    rubric: 'sdd',
    phaseId: 'B',
    title: 'Software design document',
    purpose: 'The modules you will build and how they fit together.',
    fileName: 'sdd.json',
    fields: [
      {
        name: 'modules',
        label: 'Modules',
        kind: 'objectList',
        criteria: ['sdd_modules_defined', 'sdd_citations_valid', 'sdd_architectural_coherence'],
        help: 'One entry per module: what it is responsible for.',
        fields: [
          { name: 'name', label: 'Name', kind: 'text' },
          { name: 'responsibility', label: 'Responsibility', kind: 'textarea' },
        ],
      },
      {
        name: 'dataFlows',
        label: 'Data flows',
        kind: 'list',
        optional: true,
        help: 'How data moves between the modules above.',
      },
    ],
  },
  {
    rubric: 'repo-charter',
    phaseId: 'OB-A',
    title: 'Repo learning charter',
    purpose: 'What you intend to learn from a codebase that already exists.',
    fileName: 'repo-charter.json',
    fields: [
      { name: 'repoName', label: 'Repository', kind: 'text', criteria: ['repo_charter_intent_declared'] },
      {
        name: 'intent',
        label: 'Intent',
        kind: 'select',
        options: ['learn', 'contribute', 'replicate'],
      },
      {
        name: 'mvpScope',
        label: 'MVP scope',
        kind: 'list',
        criteria: ['repo_charter_scope_realistic'],
        help: 'What you will actually do. An unbounded charter cannot be finished.',
      },
    ],
  },
  {
    rubric: 'rsdd',
    phaseId: 'OB-B',
    title: 'Reverse software design document',
    purpose: 'What the code actually does, with the evidence you read it.',
    fileName: 'rsdd.json',
    fields: [
      {
        name: 'level',
        label: 'Level',
        kind: 'select',
        options: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
        criteria: ['rsdd_level_valid'],
        help: 'How deep this description goes.',
      },
      {
        name: 'modules',
        label: 'Modules',
        kind: 'objectList',
        criteria: ['rsdd_citations_grounded', 'rsdd_design_accuracy'],
        help: 'Every module must cite the code it describes. Citations are checked against the pinned commit before anything is sent to a model.',
        fields: [
          { name: 'name', label: 'Name', kind: 'text' },
          { name: 'responsibility', label: 'Responsibility', kind: 'textarea' },
          { name: 'citations', label: 'Citations', kind: 'objectList', fields: CITATION_FIELDS },
        ],
      },
    ],
  },
  {
    rubric: 'plan',
    phaseId: 'OB-C',
    title: 'Reading plan',
    purpose: 'The order you will read the code in, in dependency order.',
    fileName: 'plan.json',
    fields: [
      {
        name: 'readingPlan',
        label: 'Reading units',
        kind: 'objectList',
        criteria: ['plan_units_present', 'plan_topologically_ordered', 'plan_questions_answerable'],
        help: 'A unit read before something it depends on is rejected by a code check, with no model call.',
        fields: [
          { name: 'id', label: 'Id', kind: 'text' },
          {
            name: 'dependsOn',
            label: 'Depends on',
            kind: 'list',
            help: 'Ids of units that must be read first. Leave empty if none.',
          },
          { name: 'citations', label: 'Citations', kind: 'objectList', fields: CITATION_FIELDS },
        ],
      },
    ],
  },
  {
    rubric: 'cdd',
    phaseId: 'OB-E',
    title: 'Contribution design document',
    purpose: 'The change you propose, and the files it touches.',
    fileName: 'cdd.json',
    fields: [
      {
        name: 'characterizationTestPath',
        label: 'Characterization test',
        kind: 'text',
        criteria: ['cdd_characterization_test_present'],
        help: 'The test that pins current behaviour before you change it.',
      },
      {
        name: 'targetFiles',
        label: 'Target files',
        kind: 'objectList',
        criteria: ['cdd_target_files_cited'],
        help: 'A contribution that names no file is what this phase exists to stop.',
        fields: CITATION_FIELDS,
      },
      { name: 'rationale', label: 'Rationale', kind: 'textarea', optional: true, criteria: ['cdd_fix_rationale'] },
    ],
  },
];

export function schemaFor(rubric: string): FormSchema | null {
  return FORM_SCHEMAS.find((schema) => schema.rubric === rubric) ?? null;
}

/** Which phase a rubric belongs to, so the panel can order and lock nothing. */
export const GREENFIELD_RUBRICS = ['charter', 'sdd'];
export const ONBOARDING_RUBRICS = ['repo-charter', 'rsdd', 'plan', 'cdd'];

/**
 * Drops empty values before writing the artifact.
 *
 * A form always has every field, including the ones left blank, and an empty
 * string is not the same as an absent key: `{"title": ""}` fails a rubric with
 * "must be non-empty", while an omitted title fails with the same message for
 * the same reason. Stripping keeps the file honest about what was actually
 * written, and keeps a re-opened form from filling with blanks it invented.
 */
export function toArtifact(values: unknown): Record<string, unknown> {
  const cleaned = strip(values);
  return cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
    ? (cleaned as Record<string, unknown>)
    : {};
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(strip).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, raw]) => [key, strip(raw)] as const)
      .filter(([, raw]) => raw !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  // A zero is a real answer for a line number, so numbers pass through even
  // when falsy. Only NaN — an empty number input — is absent.
  if (typeof value === 'number') return Number.isNaN(value) ? undefined : value;

  return value ?? undefined;
}

/**
 * Whether a form has enough in it to be worth submitting.
 *
 * Not validation — the rubric decides what is good enough, and this must never
 * become a second, quieter grader that blocks a submission the engine would
 * have accepted. It only stops a completely empty form from spending a round.
 */
export function hasContent(values: unknown): boolean {
  return Object.keys(toArtifact(values)).length > 0;
}
