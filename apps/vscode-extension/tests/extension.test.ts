import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Finding } from '@deepdive/core';
import {
  buildTree,
  CliOutputError,
  DeepDiveClient,
  findingsToDiagnostics,
  fieldFromMessage,
  locateKey,
  nextLevel,
  parseCliResult,
  ProgressiveHintController,
  renderHintHtml,
  rubricForFile,
  statusBarText,
  StrugglePromptController,
  StudioStats,
  trackFor,
} from '../src/index.js';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    code: 'BOUND_VIOLATED',
    severity: 'error',
    targetFieldId: 'charter_scope_bounded',
    ...over,
  };
}

const stats: StudioStats = {
  rounds: 3,
  approved: 1,
  activeDays: 2,
  currentStreak: 1,
  longestStreak: 2,
  peakHour: 17,
  hintsTaken: 0,
  conceptsMastered: 0,
  conceptsTracked: 2,
  phasesApproved: ['A'],
};

describe('reading the CLI', () => {
  it('treats a non-zero exit as a result, not a failure', async () => {
    // `grade` exits 1 for a submission needing revision. Throwing on that
    // would turn every rejection into an error popup with no findings in it.
    const client = new DeepDiveClient(async () => ({
      stdout: JSON.stringify({
        command: 'grade',
        exitCode: 1,
        lines: [],
        errors: [],
        status: 'revise',
      }),
      stderr: '',
      code: 1,
    }));

    const result = await client.grade('charter', 'c.json', '/p');
    expect(result.status).toBe('revise');
  });

  it('passes --json without the caller having to remember it', async () => {
    let seen: string[] = [];
    const client = new DeepDiveClient(async (args) => {
      seen = args;
      return {
        stdout: '{"command":"studio","exitCode":0,"lines":[],"errors":[]}',
        stderr: '',
        code: 0,
      };
    });

    await client.studio('/p');
    expect(seen).toEqual(['studio', '--project', '/p', '--json']);
  });

  it('reads the last line, so a warning printed before it is survivable', () => {
    const result = parseCliResult({
      stdout:
        '(node:1) ExperimentalWarning: something\n{"command":"studio","exitCode":0,"lines":[],"errors":[]}',
      stderr: '',
      code: 0,
    });
    expect(result.command).toBe('studio');
  });

  it('reports unreadable output as itself rather than throwing a parse error', () => {
    expect(() => parseCliResult({ stdout: 'not json at all', stderr: '', code: 1 })).toThrow(
      CliOutputError,
    );
  });

  it('reports empty output rather than returning an empty result', () => {
    expect(() => parseCliResult({ stdout: '   ', stderr: 'boom', code: 1 })).toThrow(/boom/);
  });
});

describe('findings land on the line that caused them', () => {
  const source = '{\n  "title": "T",\n  "scopeBounds": [],\n  "goal": "g"\n}\n';

  it('underlines the field the message names', () => {
    const [spec] = findingsToDiagnostics(
      [finding({ message: '"scopeBounds" must be a non-empty array.' })],
      source,
    );

    expect(spec?.located).toBe(true);
    expect(source.slice(spec!.start, spec!.end)).toBe('"scopeBounds"');
  });

  it('does not match a shorter key inside a longer one', () => {
    expect(locateKey(source, 'scope')).toBeNull();
  });

  it('still shows a finding it cannot place, rather than dropping it', () => {
    // A finding that vanished because its field could not be located would be
    // far worse than one placed imprecisely: the student would see nothing.
    const [spec] = findingsToDiagnostics([finding({ message: 'Something is wrong.' })], source);

    expect(spec?.located).toBe(false);
    expect(spec?.message).toBe('Something is wrong.');
  });

  it('falls back to the criterion id for a round recorded before messages existed', () => {
    const [spec] = findingsToDiagnostics([finding()], source);
    expect(spec?.message).toBe('BOUND_VIOLATED on charter_scope_bounded');
  });

  it('reads the field name only from a quoted token', () => {
    expect(fieldFromMessage('"scopeBounds" must be an array')).toBe('scopeBounds');
    expect(fieldFromMessage('scope bounds must be an array')).toBeNull();
    expect(fieldFromMessage(undefined)).toBeNull();
  });

  it('maps a filename to its rubric, and declines to guess otherwise', () => {
    expect(rubricForFile('/p/charter.json')).toBe('charter');
    expect(rubricForFile('C:\\p\\repo-charter.json')).toBe('repo-charter');
    expect(rubricForFile('/p/notes.json')).toBeNull();
    expect(rubricForFile('/p/charter.txt')).toBeNull();
  });
});

