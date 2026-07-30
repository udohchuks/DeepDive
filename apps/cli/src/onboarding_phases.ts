import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import {
  Clock,
  CompletionRecord,
  CompletionRecordSchema,
  CryptoIdGenerator,
  ModelProvider,
  PhaseId,
  SystemClock,
  TestRunResult,
  TestRunner,
} from '@deepdive/core';
import { LocalTestRunner } from '@deepdive/engine';
import { GraderPrompt } from '@deepdive/content';
import { RoundSummary } from './session_store.js';

export type TestFramework = 'vitest' | 'jest' | 'cargo' | 'pytest';

export const TEST_FRAMEWORKS: TestFramework[] = ['vitest', 'jest', 'cargo', 'pytest'];

export function isTestFramework(value: string): value is TestFramework {
  return (TEST_FRAMEWORKS as string[]).includes(value);
}

export interface CharacterizeResult {
  lines: string[];
  result: TestRunResult;
  /** True only when the suite passed. Decided by the runner, never by a model. */
  passed: boolean;
}

/**
 * Phase OB-D: runs the repository's characterization tests.
 *
 * P-5 in the most literal form the CLI has: the verdict here is the test
 * runner's exit state and nothing else. No model is constructed, no provider is
 * resolved, and no prompt exists in this path — there is nothing for a model to
 * disagree with. A student who wrote a test that pins current behaviour has
 * either got it green or has not.
 */
export async function runCharacterize(
  workspace: string,
  framework: TestFramework,
  runner: TestRunner = new LocalTestRunner(),
  timeoutMs = Number(process.env.DEEPDIVE_TEST_TIMEOUT_MS ?? 60_000),
): Promise<CharacterizeResult> {
  const result = await (
    runner as {
      runTests(
        framework: TestFramework,
        dir: string,
        options?: { timeoutMs?: number },
      ): Promise<TestRunResult>;
    }
  ).runTests(framework, path.resolve(workspace), { timeoutMs });

  const lines = [
    `characterization tests (${framework}): ${result.success ? 'green' : 'FAILED'}`,
    `  passed ${result.totalPassed}, failed ${result.totalFailed}, skipped ${result.totalSkipped}`,
  ];

  if (!result.success) {
    lines.push('', 'Phase OB-D does not advance until the suite is green.');
  }

  return { lines, result, passed: result.success };
}

