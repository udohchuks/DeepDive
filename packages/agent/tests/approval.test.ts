import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  withApproval,
  summarizeToolCall,
  isPermissionMode,
  READ_ONLY_TOOLS,
  ToolCallHook,
  ApprovalRequest,
} from '../src/index.js';
import { buildScaffolderSessionOptions } from '../src/roles/scaffolder.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

const allowAll: ToolCallHook = () => ({ block: false });
const denyAll: ToolCallHook = () => ({ block: true, reason: 'policy says no' });

function recordingApprover(answer: boolean) {
  const seen: ApprovalRequest[] = [];
  return {
    seen,
    approver: async (request: ApprovalRequest) => {
      seen.push(request);
      return answer;
    },
  };
}

describe('approval-based permissions', () => {
  it('asks before a mutating tool in approve mode', async () => {
    const { seen, approver } = recordingApprover(true);
    const hook = withApproval(allowAll, { mode: 'approve', approver });

    const decision = await hook({ toolName: 'write', args: { path: 'a.ts' }, role: 'scaffolder' });

    expect(decision.block).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.summary).toContain('a.ts');
  });

  it('blocks when the student declines, and says so', async () => {
    const { approver } = recordingApprover(false);
    const hook = withApproval(allowAll, { mode: 'approve', approver });

    const decision = await hook({ toolName: 'bash', args: { command: 'rm x' }, role: 'scaffolder' });

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain('Declined by user');
  });

  it('does not prompt for read-only tools', async () => {
    const { seen, approver } = recordingApprover(true);
    const hook = withApproval(allowAll, { mode: 'approve', approver });

    for (const tool of READ_ONLY_TOOLS) {
      const decision = await hook({ toolName: tool, args: { path: 'x' }, role: 'verifier' });
      expect(decision.block).toBe(false);
    }
    // Prompting for every read trains people to approve without looking.
    expect(seen).toHaveLength(0);
  });

  it('asks nothing in auto mode', async () => {
    const { seen, approver } = recordingApprover(true);
    const hook = withApproval(allowAll, { mode: 'auto', approver });

    const decision = await hook({ toolName: 'write', args: { path: 'a.ts' }, role: 'scaffolder' });

    expect(decision.block).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('PROTECTED INVARIANT: approval cannot widen policy', async () => {
    // An approver that says yes to everything must not be able to authorise
    // something policy refused.
    const { seen, approver } = recordingApprover(true);

    for (const mode of ['approve', 'auto'] as const) {
      const hook = withApproval(denyAll, { mode, approver });
      const decision = await hook({ toolName: 'write', args: { path: 'a.ts' }, role: 'scaffolder' });

      expect(decision.block).toBe(true);
      expect(decision.reason).toBe('policy says no');
    }

    // A policy denial is never even offered for approval.
    expect(seen).toHaveLength(0);
  });

  it('PROTECTED INVARIANT P-2: no answer at the prompt authorises a graded-artifact write', async () => {
    const evaluator = new PathPolicyEvaluator({
      readOnlyPaths: [path.join(process.cwd(), 'packages')],
      readWritePaths: [path.join(process.cwd(), 'packages/agent/tests')],
      blockedPaths: [],
    });
    const { approver } = recordingApprover(true);

    for (const mode of ['approve', 'auto'] as const) {
      const options = buildScaffolderSessionOptions(evaluator, ['sdd.json'], { mode, approver });
      const decision = await options.hook({
        toolName: 'write',
        args: { path: 'packages/agent/tests/sdd.json' },
        role: 'scaffolder',
      });

      expect(decision.block).toBe(true);
      expect(decision.reason).toContain('PROTECTED INVARIANT P-2');
    }
  });

  it('fails closed when the approval prompt itself errors', async () => {
    const hook = withApproval(allowAll, {
      mode: 'approve',
      approver: async () => {
        throw new Error('tty exploded');
      },
    });

    const decision = await hook({ toolName: 'write', args: { path: 'a.ts' }, role: 'scaffolder' });

    expect(decision.block).toBe(true);
    expect(decision.reason).toContain('tty exploded');
  });

  it('summarises bash by its command and file tools by their path', () => {
    expect(summarizeToolCall('bash', { command: 'npm test' })).toBe('run: npm test');
    expect(summarizeToolCall('edit', { path: 'src/a.ts' })).toBe('edit: src/a.ts');
    expect(summarizeToolCall('mystery', {})).toBe('mystery');
  });

  it('recognises only the documented modes', () => {
    expect(isPermissionMode('approve')).toBe(true);
    expect(isPermissionMode('auto')).toBe(true);
    expect(isPermissionMode('bypass')).toBe(false);
  });
});
