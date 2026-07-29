import { AgentSession } from '../sdk/pi_contract.js';
import { createScaffolderSession } from './scaffolder.js';
import { createVerifierSession } from './verifier.js';
import { createGraderSession } from './grader.js';
import { PathPolicyEvaluator } from '@deepdive/sandbox';

export function buildRoleSession(
  role: 'scaffolder' | 'verifier' | 'grader',
  pathEvaluator?: PathPolicyEvaluator,
  gradedArtifactPaths?: string[],
): AgentSession {
  switch (role) {
    case 'scaffolder':
      if (!pathEvaluator) {
        throw new Error('PathPolicyEvaluator is required for Scaffolder session');
      }
      return createScaffolderSession(pathEvaluator, gradedArtifactPaths);
    case 'verifier':
      return createVerifierSession();
    case 'grader':
      return createGraderSession();
    default:
      throw new Error(`Unknown role: ${role}`);
  }
}
