import { describe, it, expect } from 'vitest';
import { createAgentSession } from '../src/index.js';

describe('pi SDK Capability & Contract Verification (Phase 3.0)', () => {
  it('createAgentSession accepts tools, excludeTools, noTools, customTools, and tool_call hook', async () => {
    let hookFired = false;
    const session = createAgentSession('verifier', {
      tools: ['read', 'grep', 'find'],
      excludeTools: ['grep'],
      customTools: {
        custom_tool_1: {},
      },
      hooks: {
        tool_call: async (ctx) => {
          hookFired = true;
          if (ctx.toolName === 'custom_tool_1' && ctx.args.action === 'block') {
            return { block: true, reason: 'Hook blocked execution' };
          }
          return { block: false };
        },
      },
    });

    expect(session.grantedTools).toContain('read');
    expect(session.grantedTools).toContain('find');
    expect(session.grantedTools).not.toContain('grep'); // excluded
    expect(session.grantedTools).toContain('custom_tool_1');

    // Test tool execution hook
    const resOk = await session.executeTool('read', { path: 'file.txt' });
    expect(hookFired).toBe(true);
    expect(resOk.blocked).toBe(false);

    // Test tool_call hook blocking
    const resBlocked = await session.executeTool('custom_tool_1', { action: 'block' });
    expect(resBlocked.blocked).toBe(true);
    expect(resBlocked.reason).toContain('Hook blocked');
  });

  it('noTools: all disables all builtin tools while retaining customTools', () => {
    const session = createAgentSession('grader', {
      noTools: 'all',
      customTools: { submit_rubric_verdict: {} },
    });
    expect(session.grantedTools).toEqual(['submit_rubric_verdict']);
  });
});
