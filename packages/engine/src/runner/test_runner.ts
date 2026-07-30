import { execFile } from 'child_process';
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

/**
 * Runs a command directly, with no shell.
 *
 * A failing test suite exits non-zero, which is a normal outcome here rather
 * than an error, so a non-zero exit still yields its captured output for the
 * parser. Only a spawn failure produces no output at all.
 */
const execFileExecutor: CommandExecutor = (command, args, options) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, timeout: options.timeoutMs, windowsHide: true, shell: false },
      (error, stdout, stderr) => {
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
    let command = 'npx';
    let args: string[] = [framework, 'run'];

    if (framework === 'cargo') {
      command = 'cargo';
      args = ['test'];
    } else if (framework === 'pytest') {
      command = 'pytest';
      args = [];
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
