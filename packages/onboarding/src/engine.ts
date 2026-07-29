import {
  PhaseState,
  transitionPhase,
  evaluateGateExit,
  SubmissionStatus,
  RubricVerdict,
} from '@deepdive/core';

export class OnboardingGatingEngine {
  public evaluateExit(state: PhaseState, verdictApproved: boolean): boolean {
    if (state.mode !== 'onboarding') {
      throw new Error(`Onboarding engine cannot process project mode: "${state.mode}"`);
    }
    const status: SubmissionStatus = verdictApproved ? 'approved' : 'revise';
    const verdict: RubricVerdict = {
      rubricId: 'rubric_ob_v1',
      status,
      flags: [],
      questions: [],
      timestamp: new Date().toISOString(),
    };
    return evaluateGateExit(state.currentPhase, verdict);
  }

  public advancePhase(state: PhaseState, verdictApproved: boolean): { nextState: PhaseState; transitionOccurred: boolean } {
    if (state.mode !== 'onboarding') {
      throw new Error(`Onboarding engine cannot process project mode: "${state.mode}"`);
    }
    const status: SubmissionStatus = verdictApproved ? 'approved' : 'revise';
    const nextState = transitionPhase(state, status);
    return {
      nextState,
      transitionOccurred: nextState.currentPhase !== state.currentPhase || nextState.isComplete,
    };
  }
}
