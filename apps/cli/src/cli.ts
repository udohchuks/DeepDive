import { createModelProvider } from '@deepdive/provider';
import { assertWorkspace, loadArtifact } from './artifact_input.js';
import { buildDoctorReport } from './doctor.js';
import { CITATION_CRITERION, CLI_RUBRICS, ONBOARDING_RUBRICS, runGrade } from './grade.js';
import { readOnboardingConfig, runOnboard, verifyRepoCitations } from './onboarding_commands.js';
import {
  applyQuizToMastery,
  buildCompletionRecord,
  generateQuiz,
  QuizQuestion,
  renderMastery,
  selectFromBank,
  isTestFramework,
  runCharacterize,
  scoreQuiz,
  TEST_FRAMEWORKS,
  writeCompletionRecord,
} from './onboarding_phases.js';
import { askMultipleChoice } from './prompt.js';
import {
  generateHint,
  HINT_LADDER,
  primaryStickingPoint,
  resolveRequestedLevel,
  shouldOfferHint,
  buildHintProfile,
} from './hints.js';
import { HintLevel, QuizItem } from '@deepdive/core';
import { renderStudio } from './studio.js';
import { buildRoleModel, PiBackedKeyStore, runScaffold, runVerify } from './agent_commands.js';
import { createTerminalApprover } from './approver.js';
import { SessionStore } from './session_store.js';
import { ApprovalOptions, isPermissionMode, PermissionMode } from '@deepdive/agent';

export const USAGE = `deepdive — guided project learning, run locally

Usage:
  deepdive doctor
      Check permission mode and provider/credential configuration.
      Makes no network call and spends nothing.

  deepdive onboard <repo-url> [<dir>]
      Clone a repository and pin the commit you will be graded against.
      Starts Codebase Onboarding mode in that directory.

  deepdive grade <rubric> <artifact.json>
      Run the deterministic gate, then grade judged criteria with the model.
      Rubrics: ${Object.keys(CLI_RUBRICS).join(', ')}
      Onboarding rubrics (rsdd, plan, cdd) have their citations checked
      against the cloned repo at the pinned commit before any model call, so
      a citation to a file that does not exist is free to reject.

  deepdive characterize <workspace> [vitest|jest|cargo|pytest]
      Phase OB-D. Run the repository's test suite. The runner decides the
      verdict — no model is called on this path.

  deepdive quiz
      Phase OB-F. Draws from your question bank, favouring concepts you
      have not yet mastered, and writes new questions only to fill the
      gap. Scored by exact match; mastery carries across sessions.

  deepdive complete
      Phase OB-G. Derive the completion record from your approved rounds.

  deepdive hint [L1|L2|L3|L4]
      Reveal the next rung of the hint ladder for your latest open round.
      Unlimited, and logged rather than penalised. L4 is the ceiling: no
      level ever gives you the answer.

  deepdive studio
      Consistency and progress at a glance: rounds, active days, streaks,
      phase progress and a twelve-week heatmap.

  deepdive history
      Show every round recorded for this project, oldest first.
      Grades, scaffold runs and verify runs all appear, tagged by role.

  deepdive scaffold [--auto|--approve] <workspace> <instruction>
      Run the Scaffolder against a workspace (write/edit/bash, path-scoped).
      Cannot write graded artifacts, in any mode.

  deepdive verify [--auto|--approve] <workspace> <instruction>
      Run the Verifier against a workspace (read-only).

Permission modes:
  --approve   (default) ask before each mutating command; reads run freely
  --auto      policy decides, nothing is asked

  Policy always applies. Approval can only narrow what policy permits, so no
  answer at a prompt can authorise a write into a graded artifact.
  Set DEEPDIVE_PERMISSION_MODE to change the default.

  In an onboarding workspace, running the cloned repository's test suite is
  confirmed separately and --auto does not answer it.

Configuration is read from the environment. Load a .env file with Node's own
loader, which keeps the key out of your shell history:

  node --env-file=.env node_modules/.bin/deepdive doctor
`;

/**
 * Extracts the permission mode from argv.
 *
 * Defaults to `approve`: the safe mode is the one you get by forgetting to
 * choose. `DEEPDIVE_PERMISSION_MODE` sets a default for people who have already
 * decided, and an explicit flag still wins over it.
 */
export function parsePermissionMode(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): { mode: PermissionMode; rest: string[] } {
  const rest: string[] = [];
  let mode: PermissionMode | undefined;

  for (const arg of argv) {
    if (arg === '--auto') mode = 'auto';
    else if (arg === '--approve') mode = 'approve';
    else rest.push(arg);
  }

  if (!mode) {
    const fromEnv = env.DEEPDIVE_PERMISSION_MODE;
    if (fromEnv && isPermissionMode(fromEnv)) mode = fromEnv;
  }

  return { mode: mode ?? 'approve', rest };
}

