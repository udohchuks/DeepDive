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

## Tests
Covered by `packages/engine/tests/pipeline.test.ts`.
