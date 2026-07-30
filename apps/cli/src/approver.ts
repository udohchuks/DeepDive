import { createInterface } from 'readline/promises';
import { Approver, ApprovalRequest } from '@deepdive/agent';

/**
 * Prompts on the terminal for each mutating tool call.
 *
 * Declining is the default for anything that is not an explicit yes, including
 * EOF: a non-interactive stdin (a pipe, CI) must not be read as consent. That
 * is why this returns false rather than throwing on a closed stream — the run
 * continues with the action refused, and the agent is told why.
 */
export function createTerminalApprover(): Approver {
  return async (request: ApprovalRequest): Promise<boolean> => {
    if (!process.stdin.isTTY) {
      return false;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(
        `\n  ${request.role} wants to ${request.summary}\n  allow? [y/N] `,
      );
      return answer.trim().toLowerCase() === 'y';
    } catch {
      return false;
    } finally {
      rl.close();
    }
  };
}

/** Approver that refuses everything. Used when no terminal is available. */
export const denyAllApprover: Approver = async () => false;
