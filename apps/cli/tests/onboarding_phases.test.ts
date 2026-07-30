import { describe, it, expect } from 'vitest';
import { TestRunResult, TestRunner, Clock } from '@deepdive/core';
import { runCodeCheck } from '@deepdive/content';
import { checkReadingOrder } from '@deepdive/core';
import {
  buildCompletionRecord,
  ONBOARDING_PHASE_SEQUENCE,
  QUIZ_PASS_RATIO,
  runCharacterize,
  scoreQuiz,
  QuizQuestion,
} from '../src/onboarding_phases.js';
import { RoundSummary } from '../src/session_store.js';
import { CLI_RUBRICS } from '../src/grade.js';

const fixedClock: Clock = {
  now: () => new Date('2026-01-01T00:00:00.000Z'),
  isoString: () => '2026-01-01T00:00:00.000Z',
};

function testResult(overrides: Partial<TestRunResult> = {}): TestRunResult {
  return {
    totalPassed: 3,
    totalFailed: 0,
    totalSkipped: 0,
    success: true,
    suites: [],
    rawOutput: '',
    ...overrides,
  };
}

describe('OB-C: reading plan ordering', () => {
  const unit = (id: string, dependsOn: string[] = []) => ({
    id,
    title: id,
    question: 'why?',
    dependsOn,
    citations: [{ filePath: `${id}.ts`, lineStart: 1, lineEnd: 2 }],
  });

  it('accepts a plan whose dependencies come first', () => {
    expect(checkReadingOrder([unit('a'), unit('b', ['a'])]).ordered).toBe(true);
  });

  it('rejects a plan that reads a unit before what it depends on', () => {
    // The OB-C exit criterion is an ordering, not just an acyclic graph: a
    // dependency further down the list would be read too late.
    const result = checkReadingOrder([unit('b', ['a']), unit('a')]);
    expect(result.ordered).toBe(false);
    expect(result.problems[0]).toContain('scheduled before');
  });

  it('reports a dependency on a unit that is not in the plan', () => {
    // Silently ignoring unknown ids would let a typo weaken the whole check.
    const result = checkReadingOrder([unit('a', ['typo'])]);
    expect(result.ordered).toBe(false);
    expect(result.problems[0]).toContain('not a unit in this plan');
  });

  it('is enforced by the rubric code check, not only the helper', () => {
    expect(
      runCodeCheck('check_reading_plan_ordered', { readingPlan: [unit('b', ['a']), unit('a')] })
        .passed,
    ).toBe(false);
    expect(
      runCodeCheck('check_reading_units_cited', {
        readingPlan: [{ id: 'a', citations: [{ filePath: 'a.ts' }] }],
      }).passed,
    ).toBe(false); // no line range
  });
});

describe('PROTECTED INVARIANT (P-5): OB-D is decided by the test runner', () => {
  class StubRunner implements TestRunner {
    constructor(private readonly result: TestRunResult) {}
    async runTests(): Promise<TestRunResult> {
      return this.result;
    }
  }

  it('approves only when the suite is green', async () => {
    const green = await runCharacterize('.', 'vitest', new StubRunner(testResult()));
    expect(green.passed).toBe(true);

    const red = await runCharacterize(
      '.',
      'vitest',
      new StubRunner(testResult({ success: false, totalFailed: 2 })),
    );
    expect(red.passed).toBe(false);
    expect(red.lines.join('\n')).toContain('does not advance');
  });

  it('reports the runner\'s counts rather than a summary of them', async () => {
    const outcome = await runCharacterize(
      '.',
      'vitest',
      new StubRunner(testResult({ totalPassed: 7, totalSkipped: 1 })),
    );
    expect(outcome.lines.join('\n')).toContain('passed 7, failed 0, skipped 1');
  });
});

