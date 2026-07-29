import { PhaseState } from '@deepdive/core';
import { OnboardingGatingEngine } from './engine.js';

export class OnboardingDriver {
  private engine = new OnboardingGatingEngine();

  public createInitialState(): PhaseState {
    return {
      currentPhase: 'OB-A',
      roundCount: 0,
      mode: 'onboarding',
      isComplete: false,
    };
  }

  public processSubmissionVerdict(
    currentState: PhaseState,
    verdictApproved: boolean,
  ): { newState: PhaseState; transitionOccurred: boolean } {
    const canAdvance = this.engine.evaluateExit(currentState, verdictApproved);

    if (canAdvance) {
      const transResult = this.engine.advancePhase(currentState, verdictApproved);
      return {
        newState: transResult.nextState,
        transitionOccurred: transResult.transitionOccurred,
      };
    }

    const nextState: PhaseState = {
      ...currentState,
      roundCount: currentState.roundCount + 1,
    };

    return {
      newState: nextState,
      transitionOccurred: false,
    };
  }
}
