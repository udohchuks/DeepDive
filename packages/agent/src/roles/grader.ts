import { AgentSession, createAgentSession } from '../sdk/pi_contract.js';
import { createPermissionHook } from '../hooks/permission_hook.js';

export function createGraderSession(): AgentSession {
  const permHook = createPermissionHook({
    role: 'grader',
  });

  return createAgentSession('grader', {
    noTools: 'all',
    customTools: {
      submit_rubric_verdict: {
        description: 'Emits structured rubric verdict',
      },
    },
    hooks: {
      tool_call: permHook,
    },
  });
}
