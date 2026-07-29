import { PhaseId, SubmissionStatus } from '../domain/types.js';

export const GreenfieldTransitions: Record<PhaseId, PhaseId | null> = {
  A: 'B',
  B: 'B.5',
  'B.5': 'C',
  C: 'D',
  D: 'E',
  E: 'F',
  F: null, // Terminal
  'OB-A': null,
  'OB-B': null,
  'OB-C': null,
  'OB-D': null,
  'OB-E': null,
  'OB-F': null,
  'OB-G': null,
};

export const OnboardingTransitions: Record<PhaseId, PhaseId | null> = {
  'OB-A': 'OB-B',
  'OB-B': 'OB-C',
  'OB-C': 'OB-D',
  'OB-D': 'OB-E',
  'OB-E': 'OB-F',
  'OB-F': 'OB-G',
  'OB-G': null, // Terminal
  A: null,
  B: null,
  'B.5': null,
  C: null,
  D: null,
  E: null,
  F: null,
};

export interface PhaseState {
  currentPhase: PhaseId;
  roundCount: number;
  mode: 'greenfield' | 'onboarding';
  isComplete: boolean;
}

export class IllegalTransitionError extends Error {
  constructor(public from: PhaseId, public to?: PhaseId, reason?: string) {
    super(`Illegal phase transition from ${from}${to ? ` to ${to}` : ''}${reason ? `: ${reason}` : ''}`);
    this.name = 'IllegalTransitionError';
  }
}

export function transitionPhase(
  currentState: PhaseState,
  verdictStatus: SubmissionStatus,
  targetPhase?: PhaseId,
): PhaseState {
  // If status is not approved, state remains in current phase and increments roundCount (unbounded)
  if (verdictStatus !== 'approved') {
    return {
      ...currentState,
      roundCount: currentState.roundCount + 1,
    };
  }

  const map = currentState.mode === 'greenfield' ? GreenfieldTransitions : OnboardingTransitions;
  const nextDefault = map[currentState.currentPhase];

  if (nextDefault === null) {
    throw new IllegalTransitionError(currentState.currentPhase, targetPhase, 'Phase is terminal or invalid for mode');
  }

  const destination = targetPhase ?? nextDefault;
  if (destination !== nextDefault) {
    throw new IllegalTransitionError(currentState.currentPhase, destination, `Cannot skip to ${destination}`);
  }

  return {
    ...currentState,
    currentPhase: destination,
    roundCount: 1, // reset round count for new phase
    isComplete: destination === 'F' || destination === 'OB-G',
  };
}
