import { AgentSession, createAgentSession } from '../sdk/pi_contract.js';
import { createPermissionHook } from '../hooks/permission_hook.js';

export function createVerifierSession(): AgentSession {
  const permHook = createPermissionHook({
    role: 'verifier',
  });

  return createAgentSession('verifier', {
    tools: ['read', 'grep', 'find', 'ls', 'bash'],
    hooks: {
      tool_call: permHook,
    },
  });
}
