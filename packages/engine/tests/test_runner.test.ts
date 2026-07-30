import { describe, it, expect } from 'vitest';
import {
  parseTestOutput,
  resolveJsFramework,
  LocalTestRunner,
  TestRunnerSpawnError,
} from '../src/index.js';
import fs from 'fs';
import path from 'path';

describe('Test Runner Output Parser (Phase 5.1)', () => {
  it('parses vitest output correctly', () => {
    const stdout = 'Tests: 12 passed, 12 total';
    const result = parseTestOutput('vitest', stdout, '');
    expect(result.success).toBe(true);
    expect(result.totalPassed).toBe(12);
    expect(result.totalFailed).toBe(0);
  });

  it('parses failing vitest output correctly', () => {
    const stdout = 'Tests: 10 passed, 2 failed, 12 total\n 2 failed';
    const result = parseTestOutput('vitest', stdout, '');
    expect(result.success).toBe(false);
    expect(result.totalPassed).toBe(10);
    expect(result.totalFailed).toBe(2);
  });

  it('parses cargo test output correctly', () => {
    const stdout = 'test result: ok. 8 passed; 0 failed; 0 ignored';
    const result = parseTestOutput('cargo', stdout, '');
    expect(result.success).toBe(true);
    expect(result.totalPassed).toBe(8);
    expect(result.totalFailed).toBe(0);
  });

  it('parses pytest output correctly', () => {
    const stdout = '5 passed, 0 failed in 0.12s';
    const result = parseTestOutput('pytest', stdout, '');
    expect(result.success).toBe(true);
    expect(result.totalPassed).toBe(5);
  });

  it('PROTECTED INVARIANT P-5: Test runner module contains ZERO provider / model calls', () => {
    const runnerCode = fs.readFileSync(path.join(process.cwd(), 'packages/engine/src/runner/test_runner.ts'), 'utf-8');
    const parserCode = fs.readFileSync(path.join(process.cwd(), 'packages/engine/src/runner/output_parser.ts'), 'utf-8');

    expect(runnerCode).not.toContain('@deepdive/provider');
    expect(runnerCode).not.toContain('generateStructured');
    expect(parserCode).not.toContain('@deepdive/provider');
    expect(parserCode).not.toContain('generateStructured');
  });
});

describe('PROTECTED INVARIANT: a runner that never started is not a failing suite', () => {
  it('runs the framework entry with the current Node, never a launcher', () => {
    // npx is npx.cmd on Windows, which execFile cannot find by name and modern
    // Node refuses to spawn without a shell — so every run failed to start.
    expect(resolveJsFramework('vitest', '/w', '/node', () => true)).toEqual({ command: '/node', args: [path.join('/w', 'node_modules/vitest/vitest.mjs')] });
  });

  it('reports a clear error when the framework is not installed', () => {
    expect(() => resolveJsFramework('vitest', '/w', '/node', () => false)).toThrow(
      /not installed/,
    );
  });

  it('throws rather than reporting 0 passed / 0 failed when spawn fails', async () => {
    const runner = new LocalTestRunner(async () => {
      throw new TestRunnerSpawnError('npx', 'ENOENT');
    });

    // Under P-5 the runner's answer is authoritative, so "the suite failed" for
    // a command that never ran would be an authoritative falsehood.
    await expect(runner.runTests('vitest', '.')).rejects.toThrow(/No tests were run/);
  });
});
