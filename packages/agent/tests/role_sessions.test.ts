import { describe, it, expect } from 'vitest';
import path from 'path';
import type { ExtensionAPI, ExtensionContext, ToolCallEvent, ToolCallEventResult } from '@earendil-works/pi-coding-agent';
import { createRoleGateExtension, RoleSessionOptions } from '../src/index.js';
import { buildScaffolderSessionOptions } from '../src/roles/scaffolder.js';
import { buildVerifierSessionOptions } from '../src/roles/verifier.js';
import { createGraderSession } from '../src/roles/grader.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

/**
 * Role scoping is enforced in two places: the exact `tools` allowlist pi is
 * given, and the `tool_call` gate that inspects arguments. These tests drive
 * the gate through the same extension pi itself would invoke, rather than
 * through a stubbed executor, so a change in how we register the handler is
 * caught here.
 */
function gateFor(options: RoleSessionOptions): (toolName: string, args: Record<string, unknown>) => Promise<ToolCallEventResult> {
  const extension = createRoleGateExtension(options.role, options.hook);
  let captured: ((event: ToolCallEvent, ctx: ExtensionContext) => unknown) | undefined;
  const fakePi = {
    on: (eventName: string, handler: (event: ToolCallEvent, ctx: ExtensionContext) => unknown) => {
      if (eventName === 'tool_call') captured = handler;
    },
  } as unknown as ExtensionAPI;

  const factory = typeof extension === 'function' ? extension : extension.factory;
  factory(fakePi);
  if (!captured) throw new Error('role gate registered no tool_call handler');
  const handler = captured;

  return async (toolName, args) =>
    (await handler(
      { type: 'tool_call', toolCallId: 'tc-1', toolName, input: args } as ToolCallEvent,
      {} as ExtensionContext,
    )) as ToolCallEventResult;
}

describe('Role Session Factory & Tool Scoping (Phase 3.3)', () => {
  const rootDir = process.cwd();
  const evaluator = new PathPolicyEvaluator({
    readOnlyPaths: [path.join(rootDir, 'packages')],
    readWritePaths: [path.join(rootDir, 'packages/agent/tests')],
    blockedPaths: [],
  });

  it('Verifier is granted read-only tools and blocks writes and mutating commands', async () => {
    const options = buildVerifierSessionOptions();
    expect(options.tools).toEqual(['read', 'grep', 'find', 'ls', 'bash']);

    const gate = gateFor(options);

    expect((await gate('write', { path: 'file.ts' })).block).toBe(true);
    expect((await gate('bash', { command: 'rm -rf /' })).block).toBe(true);
    expect((await gate('bash', { command: 'git status' })).block).toBe(false);
  });

  it('PROTECTED INVARIANT: Grader holds no tools at all', async () => {
    const grader = createGraderSession();
    expect(grader.grantedTools).toEqual([]);

    for (const tool of ['read', 'write', 'edit', 'bash']) {
      expect((await grader.executeTool(tool, { path: 'sdd.json' })).block).toBe(true);
    }
  });

  it('PROTECTED INVARIANT P-2: Scaffolder cannot write into a graded-artifact path (AI never authors graded work)', async () => {
    const options = buildScaffolderSessionOptions(evaluator, ['sdd.json', 'rsdd.json', 'cdd.json']);
    expect(options.tools).toEqual(['write', 'edit', 'bash']);

    const gate = gateFor(options);

    const gradedWrite = await gate('write', { path: 'packages/agent/tests/sdd.json' });
    expect(gradedWrite.block).toBe(true);
    expect(gradedWrite.reason).toContain('PROTECTED INVARIANT P-2');

    const scaffoldWrite = await gate('write', { path: 'packages/agent/tests/scaffold_stub.ts' });
    expect(scaffoldWrite.block).toBe(false);
  });
});
