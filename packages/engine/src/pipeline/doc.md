# Submission Pipeline Orchestrator

**Package:** @deepdive/engine  ·  **Build step:** 5.2  ·  **Architecture ref:** §12

## What it does
Orchestrates the submission review round pipeline (steps 1–8 of §12 sequence flow), including deterministic short-circuit evaluation, Dual-LLM quarantine filtering, Verifier & Grader role execution, SQLite round persistence, and clarifying question handling.

## How it works
1. **Deterministic Gate (D-1):** Evaluates all `deterministic` rubric criteria first. If any fail, short-circuits to `revise` state immediately with **zero model provider calls**.
2. **Quarantined Verifier -> Grader Flow:** Verifier observations are filtered through `@deepdive/agent` Dual-LLM quarantine before reaching Grader.
3. **SQLite Persistence:** Saves every completed review round into SQLite (`RoundRepository`) as an append-only record.

## How to use it
```typescript
import { SubmissionOrchestrator } from '@deepdive/engine';

const orchestrator = new SubmissionOrchestrator(options);
const result = await orchestrator.executeReviewRound();
```

## Constraints & gotchas
- Deterministic failures immediately halt the review round prior to Grader invocation.
- **Every failing finding carries a `message` saying why.** The gate used to build findings from the criterion id alone and discard the code check's own message, so a rejection printed `BOUND_VIOLATED on charter_scope_bounded` and nothing else. That is the wrong place to be terse: the deterministic gate is the half of grading that teaches for free, and a rejection explaining nothing pushes the student toward `deepdive hint`, which costs a model call, to learn something a code check already knew. The check's message wins over the criterion description, since the description restates the rule while the message describes this submission.
- A code check that **throws** is a bug in the rubric, not in the student's work, so its message says so — otherwise the student goes looking for the mistake in their own artifact.
- The message is **persisted, not only printed** (migration `003`), so `history` can explain an old round. Rounds recorded before that migration read back with `message: undefined` and still render, just without the explanation; the reason was never captured for them and cannot be reconstructed.

## Tests
Covered by `packages/engine/tests/pipeline.test.ts`.
