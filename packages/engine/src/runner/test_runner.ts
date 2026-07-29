import { TestRunner, TestRunResult } from '@deepdive/core';
import { SandboxWrapper } from '@deepdive/sandbox';
import { parseTestOutput } from './output_parser.js';

export class SandboxedTestRunner implements TestRunner {
  constructor(private sandbox: SandboxWrapper) {}

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

    const execResult = await this.sandbox.execute({
      cwd: testDirectory,
      command,
      args,
      mountPolicy: {
        readOnlyPaths: [],
        readWritePaths: [testDirectory],
        blockedPaths: [],
      },
      timeoutMs: options?.timeoutMs ?? 60000,
    });

    return parseTestOutput(framework, execResult.stdout, execResult.stderr);
  }
}