/** A quiz the CLI can score without a model. */
export const QuizQuestionSchema = z.object({
  id: z.string().min(1),
  conceptId: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string()).min(2).max(6),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const QuizSetSchema = z.object({ questions: z.array(QuizQuestionSchema).min(1) });

/**
 * Phase OB-F: generates comprehension questions from the student's own approved
 * reverse SDD.
 *
 * Two deliberate restrictions. The source is the student's approved RSDD rather
 * than the repository, so the quiz tests what they claimed to understand — and
 * the Grader stays tool-free, holding no ability to read the clone. And only
 * multiple choice is generated, because an answer scored by exact match against
 * `correctAnswer` needs no model at scoring time: generation may vary, the
 * grade cannot (D-1).
 */
export async function generateQuiz(
  rsdd: Record<string, unknown>,
  provider: ModelProvider,
  count = 5,
): Promise<QuizQuestion[]> {
  const set = await provider.generateStructured({
    role: 'grader',
    promptVersion: GraderPrompt.version,
    systemPrompt: GraderPrompt.systemPrompt,
    userPrompt: JSON.stringify(
      {
        task: `Write ${count} multiple-choice comprehension questions about the codebase described below.`,
        rules: [
          'Each question must have exactly one correct option.',
          'correctAnswer must be the exact text of one of the options.',
          'Ask about how the described modules relate and why, not about trivia.',
          'Do not reveal the answer in the question text.',
        ],
        reverseSystemDesign: rsdd,
        outputShape:
          '{"questions":[{"id":string,"conceptId":string,"question":string,"options":string[],"correctAnswer":string,"explanation":string}]}',
      },
      null,
      2,
    ),
    schema: QuizSetSchema,
  });

  // A "correct" answer that is not among the options would be unanswerable, so
  // the question is dropped rather than shown and marked wrong whatever is said.
  return set.questions.filter((q) => q.options.includes(q.correctAnswer));
}

export interface QuizScore {
  total: number;
  correct: number;
  passed: boolean;
  lines: string[];
}

/** Passing OB-F needs most of the quiz right, not a bare majority. */
export const QUIZ_PASS_RATIO = 0.8;

/**
 * Scores answers by exact match against the recorded correct option.
 *
 * Pure, so the same answers always produce the same grade, and it costs
 * nothing to re-run.
 */
export function scoreQuiz(questions: readonly QuizQuestion[], answers: readonly string[]): QuizScore {
  const lines: string[] = [];
  let correct = 0;

  questions.forEach((question, index) => {
    const given = answers[index];
    const right = given === question.correctAnswer;
    if (right) correct += 1;
    lines.push(
      `  ${right ? 'correct' : 'wrong  '} ${question.question}`,
      right ? '' : `           you: ${given ?? '(no answer)'} · answer: ${question.correctAnswer}`,
      right ? '' : `           ${question.explanation}`,
    );
  });

  const passed = questions.length > 0 && correct / questions.length >= QUIZ_PASS_RATIO;
  return {
    total: questions.length,
    correct,
    passed,
    lines: [
      `quiz: ${correct}/${questions.length} correct — ${passed ? 'passed' : 'not passed'}`,
      ...lines.filter(Boolean),
    ],
  };
}

/** Phases a completed onboarding project must have approved, in order. */
export const ONBOARDING_PHASE_SEQUENCE: PhaseId[] = [
  'OB-A',
  'OB-B',
  'OB-C',
  'OB-D',
  'OB-E',
  'OB-F',
];

export interface CompletionResult {
  lines: string[];
  record?: CompletionRecord;
  complete: boolean;
}

/**
 * Phase OB-G: builds the completion record from the recorded history.
 *
 * Derived rather than asserted. The student cannot submit a completion record
 * claiming phases they never passed, because the only input is the rounds
 * already in the database — and those are append-only, so a phase counts as
 * done exactly when some round for it was approved.
 */
export function buildCompletionRecord(
  projectId: string,
  charterTitle: string,
  rounds: readonly RoundSummary[],
  clock: Clock = new SystemClock(),
  ids = new CryptoIdGenerator(),
): CompletionResult {
  const approved = new Set(
    rounds.filter((r) => r.status === 'approved').map((r) => r.phaseId as PhaseId),
  );
  const missing = ONBOARDING_PHASE_SEQUENCE.filter((phase) => !approved.has(phase));

  if (missing.length > 0) {
    return {
      complete: false,
      lines: [
        'not complete yet — no approved round for:',
        ...missing.map((phase) => `  - ${phase}`),
      ],
    };
  }

  const completedAt = clock.isoString();
  const completedPhases = [...ONBOARDING_PHASE_SEQUENCE, 'OB-G' as PhaseId];

  // D-7: the hash covers what was completed and when, so a record edited after
  // the fact no longer matches the hash it carries.
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ projectId, charterTitle, completedPhases, completedAt }))
    .digest('hex');

  const record = CompletionRecordSchema.parse({
    id: ids.generate(),
    projectId,
    mode: 'onboarding',
    charterTitle,
    completedPhases,
    hintProfile: [],
    completedAt,
    contentHash,
  });

  return {
    record,
    complete: true,
    lines: [
      `completion record for "${charterTitle}"`,
      `  phases: ${completedPhases.join(' → ')}`,
      `  hash:   ${contentHash}`,
    ],
  };
}

/** Writes the record beside the project, where the rest of its history lives. */
export function writeCompletionRecord(projectDir: string, record: CompletionRecord): string {
  const file = path.join(path.resolve(projectDir), '.deepdive', 'completion.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8');
  return file;
}
