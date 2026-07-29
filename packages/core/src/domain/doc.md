# Domain Schemas & Types

**Package:** @deepdive/core  ·  **Build step:** 1.1  ·  **Architecture ref:** §1, §6

## What it does
Provides Zod schemas and inferred TypeScript types for all core domain entities in the DeepDive platform (Charters, SDD/RSDD, CDD, Rubrics, Hints, Quizzes, Completion Records, and Findings).

## How it works
All data structures are defined as Zod schemas as the single source of truth, with TypeScript types derived via `z.infer`. 

Crucially, `finding.ts` defines the Quarantine Boundary Type: the only data structure allowed to cross from the Verifier role to the Grader role. It is strictly constrained with no arbitrary free-text fields or prose descriptors, physically preventing prompt-injection payloads in raw repo or student code from reaching the Grader role.

Every rubric criterion in `rubric.ts` is explicitly tagged with a `kind` of either `deterministic` or `judged` (D-1), ensuring code-decidable checks run first and short-circuit without model calls.

## How to use it
```typescript
import { FindingSchema, RubricVerdictSchema } from '@deepdive/core';

// Validating a structured finding from the Verifier
const finding = FindingSchema.parse({
  id: '123e4567-e89b-12d3-a456-426614174000',
  code: 'CITATION_MISSING',
  severity: 'error',
  targetFieldId: 'sdd.modules[0].citations',
  filePath: 'src/main.rs',
  lineStart: 12,
  lineEnd: 20,
});
```

## Constraints & gotchas
- `FindingSchema` uses `.strict()`: adding any unconstrained property to a Finding object will fail validation immediately.
- `Finding` target field IDs must conform to the alphanumeric/dot identifier format (`/^[a-zA-Z0-9_\-[\].]+$/`).

## Tests
Covered by `packages/core/tests/schemas.test.ts`, asserting schema round-trips, malformed input rejections, and the protected quarantine containment check for `Finding`.

Command: `npm --workspace=packages/core run test`
