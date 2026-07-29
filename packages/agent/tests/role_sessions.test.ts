import { describe, it, expect } from 'vitest';
import path from 'path';
import { buildRoleSession } from '../src/index.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

describe('Role Session Factory & Tool Scoping (Phase 3.3)', () => {
  const rootDir = process.cwd();
  const evaluator = new PathPolicyEvaluator({
    readOnlyPaths: [path.join(rootDir, 'packages')],
    readWritePaths: [path.join(rootDir, 'packages/agent/tests')],
    blockedPaths: [],
  });

  it('Verifier session has read-only tools and cannot write or execute mutating commands', async () => {
    const session = buildRoleSession('verifier');
    expect(session.grantedTools).toEqual(['read', 'grep', 'find', 'ls', 'bash']);

    const writeRes = await session.executeTool('write', { path: 'file.ts' });
    expect(writeRes.blocked).toBe(true);

    const mutatingBashRes = await session.executeTool('bash', { command: 'rm -rf /' });
    expect(mutatingBashRes.blocked).toBe(true);

    const readOnlyBashRes = await session.executeTool('bash', { command: 'git status' });
    expect(readOnlyBashRes.blocked).toBe(false);
  });

  it('Grader session has no filesystem tools (noTools: all) and only custom verdict tool', async () => {
    const session = buildRoleSession('grader');
    expect(session.grantedTools).toContain('submit_rubric_verdict');
    expect(session.grantedTools).not.toContain('read');
    expect(session.grantedTools).not.toContain('write');
    expect(session.grantedTools).not.toContain('edit');
    expect(session.grantedTools).not.toContain('bash');

    const readRes = await session.executeTool('read', { path: 'sdd.json' });
    expect(readRes.blocked).toBe(true);
  });

  it('PROTECTED INVARIANT P-2: Scaffolder cannot write into a graded-artifact path (AI never authors graded work)', async () => {
    const session = buildRoleSession('scaffolder', evaluator, ['sdd.json', 'rsdd.json', 'cdd.json']);

    // Attempting to write into a graded artifact file path is blocked by P-2 check
    const gradedWrite = await session.executeTool('write', { path: 'packages/agent/tests/sdd.json' });
    expect(gradedWrite.blocked).toBe(true);
    expect(gradedWrite.reason).toContain('PROTECTED INVARIANT P-2');

    // Writing into a non-graded scaffold test path is allowed
    const scaffoldWrite = await session.executeTool('write', { path: 'packages/agent/tests/scaffold_stub.ts' });
    expect(scaffoldWrite.blocked).toBe(false);
  });
});
