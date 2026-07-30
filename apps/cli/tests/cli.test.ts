import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ModelProvider, ModelRequestOptions } from '@deepdive/core';
import { runCli, CliIo } from '../src/cli.js';
import { buildDoctorReport } from '../src/doctor.js';
import { runGrade, GraderVerdictSchema, CLI_RUBRICS } from '../src/grade.js';

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