/**
 * Extracts `--project <dir>`, defaulting to the current directory.
 *
 * One rule for every command: history belongs to the directory you run in.
 * Deriving it from the artifact path for `grade` and the workspace for
 * `scaffold` would put two projects' rounds in different places depending on
 * which command wrote first.
 */
export function parseProjectDir(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): { projectDir: string; rest: string[] } {
  const rest: string[] = [];
  let projectDir: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--project') {
      // Falling back to the current directory here would silently write one
      // project's history into another — the failure would be invisible until
      // `history` came back empty in the directory that should have had it.
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--project needs a directory: deepdive <command> --project <dir>');
      }
      projectDir = value;
      i += 1;
    } else {
      rest.push(argv[i]!);
    }
  }

  return { projectDir: projectDir ?? env.DEEPDIVE_PROJECT_DIR ?? process.cwd(), rest };
}

/**
 * Where an agent run lands in the greenfield phase sequence.
 *
 * Scaffolding produces the task/test breakdown of phase C; verification reports
 * on the implemented modules and test suite of phase D. Recording them under
 * their real phases keeps one ordered history rather than two parallel logs.
 */
export const AGENT_PHASE_IDS = { scaffold: 'C', verify: 'D' } as const;

/** How many questions one quiz asks. */
export const QUIZ_LENGTH = 5;

/**
 * Only multiple-choice items can be scored without a model.
 *
 * The bank's schema allows traced and explanatory question types, which a
 * future surface may add; drawing one here would mean grading free text, and
 * the quiz would stop being deterministic.
 */
function isMultipleChoice(item: QuizItem): item is QuizItem & { options: string[] } {
  return item.type === 'multiple_choice' && Array.isArray(item.options) && item.options.length >= 2;
}

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

/**
 * Opens the project store, appends one round, and closes it.
 *
 * Every command records through here so none can forget to close the database
 * or invent its own path for the history file.
 */
function recordRoundFor(
  projectDir: string,
  io: CliIo,
  input: Parameters<SessionStore['recordRound']>[0],
): void {
  const store = new SessionStore({ projectDir });
  try {
    const round = store.recordRound(input);
    io.out(`\nsaved as round ${round.roundNumber} (${store.dbPath})`);
  } finally {
    store.close();
  }
}

/**
 * Offers a hint when the same field has been the sticking point twice running.
 *
 * An offer, not an intervention: it prints a line and makes no model call. Being
 * wrong twice about different things is ordinary progress; being stuck on the
 * same field twice is the signal worth naming (§8b).
 */
function offerHintIfStuck(projectDir: string, io: CliIo): void {
  const store = new SessionStore({ projectDir });
  try {
    const history = store.primaryFieldHistory();
    if (!shouldOfferHint(history)) return;

    io.out(
      `\nThat is twice on ${history[history.length - 1]}. Run "deepdive hint" if you want a nudge —`,
    );
    io.out('it is recorded, but nothing scores you down for taking one.');
  } finally {
    store.close();
  }
}

/**
 * Confirms that the student accepts running a third-party repository's code.
 *
 * An onboarding workspace is a clone of someone else's project, and `scaffold`
 * and `verify` both hold `bash`. Running its test suite executes whatever that
 * repository's scripts do, with the student's own file access — a materially
 * different risk from running tests they wrote themselves, and one `--auto`
 * would otherwise pass over in silence. There is no OS sandbox at the moment,
 * so an informed decision is the whole of the protection: this asks once per
 * command, and `--auto` does not answer it.
 */
async function confirmThirdPartyCode(
  workspace: string,
  repoUrl: string,
  io: CliIo,
): Promise<boolean> {
  io.out('');
  io.out(`${workspace} is a clone of ${repoUrl}.`);
  io.out('Running its test suite executes that repository\'s code on this machine.');
  io.out('There is no OS sandbox — it runs with your file access.');

  return createTerminalApprover()({
    role: 'this workspace',
    toolName: 'bash',
    args: { workspace, repoUrl },
    summary: `run code from ${repoUrl}`,
  });
}

