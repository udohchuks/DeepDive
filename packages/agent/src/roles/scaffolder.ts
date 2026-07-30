import { AgentSession, createRoleSession, RoleSessionOptions } from '../sdk/pi_contract.js';
import { createPermissionHook } from '../hooks/permission_hook.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

/** Exact tool grant for the Scaffolder. Asserted directly by the role tests. */
export const SCAFFOLDER_TOOLS = ['write', 'edit', 'bash'] as const;

export function buildScaffolderSessionOptions(
  pathEvaluator: PathPolicyEvaluator,
  gradedArtifactPaths: string[] = ['sdd.json', 'rsdd.json', 'cdd.json'],
): RoleSessionOptions {
  return {
    role: 'scaffolder',
    tools: [...SCAFFOLDER_TOOLS],
    hook: createPermissionHook({ role: 'scaffolder', pathEvaluator, gradedArtifactPaths }),
  };
}

export function createScaffolderSession(
  pathEvaluator: PathPolicyEvaluator,
  gradedArtifactPaths?: string[],
): Promise<AgentSession> {
  return createRoleSession(buildScaffolderSessionOptions(pathEvaluator, gradedArtifactPaths));
}
