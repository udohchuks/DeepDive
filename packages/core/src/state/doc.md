# Phase State Machine & Gates

**Package:** @deepdive/core  ·  **Build step:** 1.3  ·  **Architecture ref:** §7

## What it does
Provides pure, side-effect-free transition state machine logic and gate evaluator rules for Greenfield (A–F) and Onboarding (OB-A–OB-G) learning modes.

## How it works
Phase progression is driven by rubric approval (`verdictStatus === 'approved'`). If a submission receives `revise` or `clarify`, the state machine increments the round count and stays in the current phase.

Crucially, **no numeric round cap exists** — rounds are unbounded by architectural decision (architecture.md §7). Students receive as many review rounds as needed to satisfy entry/exit criteria without artificial caps.

## How to use it
```typescript
import { transitionPhase, PhaseState } from '@deepdive/core';

let state: PhaseState = {
  currentPhase: 'A',
  roundCount: 1,
  mode: 'greenfield',
  isComplete: false,
};

// Transition on rubric approval
state = transitionPhase(state, 'approved');
console.log(state.currentPhase); // 'B'
```

## Constraints & gotchas
- Skipping phases or transitioning between modes is an `IllegalTransitionError`.
- `roundCount` resets to 1 upon entering a new phase.

## Tests
Covered by `packages/core/tests/state_machine.test.ts`, asserting legal sequence transitions, illegal transition errors, gate exit evaluations, and the protected unbounded rounds invariant test.

Command: `npm --workspace=packages/core run test`
