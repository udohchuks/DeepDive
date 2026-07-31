import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Finding } from '@deepdive/core';
import {
  availableRubrics,
  CliResult,
  DeepDiveClient,
  DeepDiveSidebarProvider,
  fieldAtPath,
  findingsByField,
  FORM_SCHEMAS,
  hasContent,
  mutate,
  renderPanel,
  schemaFor,
  SidebarHost,
  toArtifact,
} from '../src/index.js';

function finding(message: string, field = 'charter_scope_bounded'): Finding {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    code: 'BOUND_VIOLATED',
    severity: 'error',
    targetFieldId: field,
    message,
  };
}

interface Harness {
  provider: DeepDiveSidebarProvider;
  files: Map<string, string>;
  rendered: string[];
  errors: string[];
  calls: string[][];
}

function harness(responses: Partial<Record<string, CliResult>> = {}): Harness {
  const files = new Map<string, string>();
  const rendered: string[] = [];
  const errors: string[] = [];
  const calls: string[][] = [];

  const host: SidebarHost = {
    render: (html) => rendered.push(html),
    readFile: (file) => files.get(file) ?? null,
    writeFile: (file, contents) => void files.set(file, contents),
    join: (...parts) => path.join(...parts),
    projectDir: () => path.join(path.sep, 'project'),
    showError: (message) => errors.push(message),
  };

  const client = new DeepDiveClient(async (args) => {
    calls.push(args);
    const command = args[0]!;
    const result: CliResult = responses[command] ?? {
      command,
      exitCode: 0,
      lines: [],
      errors: [],
    };
    return { stdout: JSON.stringify(result), stderr: '', code: result.exitCode };
  });

  return { provider: new DeepDiveSidebarProvider(host, client), files, rendered, errors, calls };
}

const CHARTER = path.join(path.sep, 'project', 'charter.json');

describe('the panel writes what you typed, and nothing else', () => {
  it('saves the form to the artifact file', async () => {
    const h = harness();
    await h.provider.handleMessage({
      type: 'save',
      values: { title: 'Bookmark Deduplicator', scopeBounds: ['No browser extension'] },
    });

    expect(JSON.parse(h.files.get(CHARTER)!)).toEqual({
      title: 'Bookmark Deduplicator',
      scopeBounds: ['No browser extension'],
    });
  });

  it('drops blank fields rather than writing empty strings', () => {
    // An empty string is not the same as an absent key, and a file full of ""
    // would misrepresent what the student actually wrote.
    expect(toArtifact({ title: 'T', goal: '   ', scopeBounds: ['', 'real'] })).toEqual({
      title: 'T',
      scopeBounds: ['real'],
    });
  });

  it('keeps a zero, which is a real line number', () => {
    expect(toArtifact({ lineStart: 0 })).toEqual({ lineStart: 0 });
  });

  it('reads an existing artifact back into the form', async () => {
    const h = harness();
    h.files.set(CHARTER, JSON.stringify({ title: 'From disk' }));

    await h.provider.initialize();
    expect(h.provider.state().values).toEqual({ title: 'From disk' });
  });

  it('does not blank the form when the file on disk is unparseable', async () => {
    // Silently emptying the form would overwrite hand-edited work on the very
    // next save.
    const h = harness();
    h.files.set(CHARTER, '{ broken');

    await h.provider.initialize();
    expect(h.provider.state().notice).toMatch(/not valid JSON/);
    expect(h.files.get(CHARTER)).toBe('{ broken');
  });
});

