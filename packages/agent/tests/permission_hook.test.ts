import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import { createPermissionHook } from '../src/index.js';
import { PathPolicyEvaluator } from '@deepdive/policy';

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

  it('allows Scaffolder write access to standard workspace files but blocks graded-artifact paths (P-2)', async () => {
    const hook = createPermissionHook({
      role: 'scaffolder',
      gradedArtifactPaths: ['sdd.json', 'rsdd.json', 'cdd.json'],
    });

    const allowedWrite = await hook({ toolName: 'write', args: { path: 'src/main.ts' }, role: 'scaffolder' });
    expect(allowedWrite.block).toBe(false);

    const blockedSdd = await hook({ toolName: 'write', args: { path: 'sdd.json' }, role: 'scaffolder' });
    expect(blockedSdd.block).toBe(true);

    const blockedRsdd = await hook({ toolName: 'write', args: { path: 'rsdd.json' }, role: 'scaffolder' });
    expect(blockedRsdd.block).toBe(true);

    const blockedCdd = await hook({ toolName: 'write', args: { path: 'cdd.json' }, role: 'scaffolder' });
    expect(blockedCdd.block).toBe(true);
  });

  it('PROTECTED INVARIANT P-2: graded-artifact matching is by path, not by substring', async () => {
    const hook = createPermissionHook({
      role: 'scaffolder',
      gradedArtifactPaths: ['sdd.json', path.resolve('/repo/graded')],
    });
    const write = (p: string) => hook({ toolName: 'write', args: { path: p }, role: 'scaffolder' });

    // A bare filename means "the graded artifact, wherever it is kept".
    expect((await write('deep/nested/sdd.json')).block).toBe(true);
    expect((await write('SDD.JSON')).block).toBe(true);
    // ...and must not match a file that merely contains the name.
    expect((await write('my_sdd.json.bak')).block).toBe(false);

    // A path entry means a location, matched by containment.
    expect((await write(path.resolve('/repo/graded/charter.json'))).block).toBe(true);
    // The case the old substring check got wrong: a sibling sharing a prefix
    // was treated as being inside the graded directory.
    expect((await write(path.resolve('/repo/graded-old/charter.json'))).block).toBe(false);
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

  it('PROTECTED INVARIANT P-2: Scaffolder cannot write a graded artifact through bash', async () => {
    // Observed live: the write tool was blocked, and the model created the
    // file through bash instead — past both the artifact check and the path
    // policy, which only inspect write/edit arguments. Bash must be gated too.
    const hook = createPermissionHook({
      role: 'scaffolder',
      gradedArtifactPaths: ['sdd.json'],
      workspaceRoot: path.resolve('/workspace/project'),
    });

    const redirect = await hook({
      toolName: 'bash',
      args: { command: 'echo \'{"goal":"x"}\' > sdd.json' },
      role: 'scaffolder',
    });
    expect(redirect.block).toBe(true);
    expect(redirect.reason).toContain('write and edit tools');

    const remove = await hook({ toolName: 'bash', args: { command: 'rm sdd.json' }, role: 'scaffolder' });
    expect(remove.block).toBe(true);
    expect(remove.reason).toContain('P-2');

    const viaNode = await hook({
      toolName: 'bash',
      args: { command: "node -e \"require('fs').writeFileSync('sdd.json','{}')\"" },
      role: 'scaffolder',
    });
    expect(viaNode.block).toBe(true);
    expect(viaNode.reason).toContain('P-2');
  });

  it('allows ordinary Scaffolder bash commands inside the workspace', async () => {
    const hook = createPermissionHook({
      role: 'scaffolder',
      gradedArtifactPaths: ['sdd.json'],
      workspaceRoot: path.resolve('/workspace/project'),
    });

    const install = await hook({ toolName: 'bash', args: { command: 'npm install' }, role: 'scaffolder' });
    expect(install.block).toBe(false);

    const tests = await hook({ toolName: 'bash', args: { command: 'mkdir tests' }, role: 'scaffolder' });
    expect(tests.block).toBe(false);
  });

  it('blocks Scaffolder bash commands that escape the workspace', async () => {
    const hook = createPermissionHook({
      role: 'scaffolder',
      gradedArtifactPaths: ['sdd.json'],
      workspaceRoot: path.resolve('/workspace/project'),
    });

    const outside = await hook({
      toolName: 'bash',
      args: { command: `cp x.txt ${path.resolve('/elsewhere')}/x.txt` },
      role: 'scaffolder',
    });
    expect(outside.block).toBe(true);
    expect(outside.reason).toContain('workspace boundary');
  });

  it('fails closed on Scaffolder bash when no workspace root is configured', async () => {
    const hook = createPermissionHook({ role: 'scaffolder', gradedArtifactPaths: ['sdd.json'] });
    const check = await hook({ toolName: 'bash', args: { command: 'npm install' }, role: 'scaffolder' });
    expect(check.block).toBe(true);
    expect(check.reason).toContain('no workspace root');
  });

  it.runIf(process.platform === 'win32')(
    'write tool accepts POSIX-form absolute paths that land inside the workspace',
    async () => {
      // Git Bash maps /tmp to the user's temp directory; a policy rooted there
      // must recognize the POSIX spelling of its own files instead of pushing
      // the model toward the bash workaround.
      const root = path.join(os.tmpdir(), 'dd-policy-ws');
      const evaluator = new PathPolicyEvaluator({
        readOnlyPaths: [],
        readWritePaths: [root],
        blockedPaths: [],
      });
      const hook = createPermissionHook({ role: 'scaffolder', pathEvaluator: evaluator });

      const check = await hook({
        toolName: 'write',
        args: { path: '/tmp/dd-policy-ws/notes.md' },
        role: 'scaffolder',
      });
      expect(check.block).toBe(false);
    },
  );
});
