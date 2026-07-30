import { AgentSession } from '../sdk/pi_contract.js';
import { createScaffolderSession } from './scaffolder.js';
import { createVerifierSession } from './verifier.js';
import { createGraderSession, ToolFreeSession } from './grader.js';
import { PathPolicyEvaluator } from '@deepdive/policy';

/**
 * Scaffolder and Verifier run on the pi coding-agent harness because they need
 * real filesystem and bash tools. The Grader holds no tools, so it is a plain
 * tool-free session — see grader.ts for why that asymmetry is deliberate.
 */
export type RoleSession = AgentSession | ToolFreeSession;

export function buildRoleSession(
  role: 'scaffolder' | 'verifier' | 'grader',
  pathEvaluator?: PathPolicyEvaluator,
  gradedArtifactPaths?: string[],
): Promise<RoleSession> {
  switch (role) {
    case 'scaffolder':
      if (!pathEvaluator) {
        throw new Error('PathPolicyEvaluator is required for Scaffolder session');
      }
      return createScaffolderSession(pathEvaluator, gradedArtifactPaths);
    case 'verifier':
      return createVerifierSession();
    case 'grader':
      return Promise.resolve(createGraderSession());
    default:
      throw new Error(`Unknown role: ${role}`);
  }
}