describe('submitting', () => {
  it('grades the file it just wrote, not the form values', async () => {
    const h = harness({
      grade: { command: 'grade', exitCode: 1, lines: [], errors: [], status: 'revise', findings: [] },
    });

    await h.provider.handleMessage({ type: 'submit', values: { title: 'T' } });

    const grade = h.calls.find((c) => c[0] === 'grade')!;
    expect(grade).toContain(CHARTER);
    expect(h.files.has(CHARTER)).toBe(true);
  });

  it('refuses to spend a round on an empty form', async () => {
    const h = harness();
    await h.provider.handleMessage({ type: 'submit', values: { title: '  ' } });

    expect(h.calls.some((c) => c[0] === 'grade')).toBe(false);
    expect(h.provider.state().notice).toMatch(/Nothing to submit/);
  });

  it('keeps the findings so they can be shown against their fields', async () => {
    const h = harness({
      grade: {
        command: 'grade',
        exitCode: 1,
        lines: [],
        errors: [],
        status: 'revise',
        findings: [finding('"scopeBounds" must be a non-empty array.')],
      },
    });

    await h.provider.handleMessage({ type: 'submit', values: { title: 'T' } });
    expect(h.provider.state().status).toBe('revise');
    expect(h.provider.state().findings).toHaveLength(1);
  });

  it('says something even when a rejection carries no findings', async () => {
    // A citation check fails before the gate and reports through lines. A
    // silent panel would look like nothing happened.
    const h = harness({
      grade: {
        command: 'grade',
        exitCode: 1,
        lines: ['citation check: FAILED — no model call made'],
        errors: [],
        status: 'revise',
        findings: [],
      },
    });

    await h.provider.handleMessage({ type: 'submit', values: { title: 'T' } });
    expect(h.provider.state().notice).toMatch(/citation check/);
  });
});

describe('editing repeated fields', () => {
  it('adds and removes list rows', () => {
    const added = mutate({ scopeBounds: ['a'] }, 'scopeBounds', 'add');
    expect(added.scopeBounds).toEqual(['a', '']);
    expect(mutate(added, 'scopeBounds.0', 'remove').scopeBounds).toEqual(['']);
  });

  it('creates the array when the field has never been filled', () => {
    expect(mutate({}, 'scopeBounds', 'add').scopeBounds).toEqual(['']);
  });

  it('adds a row inside a nested object list', () => {
    const values = { modules: [{ name: 'a', citations: [] }] };
    const result = mutate(values, 'modules.0.citations', 'addObject', { filePath: '' });
    expect((result.modules as { citations: unknown[] }[])[0]!.citations).toEqual([{ filePath: '' }]);
  });

  it('does not mutate the state it was given', () => {
    const before = { scopeBounds: ['a'] };
    mutate(before, 'scopeBounds', 'add');
    expect(before.scopeBounds).toEqual(['a']);
  });

  it('finds the field definition behind a path with indices in it', () => {
    const field = fieldAtPath(schemaFor('rsdd'), 'modules.2.citations');
    expect(field?.name).toBe('citations');
    expect(field?.fields?.map((f) => f.name)).toEqual(['filePath', 'lineStart', 'lineEnd']);
  });
});

describe('switching phases', () => {
  it('saves the current form before loading the next', async () => {
    const h = harness();
    await h.provider.handleMessage({ type: 'switch', rubric: 'sdd', values: { title: 'kept' } });

    expect(JSON.parse(h.files.get(CHARTER)!)).toEqual({ title: 'kept' });
    expect(h.provider.state().schema?.rubric).toBe('sdd');
  });

  it('clears the previous phase findings, which were about another artifact', async () => {
    const h = harness({
      grade: {
        command: 'grade',
        exitCode: 1,
        lines: [],
        errors: [],
        status: 'revise',
        findings: [finding('"scopeBounds" is required.')],
      },
    });

    await h.provider.handleMessage({ type: 'submit', values: { title: 'T' } });
    await h.provider.handleMessage({ type: 'switch', rubric: 'sdd', values: {} });

    expect(h.provider.state().findings).toEqual([]);
    expect(h.provider.state().status).toBeNull();
  });

  it('offers every phase rather than locking you to the next one', () => {
    // Locking would mean the tool decides which phase you are on, and the
    // order of your own work is the part that belongs to the student.
    expect(availableRubrics([]).map((r) => r.rubric)).toContain('cdd');
    expect(availableRubrics(['OB-A'])[0]!.rubric).toBe('repo-charter');
  });
});

