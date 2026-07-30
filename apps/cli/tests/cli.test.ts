import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ModelProvider, ModelRequestOptions } from '@deepdive/core';
import { runCli, CliIo, parsePermissionMode } from '../src/cli.js';
import { createTerminalApprover } from '../src/approver.js';
import { buildDoctorReport } from '../src/doctor.js';
import { runGrade, GraderVerdictSchema, CLI_RUBRICS } from '../src/grade.js';
import {
  assertSandboxAvailable,
  resolveRoleModelConfig,
  SandboxUnavailableError,
} from '../src/agent_commands.js';
import { runPreflight } from '@deepdive/sandbox';

function captureIo(): CliIo & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return { lines, errors, out: (l) => lines.push(l), err: (l) => errors.push(l) };
}

/** Records what it was asked, so tests can assert a call did or did not happen. */
class SpyProvider implements ModelProvider {
  calls: ModelRequestOptions<unknown>[] = [];
  constructor(private readonly response: unknown) {}
  async generateStructured<T>(options: ModelRequestOptions<T>): Promise<T> {
    this.calls.push(options as ModelRequestOptions<unknown>);
    return options.schema.parse(this.response);
  }
}

describe('deepdive CLI', () => {
  it('prints usage and exits non-zero when given no command', async () => {
    const io = captureIo();
    expect(await runCli([], io)).toBe(1);
    expect(io.lines.join('\n')).toContain('deepdive doctor');
  });

  it('reports an unknown command rather than doing nothing', async () => {
    const io = captureIo();
    expect(await runCli(['frobnicate'], io)).toBe(1);
    expect(io.errors.join('\n')).toContain('Unknown command');
  });

  it('doctor reports missing configuration instead of failing silently', () => {
    const report = buildDoctorReport({ MODEL_PROVIDER: 'deepseek' } as NodeJS.ProcessEnv);
    expect(report.lines.join('\n')).toContain('deepseek');
  });

  it('doctor names the valid providers when MODEL_PROVIDER is unrecognised', () => {
    const report = buildDoctorReport({ MODEL_PROVIDER: 'deepsek' } as NodeJS.ProcessEnv);
    const text = report.lines.join('\n');
    expect(report.ok).toBe(false);
    expect(text).toContain('known providers');
    expect(text).toContain('deepseek');
  });

  it('grade rejects an unknown rubric by name', async () => {
    const provider = new SpyProvider({});
    await expect(runGrade('nonsense', {}, provider)).rejects.toThrow('Unknown rubric');
    expect(provider.calls).toHaveLength(0);
  });

  it('PROTECTED INVARIANT D-1: a deterministic failure short-circuits before any model call', async () => {
    const provider = new SpyProvider({ verdict: 'approved', criterionFindings: [] });

    // Charter with no title fails a code check, so grading must stop there.
    const result = await runGrade('charter', { scopeBounds: [], goal: 'x' }, provider);

    expect(result.shortCircuited).toBe(true);
    expect(provider.calls).toHaveLength(0);
    expect(result.lines.join('\n')).toContain('no model call made');
  });

  it('sends only judged criteria to the model once the gate passes', async () => {
    const provider = new SpyProvider({
      verdict: 'approved',
      criterionFindings: [{ criterionId: 'charter_goal_clarity', met: true, comment: 'clear' }],
    });

    const result = await runGrade(
      'charter',
      {
        title: 'Realtime chat',
        scopeBounds: ['no mobile client'],
        goal: 'Learn websocket backpressure',
      },
      provider,
    );

    expect(result.shortCircuited).toBe(false);
    expect(provider.calls).toHaveLength(1);

    const sent = provider.calls[0]!;
    expect(sent.role).toBe('grader');
    expect(sent.userPrompt).toContain('charter_goal_clarity');
    // Deterministic criteria were already settled and must not be re-litigated.
    expect(sent.userPrompt).not.toContain('charter_title_present');
  });

  it('PROTECTED INVARIANT: an unparseable verdict is rejected, never coerced', async () => {
    const provider = new SpyProvider({ verdict: 'looks-good-to-me', criterionFindings: [] });

    await expect(
      runGrade(
        'charter',
        { title: 'T', scopeBounds: ['no mobile'], goal: 'g' },
        provider,
      ),
    ).rejects.toThrow();
  });

  it('exposes the rubrics the usage text advertises', () => {
    for (const name of Object.keys(CLI_RUBRICS)) {
      expect(CLI_RUBRICS[name]!.criteria.length).toBeGreaterThan(0);
    }
  });

  it('scaffold and verify require both a workspace and an instruction', async () => {
    for (const command of ['scaffold', 'verify']) {
      const io = captureIo();
      expect(await runCli([command, './workspace'], io)).toBe(1);
      expect(io.errors.join('\n')).toContain(`deepdive ${command}`);
      expect(io.errors.join('\n')).toContain('<workspace> <instruction>');
    }
  });

  it('defaults to approve mode when no flag or env is given', () => {
    // The safe mode must be the one you get by forgetting to choose.
    const parsed = parsePermissionMode(['./ws', 'do a thing'], {} as NodeJS.ProcessEnv);
    expect(parsed.mode).toBe('approve');
    expect(parsed.rest).toEqual(['./ws', 'do a thing']);
  });

  it('accepts --auto and --approve, and strips them from the operands', () => {
    expect(parsePermissionMode(['--auto', './ws'], {} as NodeJS.ProcessEnv)).toEqual({
      mode: 'auto',
      rest: ['./ws'],
    });
    expect(parsePermissionMode(['--approve', './ws'], {} as NodeJS.ProcessEnv)).toEqual({
      mode: 'approve',
      rest: ['./ws'],
    });
  });

  it('an explicit flag overrides DEEPDIVE_PERMISSION_MODE', () => {
    const env = { DEEPDIVE_PERMISSION_MODE: 'auto' } as NodeJS.ProcessEnv;
    expect(parsePermissionMode([], env).mode).toBe('auto');
    expect(parsePermissionMode(['--approve'], env).mode).toBe('approve');
  });

  it('ignores an unrecognised DEEPDIVE_PERMISSION_MODE rather than trusting it', () => {
    const env = { DEEPDIVE_PERMISSION_MODE: 'bypass' } as NodeJS.ProcessEnv;
    expect(parsePermissionMode([], env).mode).toBe('approve');
  });

  it('PROTECTED INVARIANT: a non-interactive stdin is never read as consent', async () => {
    // Piped input or CI must not silently approve mutating commands.
    const approver = createTerminalApprover();
    const wasTty = process.stdin.isTTY;
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      const approved = await approver({
        role: 'scaffolder',
        toolName: 'write',
        args: { path: 'a.ts' },
        summary: 'write: a.ts',
      });
      expect(approved).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: wasTty, configurable: true });
    }
  });

  it('sandbox is still required for running code the student did not write', () => {
    const preflight = runPreflight();
    if (preflight.isSupported) {
      expect(() => assertSandboxAvailable()).not.toThrow();
      return;
    }
    // Fail-closed: no unsandboxed fallback exists for roles that execute tools.
    expect(() => assertSandboxAvailable()).toThrow(SandboxUnavailableError);
    expect(() => assertSandboxAvailable()).toThrow(/requires real isolation/);
  });

  it('role sessions use the same pinned model as the Grader, not a separate one', () => {
    const config = resolveRoleModelConfig({ MODEL_PROVIDER: 'deepseek' } as NodeJS.ProcessEnv);
    expect(config.providerId).toBe('deepseek');
    expect(config.modelId).toBe('deepseek-chat');
    // A moving alias here would change the agent between submissions (D-5).
    expect(config.modelId).not.toMatch(/latest|\*/i);
  });

  it('treats the claude alias as the anthropic provider', () => {
    const config = resolveRoleModelConfig({ MODEL_PROVIDER: 'claude' } as NodeJS.ProcessEnv);
    expect(config.providerId).toBe('anthropic');
  });

  it('the verdict schema accepts every documented exit state', () => {
    for (const verdict of ['approved', 'revise', 'clarifying_question']) {
      expect(() =>
        GraderVerdictSchema.parse({ verdict, criterionFindings: [] }),
      ).not.toThrow();
    }
    expect(() => GraderVerdictSchema.parse({ verdict: 'maybe', criterionFindings: [] })).toThrow();
    expect(z.string().safeParse('sanity').success).toBe(true);
  });
});