describe('the sidebar', () => {
  it('shows the track the project is actually on', () => {
    expect(trackFor(['OB-A']).name).toBe('onboarding');
    expect(trackFor(['A']).name).toBe('greenfield');
    expect(trackFor([]).name).toBe('greenfield');
  });

  it('reports effort and outcome separately', () => {
    const consistency = buildTree(stats, []).find((n) => n.id === 'consistency');
    const labels = consistency?.children?.map((c) => `${c.label}=${c.description}`);

    expect(labels).toContain('Rounds=3');
    expect(labels).toContain('Approved=1 of 3');
  });

  it('explains what will fill it rather than printing zeroes', () => {
    const nodes = buildTree(undefined, []);
    expect(nodes[0]?.label).toBe('Nothing recorded yet');
  });

  it('lists rounds newest first, with each finding under its round', () => {
    const rounds = [
      {
        roundNumber: 1,
        phaseId: 'A',
        status: 'revise',
        submittedAt: 'x',
        roleId: 'grader',
        findings: [finding({ message: 'why' })],
      },
      {
        roundNumber: 2,
        phaseId: 'A',
        status: 'approved',
        submittedAt: 'y',
        roleId: 'grader',
        findings: [],
      },
    ];

    const section = buildTree(stats, rounds).find((n) => n.id === 'rounds');
    expect(section?.children?.[0]?.label).toBe('2. approved');
    expect(section?.children?.[1]?.children?.[0]?.description).toBe('why');
  });

  it('names the next unfinished phase in the status bar', () => {
    expect(statusBarText(stats)).toContain('phase B');
    expect(statusBarText(undefined)).toBe('$(mortar-board) DeepDive');
  });
});

describe('PROTECTED INVARIANT: the hint ladder stops at L4', () => {
  it('offers no rung above L4', () => {
    expect(nextLevel([])).toBe('L1');
    expect(nextLevel([{ level: 'L1' }, { level: 'L2' }, { level: 'L3' }])).toBe('L4');
    expect(
      nextLevel([{ level: 'L1' }, { level: 'L2' }, { level: 'L3' }, { level: 'L4' }]),
    ).toBeNull();
  });

  it('renders no control that could ask for a fifth level', () => {
    const html = renderHintHtml({
      targetFieldId: 'charter_goal_clarity',
      revealed: [
        { level: 'L1', content: 'a' },
        { level: 'L2', content: 'b' },
        { level: 'L3', content: 'c' },
        { level: 'L4', content: 'd' },
      ],
    });

    expect(html).not.toContain('<button');
    expect(html).toContain('L4 is the last rung');
  });

  it('keeps every revealed rung on screen', () => {
    // Re-reading a rung is free and makes no model call. A rung that vanished
    // after being read would push the student to ask for the next one just to
    // see something, which is the wrong incentive.
    const html = renderHintHtml({
      targetFieldId: 'f',
      revealed: [
        { level: 'L1', content: 'first rung' },
        { level: 'L2', content: 'second rung' },
      ],
    });

    expect(html).toContain('first rung');
    expect(html).toContain('second rung');
    expect(html).toContain('Reveal L3');
  });

  it('escapes artifact text into the webview', () => {
    const html = renderHintHtml({
      targetFieldId: 'f',
      revealed: [{ level: 'L1', content: '<img src=x onerror="alert(1)">' }],
    });

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('steps L1 -> L2 -> L3 -> L4 and stops', () => {
    expect(ProgressiveHintController.getNextLevel('L1')).toBe('L2');
    expect(ProgressiveHintController.getNextLevel('L4')).toBeNull();
  });
});

describe('struggle detection', () => {
  it('triggers on two consecutive flags of the same field', () => {
    expect(StrugglePromptController.checkAndTriggerStrugglePrompt(['a', 'b']).isVisible).toBe(false);

    const struggling = StrugglePromptController.checkAndTriggerStrugglePrompt(['a', 'a']);
    expect(struggling.isVisible).toBe(true);
    expect(struggling.options).toEqual(['request_hint', 'dismiss']);
  });
});

describe('PROTECTED INVARIANT P-2: the UI cannot ask the AI to do the work', () => {
  it('has no command, message type, or control that produces graded artifacts', () => {
    const dir = path.join(process.cwd(), 'apps/vscode-extension');
    const sources = [
      'src/activation.ts',
      'src/deepdive_client.ts',
      'src/hint_view.ts',
      'src/tree_model.ts',
      'src/diagnostics.ts',
      'src/ui/hint_panel.ts',
      'src/ui/struggle_modal.ts',
      'package.json',
    ]
      .map((file) => fs.readFileSync(path.join(dir, file), 'utf-8'))
      .join('\n');

    for (const forbidden of [
      'generate_solution',
      'write_solution',
      'give_answer',
      'show_solution',
      'deepdive.scaffold',
      'deepdive.verify',
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });

  it('declares only read and grade commands in the manifest', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'apps/vscode-extension/package.json'), 'utf-8'),
    ) as { contributes: { commands: { command: string }[] } };

    // scaffold and verify hold tools and write files. They stay at the command
    // line, where the per-command approval prompt is, rather than behind a
    // one-click button in a panel that would make running an agent a reflex.
    expect(manifest.contributes.commands.map((c) => c.command).sort()).toEqual([
      'deepdive.doctor',
      'deepdive.grade',
      'deepdive.hint',
      'deepdive.refresh',
      'deepdive.studio',
    ]);
  });
});