describe('hints in the panel', () => {
  it('keeps every revealed rung, not just the newest', async () => {
    const h = harness({
      hint: {
        command: 'hint',
        exitCode: 0,
        lines: [],
        errors: [],
        level: 'L2',
        content: 'second rung',
        targetFieldId: 'charter_goal_clarity',
        revealed: [{ level: 'L1', content: 'first rung' }],
      },
    });

    await h.provider.handleMessage({ type: 'hint' });
    expect(h.provider.state().hint?.map((x) => x.level)).toEqual(['L1', 'L2']);
  });

  it('explains rather than failing when there is nothing to hint at', async () => {
    const h = harness({
      hint: {
        command: 'hint',
        exitCode: 1,
        lines: [],
        errors: ['Nothing to hint at — no round has open findings.'],
      },
    });

    await h.provider.handleMessage({ type: 'hint' });
    expect(h.provider.state().notice).toMatch(/Nothing to hint at/);
    expect(h.errors).toEqual([]);
  });
});

describe('rendering', () => {
  it('attaches a finding to the field its message names', () => {
    const html = renderPanel({
      schema: schemaFor('charter'),
      available: availableRubrics([]),
      values: {},
      findings: [finding('"scopeBounds" must be a non-empty array.')],
      status: 'revise',
      rounds: [],
    });

    // The error text sits inside the scopeBounds field block, not in a banner.
    const block = html.slice(html.indexOf('Scope bounds'));
    expect(block.slice(0, block.indexOf('</div>') + 400)).toContain('must be a non-empty array');
  });

  it('still shows a finding whose field cannot be identified', () => {
    const grouped = findingsByField([finding('Something went wrong.')]);
    expect(grouped.get('')).toHaveLength(1);
  });

  it('places a judged finding by its criterion, since its message is prose', () => {
    // Most rejections after the gate passes are judged. Without the
    // criterion→field map they all landed in a banner, which is the case
    // where reading the feedback closely matters most.
    const grouped = findingsByField(
      [finding('The goal statement is too vague.', 'charter_goal_clarity')],
      schemaFor('charter'),
    );
    expect(grouped.get('goal')).toHaveLength(1);
  });

  it('ignores a quoted word in prose that is not a field of this form', () => {
    // The Grader quotes the student's own words back at them. An unchecked
    // match put a rejection about the goal under whichever word was in quotes.
    const grouped = findingsByField(
      [finding('It only says "merge" without saying what that means.', 'charter_goal_clarity')],
      schemaFor('charter'),
    );

    expect(grouped.has('merge')).toBe(false);
    expect(grouped.get('goal')).toHaveLength(1);
  });

  it('marks the field it placed a finding under', () => {
    const html = renderPanel({
      schema: schemaFor('charter'),
      available: availableRubrics([]),
      values: {},
      findings: [finding('The goal statement is too vague.', 'charter_goal_clarity')],
      status: 'revise',
      rounds: [],
    });

    expect(html.match(/class="field invalid"/g)).toHaveLength(1);
    const goalBlock = html.split('<div class="field').find((b) => b.includes('>Goal<'))!;
    expect(goalBlock).toContain('too vague');
  });

  it('maps every criterion the rubrics define to a field', () => {
    // A criterion with no field would silently fall back to the banner, and
    // the gap would only show up as a rejection the student cannot locate.
    const mapped = new Set(FORM_SCHEMAS.flatMap((s) => s.fields.flatMap((f) => f.criteria ?? [])));
    expect(mapped.has('charter_goal_clarity')).toBe(true);
    expect(mapped.has('sdd_architectural_coherence')).toBe(true);
    expect(mapped.has('rsdd_design_accuracy')).toBe(true);
    expect(mapped.has('cdd_fix_rationale')).toBe(true);
    expect(mapped.has('plan_questions_answerable')).toBe(true);
  });

  it('escapes what the student typed', () => {
    const html = renderPanel({
      schema: schemaFor('charter'),
      available: availableRubrics([]),
      values: { title: '"><script>alert(1)</script>' },
      findings: [],
      status: null,
      rounds: [],
    });

    expect(html).not.toContain('<script>alert(1)');
  });

  it('disables the buttons while a submission is in flight', () => {
    const html = renderPanel({
      schema: schemaFor('charter'),
      available: availableRubrics([]),
      values: {},
      findings: [],
      status: null,
      rounds: [],
      busy: true,
    });

    expect(html).toContain('Grading…');
    expect(html).toContain('disabled');
  });
});

