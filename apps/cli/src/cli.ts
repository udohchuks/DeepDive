import { readFile } from 'fs/promises';
import { createModelProvider } from '@deepdive/provider';
import { buildDoctorReport } from './doctor.js';
import { CITATION_CRITERION, CLI_RUBRICS, ONBOARDING_RUBRICS, runGrade } from './grade.js';
import { readOnboardingConfig, runOnboard, verifyRepoCitations } from './onboarding_commands.js';
import {
  buildCompletionRecord,
  generateQuiz,
  isTestFramework,
  runCharacterize,
  scoreQuiz,
  TEST_FRAMEWORKS,
  writeCompletionRecord,
} from './onboarding_phases.js';
import { askMultipleChoice } from './prompt.js';
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
      Phase OB-F. Comprehension questions generated from your approved
      reverse SDD, scored by exact match.

  deepdive complete
      Phase OB-G. Derive the completion record from your approved rounds.

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
    if (argv[i] === '--project' && i + 1 < argv.length) {
      projectDir = argv[i + 1];
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
  const { projectDir, rest: withoutProject } = parseProjectDir(argv);
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

      const raw = await readFile(artifactPath, 'utf8');
      const payload = JSON.parse(raw) as Record<string, unknown>;

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

      // A submission needing revision exits non-zero so the result is visible
      // to a script or a pre-commit hook, not only to a reader. "approved" is
      // the only success; a deterministic-gate failure is a failure too.
      return result.verdict?.verdict === 'approved' ? 0 : 1;
    }

    if (command === 'history') {
      const store = new SessionStore({ projectDir });
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
      try {
        rsdd = store.latestArtifact('rsdd');
      } finally {
        store.close();
      }

      if (!rsdd) {
        io.err('No reverse SDD on record. Run "deepdive grade rsdd <rsdd.json>" first.');
        return 1;
      }

      const provider = createModelProvider(undefined, new PiBackedKeyStore());
      const questions = await generateQuiz(rsdd, provider);
      if (questions.length === 0) {
        io.err('The model returned no answerable questions. Try again.');
        return 1;
      }

      io.out(`${questions.length} questions from your approved reverse SDD.\n`);
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

        const outcome = buildCompletionRecord(store.projectId, title, store.history());
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
