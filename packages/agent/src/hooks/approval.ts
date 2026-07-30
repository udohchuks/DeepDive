import { ToolCallHook, ToolCallHookContext, ToolCallHookResult } from '../sdk/pi_contract.js';

/**
 * How tool calls are authorised.
 *
 * - `approve`: mutating tools ask the student before running. Read-only tools
 *   run without interruption, because prompting for every `read` trains people
 *   to approve without looking.
 * - `auto`: policy alone decides. Nothing is asked.
 */
export type PermissionMode = 'approve' | 'auto';

export const PERMISSION_MODES: readonly PermissionMode[] = ['approve', 'auto'];

export function isPermissionMode(value: string): value is PermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(value);
}

/** Tools that only observe. They never prompt in either mode. */
export const READ_ONLY_TOOLS = ['read', 'grep', 'find', 'ls'] as const;

export interface ApprovalRequest {
  role: string;
  toolName: string;
  args: Record<string, unknown>;
  /** One-line description of what will happen, for display. */
  summary: string;
}

export type Approver = (request: ApprovalRequest) => Promise<boolean>;

/** Short, human-readable description of a pending tool call. */
export function summarizeToolCall(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'bash') {
    return `run: ${String(args.command ?? '')}`;
  }
  const target = args.path ?? args.filePath ?? args.file_path;
  if (target) {
    return `${toolName}: ${String(target)}`;
  }
  return toolName;
}

export interface ApprovalOptions {
  mode: PermissionMode;
  approver: Approver;
}

/**
 * Composes the policy hook with human approval.
 *
 * Order is the whole point. Policy runs first and its denials are final: a
 * student is never offered the chance to approve a write into their own graded
 * artifact (P-2), or the Verifier mutating the repository it is supposed to
 * only read. Approval can therefore only ever *narrow* what policy permits,
 * never widen it.
 *
 * This is what replaces mandatory OS sandboxing for trusted code: the student
 * sees each mutating command before it runs, which is a real control, rather
 * than a VM boundary they had to install first.
 */
export function withApproval(policy: ToolCallHook, options: ApprovalOptions): ToolCallHook {
  return async (context: ToolCallHookContext): Promise<ToolCallHookResult> => {
    const decision = await policy(context);

    // Policy denials are not negotiable and are never surfaced for approval.
    if (decision.block) {
      return decision;
    }

    if (options.mode === 'auto') {
      return { block: false };
    }

    if ((READ_ONLY_TOOLS as readonly string[]).includes(context.toolName)) {
      return { block: false };
    }

    let approved: boolean;
    try {
      approved = await options.approver({
        role: context.role,
        toolName: context.toolName,
        args: context.args,
        summary: summarizeToolCall(context.toolName, context.args),
      });
    } catch (err: unknown) {
      // An approval prompt that failed has not approved anything.
      const message = err instanceof Error ? err.message : 'unknown error';
      return { block: true, reason: `Approval prompt failed: ${message}` };
    }

    return approved
      ? { block: false }
      : { block: true, reason: `Declined by user: ${summarizeToolCall(context.toolName, context.args)}` };
  };
}