describe('PROTECTED INVARIANT P-2: the panel cannot author the work', () => {
  it('offers no field help that supplies an answer', () => {
    // Help text says what a field is for. The moment it contains an example
    // answer, the student is copying rather than deciding.
    for (const schema of FORM_SCHEMAS) {
      for (const field of schema.fields) {
        expect(field.help ?? '').not.toMatch(/e\.g\.|for example|such as:/i);
      }
    }
  });

  it('has no message type, control, or handler that generates content', () => {
    const dir = path.join(process.cwd(), 'apps/vscode-extension/src');
    const sources = ['sidebar_provider.ts', 'panel_view.ts', 'forms.ts']
      .map((file) => fs.readFileSync(path.join(dir, file), 'utf-8'))
      .join('\n');

    // Matched as identifiers rather than as substrings: the prose in these
    // files legitimately says "no field carries a suggested answer", and a
    // check that fired on the word would punish documenting the invariant.
    for (const forbidden of [
      /generate_solution/,
      /write_solution/,
      /give_answer/,
      /show_solution/,
      /\bautofill\b/i,
      /\bsuggestValue\b/i,
      /\bfillFrom(Model|Hint)\b/i,
    ]) {
      expect(sources).not.toMatch(forbidden);
    }
  });

  it('renders no button beyond the ones a learner drives themselves', () => {
    const html = renderPanel({
      schema: schemaFor('charter'),
      available: availableRubrics([]),
      values: {},
      findings: [],
      status: null,
      rounds: [],
    });

    const labels = [...html.matchAll(/<button[^>]*>([^<]*)</g)].map((m) => m[1]!.trim());
    for (const label of labels) {
      expect(label).not.toMatch(/generate|write it|solve|fix for me|answer/i);
    }
  });

  it('never fills a form field from a model response', async () => {
    // A hint arrives as prose in its own panel section. If it could reach the
    // form values, the AI would be authoring the graded artifact.
    const h = harness({
      hint: {
        command: 'hint',
        exitCode: 0,
        lines: [],
        errors: [],
        level: 'L1',
        content: 'Think about what the user can do.',
        targetFieldId: 'charter_goal_clarity',
      },
    });

    await h.provider.handleMessage({ type: 'hint', values: { title: 'mine' } });
    expect(h.provider.state().values).toEqual({ title: 'mine' });
  });
});

describe('the form covers every rubric the CLI grades', () => {
  it('has a schema per rubric, with a file name and a phase', () => {
    for (const schema of FORM_SCHEMAS) {
      expect(schema.fileName).toMatch(/\.json$/);
      expect(schema.phaseId).toMatch(/^(OB-)?[A-G]$/);
      expect(schema.fields.length).toBeGreaterThan(0);
    }
  });

  it('asks for every field the deterministic gate requires', () => {
    // A gate that rejects a field the form never offered would be unanswerable
    // from the panel.
    const names = (rubric: string) => schemaFor(rubric)!.fields.map((f) => f.name);

    expect(names('charter')).toContain('scopeBounds');
    expect(names('repo-charter')).toEqual(expect.arrayContaining(['repoName', 'intent', 'mvpScope']));
    expect(names('rsdd')).toEqual(expect.arrayContaining(['level', 'modules']));
    expect(names('cdd')).toEqual(expect.arrayContaining(['characterizationTestPath', 'targetFiles']));
    expect(names('plan')).toContain('readingPlan');
  });

  it('treats a form with only whitespace as empty', () => {
    expect(hasContent({ title: '  ', scopeBounds: [''] })).toBe(false);
    expect(hasContent({ title: 'x' })).toBe(true);
  });
});
