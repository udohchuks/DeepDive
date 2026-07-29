import { PhaseState } from '@deepdive/core';
import { GreenfieldGatingEngine } from './engine.js';

export class GreenfieldDriver {
  private engine = new GreenfieldGatingEngine();

  public createInitialState(): PhaseState {
    return {
      currentPhase: 'A',
      roundCount: 0,
      mode: 'greenfield',
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

    // Increments round count without numeric cap (Unbounded Rounds)
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
