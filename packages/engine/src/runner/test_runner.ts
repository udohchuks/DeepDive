import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { TestRunner, TestRunResult } from '@deepdive/core';
import { parseTestOutput } from './output_parser.js';

export interface CommandExecution {
  stdout: string;
  stderr: string;
}

export type CommandExecutor = (
  command: string,
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<CommandExecution>;

/** Raised when the test command could not be started at all. */
export class TestRunnerSpawnError extends Error {
  constructor(command: string, cause: string) {
    super(
      `Could not start "${command}": ${cause}. No tests were run, so there is no result to report.`,
    );
    this.name = 'TestRunnerSpawnError';
  }
}

/** Where each JS framework's runnable entry point lives inside a workspace. */
const JS_FRAMEWORK_ENTRIES: Record<string, string[]> = {
  vitest: ['node_modules/vitest/vitest.mjs'],
  jest: ['node_modules/jest/bin/jest.js', 'node_modules/jest-cli/bin/jest.js'],
};

export class TestFrameworkNotInstalledError extends Error {
  constructor(framework: string, directory: string) {
    super(
      `${framework} is not installed in ${directory}. Run the project's install step first — no tests were run.`,
    );
    this.name = 'TestFrameworkNotInstalledError';
  }
}

/**
 * Resolves a JS test framework to a command the current Node can run directly.
 *
 * Going through `npx` does not work: on Windows the launcher is `npx.cmd`,
 * which `execFile` cannot find by bare name, and spawning the `.cmd` is refused
 * outright by modern Node unless a shell is enabled. Enabling a shell to fix a
 * path problem would put student- and repository-controlled strings back on a
 * command line, so instead the framework's own JS entry point is located inside
 * the workspace and handed to `process.execPath`. No launcher, no shell, and
 * the same code path on every platform.
 */
export function resolveJsFramework(
  framework: string,
  directory: string,
  execPath: string = process.execPath,
  exists: (p: string) => boolean = fs.existsSync,
): { command: string; args: string[] } {
  for (const relative of JS_FRAMEWORK_ENTRIES[framework] ?? []) {
    const entry = path.join(directory, relative);
    if (exists(entry)) return { command: execPath, args: [entry] };
  }

  throw new TestFrameworkNotInstalledError(framework, directory);
}

/**
 * Runs a command directly, with no shell.
 *
 * A failing test suite exits non-zero, which is a normal outcome here rather
 * than an error, so a non-zero exit still yields its captured output for the
 * parser. A spawn failure is different in kind and throws: reporting "0 passed,
 * 0 failed" for a command that never started would present the absence of a
 * result as a failing result, and under P-5 that answer is authoritative.
 */
const execFileExecutor: CommandExecutor = (command, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, timeout: options.timeoutMs, windowsHide: true, shell: false },
      (error, stdout, stderr) => {
        const spawnFailed =
          error !== null &&
          typeof error.code === 'string' &&
          ['ENOENT', 'EACCES', 'EPERM', 'EINVAL'].includes(error.code);

        if (spawnFailed) {
          reject(new TestRunnerSpawnError(command, error.code as string));
          return;
        }

        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? (error ? String(error.message) : ''),
        });
      },
    );
  });

/**
 * Runs a project's test suite locally.
 *
 * This replaces the previous sandbox-wrapped runner. For a student's own
 * project the code being executed is code they wrote and would run themselves,
 * so requiring an OS sandbox to run it added an install step without a matching
 * risk.
 *
 * That reasoning does **not** extend to Codebase Onboarding, where the suite
 * belongs to a cloned third-party repository: `npm install` alone runs a
 * stranger's postinstall scripts. Isolation belongs there, and the executor is
 * injectable so it can be supplied without changing this class.
 */
export class LocalTestRunner implements TestRunner {
  constructor(private readonly execute: CommandExecutor = execFileExecutor) {}

  async runTests(
    framework: 'vitest' | 'jest' | 'cargo' | 'pytest',
    testDirectory: string,
    options?: { testMatch?: string; timeoutMs?: number },
  ): Promise<TestRunResult> {
    // cargo and pytest are real executables on PATH; vitest and jest are not.
    let command: string;
    let args: string[];

    if (framework === 'cargo') {
      command = 'cargo';
      args = ['test'];
    } else if (framework === 'pytest') {
      command = 'pytest';
      args = [];
    } else {
      const resolved = resolveJsFramework(framework, testDirectory);
      command = resolved.command;
      args = [...resolved.args, 'run'];
    }

    if (options?.testMatch) {
      args.push(options.testMatch);
    }

    const result = await this.execute(command, args, {
      cwd: testDirectory,
      timeoutMs: options?.timeoutMs ?? 60000,
    });

    return parseTestOutput(framework, result.stdout, result.stderr);
  }
}