/** Returns a process exit code rather than calling process.exit, so it is testable. */
export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  let projectDir: string;
  let withoutProject: string[];
  try {
    ({ projectDir, rest: withoutProject } = parseProjectDir(argv));
  } catch (err: unknown) {
    io.err(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const [command, ...rest] = withoutProject;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    io.out(USAGE);
    return command ? 0 : 1;
  }

  try {
    if (command === 'doctor') {
      const report = buildDoctorReport();
      for (const line of report.lines) io.out(line);
      io.out(report.ok ? '\nReady.' : '\nNot ready — see above.');
      return report.ok ? 0 : 1;
    }

    if (command === 'onboard') {
      const [repoUrl, dir] = rest;
      if (!repoUrl) {
        io.err('Usage: deepdive onboard <repo-url> [<dir>]');
        return 1;
      }

      const result = await runOnboard(repoUrl, dir ?? projectDir);
      for (const line of result.lines) io.out(line);
      return 0;
    }

    if (command === 'grade') {
      const [rubricName, artifactPath] = rest;
      if (!rubricName || !artifactPath) {
        io.err('Usage: deepdive grade <rubric> <artifact.json>');
        return 1;
      }

      const payload = await loadArtifact(artifactPath);

      // A reverse SDD is a claim about a repository, so its citations are
      // checked against that repository before anything else. This is the same
      // deterministic-first principle as the gate (D-1), extended to evidence
      // the gate cannot reach: a fabricated citation costs no model call.
      if (ONBOARDING_RUBRICS.has(rubricName)) {
        const criterion = CITATION_CRITERION[rubricName]!;
        const citations = await verifyRepoCitations(payload, projectDir, undefined, criterion);
        for (const line of citations.lines) io.out(line);
        if (!citations.passed) {
          recordRoundFor(projectDir, io, {
            phaseId: CLI_RUBRICS[rubricName]!.phaseId,
            status: 'revise',
            artifactType: rubricName,
            artifactPayload: payload,
            findings: citations.findings,
          });
          return 1;
        }
      }

      // Same pi-aware resolution the agent roles use, so the Grader cannot end
      // up authenticating from a different source than scaffold/verify.
      // A reading plan is judged against the reverse SDD it is meant to cover,
      // read back from the record so the two cannot disagree.
      let context: Record<string, unknown> | undefined;
      if (rubricName === 'plan') {
        const store = new SessionStore({ projectDir });
        try {
          context = store.latestArtifact('rsdd') ?? undefined;
        } finally {
          store.close();
        }
        if (!context) {
          io.err('No reverse SDD on record. Run "deepdive grade rsdd <rsdd.json>" first.');
          return 1;
        }
      }

      const provider = createModelProvider(undefined, new PiBackedKeyStore());
      const result = await runGrade(rubricName, payload, provider, context);
      for (const line of result.lines) io.out(line);

      // Record the submission whatever the outcome. A rejected round is the
      // part worth keeping: it is the record of what changed between attempts.
      recordRoundFor(projectDir, io, {
        phaseId: CLI_RUBRICS[rubricName]!.phaseId,
        status: result.verdict?.verdict ?? 'revise',
        artifactType: rubricName,
        artifactPayload: payload,
        findings: result.findings,
        verdictPayload: result.verdict,
      });

      offerHintIfStuck(projectDir, io);

      // A submission needing revision exits non-zero so the result is visible
      // to a script or a pre-commit hook, not only to a reader. "approved" is
      // the only success; a deterministic-gate failure is a failure too.
      return result.verdict?.verdict === 'approved' ? 0 : 1;
    }

    if (command === 'studio') {
      const store = new SessionStore({ projectDir, mustExist: true });
      try {
        const rounds = store.history();
        const hintsTaken = store
          .hintProfileSource()
          .reduce((total, entry) => total + entry.hints.length, 0);

        for (const line of renderStudio({
          projectDir,
          rounds,
          mastery: store.masteryStates(),
          hintsTaken,
          now: new Date(),
        })) {
          io.out(line);
        }
        return 0;
      } finally {
        store.close();
      }
    }

    if (command === 'history') {
      const store = new SessionStore({ projectDir, mustExist: true });
      try {
        const rounds = store.history();
        if (rounds.length === 0) {
          io.out(`No rounds recorded yet for ${projectDir}.`);
          return 0;
        }

        io.out(`round history for ${projectDir}\n`);
        for (const round of rounds) {
          io.out(
            `  ${String(round.roundNumber).padStart(3)}. [${round.status}] phase ${round.phaseId} ${round.roleId}  ${round.submittedAt}`,
          );
          for (const finding of round.findings) {
            io.out(`       - ${finding.severity}: ${finding.code} on ${finding.targetFieldId}`);
          }
        }
        return 0;
      } finally {
        store.close();
      }
    }

    if (command === 'hint') {
      // A typo like "L9" must not be read as "no level requested", which would
      // quietly reveal L1 instead of saying the argument was wrong.
      const levelArg = rest.find((arg) => /^l\d+$/i.test(arg));
      if (levelArg && !HINT_LADDER.includes(levelArg.toUpperCase() as HintLevel)) {
        io.err(`Unknown hint level "${levelArg}". The ladder is ${HINT_LADDER.join(', ')}.`);
        return 1;
      }
      const requested = levelArg?.toUpperCase() as HintLevel | undefined;

      const store = new SessionStore({ projectDir });
      let generated;
      try {
        const turn = store.latestHintableTurn();
        if (!turn) {
          io.err('Nothing to hint at — no round has open findings. Submit something first.');
          return 1;
        }

        const field = primaryStickingPoint(turn.findings)!;
        const already = store.hintsFor(turn.turnId);
        const level = resolveRequestedLevel(
          already.map((h) => h.level),
          requested,
        );

        const existing = already.find((h) => h.level === level);
        if (existing) {
          // Re-reading is free and must not re-generate: a second call at
          // temperature 0 would still cost money to say the same thing, and a
          // ladder whose rungs changed under the student would not be a ladder.
          io.out(`${level} (already revealed) — on ${field}\n\n${existing.content}`);
          return 0;
        }

        io.out(`round ${turn.roundNumber}, phase ${turn.phaseId}, stuck on ${field}`);

        const provider = createModelProvider(undefined, new PiBackedKeyStore());
        generated = await generateHint({
          level,
          targetFieldId: field,
          artifact: turn.artifact,
          findings: turn.findings,
          alreadyRevealed: already.map((h) => ({ level: h.level, content: h.content })),
          provider,
        });

        for (const line of generated.lines) io.out(line);

        // Logged, never gated: this records that help was taken, and nothing
        // reads it to penalise a completion.
        store.recordHint(turn.turnId, generated.level, generated.content);
      } finally {
        store.close();
      }

      return 0;
    }

    if (command === 'characterize') {
      const [workspace, framework = 'vitest'] = rest;
      if (!workspace) {
        io.err(`Usage: deepdive characterize <workspace> [${TEST_FRAMEWORKS.join('|')}]`);
        return 1;
      }
      if (!isTestFramework(framework)) {
        io.err(`Unknown framework "${framework}". One of: ${TEST_FRAMEWORKS.join(', ')}`);
        return 1;
      }

      assertWorkspace(workspace);

      const onboarding = readOnboardingConfig(workspace);
      if (onboarding && !(await confirmThirdPartyCode(workspace, onboarding.repoUrl, io))) {
        io.err('declined — not running third-party code.');
        return 1;
      }

      const outcome = await runCharacterize(workspace, framework);
      for (const line of outcome.lines) io.out(line);

      // P-5: the runner decides. Nothing on this path can call a model.
      recordRoundFor(projectDir, io, {
        phaseId: 'OB-D',
        status: outcome.passed ? 'approved' : 'revise',
        artifactType: 'characterization',
        roleId: 'test_runner',
        artifactPayload: {
          framework,
          workspace,
          totalPassed: outcome.result.totalPassed,
          totalFailed: outcome.result.totalFailed,
          totalSkipped: outcome.result.totalSkipped,
        },
      });

      return outcome.passed ? 0 : 1;
    }

    if (command === 'quiz') {
      const store = new SessionStore({ projectDir });
      let rsdd: Record<string, unknown> | null;
      let questions: QuizQuestion[];
      let mastery;
      try {
        rsdd = store.latestArtifact('rsdd');
        if (!rsdd) {
          io.err('No reverse SDD on record. Run "deepdive grade rsdd <rsdd.json>" first.');
          return 1;
        }

        mastery = store.masteryStates();
        const bank = store.quizBank().filter(isMultipleChoice);
        const selected = selectFromBank(bank, mastery, QUIZ_LENGTH);
        questions = selected.chosen;

        // Generate only the shortfall. A question already banked costs nothing
        // to re-ask, and re-asking one answered wrong is how mastery moves.
        if (selected.shortfall > 0) {
          const provider = createModelProvider(undefined, new PiBackedKeyStore());
          const fresh = await generateQuiz(rsdd, provider, selected.shortfall);
          for (const question of fresh) {
            store.bankQuizItem({ ...question, type: 'multiple_choice' });
          }
          questions = [...questions, ...fresh].slice(0, QUIZ_LENGTH);
          io.out(`${questions.length} questions (${fresh.length} newly written).`);
        } else {
          io.out(`${questions.length} questions from your bank of ${bank.length}.`);
        }
      } finally {
        store.close();
      }

      if (questions.length === 0) {
        io.err('The model returned no answerable questions. Try again.');
        return 1;
      }

      io.out('');
      const answers: string[] = [];
      for (const question of questions) {
        const answer = await askMultipleChoice(question.question, question.options, io.out);
        if (answer === null) {
          io.err('\nno answer given — a quiz needs an interactive terminal.');
          return 1;
        }
        answers.push(answer);
      }

      // Scored by exact match, so the grade is the same every time (D-1).
      const score = scoreQuiz(questions, answers);
      io.out('');
      for (const line of score.lines) io.out(line);

      // Mastery carries across sessions: this is what makes a second quiz test
      // what is still unknown rather than starting over.
      const masteryStore = new SessionStore({ projectDir });
      try {
        const updates = applyQuizToMastery(
          questions,
          answers,
          mastery!,
          new Date().toISOString(),
        );
        for (const update of updates) masteryStore.saveMastery(update.after);
        for (const line of renderMastery(updates)) io.out(line);
      } finally {
        masteryStore.close();
      }

      recordRoundFor(projectDir, io, {
        phaseId: 'OB-F',
        status: score.passed ? 'approved' : 'revise',
        artifactType: 'quiz',
        roleId: 'grader',
        artifactPayload: {
          correct: score.correct,
          total: score.total,
          questions: questions.map((q, i) => ({
            question: q.question,
            given: answers[i],
            correctAnswer: q.correctAnswer,
          })),
        },
      });

      return score.passed ? 0 : 1;
    }

    if (command === 'complete') {
      const store = new SessionStore({ projectDir });
      try {
        const charter = store.latestArtifact('repo-charter');
        const title = typeof charter?.repoName === 'string' ? charter.repoName : null;
        if (!title) {
          io.err(
            'No repo learning charter on record. Run "deepdive grade repo-charter <charter.json>" first.',
          );
          return 1;
        }

        const outcome = buildCompletionRecord(
          store.projectId,
          title,
          store.history(),
          buildHintProfile(store.hintProfileSource()),
        );
        for (const line of outcome.lines) io.out(line);
        if (!outcome.complete) return 1;

        const file = writeCompletionRecord(projectDir, outcome.record!);
        io.out(`\nwritten to ${file}`);
      } finally {
        store.close();
      }

      recordRoundFor(projectDir, io, {
        phaseId: 'OB-G',
        status: 'approved',
        artifactType: 'completion',
        roleId: 'engine',
        artifactPayload: { derivedFrom: 'round history' },
      });

      return 0;
    }

    if (command === 'scaffold' || command === 'verify') {
      const { mode, rest: positional } = parsePermissionMode(rest);
      const [workspace, ...instructionParts] = positional;
      const instruction = instructionParts.join(' ');
      if (!workspace || !instruction) {
        io.err(`Usage: deepdive ${command} [--auto|--approve] <workspace> <instruction>`);
        return 1;
      }

      // Checked before the model is built, so a typo'd path costs nothing and
      // is reported as itself rather than as a missing API key.
      assertWorkspace(workspace);

      // Asked before the model is built, so declining costs nothing.
      const onboarding = readOnboardingConfig(workspace);
      if (onboarding && !(await confirmThirdPartyCode(workspace, onboarding.repoUrl, io))) {
        io.err('declined — not running third-party code.');
        return 1;
      }

      const approval: ApprovalOptions = { mode, approver: createTerminalApprover() };
      io.out(`permission mode: ${mode}`);

      const model = await buildRoleModel();
      const result =
        command === 'scaffold'
          ? await runScaffold(workspace, instruction, model, approval)
          : await runVerify(workspace, instruction, model, approval);

      for (const line of result.lines) io.out(line);

      // An agent run is a round without a verdict: no rubric judged it, so its
      // status is `completed` rather than approved/revise. What makes it worth
      // recording is the same thing that makes a graded round worth recording —
      // history that shows whether the tests were ever scaffolded and whether
      // the Verifier's findings were acted on between attempts.
      recordRoundFor(projectDir, io, {
        phaseId: AGENT_PHASE_IDS[command],
        status: 'completed',
        artifactType: command,
        roleId: result.role,
        artifactPayload: {
          workspace,
          instruction,
          permissionMode: mode,
          tools: result.tools,
          summary: result.finalText,
        },
      });

      return 0;
    }

    io.err(`Unknown command: ${command}`);
    io.err(USAGE);
    return 1;
  } catch (err: unknown) {
    // Typed provider failures (missing key, unsupported provider, unknown model)
    // are reported as-is; their messages already say what to fix.
    io.err(`error: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
