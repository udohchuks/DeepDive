import { describe, it, expect } from 'vitest';
import { createPermissionHook } from '../src/index.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

describe('tool_call Permission Hook (Phase 3.1)', () => {
  it('blocks Verifier mutating tools and mutating bash commands', async () => {
    const hook = createPermissionHook({ role: 'verifier' });

    const writeCheck = await hook({ toolName: 'write', args: { path: 'test.ts' }, role: 'verifier' });
    expect(writeCheck.block).toBe(true);

    const mutatingBash = await hook({ toolName: 'bash', args: { command: 'rm -rf /' }, role: 'verifier' });
    expect(mutatingBash.block).toBe(true);

    const readOnlyBash = await hook({ toolName: 'bash', args: { command: 'git status' }, role: 'verifier' });
    expect(readOnlyBash.block).toBe(false);
  });

  it('blocks Grader from using any filesystem or bash tool', async () => {
    const hook = createPermissionHook({ role: 'grader' });

    const readCheck = await hook({ toolName: 'read', args: { path: 'sdd.json' }, role: 'grader' });
    expect(readCheck.block).toBe(true);
  });

  it('fails closed on evaluator error', async () => {
    const errorEvaluator = {
      evaluateWriteAccess: () => {
        throw new Error('Simulated evaluation crash');
      },
    } as unknown as PathPolicyEvaluator;

    const hook = createPermissionHook({ role: 'scaffolder', pathEvaluator: errorEvaluator });
    const check = await hook({ toolName: 'write', args: { path: 'test.txt' }, role: 'scaffolder' });
    expect(check.block).toBe(true);
    expect(check.reason).toContain('evaluator error');
  });
});
