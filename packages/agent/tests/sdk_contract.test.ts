import { describe, it, expect } from 'vitest';
import path from 'path';
import {
  createAgentSession as piCreateAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolCallEventResult,
} from '@earendil-works/pi-coding-agent';
import {
  buildRoleSessionOptions,
  createRoleGateExtension,
  PI_BUILTIN_TOOLS,
  ToolCallHook,
} from '../src/index.js';
import { buildScaffolderSessionOptions, SCAFFOLDER_TOOLS } from '../src/roles/scaffolder.js';
import { buildVerifierSessionOptions, VERIFIER_TOOLS } from '../src/roles/verifier.js';
import { createGraderSession } from '../src/roles/grader.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

/**
 * Build step 3.0: verify our contract against the INSTALLED SDK.
 *
 * The previous version of this file exercised a hand-written stub of pi and so
 * verified nothing about pi. These tests import the real package.
 */

/** Captures the handler a factory registers, so it can be invoked directly. */
function captureToolCallHandler(
  extension: ReturnType<typeof createRoleGateExtension>,
): (event: ToolCallEvent) => Promise<ToolCallEventResult> {
  let captured: ((event: ToolCallEvent, ctx: ExtensionContext) => unknown) | undefined;
  const fakePi = {
    on: (eventName: string, handler: (event: ToolCallEvent, ctx: ExtensionContext) => unknown) => {
      if (eventName === 'tool_call') captured = handler;
    },
  } as unknown as ExtensionAPI;

  const factory = typeof extension === 'function' ? extension : extension.factory;
  factory(fakePi);

  if (!captured) throw new Error('extension did not register a tool_call handler');
  const handler = captured;
  return async (event: ToolCallEvent) =>
    (await handler(event, {} as ExtensionContext)) as ToolCallEventResult;
}

function toolCallEvent(toolName: string, input: Record<string, unknown>): ToolCallEvent {
  return { type: 'tool_call', toolCallId: 'tc-1', toolName, input } as ToolCallEvent;
}

describe('pi SDK contract verification against the installed package (Phase 3.0)', () => {
  it('the real SDK exposes the entry points our adapter depends on', () => {
    expect(typeof piCreateAgentSession).toBe('function');
    expect(typeof DefaultResourceLoader).toBe('function');
    expect(typeof SettingsManager.create).toBe('function');
    expect(typeof SessionManager.inMemory).toBe('function');
    expect(typeof getAgentDir).toBe('function');
  });

  it('PROTECTED INVARIANT: role scoping never depends on noTools semantics', () => {
    // Regression guard. The old stub read noTools:'builtin' as "drop custom
    // tools too"; real pi documents the opposite — built-ins off, custom and
    // extension tools KEPT. Any role that leaned on the stub's reading would
    // have silently retained custom tools. Roles now use exact allowlists, so
    // emitting noTools at all is the regression.
    const evaluator = new PathPolicyEvaluator({
      readOnlyPaths: [path.join(process.cwd(), 'packages')],
      readWritePaths: [path.join(process.cwd(), 'packages/agent/tests')],
      blockedPaths: [],
    });
    const optionSets = [
      buildRoleSessionOptions(buildVerifierSessionOptions()),
      buildRoleSessionOptions(buildScaffolderSessionOptions(evaluator)),
    ];

    for (const options of optionSets) {
      expect(options).not.toHaveProperty('noTools');
      expect(Array.isArray(options.tools)).toBe(true);
      expect(options.tools!.length).toBeGreaterThan(0);
    }
  });

  it('each role receives exactly its declared allowlist and nothing more', () => {
    const evaluator = new PathPolicyEvaluator({
      readOnlyPaths: [path.join(process.cwd(), 'packages')],
      readWritePaths: [path.join(process.cwd(), 'packages/agent/tests')],
      blockedPaths: [],
    });

    const verifier = buildRoleSessionOptions(buildVerifierSessionOptions());
    expect(verifier.tools).toEqual([...VERIFIER_TOOLS]);
    expect(verifier.tools).not.toContain('write');
    expect(verifier.tools).not.toContain('edit');

    const scaffolder = buildRoleSessionOptions(buildScaffolderSessionOptions(evaluator));
    expect(scaffolder.tools).toEqual([...SCAFFOLDER_TOOLS]);
  });

  it('PROTECTED INVARIANT: the Grader holds no tools and no coding-agent harness', async () => {
    const grader = createGraderSession();
    expect(grader.grantedTools).toEqual([]);

    // Every built-in is refused, whatever route reaches it.
    for (const tool of PI_BUILTIN_TOOLS) {
      const decision = await grader.executeTool(tool, { path: 'sdd.json' });
      expect(decision.block).toBe(true);
    }

    // Even an unrecognised custom tool is refused, because the role holds none.
    const custom = await grader.executeTool('submit_rubric_verdict', { verdict: 'approved' });
    expect(custom.block).toBe(true);
  });

  it('the role gate registers a real tool_call handler that can block', async () => {
    const hook: ToolCallHook = (ctx) =>
      ctx.args.action === 'block' ? { block: true, reason: 'policy refused' } : { block: false };

    const handler = captureToolCallHandler(createRoleGateExtension('verifier', hook));

    const allowed = await handler(toolCallEvent('read', { action: 'allow' }));
    expect(allowed.block).toBe(false);

    const blocked = await handler(toolCallEvent('read', { action: 'block' }));
    expect(blocked.block).toBe(true);
    expect(blocked.reason).toContain('policy refused');
  });

  it('PROTECTED INVARIANT: a throwing policy hook fails closed', async () => {
    const handler = captureToolCallHandler(
      createRoleGateExtension('verifier', () => {
        throw new Error('evaluator exploded');
      }),
    );

    const decision = await handler(toolCallEvent('bash', { command: 'rm -rf /' }));
    expect(decision.block).toBe(true);
    expect(decision.reason).toContain('evaluator exploded');
  });

  it('the gate sees live tool input, not a snapshot taken before mutation', async () => {
    // pi documents event.input as mutable with no re-validation after a handler
    // edits it, so the gate must read the object that will actually execute.
    const seen: string[] = [];
    const handler = captureToolCallHandler(
      createRoleGateExtension('scaffolder', (ctx) => {
        seen.push(String(ctx.args.path));
        return { block: false };
      }),
    );

    const event = toolCallEvent('write', { path: 'original.ts' });
    (event.input as Record<string, unknown>).path = 'mutated.ts';
    await handler(event);

    expect(seen).toEqual(['mutated.ts']);
  });
});
