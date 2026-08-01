# Deterministic Gate

**Package:** @deepdive/engine  ·  **Build step:** 5.2  ·  **Architecture ref:** §12

## What it does
Evaluates every `deterministic` rubric criterion against a submission, and reports whether the submission may proceed to a model. Also holds clarifying-question handling.

This package used to export a `SubmissionOrchestrator` that claimed to run steps 1–8 of the §12 sequence — gate, quarantine, Verifier, Grader, persistence. It has been deleted. No product code ever called it: the real path is `runGrade` in `apps/cli`, and the orchestrator existed only in tests. Worse, its Grader step was hardcoded to emit one `warning` finding and discard the tool result, so its exit state was `approved` for every input, and the integration suites built on it were green whether or not grading worked. A second implementation of "what does grading mean" is a liability even when it is correct; this one was not.

## How it works
1. **Test results first.** A failing suite fails the gate outright (P-5: the result is authoritative, no model is consulted about it).
2. **Then each deterministic criterion**, via the code-check registry in `@deepdive/content`.
3. **Fails closed.** A criterion with no artifact to check, or a check that throws, is a failure — never a pass by default.

Who calls it and what happens next is the caller's business. `runGrade` calls it before building a model request, which is where D-1's "zero model calls on a deterministic failure" actually holds; that property is asserted in `tests/integration/greenfield_e2e.test.ts` against a provider that throws if reached, rather than against a counter.

## How to use it
```typescript
import { evaluateDeterministicGate } from '@deepdive/engine';

const gate = evaluateDeterministicGate(rubric, testResult, idGenerator, artifactPayload);
if (!gate.passed) return gate.failedFindings; // no model call
```

## Constraints & gotchas
- **Every failing finding carries a `message` saying why.** The gate used to build findings from the criterion id alone and discard the code check's own message, so a rejection printed `BOUND_VIOLATED on charter_scope_bounded` and nothing else. That is the wrong place to be terse: the deterministic gate is the half of grading that teaches for free, and a rejection explaining nothing pushes the student toward `deepdive hint`, which costs a model call, to learn something a code check already knew. The check's message wins over the criterion description, since the description restates the rule while the message describes this submission.
- A code check that **throws** is a bug in the rubric, not in the student's work, so its message says so — otherwise the student goes looking for the mistake in their own artifact.
- The message is **persisted, not only printed** (migration `003`), so `history` can explain an old round. Rounds recorded before that migration read back with `message: undefined` and still render, just without the explanation; the reason was never captured for them and cannot be reconstructed.
- **The gate does not persist anything.** Recording a round is the caller's job, because the caller is the one that knows whether a model was consulted afterwards.

## Tests
Covered by `packages/engine/tests/pipeline.test.ts`, and end to end through the real grading path in `tests/integration/greenfield_e2e.test.ts`.
