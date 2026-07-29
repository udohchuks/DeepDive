import { describe, it, expect } from 'vitest';
import {
  transitionPhase,
  PhaseState,
  IllegalTransitionError,
  PhaseGates,
  evaluateGateExit,
  RubricVerdict,
} from '../src/index.js';

describe('Phase State Machine & Gates (Phase 1.3)', () => {
  it('should process legal Greenfield transitions upon approval', () => {
    let state: PhaseState = {
      currentPhase: 'A',
      roundCount: 1,
      mode: 'greenfield',
      isComplete: false,
    };

    const sequence = ['B', 'B.5', 'C', 'D', 'E', 'F'] as const;
    for (const target of sequence) {
      state = transitionPhase(state, 'approved');
      expect(state.currentPhase).toBe(target);
    }
    expect(state.isComplete).toBe(true);
  });

  it('should process legal Onboarding transitions upon approval', () => {
    let state: PhaseState = {
      currentPhase: 'OB-A',
      roundCount: 1,
      mode: 'onboarding',
      isComplete: false,
    };

    const sequence = ['OB-B', 'OB-C', 'OB-D', 'OB-E', 'OB-F', 'OB-G'] as const;
    for (const target of sequence) {
      state = transitionPhase(state, 'approved');
      expect(state.currentPhase).toBe(target);
    }
    expect(state.isComplete).toBe(true);
  });

  it('should reject illegal transitions (e.g. skipping phases or wrong mode phase)', () => {
    const gfState: PhaseState = {
      currentPhase: 'A',
      roundCount: 1,
      mode: 'greenfield',
      isComplete: false,
    };

    expect(() => transitionPhase(gfState, 'approved', 'D')).toThrow(IllegalTransitionError);
    expect(() => transitionPhase(gfState, 'approved', 'OB-A')).toThrow(IllegalTransitionError);
  });

  it('PROTECTED INVARIANT: Unbounded rounds — arbitrarily high round count is accepted without capping (architecture.md §7)', () => {
    let state: PhaseState = {
      currentPhase: 'B',
      roundCount: 9999, // very high round count
      mode: 'greenfield',
      isComplete: false,
    };

    // Rejection / revision increments round count without throw or cap
    state = transitionPhase(state, 'revise');
    expect(state.roundCount).toBe(10000);

    state = transitionPhase(state, 'clarify');
    expect(state.roundCount).toBe(10001);

    // Approval transitions cleanly regardless of high round count
    state = transitionPhase(state, 'approved');
    expect(state.currentPhase).toBe('B.5');
    expect(state.roundCount).toBe(1);
  });

  it('should evaluate phase gates exit criteria correctly', () => {
    expect(PhaseGates['A'].phaseId).toBe('A');

    const approvedVerdict: RubricVerdict = {
      rubricId: 'r1',
      status: 'approved',
      flags: [],
      questions: [],
      timestamp: new Date().toISOString(),
    };
    expect(evaluateGateExit('A', approvedVerdict)).toBe(true);

    const reviseVerdict: RubricVerdict = {
      rubricId: 'r1',
      status: 'revise',
      flags: [],
      questions: [],
      timestamp: new Date().toISOString(),
    };
    expect(evaluateGateExit('A', reviseVerdict)).toBe(false);
  });
});
