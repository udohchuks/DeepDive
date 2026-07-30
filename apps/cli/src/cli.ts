import { readFile } from 'fs/promises';
import { createModelProvider } from '@deepdive/provider';
import { buildDoctorReport } from './doctor.js';
import { CLI_RUBRICS, runGrade } from './grade.js';
import {
  assertSandboxAvailable,
  buildRoleModel,
  runScaffold,
  runVerify,
} from './agent_commands.js';

export const USAGE = `deepdive — guided project learning, run locally

Usage:
  deepdive doctor
      Check sandbox availability and provider/API-key configuration.
      Makes no network call and spends nothing.

  deepdive grade <rubric> <artifact.json>
      Run the deterministic gate, then grade judged criteria with the model.
      Rubrics: ${Object.keys(CLI_RUBRICS).join(', ')}

  deepdive scaffold <workspace> <instruction>
      Run the Scaffolder against a workspace (write/edit/bash, path-scoped).
      Cannot write graded artifacts. Requires a working sandbox.

  deepdive verify <workspace> <instruction>
      Run the Verifier against a workspace (read-only). Requires a sandbox.

Configuration is read from the environment. Load a .env file with Node's own
loader, which keeps the key out of your shell history:

  node --env-file=.env node_modules/.bin/deepdive doctor
`;

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

      const result = await runGrade(rubricName, payload, createModelProvider());
      for (const line of result.lines) io.out(line);
      return 0;
    }

    if (command === 'scaffold' || command === 'verify') {
      const [workspace, ...instructionParts] = rest;
      const instruction = instructionParts.join(' ');
      if (!workspace || !instruction) {
        io.err(`Usage: deepdive ${command} <workspace> <instruction>`);
        return 1;
      }

      // Check the sandbox before building a model runtime: if the role cannot
      // run at all, say so immediately rather than after resolving credentials.
      assertSandboxAvailable();

      const model = await buildRoleModel();
      const result =
        command === 'scaffold'
          ? await runScaffold(workspace, instruction, model)
          : await runVerify(workspace, instruction, model);

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
