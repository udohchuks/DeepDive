import { readFile } from 'fs/promises';
import { createModelProvider } from '@deepdive/provider';
import { buildDoctorReport } from './doctor.js';
import { CLI_RUBRICS, runGrade } from './grade.js';
import { buildRoleModel, PiBackedKeyStore, runScaffold, runVerify } from './agent_commands.js';
import { createTerminalApprover } from './approver.js';
import { ApprovalOptions, isPermissionMode, PermissionMode } from '@deepdive/agent';

export const USAGE = `deepdive — guided project learning, run locally

Usage:
  deepdive doctor
      Check permission mode and provider/credential configuration.
      Makes no network call and spends nothing.

  deepdive grade <rubric> <artifact.json>
      Run the deterministic gate, then grade judged criteria with the model.
      Rubrics: ${Object.keys(CLI_RUBRICS).join(', ')}

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
  const [command, ...rest] = argv;

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

      // A submission needing revision exits non-zero so the result is visible
      // to a script or a pre-commit hook, not only to a reader. "approved" is
      // the only success; a deterministic-gate failure is a failure too.
      return result.verdict?.verdict === 'approved' ? 0 : 1;
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
