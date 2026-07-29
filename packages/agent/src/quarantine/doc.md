# Dual-LLM Quarantine Boundary

**Package:** @deepdive/agent  ·  **Build step:** 3.2  ·  **Architecture ref:** §6

## What it does
Enforces the containment boundary between the Verifier role (which inspects raw untrusted repository and student text) and the Grader role (which makes high-leverage grading decisions).

## How it works
Raw observations are converted into structured `Finding` objects via `transformToFinding`. The `filterAndSanitizeFindings` function validates findings against `FindingSchema` (strictly enforcing no unconstrained text properties) and rejects malformed or injected payloads.

## How to use it
```typescript
import { filterAndSanitizeFindings, transformToFinding } from '@deepdive/agent';

const finding = transformToFinding(rawObservation, idGen);
const sanitized = filterAndSanitizeFindings([finding]);
```

## Constraints & gotchas
- Extra or unconstrained properties on Finding objects cause immediate rejection.

## Tests
Covered by `packages/agent/tests/quarantine.test.ts`.
