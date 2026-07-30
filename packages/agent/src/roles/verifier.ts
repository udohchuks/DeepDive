import { AgentSession, createRoleSession, RoleSessionOptions } from '../sdk/pi_contract.js';
import { RoleModel } from '../sdk/role_model.js';
import { createPermissionHook } from '../hooks/permission_hook.js';
import { ApprovalOptions, withApproval } from '../hooks/approval.js';

/**
 * Exact tool grant for the Verifier. Read-only by construction: `write` and
 * `edit` are absent from the allowlist, and the permission hook independently
 * rejects mutating bash commands. The Verifier is the only role that touches
 * raw repository and student text, so it gets both layers.
 */
export const VERIFIER_TOOLS = ['read', 'grep', 'find', 'ls', 'bash'] as const;

export function buildVerifierSessionOptions(approval?: ApprovalOptions): RoleSessionOptions {
  const policy = createPermissionHook({ role: 'verifier' });
  return {
    role: 'verifier',
    tools: [...VERIFIER_TOOLS],
    hook: approval ? withApproval(policy, approval) : policy,
  };
}

export function createVerifierSession(
  model?: RoleModel,
  cwd?: string,
  approval?: ApprovalOptions,
): Promise<AgentSession> {
  return createRoleSession({ ...buildVerifierSessionOptions(approval), model, cwd });
}