describe('OB-F: quiz scoring', () => {
  const question = (id: string): QuizQuestion => ({
    id,
    conceptId: 'c',
    question: `q${id}`,
    options: ['right', 'wrong'],
    correctAnswer: 'right',
    explanation: 'because',
  });

  const five = ['1', '2', '3', '4', '5'].map(question);

  it('scores by exact match, so the same answers always grade the same', () => {
    const answers = ['right', 'right', 'right', 'right', 'right'];
    expect(scoreQuiz(five, answers)).toMatchObject({ correct: 5, total: 5, passed: true });
    expect(scoreQuiz(five, answers).correct).toBe(scoreQuiz(five, answers).correct);
  });

  it('requires more than a bare majority to pass', () => {
    const three = ['right', 'right', 'right', 'wrong', 'wrong'];
    expect(3 / 5).toBeLessThan(QUIZ_PASS_RATIO);
    expect(scoreQuiz(five, three).passed).toBe(false);
  });

  it('counts a missing answer as wrong rather than skipping the question', () => {
    // An unanswered question must not quietly shrink the denominator.
    const result = scoreQuiz(five, ['right']);
    expect(result).toMatchObject({ correct: 1, total: 5, passed: false });
  });

  it('shows the explanation only for what was got wrong', () => {
    const text = scoreQuiz(five, ['right', 'wrong', 'right', 'right', 'right']).lines.join('\n');
    expect(text.match(/because/g)).toHaveLength(1);
  });
});

describe('PROTECTED INVARIANT: OB-G is derived from history, not asserted', () => {
  const round = (phaseId: string, status: string): RoundSummary => ({
    roundNumber: 1,
    phaseId,
    status,
    submittedAt: '2026-01-01T00:00:00.000Z',
    roleId: 'grader',
    findings: [],
  });

  const allApproved = ONBOARDING_PHASE_SEQUENCE.map((p) => round(p, 'approved'));
  const projectId = '11111111-1111-4111-8111-111111111111';

  it('refuses to complete while any phase has no approved round', () => {
    // The student cannot claim a phase they never passed: the only input is
    // the append-only round history.
    const result = buildCompletionRecord(projectId, 'Study', allApproved.slice(0, 3), fixedClock);
    expect(result.complete).toBe(false);
    expect(result.lines.join('\n')).toContain('OB-D');
  });

  it('does not count a rejected round as a pass', () => {
    const withRevise = [...allApproved.slice(0, 5), round('OB-F', 'revise')];
    expect(buildCompletionRecord(projectId, 'Study', withRevise, fixedClock).complete).toBe(false);
  });

  it('produces a record covering every phase once all are approved', () => {
    const result = buildCompletionRecord(projectId, 'Study', allApproved, fixedClock);
    expect(result.complete).toBe(true);
    expect(result.record!.completedPhases).toEqual([...ONBOARDING_PHASE_SEQUENCE, 'OB-G']);
    expect(result.record!.mode).toBe('onboarding');
  });

  it('hashes the record so a later edit no longer matches it (D-7)', () => {
    const a = buildCompletionRecord(projectId, 'Study', allApproved, fixedClock).record!;
    const b = buildCompletionRecord(projectId, 'Different', allApproved, fixedClock).record!;
    expect(a.contentHash).toHaveLength(64);
    expect(a.contentHash).not.toBe(b.contentHash);
  });
});

describe('PROTECTED INVARIANT: every phase completion requires is reachable', () => {
  it('has a CLI route that records each phase in the sequence', () => {
    // `grade charter` records greenfield phase A, so pointing onboarding at it
    // left OB-A with no approved round and made `complete` unreachable — the
    // sequence and the routes must be checked against each other, not by hand.
    const fromRubrics = new Set(Object.values(CLI_RUBRICS).map((r) => r.phaseId));
    const fromCommands = new Set([...fromRubrics, 'OB-D', 'OB-F', 'OB-G']);

    for (const phase of ONBOARDING_PHASE_SEQUENCE) {
      expect(fromCommands, `no command records ${phase}`).toContain(phase);
    }
  });

  it('names the onboarding charter rubric separately from the greenfield one', () => {
    expect(CLI_RUBRICS['repo-charter']!.phaseId).toBe('OB-A');
    expect(CLI_RUBRICS.charter!.phaseId).toBe('A');
  });
});
