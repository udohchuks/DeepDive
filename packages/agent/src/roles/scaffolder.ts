import { AgentSession, createAgentSession } from '../sdk/pi_contract.js';
import { createPermissionHook } from '../hooks/permission_hook.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

export function createScaffolderSession(
  pathEvaluator: PathPolicyEvaluator,
  gradedArtifactPaths: string[] = ['sdd.json', 'rsdd.json', 'cdd.json'],
): AgentSession {
  const permHook = createPermissionHook({
    role: 'scaffolder',
    pathEvaluator,
    gradedArtifactPaths,
  });

  return createAgentSession('scaffolder', {
    tools: ['write', 'edit', 'bash'],
    hooks: {
      tool_call: permHook,
    },
  });
}
