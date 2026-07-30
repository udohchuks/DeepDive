import { readFile } from 'fs/promises';
import { createModelProvider } from '@deepdive/provider';
import { buildDoctorReport } from './doctor.js';
import { CLI_RUBRICS, runGrade } from './grade.js';
import { buildRoleModel, PiBackedKeyStore, runScaffold, runVerify } from './agent_commands.js';
import { createTerminalApprover } from './approver.js';
import { SessionStore } from './session_store.js';
import { ApprovalOptions, isPermissionMode, PermissionMode } from '@deepdive/agent';

export const USAGE = `deepdive — guided project learning, run locally

Usage:
  deepdive doctor
      Check permission mode and provider/credential configuration.
      Makes no network call and spends nothing.

  deepdive grade <rubric> <artifact.json>
      Run the deterministic gate, then grade judged criteria with the model.
      Rubrics: ${Object.keys(CLI_RUBRICS).join(', ')}

  deepdive history
      Show every round recorded for this project, oldest first.

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

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
};

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

    if (command === 'grade') {
      const [rubricName, artifactPath] = rest;
      if (!rubricName || !artifactPath) {
        io.err('Usage: deepdive grade <rubric> <artifact.json>');
        return 1;
      }

      const raw = await readFile(artifactPath, 'utf8');
      const payload = JSON.parse(raw) as Record<string, unknown>;

      // Same pi-aware resolution the agent roles use, so the Grader cannot end
      // up authenticating from a different source than scaffold/verify.
      const provider = createModelProvider(undefined, new PiBackedKeyStore());
      const result = await runGrade(rubricName, payload, provider);
      for (const line of result.lines) io.out(line);

      // Record the submission whatever the outcome. A rejected round is the
      // part worth keeping: it is the record of what changed between attempts.
      const store = new SessionStore({ projectDir });
      try {
        const round = store.recordRound({
          phaseId: CLI_RUBRICS[rubricName]!.phaseId,
          status: result.verdict?.verdict ?? 'revise',
          artifactType: rubricName,
          artifactPayload: payload,
          findings: result.findings,
          verdictPayload: result.verdict,
        });
        io.out(`\nsaved as round ${round.roundNumber} (${store.dbPath})`);
      } finally {
        store.close();
      }

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
            `  ${String(round.roundNumber).padStart(3)}. [${round.status}] phase ${round.phaseId}  ${round.submittedAt}`,
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

    if (command === 'scaffold' || command === 'verify') {
      const { mode, rest: positional } = parsePermissionMode(rest);
      const [workspace, ...instructionParts] = positional;
      const instruction = instructionParts.join(' ');
      if (!workspace || !instruction) {
        io.err(`Usage: deepdive ${command} [--auto|--approve] <workspace> <instruction>`);
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
