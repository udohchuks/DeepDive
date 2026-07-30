import { AgentSession, createRoleSession, RoleSessionOptions } from '../sdk/pi_contract.js';
import { RoleModel } from '../sdk/role_model.js';
import { createPermissionHook } from '../hooks/permission_hook.js';
import { ApprovalOptions, withApproval } from '../hooks/approval.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

/** Exact tool grant for the Scaffolder. Asserted directly by the role tests. */
export const SCAFFOLDER_TOOLS = ['write', 'edit', 'bash'] as const;

export function buildScaffolderSessionOptions(
  pathEvaluator: PathPolicyEvaluator,
  gradedArtifactPaths: string[] = ['sdd.json', 'rsdd.json', 'cdd.json'],
  approval?: ApprovalOptions,
): RoleSessionOptions {
  const policy = createPermissionHook({ role: 'scaffolder', pathEvaluator, gradedArtifactPaths });
  return {
    role: 'scaffolder',
    tools: [...SCAFFOLDER_TOOLS],
    hook: approval ? withApproval(policy, approval) : policy,
  };
}

export function createScaffolderSession(
  pathEvaluator: PathPolicyEvaluator,
  gradedArtifactPaths?: string[],
  model?: RoleModel,
  cwd?: string,
  approval?: ApprovalOptions,
): Promise<AgentSession> {
  return createRoleSession({
    ...buildScaffolderSessionOptions(pathEvaluator, gradedArtifactPaths, approval),
    model,
    cwd,
  });
}
