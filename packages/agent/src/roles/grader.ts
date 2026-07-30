import { createPermissionHook } from '../hooks/permission_hook.js';
import { ToolCallHookResult } from '../sdk/pi_contract.js';

/**
 * The Grader deliberately does not use the pi coding-agent harness.
 *
 * It has no filesystem or bash tools and emits only a structured verdict, so a
 * tool-executing harness would be capability it must never hold. Its model
 * calls go through @deepdive/provider (pi-ai) instead. That keeps P-2 — the AI
 * never authors graded artifacts — a property of what the Grader *is* rather
 * than of a policy hook that could be misconfigured.
 *
 * The permission hook is still wired in as defence in depth: if anything ever
 * routes a tool call here, it is refused and the refusal is explained.
 */
export interface ToolFreeSession {
  readonly role: 'grader';
  readonly grantedTools: readonly string[];
  executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallHookResult>;
}

export function createGraderSession(): ToolFreeSession {
  const permHook = createPermissionHook({ role: 'grader' });

  return {
    role: 'grader',
    grantedTools: Object.freeze([]),
    executeTool: async (toolName, args) => {
      const decision = await permHook({ toolName, args, role: 'grader' });
      if (decision.block) {
        return decision;
      }
      // No tool is reachable from a role that holds none, whatever the hook said.
      return {
        block: true,
        reason: `Grader role holds no tools; refused: ${toolName}`,
      };
    },
  };
}
